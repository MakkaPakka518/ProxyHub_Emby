// Emby Doctor test build: read-only diagnostics for configured routes only.
const DOCTOR_TIMEOUT_MS = 7000;

function doctorNormalizeBase(raw) {
  const url = new URL(String(raw || '').trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('节点线路必须是普通 HTTP(S) 地址');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  return url.toString().replace(/\/$/, '');
}

function doctorJoin(base, path) {
  const text = String(path || '');
  if (/^https?:\/\//i.test(text)) return text;
  return base.replace(/\/+$/, '') + '/' + text.replace(/^\/+/, '');
}

function doctorMediaUrl(base, path) {
  const text = String(path || '');
  if (/^https?:\/\//i.test(text)) return text;
  if (text.startsWith('//')) return new URL(base).protocol + text;
  if (text.startsWith('/')) return new URL(base).origin + text;
  return doctorJoin(base, text);
}

function doctorPublicCandidates(base) {
  const normalized = doctorNormalizeBase(base);
  const parsed = new URL(normalized);
  const candidates = [{ url: normalized + '/System/Info/Public', requestPath: '/System/Info/Public', apiBase: normalized }];
  if (!parsed.pathname || parsed.pathname === '/') {
    candidates.push({ url: parsed.origin + '/emby/System/Info/Public', requestPath: '/emby/System/Info/Public', apiBase: parsed.origin + '/emby' });
  }
  return candidates;
}

async function doctorFetch(url, init = {}, readText = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOCTOR_TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetch(url, Object.assign({}, init, { signal: controller.signal }));
    const result = { response, ms: Date.now() - started, text: '' };
    if (readText) result.text = await doctorReadText(response);
    else if (response.body && response.body.cancel) await response.body.cancel().catch(() => {});
    return result;
  } finally {
    clearTimeout(timer);
  }
}

async function doctorReadText(response, limit = 1048576) {
  const declared = Number(response.headers.get('Content-Length') || 0);
  if (declared > limit) {
    if (response.body && response.body.cancel) await response.body.cancel().catch(() => {});
    throw new Error('响应内容超过体检读取上限');
  }
  if (!response.body || !response.body.getReader) return response.text();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) throw new Error('响应内容超过体检读取上限');
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
}

async function doctorFetchJson(url, init = {}) {
  let current = String(url);
  let options = Object.assign({ cache: 'no-store' }, init);
  const allowedOrigin = new URL(current).origin;
  let totalMs = 0;
  for (let redirect = 0; redirect <= 3; redirect++) {
    const result = await doctorFetch(current, Object.assign({}, options, { redirect: 'manual' }), true);
    totalMs += result.ms;
    const status = result.response.status;
    const location = result.response.headers.get('Location');
    if (status >= 300 && status < 400 && location && redirect < 3) {
      const next = new URL(location, current);
      if (!['http:', 'https:'].includes(next.protocol)) return { status, ok: false, ms: totalMs, data: null, blockedRedirect: true };
      if (next.origin !== allowedOrigin) return { status, ok: false, ms: totalMs, data: null, blockedRedirect: true };
      if ([301, 302, 303].includes(status) && String(options.method || 'GET').toUpperCase() !== 'GET') {
        const headers = new Headers(options.headers || {});
        headers.delete('Content-Type');
        options = Object.assign({}, options, { method: 'GET', headers });
        delete options.body;
      }
      current = next.href;
      continue;
    }
    let data = null;
    try { data = JSON.parse(result.text); } catch (e) {}
    return { status, ok: result.response.ok, ms: totalMs, data };
  }
  return { status: 0, ok: false, ms: totalMs, data: null };
}

async function doctorProbePublic(base) {
  let last = null;
  for (const candidate of doctorPublicCandidates(base)) {
    try {
      const result = await doctorFetchJson(candidate.url, { headers: { Accept: 'application/json', 'User-Agent': 'EmbyDoctor/0.1' } });
      last = { ok: false, status: result.status, ms: result.ms, requestPath: candidate.requestPath, apiBase: candidate.apiBase, reachable: result.status > 0 && result.status < 500 };
      const isEmby = result.data && typeof result.data === 'object' && result.data.Version && (result.data.Id || result.data.ProductName || result.data.ServerName);
      if (result.ok && isEmby) {
        return Object.assign(last, {
          ok: true,
          product: String(result.data.ProductName || result.data.ServerName || 'Emby'),
          version: String(result.data.Version || ''),
          serverId: String(result.data.Id || '')
        });
      }
    } catch (error) {
      last = { ok: false, status: 0, ms: -1, requestPath: candidate.requestPath, apiBase: candidate.apiBase, error: error && error.name === 'AbortError' ? '连接超时' : '连接失败' };
    }
  }
  return last || { ok: false, status: 0, ms: -1, requestPath: '/System/Info/Public', apiBase: doctorNormalizeBase(base), error: '无法访问公开接口' };
}

function doctorAuthHeaders(token, json = false) {
  const headers = { Accept: 'application/json', 'X-Emby-Token': token, 'User-Agent': 'EmbyDoctor/0.1' };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

async function doctorProbeAccount(apiBase, token) {
  const result = { tested: true, auth: false, library: false, playback: false, range: null };
  try {
    const me = await doctorFetchJson(doctorJoin(apiBase, '/Users/Me'), { headers: doctorAuthHeaders(token) });
    result.authStatus = me.status;
    result.authMs = me.ms;
    if (!me.ok || !me.data || !me.data.Id) return result;
    result.auth = true;
    result.userId = String(me.data.Id);

    const listPath = '/Users/' + encodeURIComponent(result.userId) + '/Items?Recursive=true&IncludeItemTypes=Movie,Episode&Limit=1&Fields=MediaSources&SortBy=DateCreated&SortOrder=Descending';
    const library = await doctorFetchJson(doctorJoin(apiBase, listPath), { headers: doctorAuthHeaders(token) });
    result.libraryStatus = library.status;
    result.libraryMs = library.ms;
    const item = library.data && Array.isArray(library.data.Items) ? library.data.Items[0] : null;
    if (!library.ok) return result;
    result.library = true;
    if (!item || !item.Id) return result;
    result.itemId = String(item.Id);

    const playbackPath = '/Items/' + encodeURIComponent(result.itemId) + '/PlaybackInfo?UserId=' + encodeURIComponent(result.userId) + '&IsPlayback=false&AutoOpenLiveStream=false';
    let playback = await doctorFetchJson(doctorJoin(apiBase, playbackPath), { headers: doctorAuthHeaders(token) });
    if (!playback.ok || !playback.data) {
      playback = await doctorFetchJson(doctorJoin(apiBase, playbackPath), {
        method: 'POST', headers: doctorAuthHeaders(token, true), body: JSON.stringify({ UserId: result.userId, IsPlayback: false, AutoOpenLiveStream: false })
      });
    }
    result.playbackStatus = playback.status;
    result.playbackMs = playback.ms;
    const mediaSources = playback.data && Array.isArray(playback.data.MediaSources) ? playback.data.MediaSources : [];
    const media = mediaSources.find(source => source && source.DirectStreamUrl) || mediaSources.find(source => source && (source.SupportsDirectPlay || source.SupportsDirectStream)) || mediaSources[0];
    if (!playback.ok || !media) return result;
    result.playback = true;
    result.directPlay = media.SupportsDirectPlay !== false;
    result.directStream = !!media.SupportsDirectStream;
    result.transcoding = !!media.SupportsTranscoding;

    const directUrl = String(media.DirectStreamUrl || '');
    if (directUrl) {
      const rangeUrl = doctorMediaUrl(apiBase, directUrl);
      if (new URL(rangeUrl).origin !== new URL(apiBase).origin) {
        result.range = { status: 0, ms: 0, ok: false, skipped: 'external' };
      } else {
        const range = await doctorFetch(rangeUrl, {
          method: 'GET', redirect: 'manual', cache: 'no-store',
          headers: Object.assign(doctorAuthHeaders(token), { Range: 'bytes=0-1' })
        });
        result.range = { status: range.response.status, ms: range.ms, ok: range.response.status === 206, redirected: range.response.status >= 300 && range.response.status < 400 };
      }
    }
    return result;
  } catch (error) {
    result.error = error && error.name === 'AbortError' ? '账号检测超时' : '账号检测失败';
    return result;
  }
}

async function runEmbyDoctor(route, token) {
  const targets = String(route.target || '').split(',').map(value => value.trim()).filter(Boolean).slice(0, 8);
  if (!targets.length) throw new Error('该节点没有可检测线路');
  const lines = await Promise.all(targets.map(async (target, index) => {
    try { return Object.assign({ line: index + 1 }, await doctorProbePublic(target)); }
    catch (error) { return { line: index + 1, ok: false, status: 0, ms: -1, error: '线路格式无效或无法连接' }; }
  }));
  const selected = lines.find(line => line.ok) || lines.find(line => line.reachable) || lines[0];
  const recommendations = [];
  if (!lines.some(line => line.ok)) recommendations.push('所有线路的 Emby 公开接口均未通过，请检查源站地址、CF 出口限制或源站防火墙。');
  if (lines[0] && !lines[0].ok && lines.some((line, index) => index > 0 && line.ok)) recommendations.push('主线路异常但备用线路可用，建议调整线路顺序或修复主线路。');
  if (selected && selected.requestPath && selected.requestPath.startsWith('/emby/')) recommendations.push('源站实际 API 位于 /emby 子路径，反代需保留该路径。');
  if (lines.some(line => line.status === 401 || line.status === 403)) recommendations.push('公开接口返回 401/403，源站可能启用了访问限制或拦截 Cloudflare 出口。');

  let account = { tested: false };
  if (token && selected && selected.ok) {
    account = await doctorProbeAccount(selected.apiBase, token);
    if (!account.auth) recommendations.push('普通用户 Token 未通过验证，可能已失效或该线路未指向对应服务器。');
    else if (!account.library) recommendations.push('账号已登录，但媒体库接口不可用或账号没有可见媒体。');
    else if (!account.playback) recommendations.push('媒体库可读，但 PlaybackInfo 获取失败，需检查账号播放权限。');
    else if (account.range && account.range.skipped === 'external') recommendations.push('媒体地址指向站外域名，为保护用户 Token 已跳过 Range 请求。');
    else if (account.range && !account.range.ok && !account.range.redirected) recommendations.push('源站媒体 Range 未返回 206，拖动进度或直播放可能异常。');
  }
  if (!recommendations.length) recommendations.push('源站侧基础检查正常，请继续查看浏览器完成的反代链路检查。');
  return { lines, selectedLine: selected ? selected.line : 0, publicPath: selected && selected.requestPath ? selected.requestPath : '/System/Info/Public', serverId: selected && selected.serverId ? selected.serverId : '', version: selected && selected.version ? selected.version : '', account, recommendations };
}

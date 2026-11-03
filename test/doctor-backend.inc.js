// Emby Doctor test build: read-only diagnostics for configured routes only.
const DOCTOR_TIMEOUT_MS = 7000;
const DOCTOR_CLIENT_PROFILE = {
  client: 'SenPlayer', version: '6.2.2', device: 'iPhone',
  deviceId: '9c4e7a2b-6d8f-4b3a-9e2c-1f5d8a0b7e64',
  ua: 'SenPlayer/6.2.2 (iPhone; iOS 17.5; Scale/3.00)'
};

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

function doctorStripMediaCredentials(url) {
  const parsed = new URL(url);
  const blocked = new Set(['api_key', 'x-emby-token', 'x-mediabrowser-token', 'access_token', 'token']);
  for (const key of Array.from(parsed.searchParams.keys())) {
    if (blocked.has(key.toLowerCase())) parsed.searchParams.delete(key);
  }
  return parsed.href;
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
      const result = await doctorFetchJson(candidate.url, { headers: doctorAuthHeaders(candidate.url) });
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

function doctorAuthHeaderValue(token = '') {
  const profile = DOCTOR_CLIENT_PROFILE;
  const parts = [
    'MediaBrowser Client="' + profile.client + '"',
    'Device="' + profile.device + '"',
    'DeviceId="' + profile.deviceId + '"',
    'Version="' + profile.version + '"'
  ];
  if (token) parts.push('Token="' + String(token).replace(/["\\\r\n]/g, '') + '"');
  return parts.join(', ');
}

function doctorAuthHeaders(url, token = '', json = false) {
  const origin = new URL(url).origin;
  const headers = {
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': DOCTOR_CLIENT_PROFILE.ua,
    'X-Emby-Authorization': doctorAuthHeaderValue(token),
    Origin: origin,
    Referer: origin + '/'
  };
  if (token) headers['X-Emby-Token'] = token;
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

async function doctorAuthenticate(apiBase, username, password) {
  try {
    const authUrl = doctorJoin(apiBase, '/Users/AuthenticateByName');
    const response = await doctorFetchJson(authUrl, {
      method: 'POST',
      headers: doctorAuthHeaders(authUrl, '', true),
      body: JSON.stringify({ Username: username, Pw: password, Password: password })
    });
    const token = response.data && String(response.data.AccessToken || '');
    const userId = response.data && response.data.User && String(response.data.User.Id || '');
    return { ok: !!(response.ok && token), status: response.status, ms: response.ms, token, userId };
  } catch (error) {
    return { ok: false, status: 0, ms: -1, token: '', userId: '', error: error && error.name === 'AbortError' ? '登录超时' : '登录失败' };
  }
}

async function doctorLogoutSession(apiBase, token) {
  try {
    const logoutUrl = doctorJoin(apiBase, '/Sessions/Logout');
    const result = await doctorFetch(logoutUrl, {
      method: 'POST', redirect: 'manual', cache: 'no-store', headers: doctorAuthHeaders(logoutUrl, token)
    });
    return { ok: result.response.status >= 200 && result.response.status < 300, status: result.response.status, ms: result.ms };
  } catch (error) {
    return { ok: false, status: 0, ms: -1, error: error && error.name === 'AbortError' ? '注销超时' : '注销失败' };
  }
}

async function doctorProbeAccount(apiBase, token) {
  const result = { tested: true, auth: false, library: false, playback: false, range: null };
  try {
    const meUrl = doctorJoin(apiBase, '/Users/Me');
    const me = await doctorFetchJson(meUrl, { headers: doctorAuthHeaders(meUrl, token) });
    result.authStatus = me.status;
    result.authMs = me.ms;
    if (!me.ok || !me.data || !me.data.Id) return result;
    result.auth = true;
    result.userId = String(me.data.Id);

    const listPath = '/Users/' + encodeURIComponent(result.userId) + '/Items?Recursive=true&IncludeItemTypes=Movie,Episode&Limit=1&Fields=MediaSources&SortBy=DateCreated&SortOrder=Descending';
    const libraryUrl = doctorJoin(apiBase, listPath);
    const library = await doctorFetchJson(libraryUrl, { headers: doctorAuthHeaders(libraryUrl, token) });
    result.libraryStatus = library.status;
    result.libraryMs = library.ms;
    const item = library.data && Array.isArray(library.data.Items) ? library.data.Items[0] : null;
    if (!library.ok) return result;
    result.library = true;
    if (!item || !item.Id) return result;
    result.itemId = String(item.Id);

    const playbackPath = '/Items/' + encodeURIComponent(result.itemId) + '/PlaybackInfo?UserId=' + encodeURIComponent(result.userId) + '&IsPlayback=false&AutoOpenLiveStream=false';
    const playbackUrl = doctorJoin(apiBase, playbackPath);
    let playback = await doctorFetchJson(playbackUrl, { headers: doctorAuthHeaders(playbackUrl, token) });
    if (!playback.ok || !playback.data) {
      playback = await doctorFetchJson(playbackUrl, {
        method: 'POST', headers: doctorAuthHeaders(playbackUrl, token, true), body: JSON.stringify({ UserId: result.userId, IsPlayback: false, AutoOpenLiveStream: false })
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
      const rangeUrl = doctorStripMediaCredentials(doctorMediaUrl(apiBase, directUrl));
      if (new URL(rangeUrl).origin !== new URL(apiBase).origin) {
        result.range = { status: 0, ms: 0, ok: false, skipped: 'external' };
      } else {
        const range = await doctorFetch(rangeUrl, {
          method: 'GET', redirect: 'manual', cache: 'no-store',
          headers: Object.assign(doctorAuthHeaders(rangeUrl, token), { Range: 'bytes=0-1' })
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

async function runEmbyDoctor(route, credentials = {}) {
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
  const username = String(credentials.username || '').trim();
  const password = String(credentials.password == null ? '' : credentials.password);
  if (username && selected && selected.ok) {
    if (new URL(selected.apiBase).protocol !== 'https:') {
      account = { tested: true, auth: false, library: false, playback: false, range: null, insecureHttp: true };
      recommendations.push('源站使用 HTTP，为避免明文传输账号密码，已跳过账号与播放检测；请将源站改为 HTTPS。');
    } else {
      const login = await doctorAuthenticate(selected.apiBase, username, password);
      account = { tested: true, auth: false, library: false, playback: false, range: null, authStatus: login.status, authMs: login.ms };
      if (login.ok) {
        try {
          account = await doctorProbeAccount(selected.apiBase, login.token);
          account.loginMs = login.ms;
        } finally {
          const logout = await doctorLogoutSession(selected.apiBase, login.token);
          account.logout = logout;
          if (!logout.ok) recommendations.push('临时 Token 自动注销失败，请在 Emby 客户端设备列表中手动退出 Emby Doctor。');
        }
      }
    }
    if (!account.insecureHttp) {
      if (!account.auth) recommendations.push('普通用户账号或密码未通过验证，或该线路未指向对应服务器。');
      else if (!account.library) recommendations.push('账号已登录，但媒体库接口不可用或账号没有可见媒体。');
      else if (!account.playback) recommendations.push('媒体库可读，但 PlaybackInfo 获取失败，需检查账号播放权限。');
      else if (account.range && account.range.skipped === 'external') recommendations.push('媒体地址指向站外域名，为保护临时 Token 已跳过 Range 请求。');
      else if (account.range && !account.range.ok && !account.range.redirected) recommendations.push('源站媒体 Range 未返回 206，拖动进度或直播放可能异常。');
    }
  }
  if (!recommendations.length) recommendations.push('源站侧基础检查正常，请继续查看浏览器完成的反代链路检查。');
  return { lines, selectedLine: selected ? selected.line : 0, publicPath: selected && selected.requestPath ? selected.requestPath : '/System/Info/Public', serverId: selected && selected.serverId ? selected.serverId : '', version: selected && selected.version ? selected.version : '', account, recommendations };
}

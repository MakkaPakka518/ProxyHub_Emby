// VERSION: 4.0.8
const CURRENT_VERSION = "4.0.8"; 
//网页区域
// ============ isolate 级内存缓存 / 一次性初始化(减少每个请求的 D1 读写) ============
const memoStore = new Map();
// fn 抛错时:若有旧值则沿用旧值(stale-on-error),否则继续抛出
async function memoStale(key, ttlMs, fn) {
  const now = Date.now();
  const hit = memoStore.get(key);
  if (hit && hit.exp > now) return hit.val;
  try {
    const val = await fn();
    memoStore.set(key, { val, exp: now + ttlMs });
    if (memoStore.size > 300) memoStore.delete(memoStore.keys().next().value);
    return val;
  } catch (e) {
    if (hit) { console.error('memoStale fallback:', key, e && e.message); return hit.val; }
    throw e;
  }
}
function memoDel(...keys) { for (const k of keys) memoStore.delete(k); }
function memoDelPrefix(prefix) { for (const k of Array.from(memoStore.keys())) { if (k.indexOf(prefix) === 0) memoStore.delete(k); } }
let appConfigReady = false;
async function ensureAppConfig(env) {
  if (appConfigReady || !env || !env.DB) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)').run();
  appConfigReady = true;
}
// 一次性 DDL:同一 isolate 内每个 key 只执行一次(并发共享同一个 Promise);CREATE 失败不记已完成,下次重试;ALTER 失败(列已存在)忽略
const ddlOnceStore = new Map();
function ddlOnce(key, fn) {
  let p = ddlOnceStore.get(key);
  if (!p) { p = Promise.resolve().then(fn).catch(e => { ddlOnceStore.delete(key); throw e; }); ddlOnceStore.set(key, p); }
  return p;
}
async function ddlAlter(env, sql) { try { await env.DB.exec(sql); } catch (e) {} }
const ROUTE_COLS = [
  "mode TEXT DEFAULT 'off'", "remark TEXT DEFAULT ''", "last_play TEXT DEFAULT ''", "icon TEXT DEFAULT ''",
  "cache_img TEXT DEFAULT 'on'", "sort_order INTEGER DEFAULT 0", "custom_ip TEXT DEFAULT ''", "watch_limit TEXT DEFAULT '0'",
  "redirect_direct TEXT DEFAULT 'off'", "redirect_rules TEXT DEFAULT ''", "node_user TEXT DEFAULT ''", "node_pass TEXT DEFAULT ''",
  "emos_id TEXT DEFAULT ''", "emos_name TEXT DEFAULT ''", "emos_aggregate TEXT DEFAULT 'off'", "strm_opt TEXT DEFAULT 'off'", "force_direct TEXT DEFAULT 'off'",
  "direct_play TEXT DEFAULT 'on'", "edge_cache TEXT DEFAULT 'on'",
  "owner TEXT DEFAULT ''"
];
// 路由表及其关联表的完整初始化(三处入口共用,避免各自初始化不全却共用一个"已完成"标记)
function ensureRoutesSchema(env) {
  return ddlOnce('routes', async () => {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS routes (prefix TEXT PRIMARY KEY, target TEXT NOT NULL)`);
    for (const c of ROUTE_COLS) await ddlAlter(env, `ALTER TABLE routes ADD COLUMN ${c}`);
    await ensureNodeRequests(env);
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS request_stats (prefix TEXT, date TEXT, count INTEGER DEFAULT 0, PRIMARY KEY(prefix, date))`);
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS visitor_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, prefix TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, ip TEXT, country TEXT, ua TEXT)`);
    routesSchemaReady = true;
  });
}
function ensureNodeRequests(env) {
  return ddlOnce('node_requests', async () => {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS node_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, url TEXT, domain TEXT, user TEXT, ip TEXT, ua TEXT, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
    await ddlAlter(env, `ALTER TABLE node_requests ADD COLUMN ip TEXT DEFAULT ''`);
    await ddlAlter(env, `ALTER TABLE node_requests ADD COLUMN ua TEXT DEFAULT ''`);
  });
}
function ensureAdminNodeLogs(env) {
  return ddlOnce('admin_node_logs', async () => {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS admin_node_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, url TEXT, prefix TEXT, ip TEXT, ua TEXT, actor TEXT DEFAULT 'subadmin', created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
    await ddlAlter(env, `ALTER TABLE admin_node_logs ADD COLUMN actor TEXT DEFAULT 'subadmin'`);
  });
}
function ensureProxyHits(env) {
  return ddlOnce('proxy_hits', () => env.DB.exec(`CREATE TABLE IF NOT EXISTS proxy_hits (id INTEGER PRIMARY KEY AUTOINCREMENT, ip TEXT, path TEXT, ua TEXT, ts INTEGER, times INTEGER)`));
}
function ensurePlayHits(env) {
  return ddlOnce('play_hits', () => env.DB.exec(`CREATE TABLE IF NOT EXISTS play_hits (prefix TEXT, day TEXT, hour INTEGER, cnt INTEGER DEFAULT 1, PRIMARY KEY(prefix, day, hour))`));
}
function ensureVisitorLogs(env) {
  return ddlOnce('visitor_logs', async () => {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS visitor_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, prefix TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, ip TEXT, country TEXT, ua TEXT)`);
    await ddlAlter(env, `ALTER TABLE visitor_logs ADD COLUMN region TEXT DEFAULT ''`);
    await ddlAlter(env, `ALTER TABLE visitor_logs ADD COLUMN city TEXT DEFAULT ''`);
  });
}
// 原子节流:到期才抢占成功(单条 SQL,无读后写竞态)
async function claimThrottle(env, key, intervalMs) {
  await ensureAppConfig(env);
  const now = Date.now();
  const r = await env.DB.prepare("INSERT INTO app_config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(app_config.value AS INTEGER) <= ?")
    .bind(key, String(now), now - intervalMs).run();
  return !!(r && r.meta && r.meta.changes > 0);
}
// ============ 演示页素材(海报墙 / 横屏海报 / 播放片段)存入 D1 ============
// 首次有人打开首页时,Worker 在后台把 GitHub 上的素材按 256KB 分块存进 D1(可断点续传,每次只做一部分);
// 之后 /_a/p/<文件名> 一律从 D1 读取(支持 Range,视频可拖动)。D1 里还没存好的文件,临时从 GitHub 转发,不影响演示。
const POSTER_SRCS = ['https://raw.githubusercontent.com/MakkaPakka518/ProxyHub_Emby/main/POSTER/', 'https://cdn.jsdelivr.net/gh/MakkaPakka518/ProxyHub_Emby@main/POSTER/'];
const POSTER_CHUNK = 262144;
const POSTER_RANGE_CAP = 524288;
const POSTER_NAME_RE = /^(?:(?:[1-9]|[12][0-9]|30)\.webp|this\.webp|this\.mp4)$/;
const POSTER_ALL = ['this.webp', '9.webp'].concat(Array.from({ length: 30 }, (_, i) => (i + 1) + '.webp').filter(n => n !== '9.webp'), ['this.mp4']);
let posterAllDone = false, posterLastCheck = 0;
async function posterSchema(env) {
  await ddlOnce('poster_schema', async () => {
    await env.DB.exec('CREATE TABLE IF NOT EXISTS poster_assets (name TEXT PRIMARY KEY, mime TEXT, size INTEGER, chunks INTEGER, done INTEGER DEFAULT 0)');
    await env.DB.exec('CREATE TABLE IF NOT EXISTS poster_chunks (name TEXT, idx INTEGER, data TEXT, PRIMARY KEY(name, idx))');
  });
}
function posterMime(name) { return name.endsWith('.mp4') ? 'video/mp4' : 'image/webp'; }
async function posterFetch(name, range) {
  for (const base of POSTER_SRCS) {
    try {
      const r = await fetch(base + name, range ? { headers: { Range: range } } : undefined);
      if (r.ok || r.status === 206) return r;
    } catch (e) {}
  }
  return null;
}
function posterB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function posterUnb64(b) { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
// 断点续传式入库:按 POSTER_ALL 顺序,每次最多跑 budgetMs;下次从上次停下的分块继续
// Worker 里 Date.now() 在同步计算期间不走表,按「耗时」限额等于没限额;CPU 主要花在 base64 上,所以按「字节数」限额:
// 每次最多处理 budgetBytes(默认 512KB,约 5~6ms CPU),大文件(视频)分多次访问慢慢入库,避免单次请求超 CPU 限制。
async function posterSeed(env, budgetBytes) {
  await posterSchema(env);
  let spent = 0, nChunks = 0;
  for (const name of POSTER_ALL) {
    const row = await env.DB.prepare('SELECT * FROM poster_assets WHERE name = ?').bind(name).first();
    if (row && row.done) continue;
    let size = row ? row.size : 0, total = row ? row.chunks : 0;
    let idx = row ? ((await env.DB.prepare('SELECT COUNT(*) AS c FROM poster_chunks WHERE name = ?').bind(name).first()) || { c: 0 }).c : 0;
    for (;;) {
      if (spent >= budgetBytes || nChunks >= 6) return false;   // 另限每次最多 6 块:免费版单次请求最多 50 个子请求(含 D1 查询)
      const a = idx * POSTER_CHUNK, b = a + POSTER_CHUNK - 1;
      const r = await posterFetch(name, 'bytes=' + a + '-' + b);
      if (!r) return false;
      let buf = new Uint8Array(await r.arrayBuffer());
      if (r.status === 206) {
        const m = /\/(\d+)\s*$/.exec(r.headers.get('Content-Range') || '');
        if (m) size = parseInt(m[1], 10);
      } else { size = buf.length; buf = buf.subarray(a, b + 1); }   // 对方不支持 Range:返回整文件,自己切
      if (!size) return false;
      total = Math.ceil(size / POSTER_CHUNK);
      if (idx === 0) await env.DB.prepare('INSERT OR REPLACE INTO poster_assets (name, mime, size, chunks, done) VALUES (?, ?, ?, ?, 0)').bind(name, posterMime(name), size, total).run();
      await env.DB.prepare('INSERT OR REPLACE INTO poster_chunks (name, idx, data) VALUES (?, ?, ?)').bind(name, idx, posterB64(buf)).run();
      spent += buf.length; nChunks++; idx++;
      if (idx >= total) { await env.DB.prepare('UPDATE poster_assets SET done = 1 WHERE name = ?').bind(name).run(); break; }
    }
  }
  posterAllDone = true;
  return true;
}
// 触发入库:同一 isolate 每分钟最多检查一次;跨实例用 claimThrottle 防重复并发
async function posterKick(env) {
  if (!env || !env.DB || posterAllDone) return;
  const now = Date.now();
  if (now - posterLastCheck < 60000) return;
  posterLastCheck = now;
  await posterSchema(env);
  const c = await env.DB.prepare('SELECT COUNT(*) AS c FROM poster_assets WHERE done = 1').first();
  if (c && c.c >= POSTER_ALL.length) { posterAllDone = true; return; }
  if (!(await claimThrottle(env, 'poster_seed', 8000))) return;
  await posterSeed(env, (parseInt(env.POSTER_SEED_KB, 10) || 512) * 1024);
}
async function posterServe(request, env, ctx, name) {
  // 小图(海报)走 Cloudflare 边缘缓存:命中时不再读 D1、不再解码,几乎不耗 CPU
  if (name.endsWith('.webp') && request.method === 'GET' && typeof caches !== 'undefined' && caches.default) {
    const ck = new Request(new URL(request.url).origin + '/_a/p/' + name);
    try { const hit = await caches.default.match(ck); if (hit) return hit; } catch (e) {}
    const r = await posterServe0(request, env, ctx, name);
    if (r.status === 200 && r.headers.get('Cache-Control') && r.headers.get('Cache-Control').indexOf('immutable') >= 0 && ctx) {
      try { ctx.waitUntil(caches.default.put(ck, r.clone())); } catch (e) {}
    }
    return r;
  }
  return posterServe0(request, env, ctx, name);
}
async function posterServe0(request, env, ctx, name) {
  const head = request.method === 'HEAD';
  const rangeH = request.headers.get('Range');
  let row = null;
  if (env.DB) { try { await posterSchema(env); row = await env.DB.prepare('SELECT * FROM poster_assets WHERE name = ? AND done = 1').bind(name).first(); } catch (e) {} }
  if (!row) {
    // D1 还没存好:临时从 GitHub 转发,并在后台继续入库
    if (env.DB && ctx) ctx.waitUntil(posterKick(env).catch(() => {}));
    const ur = await posterFetch(name, rangeH);
    if (!ur) return new Response('Not Found', { status: 404 });
    const h = new Headers({ 'Content-Type': posterMime(name), 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=300' });
    for (const k of ['Content-Range', 'Content-Length']) { const v = ur.headers.get(k); if (v) h.set(k, v); }
    return new Response(head ? null : ur.body, { status: ur.status, headers: h });
  }
  const size = row.size;
  let start = 0, end = size - 1, status = 200;
  if (rangeH) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(rangeH.trim());
    if (m && (m[1] !== '' || m[2] !== '')) {
      if (m[1] === '') { start = Math.max(0, size - parseInt(m[2], 10)); }
      else { start = parseInt(m[1], 10); if (m[2] !== '') end = Math.min(size - 1, parseInt(m[2], 10)); }
      if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
      status = 206;
      // 单次最多回 512KB:每个请求的 base64 解码 CPU 有上限(播放器会自动接着请求后续区间)
      if (end - start + 1 > POSTER_RANGE_CAP) end = start + POSTER_RANGE_CAP - 1;
    }
  }
  const h = new Headers({ 'Content-Type': row.mime || posterMime(name), 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1), 'Cache-Control': 'public, max-age=31536000, immutable', 'ETag': 'W/"poster-' + name + '-' + size + '"' });
  if (status === 206) h.set('Content-Range', 'bytes ' + start + '-' + end + '/' + size);
  if (head) return new Response(null, { status, headers: h });
  let i = Math.floor(start / POSTER_CHUNK); const last = Math.floor(end / POSTER_CHUNK);
  const body = new ReadableStream({
    async pull(ctrl) {
      if (i > last) { ctrl.close(); return; }
      const hi = Math.min(last, i + 3);
      const { results } = await env.DB.prepare('SELECT idx, data FROM poster_chunks WHERE name = ? AND idx BETWEEN ? AND ? ORDER BY idx').bind(name, i, hi).all();
      if (!results || results.length !== hi - i + 1) { ctrl.error(new Error('chunk missing')); return; }
      for (const r of results) {
        const u8 = posterUnb64(r.data), cs = r.idx * POSTER_CHUNK;
        const s = Math.max(start, cs) - cs, e = Math.min(end, cs + u8.length - 1) - cs;
        if (e >= s) ctrl.enqueue(u8.subarray(s, e + 1));
      }
      i = hi + 1;
    }
  });
  return new Response(body, { status, headers: h });
}
// 页面 HTML(面板约 380KB):换 logo 的 split/join 与 UTF-8 编码只做一次并缓存;带 ETag,浏览器二次访问直接 304,不再重复传输与编码
const htmlCache = new Map();
function htmlHash(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function htmlResponse(request, base, tag, lg) {
  const logoVal = (lg && lg.value) ? String(lg.value) : '';
  const key = tag + '|' + logoVal;
  let ent = htmlCache.get(key);
  if (!ent) {
    const body = logoVal ? base.split(EMBY_LOGO).join(logoVal) : base;
    ent = { body: new TextEncoder().encode(body), etag: 'W/"' + tag + '-' + CURRENT_VERSION + '-' + base.length + '-' + htmlHash(logoVal) + '"' };
    if (htmlCache.size > 8) htmlCache.clear();
    htmlCache.set(key, ent);
  }
  const hd = { 'ETag': ent.etag, 'Cache-Control': 'private, no-cache' };
  const inm = request.headers.get('If-None-Match');
  if (inm && inm.indexOf(ent.etag) >= 0) return new Response(null, { status: 304, headers: hd });
  hd['Content-Type'] = 'text/html;charset=UTF-8';
  return new Response(ent.body, { headers: hd });
}
const _te = new TextEncoder();
async function sha256Hex(str) {
  const d = await crypto.subtle.digest('SHA-256', _te.encode(String(str)));
  return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function hmacHex(key, msg) {
  const k = await crypto.subtle.importKey('raw', _te.encode(String(key)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, _te.encode(String(msg)));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============ 真用户系统(用户隔离;保留订阅用户系统) ============
const USER_SUFFIX_RE = /^[a-z0-9_-]{3,24}$/;
const USER_NODE_RE = /^[A-Za-z0-9_-]{1,32}$/;
const USER_DEFAULT_MAX_NODES = 5;
const USER_RESERVED_SUFFIX = ['entry', 'api', 'catch', 'speedtest', '__client_rtt__', 'favicon.ico', 'emby', 'videos', 'items', 'img', 'users', 'web', 'system', 'sessions', 'audio', 'images', 'library', 'admin', 'login'];
let usersSchemaReady = false;
async function ensureUsersSchema(env) {
  if (usersSchemaReady || !env || !env.DB) return;
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS panel_users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT DEFAULT '', suffix TEXT UNIQUE, pass_hash TEXT UNIQUE, max_nodes INTEGER DEFAULT 5, can_ka INTEGER DEFAULT 1, enabled INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP, last_login TEXT DEFAULT '')`);
  try { await env.DB.exec(`ALTER TABLE routes ADD COLUMN owner TEXT DEFAULT ''`); } catch (e) {}
  usersSchemaReady = true;
}
// 用户列表内存缓存 15 秒(写操作后由 memoDel('panel_users') 失效);反代热路径和会话校验共用
async function getUsersCached(env) {
  if (!env || !env.DB) return [];
  return await memoStale('panel_users', 15000, async () => {
    await ensureUsersSchema(env);
    const r = await env.DB.prepare('SELECT id, name, suffix, pass_hash, max_nodes, can_ka, enabled FROM panel_users').all();
    return r.results || [];
  });
}
// 关闭 Smart Placement / 回边缘:Cloudflare multipart 设置接口的 placement.mode 只接受 "smart",
// 不存在 "off"——直接传 {mode:"off"} 会被 CF 判为 invalid placement mode。
// 回到"离访客最近的边缘节点"的官方做法是:用一份【不带 placement】的全量 multipart 重传脚本。
// 这里下载当前线上脚本,无损保留变量/D1/KV 等绑定与兼容性配置后重新部署,仅移除 placement。
async function deployPlacementEdge(env) {
  const token = env.CF_API_TOKEN, accountId = env.CF_ACCOUNT_ID, workerName = env.CF_WORKER_NAME;
  const auth = { 'Authorization': `Bearer ${token}` };
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`;

  // 1. 拉取当前线上脚本(单模块 ESM,content 端点直接返回 JS)
  const contentRes = await fetch(`${base}/content`, { headers: auth });
  if (!contentRes.ok) throw new Error(`读取线上脚本失败(HTTP ${contentRes.status}),请稍后重试或在 Cloudflare 后台手动关闭`);
  const ct = (contentRes.headers.get('content-type') || '').toLowerCase();
  if (ct.indexOf('javascript') === -1) throw new Error('该 Worker 为多模块结构,无法一键回边缘,请在 Cloudflare 后台手动关闭 Smart Placement');
  const code = await contentRes.text();
  if (!code || code.length < 32) throw new Error('线上脚本内容异常,已中止以避免覆盖');

  // 2. 读取兼容性日期/标志(故意不读取 placement)
  let compDate = '2024-01-01', compFlags = undefined;
  try {
    const svcRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/services/${workerName}`, { headers: auth });
    const svc = await svcRes.json();
    if (svc.success && svc.result) {
      const info = (svc.result.default_environment && svc.result.default_environment.script) || svc.result.script;
      if (info) {
        if (info.compatibility_date) compDate = info.compatibility_date;
        if (info.compatibility_flags) compFlags = info.compatibility_flags;
      }
    }
  } catch (e) {}

  // 3. 无损备份绑定:env 中的文本变量(命中 TOKEN/SECRET/PASS/KEY 按 secret 回写),再合并平台侧 D1/KV 等高级绑定
  const bindings = [];
  const secretNames = new Set();
  const SECRET_RE = /(TOKEN|SECRET|PASS|KEY)/i;
  for (const k in env) {
    if (typeof env[k] !== 'string') continue;
    const isSecret = secretNames.has(k) || SECRET_RE.test(k);
    bindings.push({ name: k, type: isSecret ? 'secret_text' : 'plain_text', text: env[k] });
  }
  try {
    const bRes = await fetch(`${base}/bindings`, { headers: auth });
    const bData = await bRes.json();
    if (bData.success && Array.isArray(bData.result)) {
      for (const b of bData.result) {
        if (b.type === 'secret_text') secretNames.add(b.name);
        else if (b.type !== 'plain_text' && b.type !== 'inherited') bindings.push(b);
      }
    }
  } catch (e) {}

  // 4. 全量重传,metadata 故意不带 placement → 回默认边缘
  const fd = new FormData();
  const metadata = { main_module: 'worker.js', bindings: bindings, compatibility_date: compDate };
  if (compFlags) metadata.compatibility_flags = compFlags;
  fd.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }), 'metadata.json');
  fd.append('worker.js', new Blob([code], { type: 'application/javascript+module' }), 'worker.js');
  const putRes = await fetch(base, { method: 'PUT', headers: auth, body: fd });
  const put = await putRes.json();
  if (!put.success) throw new Error('回边缘部署失败: ' + ((put.errors && put.errors[0] && put.errors[0].message) || '未知错误'));
  return true;
}
// 恒定时间字符串比较(避免按字符提前返回的时序差异)
function timingSafeEq(a, b) {
  a = String(a == null ? '' : a); b = String(b == null ? '' : b);
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
// Logo 值白名单:防止带引号/尖括号的值逃出 HTML 属性
function isSafeLogoValue(v) {
  const t = String(v || '');
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+\/=]+$/i.test(t)) return true;
  if (/^https?:\/\/[^\s"'<>`\\]+$/i.test(t)) { try { new URL(t); return true; } catch (e) {} }
  return false;
}
const AUTH_FAIL_MAX = 8;                 // 登录失败上限(每窗口每 IP)
const AUTH_FAIL_WINDOW = 10 * 60 * 1000; // 10 分钟窗口
async function authIsBlocked(env, ip) {
  if (!env.DB || !ip) return false;
  try {
    await ensureAppConfig(env);
    const win = Math.floor(Date.now() / AUTH_FAIL_WINDOW);
    const r = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?').bind('authfail:' + win + ':' + ip).first();
    return !!(r && parseInt(r.value, 10) >= AUTH_FAIL_MAX);
  } catch (e) { return false; }
}
async function authRecordFail(env, ip) {
  if (!env.DB || !ip) return;
  try {
    await ensureAppConfig(env);
    const win = Math.floor(Date.now() / AUTH_FAIL_WINDOW);
    await env.DB.prepare("INSERT INTO app_config(key,value) VALUES(?,'1') ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1").bind('authfail:' + win + ':' + ip).run();
    if (Math.random() < 0.02) await env.DB.prepare("DELETE FROM app_config WHERE key LIKE 'authfail:%' AND key NOT LIKE ?").bind('authfail:' + win + ':%').run();
  } catch (e) {}
}
function normalizeClientIp(ip) {
  const t = String(ip || '').trim();
  const m = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(t);
  return m ? m[1] : t;
}
function safeRedirectResponse(target) {
  try {
    const u = new URL(String(target || ''));
    if (u.protocol === 'http:' || u.protocol === 'https:') return Response.redirect(u.href, 302);
  } catch (e) {}
  return null;
}
async function isBareProxyEnabled(env) {
  try {
    if (!env.DB) return true;
    return await memoStale('bare_proxy', 30000, async () => {
      await ensureAppConfig(env);
      const r = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'bare_proxy_enabled'").first();
      return !(r && r.value === '0');
    });
  } catch (e) { return true; }
}

// ============ 路由表 schema 初始化内存标记(仅首次执行,节点接口提速) ============
let routesSchemaReady = false;
let lastLogsCleanAt = 0;
const BANDWIDTH_CACHE_TTL = 120000; // 带宽统计内存缓存:2 分钟
const bandwidthCache = new Map();
const GITHUB_RAW_URL = "https://raw.githubusercontent.com/MakkaPakka518/ProxyHub_Emby/refs/heads/main/worker.js";
const CHANGELOG_URL = "https://raw.githubusercontent.com/MakkaPakka518/ProxyHub_Emby/refs/heads/main/changelog.json";

// ============ 边缘缓存全局配置(可在此关闭) ============
// EDGE_CACHE_STATIC_TTL:静态资源(图片/js/css/字体)边缘缓存秒数(默认 1 天,与旧版一致)
// 注:3.4.43 移除「Static 直连视频边缘缓存」——视频流进 CF 边缘缓存(cacheEverything)会拖慢首播,视频一律直接反代
const EDGE_CACHE_STATIC_TTL = 86400;

// ==========================================
// 1. 网页界面
// ==========================================

const SVG_EYE = `<svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;
const SVG_COPY = `<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`;
const SVG_TG = `<svg viewBox="0 0 24 24" style="width:20px;height:20px;margin-right:8px;fill:#0088cc;"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.94z"/></svg>`;

const EMBY_LOGO = 'https://raw.githubusercontent.com/MakkaPakka518/Icon/refs/heads/main/MAKKA_EMBY.JPG';  // 玛卡巴卡的头像(外链);加载失败时 topbar 有内置占位兜底,可在账户设置→更换头像

const I = {
  rocket:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2 0-2.8-.8-.7-2.2-.7-3 .8z"/><path d="M12 15l-3-3c.5-4 4-7.5 8-8 2 .2 3.8 2 4 4-.5 4-4 7.5-8 8l-1-1z"/><path d="M9 12c-2 1-3.5 3-4 5"/><circle cx="15" cy="9" r="0.5"/></svg>',
  xmark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>',
  warn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3L2 20h20L12 3z"/><path d="M12 10v4M12 17.5h.01"/></svg>',
  film:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>',
  star:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l2.7 5.7 6.3.8-4.6 4.3 1.1 6.2-5.5-3-5.5 3 1.1-6.2L3 9.5l6.3-.8L12 3z"/></svg>',
  sparkles:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14zM6 14l.6 1.7L8.5 16l-1.9.7L6 18.5l-.6-1.8L3.5 16l1.9-.3L6 14z"/></svg>',
  globe:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/></svg>',
  bolt:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>',
  refresh:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 3v5h-5"/></svg>',
  chart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 20V10M12 20V4M19 20v-7"/></svg>',
  cloud:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a4 4 0 1 1 0-8 5 5 0 0 1 9.6 1.3A3.5 3.5 0 0 1 17 18H7z"/></svg>',
  trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  location:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  trophy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4z"/><path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3"/></svg>',
  moon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  pencil:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
  gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.2 4.2l2.8 2.8M17 17l2.8 2.8M1 12h4M19 12h4M4.2 19.8L7 17M17 7l2.8-2.8"/></svg>',
  lines:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18v2H3zM3 11h18v2H3zM3 16h18v2H3z"/></svg>',
  box:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
  download:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
  antenna:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.4 2a14 14 0 0 0 0 20M17.6 2a14 14 0 0 1 0 20M9.8 5.5a9 9 0 0 0 0 13M14.2 5.5a9 9 0 0 1 0 13"/><circle cx="12" cy="12" r="1.5"/></svg>',
  bulb:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M8 14.5A6 6 0 0 1 12 5a6 6 0 0 1 4 9.5c-.8.8-1 1.6-1 2.5h-6c0-.9-.2-1.7-1-2.5z"/></svg>',
  tv:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="13" rx="2"/><path d="M8 21h8M12 18v3"/></svg>',
  flame:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-5-.5 1-1 2-1 3 0 2.5 3 3 3 6 1-2 0-4 0-4 2 1 3 3 3 4.5A6.5 6.5 0 0 1 12 22 6.5 6.5 0 0 1 5.5 15C5.5 9 12 2 12 2z"/></svg>',
  link:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4.93"/><path d="M14 11a5 5 0 0 0-7.07 0l-2.83 2.83a5 5 0 0 0 7.07 7.07L13 19.07"/></svg>',
  crown:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l4 4 5-6 5 6 4-4-2 12H5L3 7z"/><path d="M6 19h12"/></svg>',
  target:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>',
  arrowdown:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
  robot:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 8V4M8 4h8"/><circle cx="9.5" cy="13" r="1" fill="currentColor"/><circle cx="14.5" cy="13" r="1" fill="currentColor"/><path d="M2 13v3M22 13v3"/></svg>',
  spy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="11" r="7"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/><path d="M9.5 14c1 .8 4 .8 5 0"/></svg>',
  flask:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v5L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 8V3"/><path d="M7 15h10"/></svg>',
  broom:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3l8 8M11 11l8-8M4 20l7-7 1 1-7 7-2-1z"/><path d="M6 8l4 4"/></svg>',
  checksquare:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12.5l2.5 2.5L16 9"/></svg>',
  upload:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5M4 21h16"/></svg>',
  db:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
  dotblue:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#007aff"/></svg>',
  dotorange:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#ff9500"/></svg>',
  dotgreen:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#34c759"/></svg>',
  dotpurple:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#af52de"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
};

const E2I = { '${I.rocket}':'rocket','${I.xmark}':'xmark','${I.check}':'check','${I.warn}':'warn','${I.film}':'film','${I.star}':'star','${I.sparkles}':'sparkles','${I.sparkles}':'sparkles','${I.globe}':'globe','${I.globe}':'globe','${I.bolt}':'bolt','${I.refresh}':'refresh','${I.chart}':'chart','${I.cloud}':'cloud','${I.trash}':'trash','${I.search}':'search','${I.location}':'location','${I.trophy}':'trophy','${I.moon}':'moon','${I.sun}':'sun','${I.dotblue}':'dotblue','${I.dotorange}':'dotorange','${I.dotgreen}':'dotgreen','${I.dotpurple}':'dotpurple','${I.robot}':'robot','${I.spy}':'spy','${I.flame}':'flame','${I.link}':'link','${I.tv}':'tv','${I.box}':'box','${I.download}':'download','${I.antenna}':'antenna','${I.bulb}':'bulb','${I.crown}':'crown','${I.target}':'target','${I.arrowdown}':'arrowdown','${I.xmark}':'xmark','${I.pencil}':'pencil','${I.gear}':'gear','${I.lines}':'lines','${I.flask}':'flask','${I.broom}':'broom','${I.checksquare}':'checksquare','${I.upload}':'upload' };
function toSvg(s){
  if(!s) return s;
  return String(s).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, function(ch){
    if(ch==='\uFE0F') return '';
    var key = E2I[ch];
    return (key && I[key]) ? '<span class="ti">'+I[key]+'</span>' : '';
  });
}


const CSS_COMMON = `
    /* =====================================================
       NEBULA 星云 —— 深空科幻设计系统
       默认深色夜空（霓虹发光）/ 可选晨曦浅色
       变量名与主 JS 完全兼容（--bg/--card/--primary/--border/--text 等）
       ===================================================== */
    :root {
        --primary:#3d7bff;
        --primary-2:#00d4ff;
        --primary-hover:#2f6bff;
        --primary-soft:rgba(61,123,255,.14);
        --primary-grad:linear-gradient(135deg,#00d4ff 0%,#3d7bff 100%);
        --primary-grad-2:linear-gradient(135deg,#7c5cff 0%,#00d4ff 100%);
        --bg:#f6f7fd;
        --bg-soft:#eef1fb;
        --bg-2:#e9ecf8;
        --card:#ffffff;
        --card-glass:rgba(255,255,255,.7);
        --glass-border:rgba(255,255,255,.6);
        --text:#131627;
        --text-sec:#5d6480;
        --text-faint:#9aa1bd;
        --border:#e3e7f4;
        --border-strong:#cdd4ea;
        --success:#0fbf7f;
        --success-soft:rgba(15,191,127,.12);
        --warning:#f5a623;
        --warning-soft:rgba(245,166,35,.14);
        --danger:#ff4d6a;
        --danger-soft:rgba(255,77,106,.12);
        --info:#22b8ff;
        --violet:#8b5cf6;
        --radius:18px;
        --radius-card:18px;
        --radius-md:13px;
        --radius-sm:10px;
        --shadow-sm:0 1px 2px rgba(20,24,50,.05),0 2px 6px rgba(20,24,50,.06);
        --shadow:0 2px 6px rgba(20,24,50,.06),0 8px 22px rgba(20,24,50,.08);
        --shadow-lg:0 6px 16px rgba(20,24,50,.1),0 20px 46px rgba(20,24,50,.14);
        --blur:blur(22px) saturate(180%);
        --topbar-h:62px;
        --font-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
        --ease:cubic-bezier(.22,.7,.28,1);
    }
    body.dark {
        --primary:#4da3ff;
        --primary-2:#00e5ff;
        --primary-hover:#3d97ff;
        --primary-soft:rgba(77,163,255,.16);
        --primary-grad:linear-gradient(135deg,#00e5ff 0%,#4da3ff 100%);
        --primary-grad-2:linear-gradient(135deg,#8b5cf6 0%,#00e5ff 100%);
        --bg:#060a13;
        --bg-soft:#0b1220;
        --bg-2:#0a0f1c;
        --card:#0d1526;
        --card-glass:rgba(10,16,30,.72);
        --glass-border:rgba(0,229,255,.14);
        --text:#e8eefc;
        --text-sec:#9aa5c2;
        --text-faint:#7d89ad;
        --border:#243350;
        --border-strong:#2a3a5c;
        --success:#22e39a;
        --success-soft:rgba(34,227,154,.14);
        --warning:#ffb84d;
        --warning-soft:rgba(255,184,77,.15);
        --danger:#ff5c7a;
        --danger-soft:rgba(255,92,122,.14);
        --info:#38bdf8;
        --violet:#a78bfa;
        --shadow-sm:0 1px 3px rgba(0,0,0,.4);
        --shadow:0 2px 8px rgba(0,0,0,.4),0 10px 26px rgba(0,0,0,.42);
        --shadow-lg:0 4px 14px rgba(0,0,0,.5),0 18px 44px rgba(0,0,0,.55),0 0 40px rgba(77,163,255,.05);
        --glow:0 0 0 1px rgba(0,229,255,.06), 0 0 24px rgba(0,229,255,.08);
    }

    /* ============ 基础 ============ */
    *{box-sizing:border-box;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
    html{background:var(--bg)}
    html,body{margin:0;padding:0}
    html.dark{background:#060a13} /* 同步 body.dark --bg,防 iOS Safari 橡皮筋露白 */
    body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--text);min-height:100vh;-webkit-text-size-adjust:100%;transition:background-color .35s,color .35s;letter-spacing:.1px;overflow-x:hidden}
    /* 星云背景：星点 + 极光 */
    body::before{content:'';position:fixed;inset:0;z-index:-2;pointer-events:none;background:
        radial-gradient(2px 2px at 12% 22%, rgba(255,255,255,.5), transparent 40%),
        radial-gradient(1.5px 1.5px at 78% 12%, rgba(0,229,255,.6), transparent 40%),
        radial-gradient(2px 2px at 34% 78%, rgba(255,255,255,.4), transparent 40%),
        radial-gradient(1.5px 1.5px at 62% 58%, rgba(139,92,246,.6), transparent 40%),
        radial-gradient(2px 2px at 88% 82%, rgba(255,255,255,.35), transparent 40%),
        radial-gradient(1.5px 1.5px at 5% 62%, rgba(0,229,255,.45), transparent 40%),
        radial-gradient(1.5px 1.5px at 45% 8%, rgba(255,255,255,.4), transparent 40%),
        radial-gradient(1100px 480px at 12% -8%, rgba(61,123,255,.14), transparent 62%),
        radial-gradient(900px 460px at 108% 6%, rgba(0,213,255,.1), transparent 60%),
        radial-gradient(760px 480px at 50% 118%, rgba(139,92,246,.12), transparent 62%);
        background-repeat:no-repeat;
    }
    body.dark::before{background:
        radial-gradient(2px 2px at 12% 22%, rgba(255,255,255,.7), transparent 40%),
        radial-gradient(1.5px 1.5px at 78% 12%, rgba(0,229,255,.9), transparent 40%),
        radial-gradient(2px 2px at 34% 78%, rgba(255,255,255,.6), transparent 40%),
        radial-gradient(1.5px 1.5px at 62% 58%, rgba(139,92,246,.9), transparent 40%),
        radial-gradient(2px 2px at 88% 82%, rgba(255,255,255,.5), transparent 40%),
        radial-gradient(1.5px 1.5px at 5% 62%, rgba(0,229,255,.7), transparent 40%),
        radial-gradient(1.5px 1.5px at 45% 8%, rgba(255,255,255,.6), transparent 40%),
        radial-gradient(1100px 480px at 12% -8%, rgba(77,163,255,.16), transparent 62%),
        radial-gradient(900px 460px at 108% 6%, rgba(0,229,255,.1), transparent 60%),
        radial-gradient(760px 480px at 50% 118%, rgba(139,92,246,.14), transparent 62%);
        background-repeat:no-repeat;}
    /* 网格线层 */
    body::after{content:'';position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.5;
        background-image:
            linear-gradient(rgba(0,229,255,.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,229,255,.025) 1px, transparent 1px);
        background-size:44px 44px;
        mask-image:radial-gradient(ellipse 90% 60% at 50% 0%, #000 20%, transparent 75%);}
    body.dark::after{opacity:.8;background-image:
        linear-gradient(rgba(0,229,255,.045) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0,229,255,.045) 1px, transparent 1px);
        background-size:44px 44px;
        mask-image:radial-gradient(ellipse 90% 60% at 50% 0%, #000 20%, transparent 75%);}
    ::selection{background:rgba(77,163,255,.3)}
    a{color:var(--primary);text-decoration:none}
    input,select,button,textarea{font-family:inherit;outline:none;font-size:14px}
    input::placeholder,textarea::placeholder{color:var(--text-sec)}
    input,select,textarea{transition:border-color .18s,box-shadow .18s,background .18s}
    input:focus,select:focus,textarea:focus{border-color:var(--primary)!important;box-shadow:0 0 0 3px var(--primary-soft), 0 0 16px rgba(0,229,255,.12)!important}
    .container{max-width:1200px;margin:0 auto;width:100%;min-height:100vh;display:flex;flex-direction:column;padding:calc(var(--topbar-h) + 56px) 24px 100px}

    /* ============ 分区标题（HUD 标签） ============ */
    .section-head{display:flex;align-items:center;gap:10px;margin:36px 2px 16px;font-size:11.5px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--text-sec)}
    .section-head:first-child{margin-top:6px}
    .section-head::before{content:'';width:8px;height:8px;background:var(--primary-grad);transform:rotate(45deg);box-shadow:0 0 10px var(--primary);flex-shrink:0}
    .section-head::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,var(--border),transparent)}

    /* ============ 卡片（深空舱板） ============ */
    .card{background:var(--card);padding:24px;border-radius:var(--radius);box-shadow:var(--shadow);margin-bottom:20px;border:1px solid var(--border);transition:box-shadow .25s,border-color .25s,transform .25s;position:relative}
    .card:hover{box-shadow:var(--shadow-lg);border-color:var(--border-strong)}
    body.dark .card{background:linear-gradient(160deg, rgba(13,21,38,.9), rgba(10,16,30,.95));border-color:rgba(0,229,255,.08)}
    body.dark .card:hover{border-color:rgba(0,229,255,.25);box-shadow:var(--shadow-lg), var(--glow)}
    .card h2,.card h3{display:flex;align-items:center;gap:9px;margin:0}
    .card h2{font-size:16px;font-weight:700;letter-spacing:.1px}
    .card h2 svg,.card h3 svg{color:var(--primary)}
    .card h3{font-size:14.5px;font-weight:700;color:var(--text)}
    .card-header{display:flex;align-items:center;flex-wrap:wrap;gap:10px}
    .card-tools{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-left:auto}
    .card-sub{font-size:12.5px;color:var(--text-sec);font-weight:500}

    /* Hero 大标题卡（星云主视觉） */
    .hero-card{display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:30px 30px;background:var(--card);overflow:hidden}
    body.dark .hero-card{background:
        radial-gradient(520px 240px at 88% -30%, rgba(139,92,246,.22), transparent 65%),
        radial-gradient(480px 260px at 12% 130%, rgba(0,229,255,.16), transparent 60%),
        linear-gradient(160deg, rgba(13,21,38,.92), rgba(8,13,24,.96))}
    .hero-card::after{content:'';position:absolute;right:-90px;top:-90px;width:260px;height:260px;border-radius:50%;border:1px solid rgba(0,229,255,.14);box-shadow:0 0 60px rgba(0,229,255,.1), inset 0 0 40px rgba(139,92,246,.08);pointer-events:none;animation:heroPulse 5s ease-in-out infinite}
    .hero-card::before{content:'';position:absolute;left:-70px;bottom:-70px;width:180px;height:180px;border-radius:50%;border:1px dashed rgba(0,229,255,.1);pointer-events:none}
    @keyframes heroPulse{0%,100%{opacity:.8}50%{opacity:.35}}
    .hero-card h1{font-size:24px;font-weight:800;margin:0;display:flex;align-items:center;gap:12px;letter-spacing:-.3px;position:relative}
    body.dark .hero-card h1{background:linear-gradient(120deg,#7ec9ff 0%,#00e5ff 45%,#a78bfa 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 0 18px rgba(0,229,255,.25))}
    .hero-card h1 svg{width:26px;height:26px}
    body.dark .hero-card h1 svg{color:var(--primary-2)}
    .hero-card .hero-sub{font-size:13px;color:var(--text-sec);margin-top:5px;font-weight:500}
    .hero-chip{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:800;letter-spacing:1.5px;color:var(--primary);background:var(--primary-soft);border:1px solid rgba(61,123,255,.3);padding:4px 11px;border-radius:999px;vertical-align:middle;text-transform:uppercase}
    body.dark .hero-chip{color:var(--primary-2);background:rgba(0,229,255,.08);border-color:rgba(0,229,255,.28);box-shadow:0 0 16px rgba(0,229,255,.15)}
    body.dark .hero-chip{color:var(--primary-2);background:rgba(0,229,255,.10);border-color:rgba(0,229,255,.34);box-shadow:0 0 18px rgba(0,229,255,.22);text-shadow:0 0 8px rgba(0,229,255,.55)}
    .hero-chip{text-shadow:0 0 10px rgba(0,229,255,.35)}

    /* ============ 五种反代模式卡片(NEBULA) ============ */
    .mode-cards-card{padding:20px 22px 22px}
    .glow-h{background:linear-gradient(120deg,#7ec9ff 0%,#00e5ff 45%,#a78bfa 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 0 12px rgba(0,229,255,.22))}
    .mode-cards{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-top:4px}
    .mode-card{position:relative;border-radius:14px;padding:13px 12px 12px;overflow:hidden;background:var(--card);border:1px solid var(--border);transition:transform .18s,border-color .18s,box-shadow .18s;cursor:pointer}
    body.dark .mode-card{background:linear-gradient(180deg,rgba(10,18,32,.9),var(--card))}
    .mode-card:hover{transform:translateY(-2px);border-color:var(--mc)}
    .mode-card:active{transform:scale(.97)}
    .mode-card .mc-top{display:flex;align-items:center;gap:6px;margin-bottom:8px;justify-content:space-between}
    .mode-card .mc-idx{font-size:10px;font-weight:800;letter-spacing:1.4px;opacity:.85}
    .mode-card .mc-count{font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:999px;background:var(--mc);color:#0b1220;opacity:.95;flex-shrink:0;line-height:1.4}
    .mode-card .mc-name{font-size:15px;font-weight:800;margin-bottom:3px;color:var(--text)}
    .mode-card .mc-desc{font-size:11.5px;color:var(--text-sec);line-height:1.45}
    .mode-card.mc-all{--mc:#94a3b8}
    @media(max-width:760px){.mode-cards{grid-template-columns:repeat(3,1fr)}}
    @media(max-width:430px){.mode-cards{grid-template-columns:1fr}}
    /* 模式卡操作浮层 */
    .mode-card-menu{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:1200;width:min(360px,calc(100vw - 40px));background:var(--card);border:1px solid var(--border-strong);border-radius:16px;padding:20px;box-shadow:var(--shadow-lg);display:none}
    .mode-card-menu .mm-title{font-size:16px;font-weight:800;display:flex;align-items:center;gap:8px}
    .mode-card-menu .mm-desc{font-size:12.5px;color:var(--text-sec);margin:6px 0 14px;line-height:1.5}
    .mode-card-menu .mm-stats{font-size:13px;font-weight:700;margin-bottom:16px;padding:10px 12px;border-radius:10px;background:rgba(120,120,120,.08)}
    .mode-card-menu .mm-btns{display:flex;flex-direction:column;gap:10px}
    .mode-card-menu .mm-btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:11px 14px;border-radius:10px;font-size:13.5px;font-weight:700;cursor:pointer;border:1px solid var(--border-strong);background:var(--card);color:var(--text);transition:all .15s}
    .mode-card-menu .mm-btn:hover{border-color:var(--mc);box-shadow:0 0 0 3px color-mix(in srgb, var(--mc) 18%, transparent)}
    .mode-card-menu .mm-btn.mm-primary{background:var(--mc);color:#0b1220;border-color:transparent}
    .mode-card-menu .mm-btn:disabled{opacity:.45;cursor:not-allowed}
    .mode-card-menu .mm-close{position:absolute;right:14px;top:14px;width:28px;height:28px;border-radius:50%;border:1px solid var(--border);background:transparent;color:var(--text-sec);font-size:14px;cursor:pointer;line-height:1}
    .mode-card-menu .mm-close:hover{color:var(--text);border-color:var(--border-strong)}

    /* ============ 顶栏（指挥舱玻璃） ============ */
    .topbar{position:fixed;top:0;left:0;right:0;z-index:900;display:flex;align-items:center;gap:14px;padding:0 20px;height:var(--topbar-h);background:var(--card-glass);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border-bottom:1px solid var(--border);box-shadow:0 1px 2px rgba(16,24,40,.04),0 4px 18px rgba(16,24,40,.05)}
    body.dark .topbar{background:rgba(7,12,22,.72);border-bottom:1px solid rgba(0,229,255,.12);box-shadow:0 1px 0 rgba(0,229,255,.08), 0 8px 30px rgba(0,0,0,.4)}
    .topbar-brand{display:flex;align-items:center;gap:11px;min-width:0;flex-shrink:0}
    .topbar-logo{width:36px;height:36px;border-radius:11px;object-fit:cover;flex-shrink:0;box-shadow:0 3px 12px rgba(0,0,0,.25);border:1px solid var(--border);cursor:pointer;transition:box-shadow .2s}
    body.dark .topbar-logo{box-shadow:0 0 18px rgba(0,229,255,.3), 0 3px 12px rgba(0,0,0,.3);border-color:rgba(0,229,255,.25)}
    .topbar-logo:hover{box-shadow:0 0 24px rgba(0,229,255,.4)}
    .topbar-title{font-weight:700;font-size:15px;letter-spacing:.2px;white-space:nowrap;line-height:1.15}
    .topbar-title small{display:block;font-size:10.5px;font-weight:700;color:var(--text-sec);letter-spacing:1.2px;text-transform:uppercase}
    body.dark .topbar-title small{color:rgba(0,229,255,.7)}
    .topbar-center{display:flex;align-items:center;gap:8px;justify-content:center;flex:1;min-width:0;overflow:hidden}
    .topbar-actions{display:flex;align-items:center;gap:6px;flex-shrink:0}
    .topbar-actions .tb-group{display:flex;align-items:center;gap:2px;padding:4px;background:var(--bg-soft);border:1px solid var(--border);border-radius:13px}
    body.dark .topbar-actions .tb-group{background:rgba(11,18,32,.8);border-color:rgba(0,229,255,.14)}
    .tb-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9px;border:none;background:transparent;cursor:pointer;color:var(--text-sec);padding:0;transition:all .18s;font-family:inherit}
    .tb-icon-btn:hover{color:var(--primary);background:var(--card);box-shadow:var(--shadow-sm)}
    body.dark .tb-icon-btn:hover{color:var(--primary-2);background:rgba(13,21,38,.9);box-shadow:0 0 14px rgba(0,229,255,.15)}
    .tb-icon-btn svg{width:17px;height:17px;fill:currentColor}
    .tb-icon-btn.danger:hover{color:var(--danger);background:var(--card)}
    body.dark .tb-icon-btn.danger:hover{background:rgba(255,92,122,.12)}

    /* ============ 按钮（霓虹系统） ============ */
    .btn-submit,.btn-danger,.btn-ghost,.btn-edit,.btn-del,.btn-dns,.pill-btn,.pill-close{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:none;cursor:pointer;font-weight:600;transition:all .18s;white-space:nowrap;font-family:inherit;line-height:1}
    .btn-submit{background:var(--primary-grad);color:#fff;padding:11px 20px;border-radius:var(--radius-sm);box-shadow:0 4px 16px rgba(61,123,255,.4);text-shadow:0 1px 2px rgba(0,0,0,.15);position:relative;overflow:hidden}
    .btn-submit::after{content:'';position:absolute;top:0;left:-80%;width:50%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.35),transparent);transform:skewX(-25deg);transition:left .5s var(--ease)}
    .btn-submit:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(61,123,255,.5);filter:brightness(1.06)}
    .btn-submit:hover::after{left:130%}
    .btn-submit:active{transform:translateY(0) scale(.98)}
    .btn-submit:disabled{opacity:.55;cursor:not-allowed;transform:none;box-shadow:none;filter:none}
    body.dark .btn-submit{background:linear-gradient(135deg,#0a84ff 0%,#00d4ff 100%);box-shadow:0 4px 18px rgba(0,213,255,.35), 0 0 20px rgba(0,213,255,.15)}
    body.dark .btn-submit:hover{box-shadow:0 8px 28px rgba(0,213,255,.45), 0 0 30px rgba(0,213,255,.2)}
    .btn-danger{background:linear-gradient(135deg,#ff7a5c,#ff4d6a);color:#fff;padding:11px 20px;border-radius:var(--radius-sm);box-shadow:0 4px 16px rgba(255,77,106,.35)}
    body.dark .btn-danger{background:linear-gradient(135deg,#ff6b81,#ff2e4d);box-shadow:0 4px 18px rgba(255,46,77,.3), 0 0 20px rgba(255,46,77,.12)}
    .btn-danger:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(255,77,106,.45)}
    .btn-danger:active{transform:translateY(0) scale(.98)}
    .btn-ghost{background:transparent;color:var(--primary);border:1px solid var(--border);padding:9px 14px;border-radius:var(--radius-sm);font-size:13px}
    .card-header .purge-mini{display:inline-flex;align-items:center;gap:4px;margin-left:auto;padding:4px 9px;min-height:0;font-size:11px;font-weight:600;line-height:1;white-space:nowrap;font-family:inherit;color:var(--primary);background:var(--primary-soft);border:1px solid var(--border);border-radius:999px;cursor:pointer;transition:all .18s}
    .card-header .purge-mini:hover{border-color:var(--primary)}
    .card-header .purge-mini:disabled{opacity:.55;cursor:not-allowed}
    .card-header .purge-mini svg{width:12px;height:12px;flex-shrink:0}
    .card-header .purge-mini + .card-tools{margin-left:0}
    .notify-btn-row{display:flex;gap:8px;flex-wrap:wrap}
    .notify-btn-row>button{flex:1 1 auto;min-width:fit-content;flex-shrink:0;white-space:nowrap}
    .notify-btn-row>.btn-submit{flex:1 1 100%}
    @media (min-width:600px){.notify-btn-row>.btn-submit{flex:0 0 auto;min-width:96px}}
    .btn-ghost:hover{border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-soft)}
    .btn-edit{background:var(--card);color:var(--primary);border:1px solid var(--primary);padding:8px 14px;border-radius:9px;font-size:13px}
    .btn-edit:hover{background:var(--primary-soft)}
    .btn-del{background:var(--card);color:var(--danger);border:1px solid var(--danger);padding:8px 14px;border-radius:9px;font-size:13px}
    .btn-del:hover{background:var(--danger-soft)}
    .btn-dns{background:var(--card);color:var(--success);border:1px solid var(--success);padding:8px 14px;border-radius:9px;font-size:13px}
    .btn-dns:hover{background:var(--success-soft)}
    .btn-dns:disabled{opacity:.5;cursor:not-allowed}
    .icon-btn{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9px;border:1px solid var(--border);background:var(--card);cursor:pointer;color:var(--text-sec);padding:0;transition:all .18s;flex-shrink:0}
    .icon-btn:hover{color:var(--primary);border-color:var(--primary);box-shadow:0 3px 12px var(--primary-soft)}
    body.dark .icon-btn{background:rgba(11,18,32,.6)}
    body.dark .icon-btn:hover{border-color:var(--primary-2);color:var(--primary-2);box-shadow:0 0 14px rgba(0,229,255,.2)}
    .icon-btn svg{width:15px;height:15px;fill:currentColor}
    .pill-btn{padding:6px 14px;border-radius:999px;background:var(--primary-soft);border:1px solid rgba(61,123,255,.28);color:var(--primary);font-size:13px}
    .pill-btn:hover{background:rgba(61,123,255,.18)}
    body.dark .pill-btn{background:rgba(0,229,255,.1);border-color:rgba(0,229,255,.25);color:var(--primary-2)}
    .pill-close{width:30px;height:30px;border-radius:999px;background:var(--danger-soft);border:1px solid rgba(255,77,106,.32);color:var(--danger)}
    .pill-close:hover{background:rgba(255,77,106,.2)}
    .btn-submit svg,.btn-danger svg,.btn-ghost svg,.btn-edit svg,.btn-del svg,.btn-dns svg,.pill-btn svg,.pill-close svg{width:15px;height:15px}

    /* ============ 徽标 / 状态（霓虹） ============ */
    .badge{padding:4px 11px;border-radius:999px;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
    .badge::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.9;box-shadow:0 0 8px currentColor}
    .rtt-pill{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;background:var(--primary-soft);border:1px solid rgba(61,123,255,.3);font-family:var(--font-mono);font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;cursor:default}
    body.dark .rtt-pill{background:rgba(0,229,255,.07);border-color:rgba(0,229,255,.2);box-shadow:0 0 14px rgba(0,229,255,.06)}
    .rtt-dot{width:7px;height:7px;border-radius:50%;background:var(--success);box-shadow:0 0 10px var(--success);flex-shrink:0}
    .rtt-label{color:var(--text-sec)}
    #themeToggle{background:transparent;border:none;cursor:pointer;padding:2px;display:inline-flex;color:var(--text-sec);transition:color .2s}
    #themeToggle:hover{color:var(--primary)}
    #themeToggle svg{width:18px;height:18px}
    .ping-badge{color:var(--text-sec);cursor:pointer;padding:5px 12px;background:var(--bg-soft);border-radius:999px;font-size:13px;font-weight:500;transition:all .2s;border:1px solid var(--border);user-select:none;display:inline-flex;align-items:center;gap:5px}
    .ping-badge:hover{border-color:var(--primary);color:var(--primary);box-shadow:0 2px 10px var(--primary-soft)}
    body.dark .ping-badge{background:rgba(11,18,32,.7)}
    body.dark .ping-badge:hover{border-color:var(--primary-2);color:var(--primary-2);box-shadow:0 0 12px rgba(0,229,255,.2)}

    /* ============ 表单 ============ */
    .field{display:flex;flex-direction:column;gap:6px;min-width:0}
    .field>label{font-size:12.5px;font-weight:600;color:var(--text-sec);display:flex;align-items:center;gap:5px}
    .field input[type=text],.field input[type=url],.field input[type=password],.field input[type=number],.field select,.field textarea,.toolbar select{width:100%;padding:11px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-soft);color:var(--text);font-size:14px}
    body.dark .field input[type=text],body.dark .field input[type=url],body.dark .field input[type=password],body.dark .field input[type=number],body.dark .field select,body.dark .field textarea,body.dark .toolbar select{background:rgba(11,18,32,.7);border-color:rgba(0,229,255,.1)}
    body.dark .field input:hover,body.dark .field select:hover,body.dark .field textarea:hover{border-color:rgba(0,229,255,.3)}
    .field input:hover,.field select:hover,.field textarea:hover{border-color:var(--border-strong)}
    .form-row{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
    .form-row .field{flex:1;min-width:220px}
    .search-input{padding:10px 16px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-soft);color:var(--text);font-size:14px;width:260px;transition:border-color .2s,box-shadow .2s}
    .search-input:focus{border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-soft)}
    body.dark .search-input{background:rgba(11,18,32,.7);border-color:rgba(0,229,255,.1)}
    body.dark .search-input:focus{border-color:var(--primary-2);box-shadow:0 0 0 3px rgba(0,229,255,.1), 0 0 16px rgba(0,229,255,.12)}
    .ip-checkbox{width:18px;height:18px;cursor:pointer;accent-color:var(--primary)}
    .toolbar{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;align-items:center}

    /* 节点页工具条 */
    .nodes-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:10px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px 18px;box-shadow:var(--shadow-sm);margin-bottom:16px}
    body.dark .nodes-toolbar{background:linear-gradient(160deg, rgba(13,21,38,.8), rgba(8,13,24,.9));border-color:rgba(0,229,255,.1)}
    .nodes-toolbar .search-input{flex:1;min-width:180px;max-width:340px;background:var(--bg-soft)}
    .nodes-toolbar .tb-sep{width:1px;height:26px;background:var(--border);margin:0 2px}
    .batch-sel{min-width:150px}

    /* ============ 节点卡片（星云数据卡） ============ */
    .node-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(350px,1fr));gap:16px}
    .emby-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:18px 18px 14px;box-shadow:var(--shadow-sm);display:flex;flex-direction:column;gap:12px;transition:all .25s;position:relative;overflow:hidden}
    .emby-card::before{content:'';position:absolute;left:0;top:0;width:100%;height:3px;background:var(--primary-grad);opacity:.85;transition:all .3s}
    .emby-card::after{content:'';position:absolute;right:-40px;top:-40px;width:110px;height:110px;border-radius:50%;background:radial-gradient(circle,rgba(0,229,255,.07),transparent 70%);pointer-events:none;transition:opacity .3s}
    body.dark .emby-card{background:linear-gradient(165deg, rgba(14,22,40,.92), rgba(9,14,26,.96));border-color:rgba(0,229,255,.1)}
    .emby-card:hover{box-shadow:var(--shadow-lg);transform:translateY(-3px);border-color:var(--border-strong)}
    body.dark .emby-card:hover{border-color:rgba(0,229,255,.35);box-shadow:var(--shadow-lg), var(--glow)}
    body.dark .emby-card:hover::before{box-shadow:0 0 18px rgba(0,229,255,.6)}
    .emby-card .card-header{border-bottom:1px solid var(--border);padding-bottom:12px}
    .card-title-group{display:flex;align-items:center;gap:11px;min-width:0;flex:1}
    .emby-icon{font-size:26px;background:linear-gradient(135deg,var(--primary-soft),transparent);border-radius:12px;padding:6px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;width:46px;height:46px;flex-shrink:0;color:var(--primary)}
    body.dark .emby-icon{background:rgba(0,229,255,.07);border-color:rgba(0,229,255,.16);color:var(--primary-2);box-shadow:0 0 14px rgba(0,229,255,.08)}
    .emby-icon svg{width:23px;height:23px}
    .emby-card .card-remark{font-size:15.5px;font-weight:700;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .emby-card .card-prefix{font-size:12px;color:var(--text-sec);font-family:var(--font-mono);margin-top:1px}
    .node-summary{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
    .node-detail{display:none;flex-direction:column;gap:10px;background:var(--bg-soft);border:1px solid var(--border);border-radius:var(--radius-md);padding:13px 14px;margin-top:2px}
    body.dark .node-detail{background:rgba(8,13,24,.6);border-color:rgba(0,229,255,.08)}
    .info-row{display:flex;align-items:flex-start;justify-content:space-between;font-size:13px;gap:10px}
    .info-label{color:var(--text-sec);font-weight:600;min-width:64px;margin-top:4px;flex-shrink:0;font-size:12px}
    .action-group{display:inline-flex;gap:6px;background:var(--card);padding:5px 8px;border-radius:var(--radius-sm);border:1px solid var(--border);align-items:flex-start;max-width:100%;flex-wrap:wrap;box-shadow:var(--shadow-sm)}
    body.dark .action-group{background:rgba(11,18,32,.6)}
    .card-footer{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:auto;padding-top:12px;border-top:1px dashed var(--border)}
    body.dark .card-footer{border-top:1px dashed rgba(0,229,255,.12)}
    .card-footer .f-right{display:flex;gap:8px;align-items:center}
    .drag-handle{cursor:grab;padding-right:8px;font-size:0;color:var(--text-faint);display:flex;align-items:center;user-select:none;touch-action:none}
    .drag-handle:active{cursor:grabbing;color:var(--primary)}
    .drag-handle svg{width:18px;height:18px}
    .emby-card.sortable-ghost{opacity:.4}
    .emby-card.sortable-drag{cursor:grabbing!important;box-shadow:var(--shadow-lg)}
    .secret-text{font-family:var(--font-mono);letter-spacing:2px;color:var(--text-faint);font-size:12px}
    .dynamic-url{display:block;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;text-align:right}
    .actual-text.dynamic-url{white-space:normal;max-width:100%;overflow:visible;text-align:left!important;word-break:break-all;font-size:12px;font-family:var(--font-mono);color:var(--primary);letter-spacing:normal}
    .url-list-item{background:var(--card);border:1px solid var(--border);padding:5px 10px;border-radius:8px;font-size:12px;margin-top:5px;word-break:break-all;line-height:1.5;color:var(--text)}
    .url-list-item:first-child{margin-top:0}

    /* ============ 表格（星云数据台） ============ */
    .table-wrapper{width:100%;border-radius:var(--radius-md);border:1px solid var(--border);overflow:hidden;background:var(--card);box-shadow:var(--shadow-sm)}
    body.dark .table-wrapper{background:rgba(11,18,32,.6);border-color:rgba(0,229,255,.1)}
    table{width:100%;border-collapse:collapse;text-align:left}
    th,td{padding:13px 16px;border-bottom:1px solid var(--border);font-size:13.5px;vertical-align:middle}
    th{color:var(--text-sec);font-weight:700;background:var(--bg-soft);font-size:11.5px;letter-spacing:.8px;text-transform:uppercase;white-space:nowrap}
    body.dark th{background:rgba(8,13,24,.8);color:rgba(0,229,255,.75);font-size:11px;letter-spacing:1.2px}
    tr:last-child td{border-bottom:none}
    tbody tr{transition:background .15s}
    tbody tr:hover td{background-color:var(--primary-soft)}
    body.dark tbody tr:hover td{background:rgba(0,229,255,.05)}

    /* ============ 图标选择 ============ */
    .icon-item{cursor:pointer;padding:6px;border-radius:var(--radius-sm);border:1px solid var(--border);display:flex;justify-content:center;align-items:center;transition:all .2s;background:var(--bg-soft);height:46px}
    .icon-item:hover{border-color:var(--primary)!important;box-shadow:0 2px 10px var(--primary-soft);transform:scale(1.06)}
    .icon-item.selected{border-color:var(--primary);background:var(--primary-soft)}
    #iconGrid::-webkit-scrollbar{width:6px}
    #iconGrid::-webkit-scrollbar-thumb{background:var(--border-strong);border-radius:3px}

    /* ============ 弹窗（全息舱） ============ */
    .modal-mask{display:none;position:fixed;inset:0;z-index:1000;background:rgba(4,8,16,.6);overflow-y:auto;-webkit-overflow-scrolling:touch;padding:max(16px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom))}
    body.dark .modal-mask{background:rgba(3,6,12,.72)}
    .modal-box{max-width:680px;margin:max(24px, env(safe-area-inset-top)) auto;background:var(--card);border:1px solid var(--border);border-radius:22px;padding:24px;box-shadow:var(--shadow-lg);animation:dsModalIn .3s var(--ease)}
    body.dark .modal-box{background:linear-gradient(165deg, rgba(14,22,40,.97), rgba(8,13,24,.98));border-color:rgba(0,229,255,.14);box-shadow:var(--shadow-lg), 0 0 40px rgba(0,229,255,.06)}
    .modal-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;gap:10px}
    .modal-head h2{font-size:17px;display:flex;align-items:center;gap:9px;margin:0;font-weight:800}
    .modal-head .close-x{background:transparent;border:none;cursor:pointer;color:var(--text-faint);display:inline-flex;padding:6px;border-radius:9px;transition:all .15s}
    .modal-head .close-x:hover{color:var(--danger);background:var(--danger-soft)}
    .modal-head .close-x svg{width:19px;height:19px}
    @keyframes dsModalIn{from{opacity:0;transform:translateY(16px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}

    /* ============ 视图切换 ============ */
    .page-view{display:none}
    .page-view.active{display:block;animation:dsFadeIn .32s var(--ease) forwards}
    @keyframes dsFadeIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}

    /* ============ 底部 Dock（指挥舱） ============ */
    .ds-dock{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);width:calc(100% - 32px);max-width:580px;background:var(--card-glass);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1px solid var(--border);border-radius:999px;padding:6px 10px;display:flex;justify-content:space-around;box-shadow:var(--shadow-lg);z-index:950}
    body.dark .ds-dock{background:rgba(9,15,28,.75);border-color:rgba(0,229,255,.16);box-shadow:0 12px 40px rgba(0,0,0,.5), 0 0 30px rgba(0,229,255,.06)}
    .ds-dock-item{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:9px 16px;border-radius:999px;color:var(--text-sec);font-size:11px;font-weight:700;letter-spacing:.2px;transition:all .22s;background:transparent;border:none;cursor:pointer;flex:1;font-family:inherit}
    .ds-dock-item svg{width:21px;height:21px;fill:currentColor;transition:transform .22s}
    .ds-dock-item:hover{color:var(--primary)}
    .ds-dock-item:hover svg{transform:translateY(-2px)}
    .ds-dock-item.active{color:#fff;background:var(--primary-grad-2);box-shadow:0 4px 18px rgba(124,92,255,.4)}
    body.dark .ds-dock-item.active{background:linear-gradient(135deg,#00d4ff 0%,#3d7bff 100%);box-shadow:0 4px 20px rgba(0,213,255,.45), 0 0 26px rgba(0,213,255,.25)}
    .ds-dock-item.active svg,.ds-dock-item.active span{color:#fff;fill:#fff}

    /* ============ Toast（霓虹胶囊） ============ */
    #toast{position:fixed;top:-64px;left:50%;transform:translateX(-50%);background:rgba(13,17,28,.94);color:#fff;padding:12px 26px;border-radius:999px;font-size:14px;font-weight:600;transition:top .45s var(--ease);z-index:9999;backdrop-filter:blur(12px);text-align:center;max-width:90vw;word-wrap:break-word;box-shadow:0 8px 30px rgba(0,0,0,.4), 0 0 20px rgba(0,229,255,.1);border:1px solid rgba(0,229,255,.2);display:flex;align-items:center;gap:8px}
    #toast.show{top:20px}

    /* ============ 图标统一 ============ */
    .ti{display:inline-flex;align-items:center;justify-content:center;vertical-align:-.18em;flex-shrink:0}
    .ti svg{width:16px;height:16px}
    h1 svg,h2 svg,h3 svg,h4 svg,p svg,label svg,span svg,div svg{width:1.1em;height:1.1em;vertical-align:-.18em;flex-shrink:0}
    .rotated{transform:rotate(180deg)}

    /* ============ 大屏弹窗（数据星云） ============ */
    #dashboardModal{padding:10px}
    #dashboardModal .modal-box{max-width:1000px}
    .stat-pills{display:flex;gap:10px;flex-wrap:wrap}
    .stat-pill{font-size:12.5px;background:var(--primary-soft);color:var(--primary);padding:6px 13px;border-radius:999px;border:1px solid rgba(61,123,255,.22);display:flex;gap:10px;flex-wrap:wrap}
    body.dark .stat-pill{background:rgba(0,229,255,.08);border-color:rgba(0,229,255,.2);color:var(--primary-2)}
    .stat-pill strong{font-weight:700}
    .chart-panel{flex:2;min-width:300px;border:1px solid var(--border);border-radius:var(--radius-md);padding:14px;background:var(--bg-soft)}
    body.dark .chart-panel{background:rgba(8,13,24,.6);border-color:rgba(0,229,255,.1)}
    .chart-panel.pie{flex:1;display:flex;justify-content:center;align-items:center;min-height:280px}

    /* ============ 测速页 ============ */
    #view-speed .toolbar{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:stretch}
    #view-speed .toolbar select{grid-column:1/-1;width:100%}
    #view-speed .toolbar .btn-submit{width:100%;padding:12px 14px;font-size:13px;justify-content:center}
    .node-cb{width:18px;height:18px;margin:0;cursor:pointer;accent-color:var(--primary);flex-shrink:0}
    .ip-text{font-family:var(--font-mono);cursor:pointer}
    .test-row .latency,.test-row .speed,.test-row .loc{font-weight:600}

    /* ============ 响应式 ============ */
    /* 测速行 / 选择行（JS 动态类，纯视觉） */
    .route-item{cursor:pointer;transition:background .15s}
    .route-item:hover td{background:var(--primary-soft)}
    .row-checkbox{width:17px;height:17px;accent-color:var(--primary);cursor:pointer}
    @media (max-width:768px){
        body{padding:0}
        .container{padding:calc(var(--topbar-h) + 40px) 14px 124px}
        .card{padding:18px;border-radius:14px;margin-bottom:16px}
        .hero-card{padding:22px 18px}
        .hero-card h1{font-size:20px}
        .node-grid{grid-template-columns:1fr}
        .nodes-toolbar{padding:12px 14px}
        .table-wrapper{border:none;background:transparent;overflow:visible;box-shadow:none}
        table,thead,tbody,th,td,tr{display:block;width:100%}
        thead{display:none}
        tr{margin-bottom:14px;background:var(--card);border-radius:var(--radius-md);border:1px solid var(--border);box-shadow:var(--shadow);overflow:hidden}
        body.dark tr{background:linear-gradient(160deg, rgba(14,22,40,.9), rgba(9,14,26,.95));border-color:rgba(0,229,255,.1)}
        td{display:flex;align-items:center;padding:12px 14px;border-bottom:1px solid var(--border);text-align:right;gap:10px;min-height:46px}
        td:last-child{border-bottom:none}
        td[colspan]{justify-content:center;text-align:center}
        td[colspan]::before{display:none!important}
        td::before{content:attr(data-label);font-weight:600;color:var(--text-sec);flex-shrink:0;margin-right:auto;text-align:left;font-size:11px;letter-spacing:.4px;text-transform:uppercase}
        .search-input{width:100%;max-width:none}
        .toolbar{flex-direction:column;align-items:stretch;gap:10px}
        .toolbar>*{width:100%}
        .topbar{padding:0 12px;gap:8px}
        .topbar-logo{width:32px;height:32px}
        .topbar-title{display:none}
        .topbar-center{flex:1}
        .pill-btn{padding:5px 10px;font-size:12px}
        .rtt-pill{padding:5px 10px;gap:6px;font-size:11px}
        .rtt-label{display:none}
        .modal-box{margin:12px auto;padding:18px;border-radius:16px}
        .stat-pill{font-size:12px}
        .nodes-toolbar .tb-sep{display:none}
    }

/* ============================================================
   深色模式可读性修复（全局输入控件）
   —— 伪装版同款：内联未写 color 的 input/textarea/select 深色下黑字不可见
   ============================================================ */
body.dark input[type=text],body.dark input[type=url],body.dark input[type=password],body.dark input[type=number],body.dark input[type=search],body.dark input[type=email],body.dark select,body.dark textarea{color:#e8eefc!important;background:#0d1526!important;border-color:rgba(0,229,255,.15)!important}
body.dark select option{background:#0d1526;color:#e8eefc}
body.dark input::placeholder,body.dark textarea::placeholder{color:#8a96b8!important;opacity:1!important}

/* ============================================================
   风格改造:玻璃拟态 + 弹幕背景层(v3.4.31)
   深色下背景改为深蓝紫渐变;全局浮动弹幕;内容层抬升让玻璃卡模糊到弹幕
   ============================================================ */
body.dark{background:linear-gradient(160deg,#0b0e1a 0%,#0f1730 48%,#060a13 100%) fixed}
.dm-layer{position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:0}
.dm-layer .dm{position:absolute;white-space:nowrap;font-weight:600;letter-spacing:3px;font-size:14px;opacity:.13;will-change:transform;animation:dmDrift var(--dm-dur,26s) linear infinite;animation-delay:var(--dm-delay,0s)}
.dm-a{color:#8ab4ff}.dm-b{color:#ffa657}.dm-c{color:#56d4dd}.dm-d{color:#a78bfa}.dm-e{color:#7ee787}
/* 浅色模式下弹幕加深提亮,保证可见 */
body:not(.dark) .dm-layer .dm{opacity:.34}
body:not(.dark) .dm-a{color:#1f5fc7}body:not(.dark) .dm-b{color:#c96a10}body:not(.dark) .dm-c{color:#0e8d9f}body:not(.dark) .dm-d{color:#6d3fc4}body:not(.dark) .dm-e{color:#2f8f43}
@keyframes dmDrift{from{transform:translateX(105%)}to{transform:translateX(-45%)}}
/* 内容层抬升,玻璃卡 backdrop-filter 模糊到背后的弹幕 */
.container,.login-wrap{position:relative;z-index:1}
/* 主卡片玻璃化(深色):半透明 + 背景模糊,弹幕在卡片背后隐约可见 */
body.dark .card,body.dark .emby-card,body.dark .nodes-toolbar,body.dark .table-wrapper{
    background:rgba(13,21,38,.72)!important;backdrop-filter:blur(16px) saturate(1.5);-webkit-backdrop-filter:blur(16px) saturate(1.5);border-color:rgba(255,255,255,.1)}
body.dark .modal-box{background:rgba(10,16,30,.85)!important;backdrop-filter:blur(18px) saturate(1.5);-webkit-backdrop-filter:blur(18px) saturate(1.5)}

/* ============ 栏目折叠组件(v3.4.32) ============ */
.collapse-head{display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;margin-bottom:10px;gap:8px}
.collapse-head .ch-title{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:800;color:var(--text)}
.collapse-head .ch-arrow{font-size:11px;color:var(--text-sec);transition:transform .25s var(--ease);flex-shrink:0}
.collapse-sec.open .collapse-head .ch-arrow{transform:rotate(90deg)}
.collapse-body{display:none}
.collapse-sec.open .collapse-body{display:block}
.collapse-arrow{display:inline-block;transition:transform .25s var(--ease);color:var(--text-sec);font-size:12px;margin-right:2px}
.collapse-arrow.open{transform:rotate(90deg)}
/* ===== 按钮组统排:等宽等高;3/2个一组始终一排;5个一组移动端2+3、宽屏一排 ===== */
.btn-grid{display:flex;flex-wrap:wrap;gap:10px}
.btn-grid>button{flex:1 1 30%;min-width:0;box-sizing:border-box;text-align:center;white-space:nowrap;padding:12px 8px;font-size:12px;justify-content:center;line-height:1.2;margin:0}
.btn-grid.cols-5>button:nth-child(-n+2){flex:1 1 45%;font-size:13px}
@media(min-width:640px){
  .btn-grid.cols-5>button,.btn-grid.cols-5>button:nth-child(-n+2),.btn-grid.cols-5>button:nth-child(n+3){flex:1 1 18%;font-size:13px}
}


/* ============================================================
   UI 2.0 · 跨端布局与观感升级 (v3.6.0)
   PC 横屏:更宽的内容区 / 更克制的层级 / 悬停反馈
   手机竖屏:44px 触控目标 / 16px 输入防缩放 / 底部安全区
   ============================================================ */

/* ---------- 基础质感 ---------- */
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}
:focus-visible{outline:2px solid var(--primary-2,var(--primary));outline-offset:2px;border-radius:8px}
*{scrollbar-width:thin;scrollbar-color:var(--border-strong) transparent}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border-strong);border-radius:999px;border:2px solid transparent;background-clip:content-box}
::-webkit-scrollbar-thumb:hover{background:var(--primary)}

/* ---------- 布局骨架:更宽的桌面内容区 ---------- */
.container{max-width:1320px;padding-left:clamp(16px,3vw,36px);padding-right:clamp(16px,3vw,36px)}
.card{padding:26px 26px 24px;border-radius:20px}
.card h2{font-size:16.5px}
.section-head{margin:32px 4px 14px}

/* ---------- 顶栏 ---------- */
.topbar{box-shadow:0 1px 0 rgba(16,24,40,.05),0 6px 24px rgba(16,24,40,.06)}
.tb-icon-btn{display:inline-flex;align-items:center;justify-content:center;min-width:36px;min-height:36px;border-radius:11px}
.tb-icon-btn:active{transform:scale(.94)}
.topbar-actions .tb-group{gap:2px}

/* ---------- Hero ---------- */
.hero-card{padding:34px 34px;border-radius:24px}
.hero-card h1{font-size:26px;letter-spacing:-.4px}
.hero-card .hero-sub{font-size:13.5px;margin-top:8px}
.hero-card .btn-submit{padding:12px 22px;font-size:14px}

/* ---------- 模式卡 ---------- */
.mode-cards{gap:14px}
.mode-card{padding:15px 14px 14px;border-radius:16px}
.mode-card .mc-name{font-size:15.5px}
.mode-card .mc-desc{font-size:12px;line-height:1.5}

/* ---------- 节点卡 / 表格 ---------- */
.node-grid{grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:18px}
.emby-card{padding:20px 20px 16px;border-radius:20px}
.table-wrapper{overflow-x:auto}

/* ---------- 按钮触控尺寸 ---------- */
.btn-submit,.btn-ghost,.btn-danger,.btn-edit,.btn-del,.pill-btn{min-height:42px}

/* ---------- 仅鼠标设备:悬停位移与柔光 ---------- */
@media (hover:hover) and (pointer:fine){
  .card{transition:box-shadow .25s,border-color .25s,transform .25s}
  .card:hover{transform:translateY(-1px)}
  .emby-card:hover{transform:translateY(-3px)}
  .btn-submit:hover{transform:translateY(-1px)}
  .mode-card:hover{transform:translateY(-3px)}
  .card:not(.hero-card)::after{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;
    transition:opacity .3s var(--ease);background:linear-gradient(160deg,rgba(0,229,255,.05),transparent 42%)}
  .card:not(.hero-card):hover::after{opacity:1}
}

/* ---------- 平板 ---------- */
@media (max-width:1100px){
  .container{max-width:980px}
  .mode-cards{grid-template-columns:repeat(3,1fr)}
}

/* ---------- 手机竖屏 ---------- */
@media (max-width:768px){
  :root{--topbar-h:58px}
  .container{padding:calc(var(--topbar-h) + 24px) 14px calc(108px + env(safe-area-inset-bottom))}

  .card{padding:18px 15px;border-radius:16px;margin-bottom:14px}
  .card h2{font-size:15.5px}
  .section-head{margin:26px 2px 12px}

  .hero-card{padding:22px 18px;border-radius:18px;gap:14px}
  .hero-card h1{font-size:19px;line-height:1.32;gap:8px}
  .hero-card .hero-sub{font-size:12.5px}
  .hero-card > div:last-child{margin-left:0!important;width:100%}
  .hero-card .btn-submit{width:100%;justify-content:center;padding:12px}
  .hero-chip{font-size:10px;padding:3px 9px;letter-spacing:1px}

  .card-header{gap:8px}
  .card-tools{margin-left:0;width:100%;display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .card-tools > *{width:100%;justify-content:center}
  .card-tools .search-input{grid-column:1/-1;max-width:none;width:100%}

  .mode-cards{gap:10px}
  .mode-card{padding:12px 10px 11px;border-radius:13px}
  .mode-card .mc-name{font-size:14px}
  .mode-card .mc-desc{font-size:11px}

  .nodes-toolbar{flex-direction:column;align-items:stretch;gap:10px;padding:14px}
  .nodes-toolbar > *{width:100%}
  .nodes-toolbar .tb-sep{display:none}
  .batch-sel{width:100%}

  /* 表格 → 卡片:值右对齐,标签左对齐,按钮不溢出 */
  td{flex-wrap:wrap;justify-content:flex-end;gap:8px;padding:12px 14px}
  td > .btn-submit,td > button{flex-shrink:0}
  .table-wrapper{border:none;box-shadow:none;background:transparent}

  /* 输入控件 16px:iOS 聚焦不放大页面 */
  input,select,textarea{font-size:16px}
  .search-input,.card-tools .search-input{font-size:16px;padding:11px 14px}
  .btn-submit,.btn-ghost,.btn-danger,.btn-edit,.btn-del{padding:12px 16px}

  /* 顶栏:允许横向滚动,不挤压 */
  .topbar{padding:0 12px;gap:6px}
  .topbar-actions{overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none}
  .topbar-actions::-webkit-scrollbar{display:none}
  .topbar-actions .tb-group{padding:3px}
  .tb-icon-btn{min-width:34px;min-height:34px}
  .rtt-pill{padding:4px 9px;font-size:11px;gap:6px}
  .topbar-logo{width:32px;height:32px;border-radius:10px}

  /* 弹窗 */
  .modal-box{max-width:100%;padding:18px 14px;border-radius:18px;margin:10px auto}
  .modal-mask{padding:8px}

  /* 底部 Dock:贴合安全区 */
  .ds-dock{bottom:calc(10px + env(safe-area-inset-bottom));width:calc(100% - 20px);padding:6px 4px;border-radius:22px}
  .ds-dock-item{padding:8px 4px;font-size:10px;min-height:48px;border-radius:16px}
  .ds-dock-item svg{width:19px;height:19px}

  .stat-pill{font-size:11.5px;padding:5px 11px}
}

/* ---------- 窄屏手机 ---------- */
@media (max-width:430px){
  .mode-cards{grid-template-columns:repeat(2,1fr)}
  .hero-card h1{font-size:17.5px}
  .container{padding-left:12px;padding-right:12px}
  .card{padding:16px 13px}
  .topbar-title{display:none}
}

/* ---------- 手机横屏:压缩纵向占用 ---------- */
@media (max-height:520px) and (orientation:landscape){
  :root{--topbar-h:52px}
  .container{padding-top:calc(var(--topbar-h) + 14px);padding-bottom:88px}
  .hero-card{padding:14px 18px}
  .hero-card h1{font-size:18px}
  .hero-card .hero-sub{display:none}
  .mode-card{padding:11px 12px 10px}
  .ds-dock{bottom:6px;padding:4px 6px;border-radius:18px;max-width:560px}
  .ds-dock-item{flex-direction:row;gap:6px;padding:7px 12px;min-height:40px;font-size:11px;border-radius:14px}
  .ds-dock-item svg{width:17px;height:17px}
}

/* ---------- 尊重减少动效 ---------- */
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}
  .card:hover,.emby-card:hover,.mode-card:hover,.btn-submit:hover{transform:none!important}
}



`



const LANDING_UI = "<!DOCTYPE html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no,maximum-scale=1,minimum-scale=1\"><meta name=\"robots\" content=\"noindex\"><title>EMBY PROXY 面板</title><link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Noto+Sans+SC:wght@300;400;500&family=Noto+Serif+SC:wght@500;700;900&display=swap\">\n<style>\n/* 布局:整屏吸附的纵向分镜,每屏一个主题;右侧胶片点导航;投影光束只做一处氛围 */\n:root{\n  --ink:#0a0b10; --ink2:#12131c; --line:#262838; --fg:#ecebf2; --dim:#9a9bb0; --beam:#f2b35e; --beam2:#ff7a59; --ok:#6fd3a0;\n  --serif:\"Noto Serif SC\",\"Songti SC\",serif; --sans:\"Noto Sans SC\",\"PingFang SC\",\"Microsoft YaHei\",sans-serif; --mono:\"JetBrains Mono\",ui-monospace,Menlo,monospace;\n  color-scheme:dark;\n}\n*{box-sizing:border-box}\nhtml,body{height:100%;margin:0;padding:0}\nbody{background:var(--ink);color:var(--fg);font-family:var(--sans);font-weight:300;line-height:1.7;overflow:hidden;\n  padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}\n:root{padding:0}\n#snap{height:100%;overflow-y:auto;overflow-x:hidden;scroll-snap-type:none;scroll-behavior:auto;overscroll-behavior-y:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y;margin:0 calc(-1*max(16px,env(safe-area-inset-left,0px)));scrollbar-width:none}\n#snap::-webkit-scrollbar{display:none}\nsection{min-height:100%;scroll-snap-align:none;scroll-snap-stop:normal;position:relative;display:flex;align-items:center;\n  padding:72px max(24px,env(safe-area-inset-right,0px)) 56px max(24px,env(safe-area-inset-left,0px));overflow:hidden}\n#stats{overflow:visible;scroll-snap-stop:normal}\n.wrap{width:100%;max-width:1080px;margin:0 auto;display:grid;gap:40px;min-width:0}\nh1,h2{font-family:var(--serif);font-weight:900;line-height:1.12;margin:0;text-wrap:balance;letter-spacing:.01em}\nh1{font-size:clamp(40px,8vw,104px)}\nh2{font-size:clamp(30px,5vw,60px)}\np{margin:0;color:var(--dim);max-width:34em}\n.tag{font-family:var(--mono);font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--beam)}\n.grad{background:linear-gradient(100deg,var(--beam),var(--beam2));-webkit-background-clip:text;background-clip:text;color:transparent}\n/* 进入动画:仅在当前屏播放,静态时内容始终可见 */\n.rise{opacity:0;transform:translate3d(0,46px,0) scale(.968);filter:blur(10px);transition:opacity 1.05s cubic-bezier(.16,1,.3,1),transform 1.25s cubic-bezier(.16,1,.3,1),filter 1.05s cubic-bezier(.16,1,.3,1);will-change:opacity,transform,filter}\nsection.on .rise,.rise.on{opacity:1;transform:none;filter:none}\n.mwrap{will-change:transform,opacity}\n#pbar{position:fixed;left:0;top:0;height:2px;width:100%;transform-origin:0 50%;transform:scaleX(0);background:linear-gradient(90deg,var(--beam),var(--beam2));z-index:60;pointer-events:none}\n.tilt{transition:transform .5s cubic-bezier(.16,1,.3,1),opacity 1s cubic-bezier(.16,1,.3,1),filter .9s cubic-bezier(.16,1,.3,1)}\n.rise:nth-child(2){transition-delay:.07s}.rise:nth-child(3){transition-delay:.14s}.rise:nth-child(4){transition-delay:.21s}\n@media(prefers-reduced-motion:reduce){.rise{opacity:1;transform:none;filter:none;transition:none}}\n.chip{transition:transform .25s cubic-bezier(.2,.7,.2,1),border-color .25s,color .25s,box-shadow .25s}\n.chip:hover{transform:translateY(-2px);box-shadow:0 6px 18px -8px rgba(232,176,75,.5)}\n.btn{transition:transform .25s cubic-bezier(.2,.7,.2,1),box-shadow .25s}\n.btn:hover{transform:translateY(-2px);box-shadow:0 10px 24px -10px rgba(232,176,75,.6)}\n.toasts{display:grid;gap:8px;min-height:80px;align-content:start}\n.toast{display:flex;gap:10px;align-items:center;font-size:12.5px;background:var(--ink2);border:1px solid var(--line);border-left:2px solid var(--beam);border-radius:8px;padding:8px 12px;color:var(--dim);animation:tin .45s cubic-bezier(.2,.7,.2,1) backwards;transition:opacity .6s,transform .6s}\n.toast .tc{font-family:var(--mono);font-size:10px;background:rgba(232,176,75,.14);color:var(--beam);padding:2px 6px;border-radius:4px;white-space:nowrap}\n.toast.out{opacity:0;transform:translateX(16px)}\n@keyframes tin{from{opacity:0;transform:translateX(-24px)}to{opacity:1;transform:none}}\n/* 滚动轨道:本身不可见,只负责给 sticky 舞台提供滑动距离 */\n.gwrap{position:relative;height:210vh}\n#stats{overflow:visible}\n/* sticky 舞台:固定在视口正中,地球/地图都围绕它的中心绘制,保证永远居中 */\n.stage-inner{position:sticky;top:calc(50vh - 220px);height:440px;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:radial-gradient(62% 62% at 50% 46%,#101826 0%,#0a0b10 72%)}\n.globe-box,.china-box{position:absolute;inset:0;pointer-events:none}.china-box{background:#080c14;border-radius:14px}.globe-box{overflow:hidden;border-radius:14px}\n.globe,.china{position:absolute;inset:0;transform-origin:50% 50%;will-change:transform,opacity;backface-visibility:hidden}\n.china-box{opacity:0}\n.globe-hint,.china-hint{position:absolute;left:16px;bottom:12px;font-size:12px;color:var(--dim);z-index:5;pointer-events:none}\n.globe-load{position:absolute;inset:0;display:grid;place-items:center;color:var(--dim);font-size:13px;z-index:6;text-align:center;padding:0 24px;pointer-events:none}\n.hot{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px}\n.hot-card{border:1px solid var(--line);border-radius:14px;background:var(--ink2);padding:16px}\n.hot-title{font-family:var(--serif);font-size:16px;margin-bottom:8px}\n.hot-chart{height:220px}\n@media(max-width:820px){.hot{grid-template-columns:1fr}.gwrap{height:210vh}.stage-inner{top:calc(50vh - 170px);height:340px}}\n.perf{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}\n.pitem{border:1px solid var(--line);border-radius:14px;background:var(--ink2);padding:20px 16px;display:grid;gap:6px;text-align:center;transition:transform .3s cubic-bezier(.2,.7,.2,1),box-shadow .3s,border-color .3s}\n.pitem:hover{transform:translateY(-3px);box-shadow:0 16px 34px -16px rgba(242,179,94,.4);border-color:var(--beam)}\n.pitem b{font-family:var(--serif);font-size:38px;font-weight:900;color:var(--fg);line-height:1}\n.pitem b small{font-size:15px;color:var(--beam)}\n.pitem span{font-size:12.5px;color:var(--dim);line-height:1.6}\n.pitem em{font-style:normal;color:var(--beam2)}\n.perf-note{margin-top:14px;text-align:center;font-family:var(--mono);font-size:11.5px;color:var(--dim)}\n@media(max-width:820px){.perf{grid-template-columns:1fr 1fr}}\n.sbox{display:flex;gap:10px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:10px 14px;background:var(--ink)}\n.sbox input{flex:1;background:none;border:none;outline:none;color:var(--fg);font-size:14px;font-family:var(--sans);min-width:0}\n.sbox span{font-family:var(--mono);font-size:11px;color:var(--dim);white-space:nowrap}\n.sres{display:none;gap:8px;margin-top:14px;min-height:150px;align-content:start}\n.srow{display:grid;grid-template-columns:64px 1fr;gap:12px;border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:var(--ink2);transition:transform .25s cubic-bezier(.2,.7,.2,1),border-color .25s}\n.srow:hover{transform:translateY(-1px);border-color:var(--beam)}\n.srow .sn{font-family:var(--serif);font-weight:700;font-size:15px;color:var(--fg)}\n.srow .sn mark{background:rgba(232,176,75,.22);color:var(--beam);border-radius:3px;padding:0 2px}\n.srow .sm{font-family:var(--mono);font-size:11px;color:var(--dim);margin-top:3px;word-break:break-all}\n.srow .sm mark{background:rgba(232,176,75,.16);color:var(--beam2);border-radius:3px;padding:0 2px}\n.srow .st{justify-self:end;display:grid;gap:4px;justify-items:end}\n.srow .st b{font-size:11px;color:var(--beam);font-weight:600}\n.srow .st em{font-style:normal;font-size:10px;color:var(--dim)}\n.step{display:inline-grid;place-items:center;width:34px;height:34px;border:1px solid var(--beam);border-radius:50%;color:var(--beam);font-family:var(--mono);font-size:13px;margin-bottom:10px}\n.plan{transition:transform .3s cubic-bezier(.2,.7,.2,1),box-shadow .3s,border-color .3s}\n.plan:hover{transform:translateY(-3px);box-shadow:0 16px 34px -16px rgba(242,179,94,.4);border-color:var(--beam)}\n@keyframes rise{from{opacity:0;transform:translateY(32px)}}\n/* nav */\nheader{position:fixed;inset:0 0 auto 0;z-index:20;display:flex;justify-content:space-between;align-items:center;padding:calc(16px + env(safe-area-inset-top,0px)) max(24px,env(safe-area-inset-right,0px)) 12px max(24px,env(safe-area-inset-left,0px));background:linear-gradient(var(--ink),transparent)}\n.logo{font-family:var(--serif);font-weight:900;letter-spacing:.2em;font-size:15px}\n.logo i{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--beam);margin-right:10px;box-shadow:0 0 14px var(--beam)}\nheader a.cta{font-size:13px;color:var(--ink);background:var(--fg);padding:7px 18px;border-radius:99px;text-decoration:none;font-weight:500}\nnav.dots{position:fixed;right:max(14px,env(safe-area-inset-right,0px));top:50%;transform:translateY(-50%);z-index:20;display:flex;flex-direction:column;gap:14px}\nnav.dots button{width:8px;height:8px;border-radius:50%;border:1px solid var(--dim);background:transparent;padding:0;cursor:pointer;transition:.3s}\nnav.dots button.on{background:var(--beam);border-color:var(--beam);height:26px;border-radius:6px}\nnav.dots button:focus-visible,a:focus-visible,button:focus-visible{outline:2px solid var(--beam);outline-offset:3px}\n.hint{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);font-family:var(--mono);font-size:11px;letter-spacing:.2em;color:var(--dim);animation:bob 2s infinite}\n@keyframes bob{50%{transform:translate(-50%,6px)}}\n/* hero beam */\n#hero::before{content:\"\";position:absolute;right:-10%;top:-20%;width:70%;height:140%;background:conic-gradient(from 200deg at 100% 30%,transparent 0 10%,rgba(242,179,94,.20) 18%,transparent 30%);filter:blur(30px);pointer-events:none}\n#hero canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}\n.stats{display:flex;gap:40px;flex-wrap:wrap;font-family:var(--mono)}\n.stats b{display:block;font-size:28px;font-weight:500;color:var(--fg)}.stats span{font-size:12px;color:var(--dim)}\n/* demo panels */\n.panel{background:var(--ink2);border:1px solid var(--line);border-radius:14px;padding:24px;min-width:0}\n.two{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center}\n.screen{aspect-ratio:16/9;border-radius:8px;background:radial-gradient(circle at 30% 30%,#3a3050,#14131d 70%);position:relative;overflow:hidden;display:grid;place-items:center}\n.screen .t{font-family:var(--serif);font-weight:900;font-size:clamp(18px,3vw,30px)}\n.scrub{margin-top:18px}\ninput[type=range]{width:100%;accent-color:var(--beam);height:24px}\n.read{display:flex;justify-content:space-between;font-family:var(--mono);font-size:12px;color:var(--dim)}\n.read em{font-style:normal;color:var(--ok)}\n.chips{display:flex;flex-wrap:wrap;gap:10px}\n.chip{font:inherit;font-size:14px;color:var(--fg);background:transparent;border:1px solid var(--line);padding:9px 18px;border-radius:99px;cursor:pointer;transition:.25s}\n.chip.on{background:var(--fg);color:var(--ink);border-color:var(--fg)}\n.spec{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:20px;font-family:var(--mono)}\n.spec div{border-top:1px solid var(--line);padding-top:10px}.spec b{display:block;font-size:20px;font-weight:500}.spec span{font-size:11px;color:var(--dim)}\n.bars{display:grid;gap:14px}\n.bar{display:grid;grid-template-columns:90px 1fr 70px;gap:12px;align-items:center;font-family:var(--mono);font-size:12px;color:var(--dim)}\n.bar i{display:block;height:6px;border-radius:3px;background:linear-gradient(90deg,var(--beam),var(--beam2));width:0;transition:width 1.2s cubic-bezier(.2,.7,.2,1)}\nsection.on .bar i{width:var(--w)}\n/* faq */\ndetails{border-bottom:1px solid var(--line);padding:16px 0}\nsummary{cursor:pointer;font-family:var(--serif);font-size:19px;font-weight:700;list-style:none;display:flex;justify-content:space-between;gap:16px}\nsummary::after{content:\"+\";color:var(--beam);transition:.3s}details[open] summary::after{transform:rotate(45deg)}\ndetails p{margin-top:10px}\n/* plans */\n.plans{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}\n.plan{border:1px solid var(--line);border-radius:14px;padding:26px;background:var(--ink2);display:grid;gap:14px;align-content:start;min-width:0}\n.plan.hot{border-color:var(--beam);box-shadow:0 0 0 1px var(--beam),0 20px 60px -20px rgba(242,179,94,.35)}\n.plan .pr{font-family:var(--serif);font-size:40px;font-weight:900}.plan .pr small{font-size:13px;color:var(--dim);font-family:var(--sans);font-weight:300}\n.plan ul{margin:0;padding:0;list-style:none;display:grid;gap:6px;font-size:14px;color:var(--dim)}\n.plan li::before{content:\"—  \";color:var(--beam)}\n.btn{display:inline-block;text-align:center;text-decoration:none;color:var(--ink);background:var(--fg);padding:10px 22px;border-radius:99px;font-weight:500;font-size:14px}\n.plan:not(.hot) .btn{background:transparent;color:var(--fg);border:1px solid var(--line)}\n@media(max-width:820px){\n  .two,.plans{grid-template-columns:1fr}\n  section{align-items:flex-start;padding-top:84px;overflow:visible;overscroll-behavior:contain}\n  .bar{grid-template-columns:70px 1fr 56px}\n  nav.dots{right:6px}\n}\n.path{font-family:var(--mono);font-size:13px;color:var(--beam);margin-bottom:16px;word-break:break-all}\n.srcs{display:grid;gap:10px}.src{display:flex;gap:12px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:12px 16px;font-size:14px;transition:.3s}\n.src code{font-family:var(--mono);font-size:12px;color:var(--dim);flex:1;min-width:0;overflow-wrap:anywhere}.src em{font-style:normal;font-size:12px;color:var(--dim)}\n.src.act{border-color:var(--ok)}.src.act em{color:var(--ok)}.src.down{opacity:.45;border-style:dashed}.src.down em{color:var(--beam2)}\n.ulist{display:grid;gap:8px;margin-top:18px}.node{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding:9px 0}\n.node code{font-family:var(--mono);font-size:13px;min-width:0;overflow-wrap:anywhere}.node em{font-style:normal;font-size:12px;color:var(--dim);white-space:nowrap}\n.qhead{display:flex;justify-content:space-between;font-family:var(--mono);font-size:12px;color:var(--dim);margin-bottom:12px}.qhead b{color:var(--fg)}\n.qlist{display:grid;gap:8px;min-height:240px;align-content:start}.qi{display:grid;grid-template-columns:70px 1fr 48px;gap:12px;align-items:center;font-size:13px;border:1px solid var(--line);border-radius:8px;padding:9px 12px}\n.qi.wait{opacity:.55}\n.qwarn{margin-top:6px;grid-column:1/-1;font-size:12px;color:#e8b04b;background:rgba(232,176,75,.08);border:1px dashed rgba(232,176,75,.45);border-radius:6px;padding:5px 8px;line-height:1.5}.pb{height:5px;background:var(--line);border-radius:3px;overflow:hidden}.pb i{display:block;height:100%;background:linear-gradient(90deg,var(--beam),var(--beam2))}.qi em{font-style:normal;font-family:var(--mono);font-size:11px;color:var(--dim);text-align:right}\n.term{margin:18px 0 0;font-family:var(--mono);font-size:12.5px;line-height:1.8;color:var(--ok);background:var(--ink);border:1px solid var(--line);border-radius:8px;padding:16px;min-height:230px;overflow-x:auto;white-space:pre}\n.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.cell{border-top:1px solid var(--line);padding-top:14px;display:grid;gap:6px;align-content:start}.cell b{font-family:var(--serif);font-size:18px}\n.btn.ghost{background:transparent;color:var(--fg);border:1px solid var(--line)}\n@media(max-width:820px){.grid3{grid-template-columns:1fr 1fr}.qi{grid-template-columns:56px 1fr 40px}}\n@media(max-width:460px){.grid3{grid-template-columns:1fr}}\n.modal{position:fixed;inset:0;z-index:50;background:rgba(5,6,10,.8);display:grid;place-items:center;padding:24px}.modal[hidden]{display:none}\n.mbox{width:100%;max-width:360px;background:var(--ink2);border:1px solid var(--line);border-radius:14px;padding:26px;display:grid;gap:14px}\n.mbox h3{margin:0;font-family:var(--serif);font-size:22px}.mbox input{font:inherit;color:var(--fg);background:var(--ink);border:1px solid var(--line);border-radius:8px;padding:11px 14px;width:100%}\n.mbox input:focus{outline:2px solid var(--beam);outline-offset:1px}.merr{min-height:18px;font-size:13px;color:var(--beam2)}\n@media(prefers-reduced-motion:reduce){#snap{scroll-behavior:auto}section.on .rise,.hint{animation:none}.bar i{transition:none}}\n\nhtml{touch-action:manipulation}\n.sres.show{display:grid}\n@keyframes srowIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}\n.srow{animation:srowIn .45s cubic-bezier(.2,.7,.2,1) both}\n.globe canvas{width:100%;height:100%;display:block;margin:0 auto}\n@media(max-width:820px){#ka .wrap{gap:22px}#ka .qlist{min-height:0}#ka .toasts{min-height:80px}}\n\n/* ---- 片库海报墙:倾斜海报墙 → 转正 → 选中海报展开成横屏 → 自动播放 + 网速 ---- */\n#wall{display:block;padding:0;overflow:visible;min-height:0;scroll-snap-stop:normal;align-items:flex-start}\n.wtrack{position:relative;height:430vh}\n.wpin{position:sticky;top:0;height:var(--sh,100vh);overflow:hidden;background:var(--ink)}\n.wpers{position:absolute;inset:0;perspective:1100px;perspective-origin:50% 45%}\n.wplane{position:absolute;left:-35%;top:-35%;width:170%;height:170%;transform-style:preserve-3d;will-change:transform,opacity}\n.wcol{position:absolute;top:0;will-change:transform}\n.wcol img{display:block;object-fit:cover;border-radius:6px;background:#161826;margin-bottom:10px}\n.wshade{position:absolute;inset:0;background:radial-gradient(70% 60% at 50% 50%,rgba(10,11,16,.15),rgba(10,11,16,.78));pointer-events:none}\n.wtext{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;padding:0 24px;pointer-events:none;will-change:opacity,transform}\n.wtext h2{font-size:clamp(34px,6.5vw,76px);text-shadow:0 6px 40px rgba(0,0,0,.7)}\n.wtext p{margin:14px auto 0;color:#cfd0de;text-shadow:0 2px 20px rgba(0,0,0,.8)}\n.wghost{position:absolute;left:0;top:0;width:0;height:0;border-radius:8px;overflow:hidden;opacity:0;background:#000;box-shadow:0 30px 90px -20px rgba(0,0,0,.8);will-change:left,top,width,height}\n.wghost img,.wghost video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}\n.wghost video{opacity:0;transition:opacity .6s}\n.wghost.vp video{opacity:1}\n.gplay{position:absolute;left:50%;top:50%;width:76px;height:76px;margin:-38px 0 0 -38px;border-radius:50%;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.5);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:grid;place-items:center;opacity:0;transition:opacity .4s,transform .35s cubic-bezier(.16,1,.3,1)}\n.gplay svg{width:30px;height:30px;fill:#fff;margin-left:4px}\n.gplay.show{opacity:1}\n.gplay.tap{transform:scale(.86);background:rgba(255,255,255,.4)}\n.gplay.gone{opacity:0;transform:scale(1.5)}\n.ghud{position:absolute;left:14px;bottom:14px;right:14px;display:flex;justify-content:space-between;align-items:flex-end;gap:12px;opacity:0;transform:translateY(8px);transition:opacity .5s,transform .5s;pointer-events:none}\n.ghud.show{opacity:1;transform:none}\n.ghud .st{font-family:var(--mono);font-size:11px;letter-spacing:.12em;color:#fff;background:rgba(0,0,0,.5);padding:5px 10px;border-radius:99px;display:flex;gap:7px;align-items:center;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}\n.ghud .st i{width:7px;height:7px;border-radius:50%;background:var(--ok);box-shadow:0 0 10px var(--ok)}\n.ghud .sp{font-family:var(--mono);font-size:clamp(20px,5vw,30px);font-weight:500;color:#fff;background:rgba(0,0,0,.5);padding:6px 14px;border-radius:10px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}\n.ghud .sp small{font-size:.55em;color:var(--beam);margin-left:4px}\n.wcap{position:absolute;left:0;right:0;bottom:9%;text-align:center;padding:0 24px;opacity:0;pointer-events:none}\n.wcap b{display:block;font-family:var(--serif);font-size:clamp(20px,3.4vw,34px);font-weight:900}\n.wcap span{display:block;margin-top:6px;color:var(--dim);font-size:14px}\n\n/* ================= Lumen 风格转场层 (v3.6.2) ================= */\n/* 标题按行遮罩上升 + 模糊消散(单行标题不拆,保持原样) */\n.lx-lines{opacity:1!important;transform:none!important;filter:none!important}\n.lx-lines .ln{display:block;overflow:hidden;padding-bottom:.08em;margin-bottom:-.02em}\n.lx-lines .ln>i{display:block;font-style:normal;\n  transform:translate3d(0,115%,0) rotate(1.4deg);opacity:0;filter:blur(12px);\n  transition:transform 1.3s var(--lx-ease,cubic-bezier(.16,1,.3,1)),\n             opacity 1.05s var(--lx-ease,cubic-bezier(.16,1,.3,1)),\n             filter 1.15s var(--lx-ease,cubic-bezier(.16,1,.3,1));\n  transition-delay:calc(var(--li,0) * 110ms)}\nsection.on .lx-lines .ln>i,.lx-lines.on .ln>i{transform:none;opacity:1;filter:none}\n\n/* 章节指示器:圆点 → 悬停/激活时展开文字标签 */\nnav.dots button{position:relative;overflow:visible}\nnav.dots button>span{position:absolute;right:20px;top:50%;\n  transform:translateY(-50%) translateX(8px);\n  font:500 11px/1 var(--mono,ui-monospace,monospace);letter-spacing:.18em;color:var(--dim);\n  white-space:nowrap;opacity:0;pointer-events:none;\n  transition:opacity .4s var(--lx-ease,cubic-bezier(.16,1,.3,1)),transform .5s var(--lx-ease,cubic-bezier(.16,1,.3,1))}\nnav.dots button.on>span,nav.dots button:hover>span{opacity:1;transform:translateY(-50%)}\n\n/* Hero 离场由 JS 驱动 */\n#hero .wrap{will-change:opacity,transform,filter;transform-origin:50% 40%}\n\n@media (max-width:767px){\n  nav.dots button>span{display:none}\n}\n@media (prefers-reduced-motion:reduce){\n  .lx-lines .ln>i{transform:none!important;opacity:1!important;filter:none!important;transition:none!important}\n}\n\n/* ================= 丝滑滚动 + 长按保护 (v3.6.3) ================= */\n/* 长按/右键不再弹出\"保存图片/复制地址\";输入框保持可选中 */\n#snap{-webkit-touch-callout:none;user-select:none;-webkit-user-select:none}\n#snap input,#snap textarea{-webkit-user-select:text;user-select:text;-webkit-touch-callout:default}\n#snap img,#snap video{-webkit-user-drag:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;pointer-events:auto}\n#snap a{-webkit-touch-callout:none}\n/* 滚动容器:去掉吸附后允许自由停靠,消除\"往回拽\"的回弹 */\n#snap{scroll-padding-bottom:0;scrollbar-gutter:auto}\n\n/* ================= v3.6.4 移动端隐藏圆点 + 全局辉光流动 ================= */\n@media (max-width:767px){ nav.dots{display:none!important} }\n\n.lx-glow{position:fixed;inset:0;pointer-events:none;z-index:0;overflow:hidden;mix-blend-mode:screen}\n.lx-glow::before{content:'';position:absolute;inset:-25%;\n  background:\n    radial-gradient(42% 38% at 24% 28%, rgba(242,179,94,.13), transparent 65%),\n    radial-gradient(38% 34% at 82% 62%, rgba(0,229,255,.09), transparent 65%),\n    radial-gradient(30% 26% at 55% 88%, rgba(255,122,89,.07), transparent 70%);\n  filter:blur(14px);\n  animation:lxBreath 18s ease-in-out infinite alternate}\n.lx-glow::after{content:'';position:absolute;top:-20%;bottom:-20%;left:-45%;width:45%;\n  background:linear-gradient(100deg,transparent 0%,rgba(255,255,255,.05) 40%,rgba(242,179,94,.10) 55%,transparent 100%);\n  filter:blur(8px);animation:lxSweep 16s linear infinite}\n@keyframes lxBreath{0%{transform:translate3d(-3%,-2%,0) scale(1)}100%{transform:translate3d(3%,2%,0) scale(1.10)}}\n@keyframes lxSweep{0%{transform:translateX(0)}100%{transform:translateX(340%)}}\n@media (prefers-reduced-motion:reduce){ .lx-glow{display:none} }\n\n/* ================= v3.6.4 移动端滚动顺滑 ================= */\n@media (max-width:767px){\n  /* section 不再内部滚动,整页只有一个滚动容器 */\n  section{overflow:visible!important;overscroll-behavior:contain}\n  #snap{overscroll-behavior-y:contain;-webkit-overflow-scrolling:touch}\n  /* 去掉逐帧虚化后的重绘压力,滚动更跟手 */\n  .mwrap{filter:none!important}\n}\n\n/* ================= v3.6.5 移动端横向溢出修复 ================= */\n#hero{overflow:hidden}\n#hero::before{right:0;width:64%}\n#snap{overflow-x:hidden}\n/* 统计区与榜单在窄屏下强制不越界 */\n@media (max-width:767px){\n  #statsStage,.stage-inner,.gwrap,.hot,.hot-card{max-width:100%;min-width:0;box-sizing:border-box}\n  .hot-card{overflow:hidden}\n  .hot-chart{max-width:100%}\n}\n\n/* ================= v3.6.7 TOP5 竞速榜单 ================= */\n.lx-top{position:relative;width:100%;height:100%}\n.lx-row{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;gap:9px;\n  transition:transform .52s cubic-bezier(.2,.8,.2,1);will-change:transform}\n.lx-name{flex:0 0 72px;width:72px;text-align:right;font-size:11px;color:#cfe0f2;\n  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.lx-track{position:relative;flex:1;height:11px;border-radius:99px;background:rgba(255,255,255,.06);overflow:hidden}\n.lx-bar{position:absolute;left:0;top:0;height:100%;width:0;border-radius:99px;\n  background:linear-gradient(90deg,#234b66,#e8b04b);box-shadow:0 0 12px rgba(232,176,75,.25)}\n.lx-val{flex:0 0 34px;font-size:11px;color:#e8b04b;font-variant-numeric:tabular-nums}\n@media (max-width:767px){\n  .lx-name{flex-basis:62px;width:62px;font-size:10.5px}\n  .lx-val{flex-basis:30px;font-size:10.5px}\n}\n</style></head><body>\n\n<header><div class=\"logo\"><i></i>EMBY PROXY 面板</div><a class=\"cta\" href=\"#enter\" data-login>登录面板</a></header>\n<div class=\"modal\" id=\"lm\" hidden><div class=\"mbox\"><h3>登录面板</h3><p>输入管理员或管理员分配给你的登录密码。</p><input type=\"password\" id=\"lpw\" placeholder=\"登录密码\" autocomplete=\"current-password\"><div class=\"merr\" id=\"lerr\"></div><div class=\"chips\"><button class=\"chip on\" id=\"lgo\">登录</button><button class=\"chip\" id=\"lcl\">取消</button></div></div></div>\n<div id=\"pbar\"></div>\n<nav class=\"dots\" id=\"dots\" aria-label=\"章节\"></nav>\n\n<div class=\"lx-glow\" aria-hidden=\"true\"></div>\n<div id=\"snap\">\n  <section id=\"hero\" class=\"on\">\n    <canvas id=\"dust\"></canvas>\n    <div class=\"wrap\">\n      <div class=\"tag rise\">EMBY PROXY · 反代面板</div>\n      <h1 class=\"rise\">一个入口，<br><span class=\"grad\">管住所有 Emby</span></h1>\n      <p class=\"rise\">把分散的 Emby 源站收进一个面板:每人一个专属地址,线路自动切换,超期自动提醒,没登录的人什么都拿不到。</p>\n      <div class=\"stats rise\"><div><b>多源站</b><span>故障自动转移</span></div><div><b>每日</b><span>超期自动提醒</span></div><div><b>0 泄漏</b><span>用户之间互不可见</span></div></div>\n    </div>\n    <div class=\"hint\">SCROLL ↓</div>\n  </section>\n\n\n  <section id=\"wall\">\n    <div class=\"wtrack\" id=\"wtrack\">\n      <div class=\"wpin\" id=\"wpin\">\n        <div class=\"wpers\"><div class=\"wplane\" id=\"wplane\"></div></div>\n        <div class=\"wshade\"></div>\n        <div class=\"wtext\" id=\"wtext\"><div class=\"tag\">你的 · EMBY媒体库</div><h2 style=\"margin-top:14px\">海报加速,<br>流畅观影</h2><p>滑动,看一部片从海报墙里打开。</p></div>\n        <div class=\"wghost\" id=\"wghost\">\n          <img class=\"gl\" id=\"gl\" alt=\"\" decoding=\"async\">\n          <img class=\"gp\" id=\"gp\" alt=\"\" decoding=\"async\">\n          <video id=\"gv\" muted playsinline loop preload=\"none\"></video>\n          <div class=\"gplay\" id=\"gplay\"><svg viewBox=\"0 0 24 24\"><path d=\"M7 4.5v15l13-7.5z\"/></svg></div>\n          <div class=\"ghud\" id=\"ghud\"><div class=\"st\"><i></i>PLAYING · 直连</div><div class=\"sp\"><span id=\"gsp\">0</span><small>MB/s</small></div></div>\n        </div>\n        <div class=\"wcap\" id=\"wcap\"><b>反代直连,满速观影</b><span>选一部,点开就是满速</span></div>\n      </div>\n    </div>\n  </section>\n\n  <section id=\"route\">\n    <div class=\"wrap two\">\n      <div>\n        <div class=\"tag rise\">01 / 线路</div>\n        <h2 class=\"rise\" style=\"margin:14px 0 18px\">一个节点,<br>挂多个源站</h2>\n        <p class=\"rise\">节点可以填多个源站地址。其中一个失联,请求自动落到下一个,播放器不用换地址。点下面的按钮模拟一次故障。</p>\n      </div>\n      <div class=\"panel rise\">\n        <div class=\"path\" id=\"routePath\">/hk/emby/Items/…</div>\n        <div class=\"srcs\" id=\"srcs\"></div>\n        <div class=\"chips\" style=\"margin-top:18px\"><button class=\"chip\" id=\"killBtn\">模拟源站 A 故障</button><button class=\"chip\" id=\"healBtn\">恢复</button></div>\n      </div>\n    </div>\n  </section>\n\n  <section id=\"users\">\n    <div class=\"wrap two\">\n      <div class=\"panel rise\">\n        <div class=\"chips\" id=\"uchips\"></div>\n        <div class=\"ulist\" id=\"ulist\"></div>\n        <div class=\"read\" style=\"margin-top:14px\"><span id=\"uhint\"></span></div>\n      </div>\n      <div>\n        <div class=\"tag rise\">02 / 用户</div>\n        <h2 class=\"rise\" style=\"margin:14px 0 18px\">每人一个后缀,<br>节点互不串</h2>\n        <p class=\"rise\">管理员创建登录密码并分配后缀。用户添加的 /111 会变成 /后缀/111,只能看到和修改自己的节点,别人的节点连名字都看不到。</p>\n      </div>\n    </div>\n  </section>\n\n  <section id=\"ka\">\n    <div class=\"wrap two\">\n      <div>\n        <div class=\"tag rise\">03 / 保活</div>\n        <h2 class=\"rise\" style=\"margin:14px 0 0\">账号保号,<br>超期提醒</h2>\n        <div class=\"toasts rise\" id=\"toasts\" style=\"margin-top:18px\"></div>\n      </div>\n      <div class=\"panel rise\">\n        <div class=\"qhead\"><span>已超期 <b id=\"qrun\">0</b></span><span>即将超期 <b id=\"qwait\">0</b></span></div>\n        <div class=\"qlist\" id=\"qlist\"></div>\n        <div class=\"chips\" style=\"margin-top:16px\"><button class=\"chip\" id=\"qadd\">模拟一个超期节点</button><button class=\"chip\" id=\"qclr\">清空</button></div>\n      </div>\n    </div>\n  </section>\n\n  <section id=\"stealth\">\n    <div class=\"wrap two\">\n      <div class=\"panel rise\">\n        <div class=\"chips\" id=\"schips\"></div>\n        <pre class=\"term\" id=\"term\"></pre>\n      </div>\n      <div>\n        <div class=\"tag rise\">04 / 防护</div>\n        <h2 class=\"rise\" style=\"margin:14px 0 18px\">外人访问,<br>什么都拿不到</h2>\n        <p class=\"rise\">没有登录的访客拿不到任何接口数据。通用反代格式可以一键关闭,拿着别人的源站地址也借不了道。切换身份看看区别。</p>\n      </div>\n    </div>\n  </section>\n\n  <section id=\"ops\">\n    <div class=\"wrap\">\n      <div><div class=\"tag rise\">05 / 运营</div><h2 class=\"rise\" style=\"margin-top:14px;margin-bottom:10px\">看得见,才管得住</h2></div>\n      <div class=\"grid3 rise\">\n        <div class=\"cell\"><b>播放热力图</b><p>按节点、日期、小时统计,看出什么时候最忙。</p></div>\n        <div class=\"cell\"><b>保号通知</b><p>观看超期、节点异常和新版本,推到 Bark/TG/Server酱/钉钉。</p></div>\n        <div class=\"cell\"><b>流量统计</b><p>接入 Cloudflare 后,按节点查看带宽用量。</p></div>\n        <div class=\"cell\"><b>申请节点</b><p>访客提交申请,管理员一键通过或拒绝。</p></div>\n        <div class=\"cell\"><b>观看限制与测速</b><p>节点可设观看天数上限,超期自动提醒;线路延迟一键测。</p></div>\n        <div class=\"cell\"><b>strm 优化</b><p>strm 直连播放时不改写路径,逐节点开关。</p></div>\n      </div>\n    </div>\n  </section>\n\n\n  <section id=\"stats\">\n    <div class=\"wrap\">\n      <div><div class=\"tag rise\">06 / 统计</div><h2 class=\"rise\" style=\"margin:14px 0 18px\">一屏看懂,<br>全站在跑什么</h2></div>\n      <div class=\"gwrap\" id=\"statsStage\">\n        <div class=\"stage-inner\" id=\"stageInner\">\n          <div class=\"globe-box\" id=\"globeBox\"><div class=\"globe\" id=\"globe\"><canvas id=\"globeCv\"></canvas></div><div class=\"globe-hint\">继续下滑 · 打开中国访问热力</div></div>\n          <div class=\"china-box\" id=\"chinaBox\"><div class=\"china\" id=\"china\"></div><div class=\"china-hint\">中国 · 节点访问热力(示意数据)</div></div>\n          <div class=\"globe-load\" id=\"globeLoad\"></div>\n        </div>\n      </div>\n      <div class=\"hot rise\">\n        <div class=\"hot-card\"><div class=\"hot-title\">节点流量 TOP 5</div><div class=\"hot-chart\" id=\"nodeTop5\"></div></div>\n        <div class=\"hot-card\"><div class=\"hot-title\">播放器 TOP 5</div><div class=\"hot-chart\" id=\"playerTop5\"></div></div>\n      </div>\n    </div>\n  </section>\n\n  <section id=\"perf\">\n    <div class=\"wrap\">\n      <div><div class=\"tag rise\">07 / 性能</div><h2 class=\"rise\" style=\"margin:14px 0 18px\">为快而生,<br>轻到没有存在感</h2></div>\n      <div class=\"perf rise\">\n        <div class=\"pitem\"><b data-count=\"1\">0</b><span>次 D1 路由查询 / 请求<br><em>未命中缓存时</em></span></div>\n        <div class=\"pitem\"><b data-count=\"15\" data-suffix=\"s\">0</b><span>内存缓存<br><em>重复请求不再读库</em></span></div>\n        <div class=\"pitem\"><b data-count=\"24\" data-suffix=\"h\">0</b><span>全天自动保号扫描<br><em>超期自动提醒</em></span></div>\n        <div class=\"pitem\"><b data-count=\"3\">0</b><span>个源站可配<br><em>故障自动转移不中断</em></span></div>\n      </div>\n      <p class=\"perf-note rise\">Cloudflare Worker + D1 · 生产环境实测 · 不含网络时延</p>\n    </div>\n  </section>\n\n  <section id=\"search\">\n    <div class=\"wrap two\">\n      <div>\n        <div class=\"tag rise\">08 / 搜索</div>\n        <h2 class=\"rise\" style=\"margin:14px 0 18px\">怎么搜都找得到</h2>\n        <p class=\"rise\">节点备注、源站地址、访问路径三种方式都能精确命中。试试输入「节点电影」「example.movie.com」或「/movie」。</p>\n      </div>\n      <div class=\"panel rise\">\n        <div class=\"sbox\"><input id=\"sInp\" placeholder=\"输入 备注 / 源站 / 路径 试搜…\"><span id=\"sCnt\"></span></div>\n        <div class=\"sres\" id=\"sres\"></div>\n        <div class=\"chips\" style=\"margin-top:12px\"><button class=\"chip\" data-s=\"节点电影\">节点电影</button><button class=\"chip\" data-s=\"example.movie.com\">example.movie.com</button><button class=\"chip\" data-s=\"/movie\">/movie</button></div>\n      </div>\n    </div>\n  </section>\n\n  <section id=\"flow\">\n    <div class=\"wrap\">\n      <div><div class=\"tag rise\">09 / 申请</div><h2 class=\"rise\" style=\"margin:14px 0 18px\">三步开一个节点</h2></div>\n      <div class=\"plans rise\">\n        <div class=\"plan\"><b class=\"step\">01</b><h3>提交申请</h3><p>访客在面板填写想接入的 Emby 地址与用途说明,一键提交到申请队列。</p><span class=\"pr\">在线表单</span></div>\n        <div class=\"plan\"><b class=\"step\">02</b><h3>管理员审批</h3><p>管理员在后台看到申请队列,通过或拒绝,顺手设置观看天数上限。</p><span class=\"pr\">1 次点击</span></div>\n        <div class=\"plan\"><b class=\"step\">03</b><h3>放行即用</h3><p>通过后自动放行:订阅用户用公共密码直接访问,专属后缀用户各管各的节点。</p><span class=\"pr\">即时生效</span></div>\n      </div>\n    </div>\n  </section>\n\n  <section id=\"faq\">\n    <div class=\"wrap\" style=\"max-width:760px\">\n      <div class=\"tag rise\">06 / 常见问题</div>\n      <h2 class=\"rise\">部署之前</h2>\n      <div class=\"rise\">\n        <details open><summary>需要什么环境?</summary><p>一个 Cloudflare 账号,Worker 加一个 D1 数据库。保号提醒走 Webhook,无需额外绑定。</p></details>\n        <details><summary>支持哪些播放器?</summary><p>Emby 官方客户端和常见的 Emby 兼容播放器,填入节点地址与账号即可。</p></details>\n        <details><summary>用户能看到管理员或别人的节点吗?</summary><p>不能。用户登录后只有自己的节点和保活记录,管理类接口一律拒绝。</p></details>\n        <details><summary>保号提醒会打扰用户吗?</summary><p>不会。每个节点每天最多推送一次,超期状态解除后自动停止提醒。</p></details>\n      </div>\n    </div>\n  </section>\n\n  <section id=\"enter\">\n    <div class=\"wrap\" style=\"text-align:center;justify-items:center\">\n      <div class=\"tag rise\">ENTER</div>\n      <h2 class=\"rise\">准备好了就进来</h2>\n      <p class=\"rise\" style=\"margin-inline:auto\">使用管理员发给你的登录密码进入面板,管理自己的节点。</p>\n      <div class=\"chips rise\" style=\"justify-content:center\"><a class=\"btn\" href=\"#enter\" data-login>登录面板</a></div>\n    </div>\n  </section>\n</div>\n\n<script>\n(function(){\n  var snap=document.getElementById('snap'), secs=[].slice.call(document.querySelectorAll('section')), dots=document.getElementById('dots'), cur=0;\n  secs.forEach(function(s,i){var b=document.createElement('button');b.setAttribute('aria-label','第 '+(i+1)+' 屏');b.onclick=function(){go(i)};dots.appendChild(b)});\n  var goAnim=0;\n  function go(i){i=Math.max(0,Math.min(secs.length-1,i));var y0=snap.scrollTop,y1=secs[i].getBoundingClientRect().top-snap.getBoundingClientRect().top+y0;\n    if(matchMedia('(prefers-reduced-motion:reduce)').matches){snap.scrollTop=y1;return}\n    cancelAnimationFrame(goAnim);var dur=Math.min(1500,500+Math.abs(y1-y0)*0.35),t0=null;snap.style.scrollSnapType='none';snap.style.scrollBehavior='auto';\n    function e(x){return x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2}\n    function st(ts){if(t0===null)t0=ts;var k=Math.min(1,(ts-t0)/dur);snap.scrollTop=y0+(y1-y0)*e(k);if(k<1)goAnim=requestAnimationFrame(st);else{snap.style.scrollSnapType='';snap.style.scrollBehavior=''}}\n    goAnim=requestAnimationFrame(st)}\n  document.querySelectorAll('[data-go]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();go(+a.dataset.go)})});\n  function mark(i){cur=i;secs.forEach(function(s,k){s.classList.toggle('on',k===i)});[].forEach.call(dots.children,function(d,k){d.classList.toggle('on',k===i)})}\n  mark(0);\n  document.addEventListener('keydown',function(e){if(e.key==='ArrowDown'||e.key==='PageDown'){e.preventDefault();go(cur+1)}if(e.key==='ArrowUp'||e.key==='PageUp'){e.preventDefault();go(cur-1)}});\n  /* 线路故障转移 */\n  var S=[{n:'源站 A',h:'a.emby.example',ok:true},{n:'源站 B',h:'b.emby.example',ok:true}],srcs=document.getElementById('srcs'),rp=document.getElementById('routePath');\n  function drawSrc(){var act=S.findIndex(function(x){return x.ok});srcs.innerHTML=S.map(function(x,i){return '<div class=\"src'+(i===act?' act':'')+(x.ok?'':' down')+'\"><span>'+x.n+'</span><code>'+x.h+'</code><em>'+(!x.ok?'失联':i===act?'承接请求':'待命')+'</em></div>'}).join('');rp.textContent='/hk/emby/Items/… → '+(act<0?'无可用源站':S[act].h)}\n  document.getElementById('killBtn').onclick=function(){S[0].ok=false;drawSrc()};document.getElementById('healBtn').onclick=function(){S[0].ok=true;drawSrc()};drawSrc();\n  /* 用户隔离 */\n  var US={alice:['111','movies','anime'],bob:['111','hk'],admin:['hk','sg','alice/111','alice/movies','alice/anime','bob/111','bob/hk']},uc=document.getElementById('uchips'),ul=document.getElementById('ulist'),uh=document.getElementById('uhint');\n  function showU(k){[].forEach.call(uc.children,function(c){c.classList.toggle('on',c.dataset.k===k)});ul.innerHTML=US[k].map(function(n){var p=k==='admin'?n:k+'/'+n;return '<div class=\"node\"><code>/'+p+'</code><em>'+(k==='admin'?(n.indexOf('/')>0?'用户节点':'管理员节点'):'我的节点')+'</em></div>'}).join('');uh.textContent=k==='admin'?'管理员能看到全部节点':'只能看到自己的 '+US[k].length+' 个节点'}\n  Object.keys(US).forEach(function(k){var b=document.createElement('button');b.className='chip';b.dataset.k=k;b.textContent=k==='admin'?'管理员':'用户 '+k;b.onclick=function(){showU(k)};uc.appendChild(b)});showU('alice');\n        /* 保号扫描模拟:倒数从5天开始,剩3天时弹提醒 */\n  var Q=[],qn=0,names=['电影站','动漫站','音乐站','备用站','海外站','测试站','家庭站'];\n  function qdraw(){var over=Q.filter(function(x){return x.s==='over'}).length,soon=Q.filter(function(x){return x.s==='soon'}).length;document.getElementById('qrun').textContent=over;document.getElementById('qwait').textContent=soon;\n    document.getElementById('qlist').innerHTML=Q.length?Q.map(function(x){\n      var warn=(x.s==='soon'&&x.days===3)?'<div class=\"qwarn\">你已经 '+x.days+' 天没看 <b>'+x.n+'</b> emby 服了,注意帐户别封禁</div>':'';\n      return '<div class=\"qi '+x.s+'\"><span>'+x.n+'</span><div class=\"pb\"><i style=\"width:'+Math.round((1-x.days/7)*100)+'%\"></i></div><em>'+(x.s==='over'?'已超期':'剩余 '+Math.max(1,x.days)+' 天')+'</em>'+warn+'</div>';\n    }).join(''):'<div class=\"qi\"><span style=\"color:var(--dim)\">无超期节点</span></div>'}\n  function qtick(){Q.forEach(function(x){if(x.s!=='soon')return;x.days-=1;if(x.days===3&&!x.warned){x.warned=1;toast('TG','「'+x.n+'」剩余 3 天,注意帐户别封禁')}if(x.days<=0)x.s='over'});qdraw()}\n  document.getElementById('qadd').onclick=function(){if(Q.length>=8)return;Q.push({n:names[qn++%names.length],s:'soon',days:5+Math.floor(Math.random()*3)});qdraw()};\n  document.getElementById('qclr').onclick=function(){Q=[];qdraw()};\n  Q.push({n:'电影站',s:'soon',days:5},{n:'动漫站',s:'soon',days:4},{n:'音乐站',s:'soon',days:3},{n:'备用站',s:'soon',days:2});setTimeout(function(){toast('TG','「音乐站」剩余 3 天,注意帐户别封禁')},1300);qdraw();\n  if(!matchMedia('(prefers-reduced-motion:reduce)').matches)setInterval(qtick,2000);\n/* 伪装 */\n  var T={guest:'$ GET /api/routes\\n401 Unauthorized\\n\\n$ GET /https://other.example/emby\\n403 Forbidden  (通用反代已关闭)\\n\\n$ GET /api/users\\n401 Unauthorized',user:'$ GET /api/me\\n{ \"role\": \"user\", \"suffix\": \"alice\" }\\n\\n$ GET /api/routes\\n[ alice/111, alice/movies ]\\n\\n$ GET /api/users\\n403 Forbidden',admin:'$ GET /api/me\\n{ \"role\": \"admin\" }\\n\\n$ GET /api/users\\n[ alice, bob ]\\n\\n$ GET /api/routes\\n[ 全部节点 ]'},sc=document.getElementById('schips'),tm=document.getElementById('term');\n  function showS(k){[].forEach.call(sc.children,function(c){c.classList.toggle('on',c.dataset.k===k)});tm.textContent=T[k]}\n  [['guest','陌生访客'],['user','用户'],['admin','管理员']].forEach(function(x){var b=document.createElement('button');b.className='chip';b.dataset.k=x[0];b.textContent=x[1];b.onclick=function(){showS(x[0])};sc.appendChild(b)});showS('guest');\n\n  var lm=document.getElementById('lm'),lpw=document.getElementById('lpw'),lerr=document.getElementById('lerr');\n  function openL(){lm.hidden=false;lerr.textContent='';setTimeout(function(){lpw.focus()},30)}\n  document.querySelectorAll('[data-login]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();openL()})});\n  document.getElementById('lcl').onclick=function(){lm.hidden=true};\n  lm.addEventListener('click',function(e){if(e.target===lm)lm.hidden=true});\n  async function doLogin(){var v=lpw.value.trim();if(!v){lerr.textContent='请输入登录密码';return}\n    try{var r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pass:v})});var d=await r.json();\n      if(d&&d.success){location.reload()}else{lerr.textContent=(d&&d.error)||'密码错误'}}catch(e){lerr.textContent='网络异常,请重试'}}\n  document.getElementById('lgo').onclick=doLogin;\n  lpw.addEventListener('keydown',function(e){e.stopPropagation();if(e.key==='Enter')doLogin();if(e.key==='Escape')lm.hidden=true});\n  \n  /* 片头尘埃粒子 */\n  var cv=document.getElementById('dust'),cx=cv.getContext('2d'),P=[],W,H;\n  function size(){W=cv.width=cv.offsetWidth;H=cv.height=cv.offsetHeight}size();addEventListener('resize',size);\n  for(var i=0;i<70;i++)P.push({x:Math.random(),y:Math.random(),r:Math.random()*1.6+.3,v:Math.random()*.0004+.0001});\n  (function loop(){cx.clearRect(0,0,W,H);P.forEach(function(p){p.y-=p.v;p.x+=p.v*.4;if(p.y<0){p.y=1;p.x=Math.random()}cx.fillStyle='rgba(242,179,94,'+(.15+p.r*.15)+')';cx.beginPath();cx.arc(p.x*W,p.y*H,p.r,0,6.3);cx.fill()});if(!matchMedia('(prefers-reduced-motion:reduce)').matches)requestAnimationFrame(loop)})();\n  /* ---- v3.5.4 演示增强: 滚动入场 / 飘屏 / 数字滚动 / 搜索 / 统计大屏 ---- */\n  var riseEls=[].slice.call(document.querySelectorAll('.rise')),riseIo=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('on');riseIo.unobserve(e.target)}})},{threshold:.15});\n  riseEls.forEach(function(el){riseIo.observe(el)});\n  [].forEach.call(document.querySelectorAll('#hero .rise'),function(el){el.classList.add('on');riseIo.unobserve(el)});\n  function toast(icon,text){var box=document.getElementById('toasts');if(!box)return;var t=document.createElement('div');t.className='toast';t.innerHTML='<b class=\"tc\">'+icon+'</b><span>'+text+'</span>';while(box.children.length>=2)box.firstChild.remove();box.appendChild(t);setTimeout(function(){t.classList.add('out');setTimeout(function(){t.remove()},650)},3400)}\n  setInterval(function(){var r=Math.random();\n    if(r<.34)toast('TG','「电影站」源站 A 失联,已自动切到源站 B');\n    else if(r<.6)toast('BARK','「动漫站」新版本 v3.5.4 已发布');\n    else if(r<.82)toast('SVR','「音乐站」节点延迟恢复正常 12ms');\n    else toast('DING','「备用站」超期扫描完成,0 异常');},4600);\n  var cIo=new IntersectionObserver(function(es){es.forEach(function(en){if(!en.isIntersecting)return;var b=en.target,tg=parseFloat(b.dataset.count)||0,suf=b.dataset.suffix||'',t0=null;function st(ts){if(!t0)t0=ts;var p=Math.min(1,(ts-t0)/1100),v=tg*p;b.textContent=(tg%1?v.toFixed(1):Math.round(v))+suf;if(p<1)requestAnimationFrame(st)}requestAnimationFrame(st);cIo.unobserve(b)})},{threshold:.6});\n  [].forEach.call(document.querySelectorAll('[data-count]'),function(el){cIo.observe(el)});\n  var SLIB=[{n:'节点电影',src:'example.movie.com',p:'/movie',rm:'院线电影 4K 原画'},{n:'节点动漫',src:'anime.example.com',p:'/anime',rm:'新番连载更新'},{n:'节点音乐',src:'music.example.com',p:'/music',rm:'无损音轨曲库'},{n:'节点备用',src:'backup.example.com',p:'/backup',rm:'冷门资源补档'}];\n  var sInp=document.getElementById('sInp'),sRes=document.getElementById('sres'),sCnt=document.getElementById('sCnt');\n  function escS(t){return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;')}\n  function markS(t,q){if(!q)return escS(t);var i=t.toLowerCase().indexOf(q.toLowerCase());if(i<0)return escS(t);return escS(t.slice(0,i))+'<mark>'+escS(t.slice(i,i+q.length))+'</mark>'+escS(t.slice(i+q.length))}\n  function doSearch(){var q=sInp.value.trim().toLowerCase(),out=[];\n    if(q){SLIB.forEach(function(it){var hits=[];\n      if(it.n.toLowerCase().indexOf(q)>=0)hits.push('备注');\n      if(it.src.toLowerCase().indexOf(q)>=0)hits.push('源站');\n      if(it.p.toLowerCase().indexOf(q)>=0)hits.push('路径');\n      if(hits.length)out.push({it:it,hits:hits})})}\n    sCnt.textContent=q?('命中 '+out.length+' / '+SLIB.length):'输入关键词试搜(备注/源站/路径)';\n    sRes.innerHTML=out.length?out.map(function(o){return '<div class=\"srow\"><div><div class=\"sn\">'+markS(o.it.n,q)+'</div><div class=\"sm\">'+markS(o.it.src,q)+' · '+markS(o.it.p,q)+'</div></div><div class=\"st\"><b>'+o.hits.map(function(h){return h+'命中'}).join(' · ')+'</b><em>'+escS(o.it.rm)+'</em></div></div>'}).join(''):'';\n    sRes.classList.toggle('show',out.length>0);\n  }\n  var demoKeys=['节点电影','example.movie.com','/movie','节点音乐'],demoIdx=0,demoTimer=null;\n  function demoFill(){sInp.value=demoKeys[demoIdx];doSearch();demoIdx=(demoIdx+1)%demoKeys.length;demoTimer=setTimeout(function(){sInp.value='';doSearch();demoTimer=setTimeout(demoFill,1000)},3600)}\n  function startDemo(){if(demoTimer)return;demoTimer=setTimeout(demoFill,1400)}\n  function stopDemo(){if(demoTimer){clearTimeout(demoTimer);demoTimer=null}}\n  if(sInp){sInp.addEventListener('input',doSearch);sInp.addEventListener('focus',stopDemo);sInp.addEventListener('blur',function(){if(!sInp.value.trim())startDemo()});doSearch();startDemo()}\n  [].forEach.call(document.querySelectorAll('[data-s]'),function(b){b.onclick=function(){stopDemo();sInp.value=b.dataset.s;doSearch()}});\n  document.addEventListener('touchmove',function(e){if(e.touches&&e.touches.length>1)e.preventDefault()},{passive:false});\n  document.addEventListener('gesturestart',function(e){e.preventDefault()});\n  /* 统计大屏: 3D 地球 / 中国热力 / TOP5 */\n  function loadJs(u,ok,fail){var s=document.createElement('script');s.src=u;s.onload=ok;s.onerror=fail||function(){};document.head.appendChild(s)}\n  function initGlobe2D(){var cv=document.getElementById('globeCv');if(!cv)return null;\n    var gb=document.getElementById('globeBox'),gl=document.getElementById('globe');\n    var cbx=document.getElementById('chinaBox'),chinaEl=document.getElementById('china');\n    var stage=document.getElementById('statsStage'),inner=document.getElementById('stageInner');\n    var gh=gb&&gb.querySelector('.globe-hint'),ch=cbx&&cbx.querySelector('.china-hint');\n    var W=0,H=0,R=0,cx=0,cy=0,dpr=1,spin=0,lastMs=0,rafId=0,chinaTriggered=false,lxLabelA=1;\n    function inView(){if(!stage)return false;var r=stage.getBoundingClientRect(),vh=window.innerHeight||0;return r.bottom>-80&&r.top<vh+80}\n    function fit(){var r=gb?gb.getBoundingClientRect():null;W=Math.max(60,Math.round(r&&r.width||360));H=Math.max(60,Math.round(r&&r.height||360));dpr=Math.min(window.devicePixelRatio||1,2);cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);cv.style.width=W+'px';cv.style.height=H+'px';R=Math.min(W,H)*0.40;cx=W/2;cy=H/2;if(inner){var vh=window.innerHeight||0,shh=inner.offsetHeight||440;if(vh>shh)inner.style.top=Math.round((vh-shh)/2)+'px'}}\n    function xy(lon,lat,th){var lam=lon*Math.PI/180,phi=lat*Math.PI/180;return{x:cx+R*Math.sin(lam+th)*Math.cos(phi),y:cy-R*Math.sin(phi),vis:Math.cos(lam+th)*Math.cos(phi)>-0.12}}\n    function strokeLine(g,pts){var on=false,i,p;g.beginPath();for(i=0;i<pts.length;i++){p=pts[i];if(!p.vis){on=false;continue}if(!on){g.moveTo(p.x,p.y);on=true}else g.lineTo(p.x,p.y)}g.stroke()}\n    var LD=[1781,-175,-1800,-161,1794,-168,339,-10,377,-31,392,-47,388,-65,392,-85,400,-101,384,-113,368,-116,346,-115,339,-97,322,-89,302,-71,295,-54,305,-36,308,-17,-87,277,-87,259,-120,259,-119,234,-129,213,-168,213,-148,215,-139,237,-125,248,-114,269,-97,269,-1228,490,-1249,500,-1274,508,-1291,528,-1305,543,-1300,559,-1317,566,-1334,584,-1349,593,-1375,589,-1390,600,-1410,603,-1410,660,-1410,697,-1391,695,-1375,690,-1356,693,-1329,695,-1298,702,-1281,705,-1258,695,-1231,696,-1215,698,-1176,690,-1152,689,-1135,677,-1108,678,-1089,674,-1070,687,-1053,686,-1032,681,-1015,676,-984,678,-961,682,-942,691,-965,701,-952,719,-929,713,-915,702,-905,685,-880,686,-863,679,-855,699,-826,697,-812,687,-833,664,-858,666,-870,652,-885,641,-907,636,-932,620,-946,601,-932,588,-923,571,-890,569,-873,560,-850,553,-834,552,-821,533,-799,512,-786,526,-791,541,-771,558,-773,581,-773,599,-781,623,-757,623,-738,624,-717,615,-696,611,-693,590,-677,582,-652,599,-625,582,-614,570,-596,552,-580,549,-562,536,-564,518,-588,511,-617,501,-639,503,-664,502,-685,491,-700,477,-666,491,-642,487,-648,470,-632,457,-615,459,-598,459,-633,447,-654,435,-644,453,-660,453,-678,457,-682,474,-700,467,-711,453,-733,450,-753,448,-768,436,-787,436,-802,424,-824,417,-821,436,-826,453,-841,463,-857,472,-874,479,-893,480,-916,481,-936,486,-952,494,-972,490,-1007,490,-1041,490,-1070,490,-1101,490,-1130,490,-1160,490,-1200,490,-840,625,-819,629,-838,622,-798,728,-781,737,-763,731,-784,729,-803,621,-936,750,-956,747,-940,753,-938,775,-962,776,-944,778,-968,788,-986,785,-881,744,-898,745,-924,748,-939,763,-960,764,-936,768,-916,768,-898,758,-878,756,-848,757,-828,758,-811,757,-832,746,-861,744,-1113,782,-1135,777,-1110,788,-1125,784,-556,513,-568,498,-549,493,-531,487,-531,467,-542,478,-560,469,-593,476,-584,491,-574,507,-559,516,-839,651,-816,645,-801,637,-825,637,-855,631,-872,635,-862,648,-845,654,-788,724,-756,722,-741,713,-722,716,-688,705,-670,692,-688,687,-665,681,-649,678,-634,669,-639,650,-667,664,-657,646,-647,634,-663,629,-688,637,-674,629,-689,623,-710,629,-734,642,-777,642,-760,653,-740,655,-727,673,-748,686,-769,689,-790,702,-813,697,-849,700,-871,703,-887,704,-902,722,-884,735,-858,738,-823,738,-806,727,-945,741,-924,741,-905,739,-920,730,-943,720,-960,729,-1229,761,-1212,769,-1191,775,-1162,776,-1180,765,-1199,761,-1215,759,-1327,540,-1312,522,-1326,531,-1055,793,-1035,792,-1008,788,-1029,783,-1052,784,-1235,485,-1257,488,-1270,498,-1284,508,-1267,504,-1249,495,-1215,744,-1176,742,-1155,735,-1192,725,-1205,714,-1231,709,-1259,719,-1248,730,-1078,758,-1059,760,-1097,749,-1122,744,-1139,747,-1118,752,-1163,750,-1154,765,-1126,761,-1108,755,-1091,755,-1105,764,-1086,767,-1065,731,-1048,717,-1028,705,-1010,700,-1027,695,-1042,689,-1060,692,-1090,688,-1115,686,-1133,685,-1152,693,-1173,700,-1151,702,-1124,704,-1143,706,-1165,705,-1184,709,-1161,713,-1194,716,-1179,727,-1152,733,-1124,730,-1099,730,-1082,717,-1075,732,-1004,727,-974,738,-967,717,-984,713,-1000,717,-1025,725,-1066,736,-1045,734,-1069,735,-985,767,-982,750,-998,749,-1025,756,-1000,766,-960,806,-943,810,-924,813,-894,805,-878,803,-858,793,-890,783,-908,782,-929,783,-950,794,-967,802,-916,819,-889,821,-870,823,-843,826,-824,829,-793,831,-763,832,-728,832,-707,832,-685,831,-658,830,-637,829,-619,826,-643,819,-668,817,-695,806,-712,798,-732,796,-769,793,-754,785,-779,779,-798,772,-779,770,-806,762,-832,765,-861,763,-895,765,-878,772,-850,775,-880,784,-854,790,-869,803,-842,802,-818,805,-841,806,-876,805,-894,809,-914,816,-752,674,-770,671,-759,683,-963,695,-984,690,-966,697,-645,499,-629,497,-640,470,-620,464,-641,464,-1170,490,-952,490,-926,485,-908,483,-884,483,-865,476,-849,469,-835,460,-823,444,-829,424,-813,422,-789,429,-715,450,-691,440,-706,431,-700,416,-719,413,-737,409,-719,409,-740,406,-749,389,-759,372,-764,391,-763,370,-764,348,-781,339,-803,325,-815,307,-810,292,-801,269,-804,252,-822,267,-827,286,-837,299,-858,302,-875,303,-892,303,-909,291,-925,296,-947,295,-966,283,-974,267,-990,264,-1001,281,-1017,298,-1031,290,-1047,301,-1061,314,-1082,318,-1110,313,-1133,320,-1160,326,-1179,336,-1194,343,-1217,362,-1225,376,-1237,390,-1242,411,-1245,428,-1240,446,-1241,469,-1223,474,-1554,201,-1560,208,-1568,212,-1580,217,-1594,222,-1665,604,-1532,580,-1545,570,-1355,598,-1320,555,-1335,572,-1350,582,-1378,585,-1399,595,-1426,601,-1459,605,-1482,607,-1497,597,-1517,592,-1514,607,-1540,594,-1553,577,-1581,565,-1596,556,-1612,554,-1631,547,-1648,544,-1629,553,-1606,560,-1587,570,-1576,583,-1597,589,-1614,587,-1625,600,-1647,603,-1661,615,-1649,626,-1631,631,-1608,638,-1625,646,-1650,644,-1668,651,-1645,666,-1617,661,-1637,671,-1654,680,-1632,694,-1609,704,-1590,709,-1566,714,-1543,707,-1522,708,-1497,705,-1476,702,-1457,701,-1436,702,-1717,638,-1697,634,-1716,633,874,492,858,485,832,473,825,455,800,449,809,432,791,429,760,430,742,433,718,428,704,421,686,407,667,412,661,430,632,436,611,444,587,455,559,450,560,413,541,423,525,418,513,431,503,446,522,454,530,469,512,470,491,464,481,477,465,484,476,505,508,517,545,510,568,510,596,505,613,508,600,520,617,530,652,544,682,550,709,552,735,540,769,545,800,509,819,508,839,509,855,497,585,456,602,448,620,435,649,437,660,420,680,411,719,414,706,402,685,395,678,371,652,384,635,394,619,411,601,414,586,428,569,418,1410,-26,1427,-33,1446,-39,1458,-49,1476,-61,1481,-80,1493,-95,1508,-103,1489,-103,1471,-95,1460,-81,1439,-79,1426,-93,1410,-91,1410,-59,1526,-37,1507,-27,1522,-32,1513,-58,1497,-63,1511,-51,1548,-53,1560,-65,1545,-51,1391,-81,1384,-62,1360,-45,1337,-35,1320,-28,1338,-25,1318,-16,1340,-8,1344,-28,1363,-23,1383,-17,1399,-24,1250,-89,1236,-104,1342,-69,1179,41,1180,23,1190,9,1175,1,1166,-15,1161,-40,1145,-35,1121,-35,1102,-29,1096,-13,1090,4,1097,20,1112,10,1129,15,1146,14,1155,32,1170,43,1294,-28,1308,-39,1292,-34,1269,-38,1279,22,1286,3,1276,18,1229,9,1251,16,1237,2,1211,4,1209,-14,1233,-6,1215,-19,1223,-35,1232,-53,1215,-46,1210,-26,1204,-55,1195,-35,1193,-14,1200,6,1217,10,1203,-103,1213,-85,1229,-81,1213,-89,1183,-84,1167,-90,1085,-64,1105,-69,1126,-69,1145,-78,1126,-84,1106,-81,1087,-76,1065,-74,1073,-60,1044,-11,1056,-24,1059,-43,1047,-59,1026,-42,1014,-28,1001,-7,990,10,977,25,964,39,953,55,975,52,991,36,1006,21,1025,14,1038,1,-686,-526,-665,-545,-686,-549,-576,-302,-581,-320,-584,-339,-572,-353,-568,-369,-577,-382,-612,-389,-623,-402,-638,-412,-644,-429,-653,-445,-673,-456,-666,-470,-672,-487,-687,-503,-682,-524,-719,-520,-730,-507,-726,-489,-719,-469,-717,-450,-722,-423,-717,-398,-711,-376,-704,-360,-698,-342,-705,-314,-700,-294,-690,-275,-684,-245,-670,-230,-650,-221,-628,-220,-608,-239,-588,-248,-586,-271,-565,-275,-548,-266,-563,-289,-670,-549,-686,-556,-710,-551,-733,-540,-747,-528,-724,-537,-706,-536,-693,-525,-696,-176,-684,-194,-682,-215,-671,-227,-684,-262,-697,-285,-699,-303,-701,-331,-704,-352,-711,-367,-708,-386,-719,-408,-719,-434,-716,-456,-724,-477,-734,-493,-723,-507,-695,-521,-710,-538,-737,-528,-753,-516,-756,-487,-741,-469,-744,-441,-727,-424,-743,-432,-737,-399,-735,-383,-726,-355,-719,-339,-717,-309,-715,-289,-707,-257,-704,-236,-701,-214,-702,-198,-699,-181,293,-45,296,-65,307,-83,290,-84,285,-108,293,-124,274,-121,258,-118,243,-110,224,-110,218,-89,217,-73,201,-69,185,-78,169,-72,134,-59,152,-43,160,-27,169,-12,178,3,181,24,185,42,203,47,224,40,244,51,264,52,280,44,297,46,308,23,299,6,296,-13,293,-33,416,-17,410,28,421,42,437,50,478,80,489,95,489,114,507,120,508,103,501,81,486,53,466,29,441,11,420,-9,378,-37,341,-11,347,12,346,31,346,48,369,44,384,36,408,43,410,-9,406,-25,396,-43,246,82,236,97,229,111,223,126,223,143,239,156,238,196,250,220,290,220,329,220,369,220,371,198,379,184,369,170,363,148,359,126,348,113,340,96,331,114,314,98,296,101,280,94,260,101,245,89,219,126,210,95,191,91,180,79,163,78,150,88,149,109,145,129,135,144,152,166,157,200,149,229,198,215,-717,197,-717,180,-735,182,-732,199,-700,196,-683,186,-700,184,-714,176,938,810,959,813,979,807,1002,798,978,788,950,790,933,794,912,803,1028,793,1054,787,994,779,1013,792,1388,761,1415,761,1451,756,1406,748,1390,746,1370,753,1482,753,1507,751,1480,748,1461,752,1399,734,1421,739,1436,732,1400,733,448,806,468,808,485,805,515,807,498,804,476,800,227,543,209,543,228,549,535,738,559,746,579,756,612,763,645,764,662,768,682,769,646,757,616,753,585,743,570,733,554,724,575,707,537,708,516,715,544,736,1429,537,1432,518,1447,490,1426,479,1435,461,1419,468,1419,489,1422,510,1417,533,1308,422,1313,441,1331,451,1341,472,1325,478,1306,487,1277,498,1269,514,1259,528,1236,535,1210,533,1202,516,1193,501,1167,499,1150,501,1129,495,1107,491,1085,493,1069,503,1046,503,1023,505,1009,515,989,520,982,504,958,500,941,505,922,508,888,495,868,498,851,501,834,511,806,514,778,534,744,535,722,544,691,554,657,546,614,540,609,524,523,517,487,506,468,494,473,477,486,466,467,446,475,430,486,418,467,418,445,427,424,432,401,436,375,447,382,462,388,478,401,493,386,499,366,502,350,512,338,523,322,521,317,538,309,556,292,559,279,568,274,587,291,600,302,618,315,629,300,636,302,658,291,669,286,691,311,696,338,693,365,691,403,679,400,663,384,660,339,668,349,654,362,641,396,645,421,665,440,661,442,680,463,682,479,669,502,680,537,689,554,684,573,685,599,683,606,699,635,695,685,681,669,695,685,719,699,730,726,728,725,711,726,690,713,663,739,668,745,683,744,706,747,728,753,713,776,723,797,723,815,717,805,736,822,739,847,738,868,739,883,751,903,756,929,758,959,761,989,764,1008,764,1044,777,1061,774,1082,767,1111,767,1133,762,1102,745,1121,738,1140,736,1156,738,1188,736,1232,730,1254,736,1286,730,1297,712,1313,708,1339,714,1356,717,1375,713,1399,715,1495,722,1530,708,1570,710,1590,709,1609,694,1641,697,1659,695,1678,696,1696,687,1705,701,1736,698,1757,699,1786,694,-1800,690,-1775,682,-1749,672,-1719,669,-1699,660,-1725,654,-1739,643,-1760,649,-1784,654,-1799,659,1800,650,1774,646,1789,633,1774,625,1746,618,1721,609,1703,599,1663,598,1635,599,1620,582,1631,562,1617,553,1604,543,1585,530,1568,510,1560,532,1554,554,1568,574,1584,581,1601,593,1619,603,1637,611,1645,626,1627,616,1601,605,1567,614,1542,598,1528,589,1513,595,1485,592,1455,593,1422,590,1390,571,1351,547,1372,540,1388,543,1413,531,1406,512,1401,484,1386,470,1369,451,1355,440,1335,428,1309,426,-1800,715,-1776,713,-1800,708,1789,708,334,460,350,457,339,444,325,453,-790,268,-778,270,-782,252,-612,-518,-592,-515,-607,-523,151,797,170,801,215,790,190,786,176,776,159,768,138,774,112,789,132,800,294,692,277,702,257,691,237,689,212,694,199,684,180,686,161,673,136,648,119,631,126,613,115,594,84,583,57,586,50,620,86,635,105,645,124,659,148,678,164,686,192,698,214,703,230,702,245,710,264,710,282,712,313,705,274,801,230,794,201,796,185,799,205,806,229,807,254,804,247,779,225,774,207,777,229,785,-468,826,-434,832,-399,832,-351,836,-271,835,-208,827,-227,823,-265,823,-319,822,-279,821,-248,818,-229,821,-206,815,-158,819,-128,817,-163,806,-200,802,-177,801,-197,788,-185,770,-217,766,-198,761,-194,743,-216,742,-236,733,-223,722,-243,726,-221,715,-235,705,-255,714,-237,702,-277,685,-307,681,-328,677,-342,667,-364,660,-384,657,-407,648,-428,627,-429,611,-448,600,-463,609,-483,609,-499,624,-516,636,-523,652,-537,661,-530,684,-511,691,-535,693,-548,703,-514,706,-531,712,-550,714,-561,737,-573,747,-613,761,-634,762,-661,761,-685,761,-714,770,-688,773,-668,774,-710,776,-733,780,-694,789,-657,794,-680,801,-637,812,-603,820,-572,822,-541,822,-504,824,-480,821,-445,817,-469,822,689,-486,705,-491,687,-498,1266,-84,1251,-94,163,-286,185,-290,199,-248,207,-265,226,-260,242,-257,258,-252,271,-236,294,-221,312,-223,319,-244,310,-257,319,-272,322,-288,309,-299,289,-322,275,-332,259,-337,236,-338,215,-343,196,-348,182,-339,182,-317,171,-299,290,-290,270,-299,288,-301,281,-305,281,-289,-1171,325,-1147,327,-1090,313,-1065,318,-1050,306,-1039,293,-1005,287,-993,268,-975,258,-978,229,-972,206,-959,188,-944,181,-928,185,-908,193,-903,210,-885,215,-868,213,-876,196,-888,179,-910,178,-905,161,-922,153,-939,159,-961,158,-980,161,-997,167,-1017,176,-1035,183,-1050,193,-1053,211,-1060,228,-1079,245,-1093,256,-1104,272,-1118,285,-1128,300,-1139,316,-1147,302,-1134,288,-1125,275,-1113,257,-1102,243,-1122,247,-1128,263,-1145,271,-1149,293,-1163,308,-560,-309,-538,-320,-534,-338,-549,-350,-571,-344,-584,-333,-579,-310,-556,-309,-545,-275,-536,-261,-543,-246,-556,-227,-579,-221,-582,-202,-575,-182,-582,-163,-602,-163,-603,-146,-617,-135,-632,-126,-654,-116,-653,-98,-672,-103,-688,-110,-705,-110,-722,-101,-736,-84,-731,-66,-717,-46,-699,-43,-694,-16,-700,5,-679,17,-663,7,-646,13,-634,24,-644,38,-621,42,-606,49,-600,28,-590,13,-573,19,-556,24,-538,24,-522,32,-505,19,-507,2,-486,-2,-466,-9,-449,-16,-434,-24,-415,-29,-385,-37,-372,-48,-356,-51,-349,-67,-351,-90,-370,-110,-384,-130,-389,-157,-393,-179,-398,-196,-408,-209,-418,-224,-446,-234,-465,-241,-485,-259,-487,-282,-507,-310,-523,-322,-695,-110,-579,-200,-600,-193,-618,-196,-627,-222,-644,-228,-663,-218,-678,-229,-688,-204,-691,-183,-690,-165,-689,-145,-687,-126,-730,-57,-737,-73,-730,-90,-713,-101,-715,-174,-734,-164,-752,-153,-764,-138,-771,-122,-781,-104,-790,-84,-805,-65,-814,-47,-803,-34,-792,-50,-778,-30,-755,-16,-737,-13,-723,-24,-700,-27,-669,13,-698,17,-700,-2,-708,-23,-731,-23,-741,-10,-758,1,-774,4,-789,14,-779,27,-773,47,-775,67,-775,85,-761,93,-749,111,-726,117,-730,97,-724,80,-707,71,-694,61,-677,63,-678,45,-678,28,-774,87,-791,90,-805,81,-821,82,-805,91,-785,94,-825,96,-843,95,-858,101,-844,110,-830,100,-837,109,-856,112,-872,125,-861,140,-844,146,-836,131,-839,114,-831,150,-848,148,-863,138,-881,140,-882,157,-864,158,-845,159,-894,144,-877,138,-898,135,-922,145,-917,161,-891,178,-892,159,-895,142,-912,139,-886,163,-607,52,-639,40,-672,22,-676,38,-675,56,-690,62,-724,74,-728,91,-726,108,-717,91,-714,110,-699,122,-682,109,-662,106,-643,104,-619,107,-608,94,-606,78,-611,62,-565,19,-581,15,-597,22,-595,40,-605,69,-598,84,-585,73,-571,60,-580,41,-545,23,-573,33,-579,48,-559,58,-540,58,-544,42,-517,42,-526,25,-518,46,62,495,81,490,72,474,60,463,70,443,46,434,30,425,7,428,-15,430,-12,460,-30,476,-46,487,-16,486,13,501,31,508,48,500,87,426,-754,-2,-766,-26,-785,-39,-800,-43,-798,-27,-809,-11,-800,4,-779,8,-763,4,-663,185,-776,185,-823,232,-806,231,-783,225,-765,212,-749,207,-778,199,-787,216,-805,220,-822,224,-839,222,-825,231,277,-209,262,-193,253,-177,270,-179,285,-165,303,-155,319,-163,328,-180,328,-197,259,-247,209,-268,202,-249,199,-218,209,-183,232,-179,251,-177,277,-205,199,-285,178,-289,156,-278,150,-261,144,-239,143,-221,128,-197,118,-181,135,-170,183,-173,214,-179,232,-175,251,-176,236,-183,217,-182,209,-218,-167,136,-167,156,-151,166,-134,160,-122,146,-115,128,-132,126,-155,126,-138,135,-156,136,-115,124,-121,140,-113,154,-97,153,-55,155,-60,206,-65,250,-15,228,18,206,31,197,43,169,27,154,10,150,-11,150,-30,138,-44,125,-55,110,-68,101,-84,109,-93,123,-110,122,-171,210,-129,233,-49,250,-55,163,-95,155,-161,181,-163,201,27,63,17,91,8,105,19,116,36,117,37,101,27,85,155,210,153,179,140,157,140,140,123,130,107,132,90,128,73,131,54,139,40,130,25,122,10,133,4,149,43,192,86,216,120,235,136,230,27,79,32,94,36,113,140,125,136,108,128,87,118,74,101,70,88,55,75,44,54,49,43,63,140,95,151,84,148,64,145,47,154,33,159,17,143,22,124,22,96,23,89,39,92,64,111,66,122,83,132,96,144,116,9,110,15,93,16,68,7,83,4,102,0,110,5,87,6,69,-5,53,-29,50,-30,74,-28,96,-12,110,-80,102,-62,105,-43,96,-26,82,-32,63,-46,52,-65,47,-80,61,-84,77,-81,94,-137,126,-117,124,-99,121,-84,114,-83,98,-82,81,-100,84,-111,100,-127,93,-143,100,-141,117,-167,124,-151,110,-166,122,-77,44,-99,56,-114,68,-102,84,-89,73,-132,89,-119,100,-107,90,-111,74,-129,78,-54,104,-31,135,4,140,22,126,12,111,-4,111,-29,110,274,52,257,53,233,46,217,42,195,50,185,35,165,32,150,39,145,55,153,74,222,110,258,70,272,56,179,17,177,-1,164,-17,160,-35,146,-50,126,-44,115,-28,131,-24,144,-13,143,12,131,23,151,20,113,23,130,23,143,-6,140,-25,118,-25,111,-40,94,-21,90,-5,98,11,328,-92,333,-108,333,-124,302,-148,289,-160,276,-173,219,-161,219,-129,240,-129,240,-112,289,-132,284,-92,303,-82,343,-102,343,-123,353,-139,358,-159,345,-146,327,-137,331,-116,332,-97,365,-117,403,-103,406,-126,408,-147,395,-167,374,-176,359,-188,347,-205,354,-221,355,-241,330,-254,321,-267,325,-204,327,-187,328,-167,312,-159,332,-140,345,-150,350,-168,357,-146,130,-48,123,-61,163,-59,171,-75,190,-80,206,-69,219,-83,222,-99,239,-109,239,-126,190,-178,142,-174,122,-171,121,-149,127,-131,137,-113,131,-98,129,-76,305,-24,301,-41,290,-28,357,327,354,311,349,295,343,312,350,328,358,333,495,-125,502,-148,499,-165,490,-191,479,-224,471,-249,454,-256,438,-245,433,-228,439,-212,445,-194,440,-174,455,-160,477,-146,488,-131,354,315,-151,139,-168,132,95,303,91,321,76,333,84,355,95,374,111,369,108,348,115,331,106,318,-87,274,-71,296,-52,300,-37,309,-26,321,-17,339,-12,357,5,363,32,368,48,369,73,371,75,341,84,327,97,281,97,265,103,244,57,196,32,191,355,324,388,334,370,315,367,299,350,294,516,242,534,242,554,254,555,235,520,230,508,248,480,300,466,291,392,322,410,344,413,364,428,374,448,372,461,357,454,340,473,325,480,310,447,292,419,312,404,319,552,227,560,241,581,237,594,227,589,211,577,197,565,181,548,169,531,167,520,190,550,200,557,220,563,257,1672,-159,1668,-157,1026,122,1030,142,1052,143,1074,142,1075,123,1058,116,1043,105,1008,126,995,108,992,92,1005,74,1021,62,1003,66,990,79,986,99,996,119,991,138,989,162,979,176,983,197,1001,204,1010,184,1030,180,1047,174,1056,156,1048,164,1040,182,1021,181,1006,195,1012,214,1032,208,1048,199,1059,175,1073,159,984,146,992,128,990,110,985,131,978,148,972,169,954,157,945,173,935,194,924,207,932,223,933,241,946,252,964,273,979,283,987,267,977,251,989,231,1000,217,1062,110,1039,193,1022,225,1045,228,1067,228,1080,216,1059,198,1064,180,1074,167,1089,153,1093,134,1092,117,1072,104,1052,86,1306,424,1297,409,1280,400,1282,384,1267,378,1250,379,1253,396,1262,411,1282,415,1296,424,1262,377,1278,383,1292,374,1295,356,1274,345,1261,367,878,493,907,503,931,505,948,500,973,497,1144,502,1155,481,1173,477,1198,470,1174,467,1160,457,1135,448,1119,451,1111,434,1092,425,1061,421,1045,419,1018,425,995,425,975,427,958,433,935,450,909,453,910,469,889,481,973,283,951,266,946,247,933,230,912,235,924,250,899,253,886,264,883,249,889,229,870,215,851,195,839,183,822,170,808,160,802,138,799,121,799,104,783,89,766,89,757,113,749,127,744,146,735,160,731,179,728,204,712,208,692,221,682,237,710,244,702,265,718,279,734,300,744,317,741,334,758,345,778,355,788,335,787,315,811,302,801,288,820,279,847,272,872,264,881,279,897,267,920,268,934,286,954,290,927,220,905,228,890,221,885,236,889,252,909,251,917,278,900,283,853,267,833,274,811,284,833,295,850,286,870,280,737,343,745,328,744,310,728,290,706,280,703,257,688,244,671,247,645,252,629,252,632,272,618,287,635,295,663,299,677,313,693,319,703,334,716,352,729,367,746,370,762,359,665,374,681,370,701,376,718,367,733,375,750,374,713,361,712,343,697,331,689,316,669,313,650,295,625,293,609,298,617,314,605,330,612,356,630,354,645,363,657,377,682,389,693,407,710,402,695,395,718,393,737,394,748,380,713,383,695,376,710,423,735,425,756,429,777,430,796,425,782,412,765,404,748,404,731,409,712,411,555,413,571,413,647,371,632,359,592,374,573,380,555,380,539,372,539,390,527,400,547,410,529,419,486,299,478,317,461,330,457,347,441,394,461,387,477,395,489,383,508,369,538,370,611,365,608,344,609,322,618,307,628,274,615,251,596,254,574,257,565,271,547,265,525,276,509,288,496,300,366,342,361,358,382,369,407,371,423,372,414,356,368,323,465,388,450,397,438,407,456,408,465,395,110,589,123,601,120,618,126,641,151,662,168,680,220,686,235,679,239,660,222,657,198,636,178,627,178,606,179,590,164,570,147,562,129,554,118,574,282,562,299,558,314,542,318,521,302,514,282,516,263,518,246,519,235,535,255,543,265,556,368,467,350,463,333,461,317,467,296,453,296,469,283,482,266,482,249,477,231,481,234,503,235,539,235,520,239,504,225,495,209,493,189,494,176,504,155,508,144,526,164,545,186,547,170,481,160,467,138,465,122,471,104,469,121,477,136,489,153,490,170,486,221,484,210,463,188,459,169,464,187,479,202,483,219,483,285,456,276,474,282,455,286,437,261,439,241,437,225,444,209,454,216,470,281,468,223,550,211,560,239,563,255,561,273,575,271,558,222,563,241,570,256,578,280,595,277,578,234,586,259,596,141,538,147,521,133,507,105,476,85,478,67,492,62,508,71,531,88,540,109,544,136,541,227,442,256,437,272,442,277,426,261,418,245,416,229,420,225,436,263,353,247,349,230,413,252,412,239,400,240,382,232,364,213,376,202,393,210,408,226,411,387,367,371,366,347,368,325,361,306,367,287,367,270,377,262,395,288,405,311,411,335,420,352,420,369,413,395,411,416,415,436,411,448,397,442,380,280,420,264,402,194,403,194,419,166,465,185,458,165,452,173,434,152,442,137,451,153,455,96,475,90,460,73,458,67,475,60,501,43,499,27,508,50,515,69,535,66,519,33,513,47,531,-90,419,-74,418,-70,402,-74,384,-79,368,-88,383,-90,402,-75,371,-71,390,-69,411,-83,423,-68,436,-43,434,-19,434,3,426,8,410,-3,393,-7,376,-21,367,-44,367,-59,360,-62,539,-68,523,-86,517,-97,539,-76,551,1658,-211,1671,-222,1655,-217,1642,-204,1621,-105,1617,-96,1606,-83,1609,-99,1596,-80,1571,-70,1769,-401,1752,-417,1749,-399,1747,-380,1738,-361,1726,-345,1743,-353,1753,-372,1774,-380,1770,-399,1697,-436,1711,-425,1721,-410,1740,-409,1732,-430,1715,-442,1706,-459,1684,-466,1667,-462,1683,-441,1477,-408,1480,-424,1469,-436,1454,-427,1447,-412,1464,-411,1261,-322,1242,-330,1228,-339,1206,-339,1190,-345,1173,-350,1156,-344,1158,-322,1152,-306,1146,-288,1135,-265,1136,-247,1138,-231,1155,-215,1172,-206,1188,-203,1209,-197,1222,-182,1230,-164,1244,-156,1257,-145,1278,-143,1296,-150,1303,-134,1317,-123,1336,-118,1353,-122,1370,-124,1361,-137,1363,-156,1383,-168,1402,-177,1413,-164,1416,-146,1417,-129,1421,-113,1435,-128,1439,-145,1453,-154,1459,-169,1464,-190,1482,-200,1493,-213,1505,-226,1516,-241,1529,-253,1531,-273,1535,-290,1531,-309,1524,-326,1513,-338,1503,-357,1500,-374,1483,-378,1463,-390,1450,-379,1436,-388,1416,-383,1400,-374,1391,-357,1382,-344,1368,-353,1379,-336,1360,-349,1346,-332,1330,-320,1313,-315,1295,-316,1271,-323,818,75,803,60,797,82,801,98,813,86,1095,182,1091,198,1108,201,803,424,819,453,852,470,866,485,953,442,963,427,1077,425,1104,429,1118,437,1197,467,1181,481,1163,479,1294,494,1310,478,1334,482,1350,485,1338,461,1319,453,1311,429,1281,420,1243,399,1221,392,1216,409,1196,399,1180,392,1189,374,1208,379,1225,369,1206,361,1192,349,1206,334,1219,317,1215,301,1217,282,1204,271,1187,245,1173,236,1159,228,1142,222,1118,216,1104,203,1085,217,1066,222,1053,234,1035,227,1017,223,962,284,946,293,925,279,907,281,888,273,815,304,797,309,785,326,789,343,752,371,743,386,801,421,1218,244,1212,228,1207,245,123,454,135,436,151,420,168,412,184,404,165,398,161,380,157,395,141,408,121,417,105,429,89,444,74,437,71,453,148,381,124,376,87,409,97,392,84,404,99,550,81,555,85,571,106,577,107,561,124,561,-57,546,-31,534,-48,548,-56,563,-50,586,-30,586,-22,569,-11,546,2,533,17,527,5,508,-25,505,-45,503,-53,520,-46,535,-145,665,-136,651,-178,637,-200,636,-228,640,-243,656,-221,664,-206,657,-191,663,-162,665,464,419,480,414,496,406,489,388,454,406,400,434,439,426,458,421,409,430,1208,127,1226,100,1241,112,1233,93,1264,84,1262,63,1242,62,1236,78,1221,69,1229,83,1246,85,1262,93,1185,93,1172,84,1184,97,1195,114,1223,182,1223,163,1217,143,1240,138,1220,138,1207,148,1199,164,1207,185,1220,114,1255,122,1253,104,1243,126,1001,65,1018,58,1034,49,1035,28,1042,13,1026,20,1013,33,1006,48,1159,43,1151,28,1138,12,1118,9,1098,13,1114,27,1130,31,1142,45,1162,61,1183,57,1155,54,1147,40,149,455,300,677,304,642,281,605,263,604,245,601,229,598,213,607,211,626,224,638,247,649,236,664,226,491,208,486,192,481,175,479,184,493,204,494,150,511,167,502,184,500,171,488,124,500,141,509,364,144,368,163,379,174,393,159,412,145,426,130,412,138,393,145,376,142,1419,392,1410,371,1403,351,1372,346,1358,335,1333,344,1310,339,1313,315,1298,326,1309,342,1326,354,1346,357,1367,373,1389,378,1401,394,1403,412,1419,400,1446,440,1432,420,1416,427,1400,416,1403,433,1417,448,1439,442,1324,335,1339,344,1330,327,-558,-224,-554,-240,-546,-257,-557,-274,-576,-274,-576,-256,-600,-240,-623,-205,-582,-199,528,173,522,156,496,147,479,140,459,133,442,126,431,141,427,157,434,176,452,174,470,169,482,182,390,320,484,286,495,271,502,256,550,225,491,186,475,171,454,173,438,173,418,178,409,195,391,213,385,237,372,249,363,266,351,281,327,351,346,357,329,351,-22,352,-14,329,-31,317,-49,305,-87,288,-88,271,-105,270,-120,260,-146,219,-170,214,-163,230,-154,244,-144,263,-131,276,-109,288,-96,299,-94,320,-77,337,-62,351,-46,353,-26,352,250,257,250,292,248,311,265,316,284,310,301,315,320,309,338,310,348,298,342,278,324,299,333,277,341,261,357,239,367,222,250,200,159,234,141,225,108,246,93,261,98,277,98,294,99,314,114,324,131,329,152,323,166,312,191,303,198,318,215,328,232,322,249,319,247,300,450,50,428,43,412,39,396,34,353,55,342,68,330,78,385,145,409,141,420,129,418,111,433,95,469,80,424,125,428,109,437,92,426,106,446,104,466,108,484,114,319,-10,298,-14,312,22,327,38,345,36,350,19,342,5,304,-11,296,-29,186,426,169,437,157,448,179,451,196,440,224,423,219,423,208,457,221,445,226,429,210,431,192,435,194,452,201,426,184,425,200,431,206,419,-617,108,308,35,292,44,262,65,251,78,248,98,265,96,290,94,308,97,324,111,338,100,338,84,340,43,319,36,323,-87,353,-87,383,-87,323,-57,353,-57,383,-57,323,-27,353,-27,-810,447,-780,447,-840,477,-810,477,-780,477,-750,477,-720,477,-690,477,-660,477,-1260,507,-1230,507,-1200,507,-1170,507,-1140,507,-1110,507,-1080,507,-1050,507,-1020,507,-990,507,-960,507,-930,507,-900,507,-870,507,-840,507,-810,507,-780,507,-750,507,-720,507,-690,507,-660,507,-630,507,-600,507,-1290,537,-1260,537,-1230,537,-1200,537,-1170,537,-1140,537,-1110,537,-1080,537,-1050,537,-1020,537,-990,537,-960,537,-930,537,-900,537,-870,537,-840,537,-780,537,-750,537,-720,537,-690,537,-660,537,-630,537,-600,537,-570,537,-1290,567,-1260,567,-1230,567,-1200,567,-1170,567,-1140,567,-1110,567,-1080,567,-1050,567,-1020,567,-990,567,-960,567,-930,567,-900,567,-750,567,-720,567,-690,567,-660,567,-630,567,-1380,597,-1350,597,-1320,597,-1290,597,-1260,597,-1230,597,-1200,597,-1170,597,-1140,597,-1110,597,-1080,597,-1050,597,-1020,597,-990,597,-960,597,-750,597,-720,597,-1380,627,-1350,627,-1320,627,-1290,627,-1260,627,-1230,627,-1200,627,-1170,627,-1140,627,-1110,627,-1080,627,-1050,627,-1020,627,-990,627,-960,627,-930,627,-1380,657,-1350,657,-1320,657,-1290,657,-1260,657,-1230,657,-1200,657,-1170,657,-1140,657,-1110,657,-1080,657,-1050,657,-1020,657,-990,657,-960,657,-930,657,-900,657,-870,657,-1380,687,-1350,687,-1320,687,-1290,687,-1260,687,-1230,687,-1200,687,-1170,687,-930,687,-900,687,-840,687,-564,496,-782,649,-752,649,-722,649,-692,649,-722,679,-692,679,-662,679,-872,709,-842,709,-812,709,-782,709,-752,709,-722,709,-1229,739,-1199,739,-1169,739,-1164,715,-1134,715,-1104,715,-1074,715,-937,812,-826,792,-796,792,-766,792,-856,822,-826,822,-796,822,-766,822,-736,822,-706,822,-676,822,-646,822,-977,281,-827,281,-1037,311,-1007,311,-977,311,-947,311,-917,311,-887,311,-857,311,-827,311,-1187,341,-1157,341,-1127,341,-1097,341,-1067,341,-1037,341,-1007,341,-977,341,-947,341,-917,341,-887,341,-857,341,-827,341,-797,341,-1217,371,-1187,371,-1157,371,-1127,371,-1097,371,-1067,371,-1037,371,-1007,371,-977,371,-947,371,-917,371,-887,371,-857,371,-827,371,-797,371,-767,371,-1217,401,-1187,401,-1157,401,-1127,401,-1097,401,-1067,401,-1037,401,-1007,401,-977,401,-947,401,-917,401,-887,401,-857,401,-827,401,-797,401,-767,401,-1217,431,-1187,431,-1157,431,-1127,431,-1097,431,-1067,431,-1037,431,-1007,431,-977,431,-947,431,-917,431,-887,431,-857,431,-827,431,-767,431,-737,431,-707,431,-1217,461,-1187,461,-1157,461,-1127,461,-1097,461,-1067,461,-1037,461,-1007,461,-977,461,-947,461,-917,461,-887,461,-857,461,-1621,604,-1591,604,-1561,604,-1531,604,-1501,604,-1441,604,-1411,604,-1621,634,-1591,634,-1561,634,-1531,634,-1501,634,-1471,634,-1441,634,-1411,634,-1651,664,-1591,664,-1561,664,-1531,664,-1501,664,-1471,664,-1441,664,-1411,664,-1621,694,-1591,694,-1561,694,-1531,694,-1501,694,-1471,694,-1441,694,-1411,694,525,437,555,437,675,437,705,437,735,437,765,437,795,437,495,467,555,467,585,467,615,467,645,467,675,467,705,467,735,467,765,467,795,467,825,467,495,497,525,497,555,497,585,497,615,497,645,497,675,497,705,497,735,497,765,497,795,497,825,497,615,527,645,527,675,527,705,527,735,527,765,527,649,401,679,401,589,431,619,431,649,431,1440,-77,1470,-77,1440,-47,1395,-61,1335,-31,1365,-31,1395,-31,1120,-11,1150,-11,1150,19,1218,-27,1043,-29,1013,1,983,31,-704,-494,-704,-464,-704,-434,-674,-434,-704,-404,-674,-404,-644,-404,-704,-374,-674,-374,-644,-374,-614,-374,-584,-374,-674,-344,-644,-344,-614,-344,-704,-314,-674,-314,-644,-314,-614,-314,-584,-314,-674,-284,-644,-284,-614,-284,-584,-284,-674,-254,-644,-254,-614,-254,-584,-254,-726,-509,-726,-479,-726,-449,-726,-419,-726,-389,-726,-359,-696,-269,-696,-239,-696,-209,-696,-179,242,-103,272,-103,182,-73,212,-73,242,-73,272,-73,302,-73,182,-43,212,-43,242,-43,272,-43,182,-13,212,-13,242,-13,272,-13,182,17,212,17,242,17,272,17,302,17,242,47,272,47,440,13,440,43,470,43,500,103,369,-17,399,-17,369,13,399,13,369,43,249,112,279,112,309,112,339,112,249,142,279,142,309,142,339,142,249,172,279,172,309,172,339,172,369,172,279,202,309,202,339,202,369,202,165,104,195,104,165,134,195,134,165,164,195,164,225,164,165,194,195,194,225,194,165,224,545,736,665,766,390,442,420,442,450,442,1320,442,1350,442,420,472,450,472,480,472,1350,472,1380,472,390,502,420,502,450,502,870,502,900,502,960,502,1080,502,1110,502,1140,502,1170,502,1290,502,1320,502,1350,502,1380,502,330,532,360,532,390,532,420,532,450,532,480,532,510,532,540,532,570,532,600,532,810,532,840,532,870,532,900,532,930,532,960,532,990,532,1020,532,1050,532,1080,532,1110,532,1140,532,1170,532,1200,532,1260,532,1290,532,1320,532,1350,532,1380,532,1410,532,1590,532,300,562,330,562,360,562,390,562,420,562,450,562,480,562,510,562,540,562,570,562,600,562,630,562,660,562,690,562,720,562,750,562,780,562,810,562,840,562,870,562,900,562,930,562,960,562,990,562,1020,562,1050,562,1080,562,1110,562,1140,562,1170,562,1200,562,1230,562,1260,562,1290,562,1320,562,1350,562,1560,562,1590,562,1620,562,300,592,330,592,360,592,390,592,420,592,450,592,480,592,510,592,540,592,570,592,600,592,630,592,660,592,690,592,720,592,750,592,780,592,810,592,840,592,870,592,900,592,930,592,960,592,990,592,1020,592,1050,592,1080,592,1110,592,1140,592,1170,592,1200,592,1230,592,1260,592,1290,592,1320,592,1350,592,1380,592,1410,592,1530,592,1620,592,330,622,360,622,390,622,420,622,450,622,480,622,510,622,540,622,570,622,600,622,630,622,660,622,690,622,720,622,750,622,780,622,810,622,840,622,870,622,900,622,930,622,960,622,990,622,1020,622,1050,622,1080,622,1110,622,1140,622,1170,622,1200,622,1230,622,1260,622,1290,622,1320,622,1350,622,1380,622,1410,622,1440,622,1470,622,1500,622,1530,622,1560,622,1590,622,1620,622,1650,622,1680,622,1710,622,1740,622,-1770,652,-1710,652,-1680,652,-1650,652,-1620,652,-1590,652,-1560,652,-1530,652,-1500,652,-1470,652,-1440,652,-1410,652,-1380,652,-1350,652,-1320,652,-1290,652,-1260,652,-1230,652,-1200,652,-1170,652,-1140,652,-1110,652,-1080,652,-1050,652,-1020,652,-990,652,-960,652,-930,652,-900,652,-840,652,-810,652,-780,652,-750,652,-720,652,-690,652,-660,652,-630,652,-600,652,-570,652,-540,652,-510,652,-480,652,-450,652,-420,652,-390,652,-360,652,-330,652,-300,652,-270,652,-240,652,-210,652,-180,652,-150,652,-120,652,-90,652,-60,652,-30,652,0,652,30,652,60,652,90,652,120,652,150,652,180,652,210,652,240,652,270,652,360,652,390,652,-1770,682,-1740,682,-1710,682,-1680,682,-1650,682,-1620,682,-1590,682,-1560,682,-1530,682,-1500,682,-1470,682,-1440,682,-1410,682,-1380,682,-1350,682,-1320,682,-1290,682,-1260,682,-1230,682,-1200,682,-1170,682,-1140,682,-1110,682,-1080,682,-1050,682,-1020,682,-990,682,-960,682,-930,682,-900,682,-870,682,-840,682,-810,682,-780,682,-750,682,-720,682,-690,682,-660,682,-630,682,-600,682,-570,682,-540,682,-510,682,-480,682,-450,682,-420,682,-390,682,-360,682,-330,682,-300,682,-270,682,-240,682,-210,682,-180,682,-150,682,-120,682,-90,682,-60,682,-30,682,0,682,30,682,60,682,90,682,120,682,150,682,180,682,210,682,240,682,270,682,420,682,480,682,690,712,720,712,750,712,780,712,810,712,840,712,870,712,900,712,930,712,960,712,990,712,1020,712,1050,712,1080,712,1110,712,1140,712,1170,712,1200,712,1230,712,1260,712,1290,712,1320,712,1350,712,1380,712,1410,712,1440,712,1470,712,1500,712,870,742,900,742,930,742,960,742,990,742,1020,742,1050,742,1080,742,1020,772,134,798,164,798,80,611,110,611,110,641,140,671,230,701,260,701,290,701,-493,630,-463,630,-433,630,-523,660,-493,660,-463,660,-433,660,-403,660,-373,660,-493,690,-463,690,-433,690,-403,690,-373,690,-343,690,-313,690,-283,690,-553,720,-523,720,-493,720,-463,720,-433,720,-403,720,-373,720,-343,720,-313,720,-283,720,-253,720,-583,750,-553,750,-523,750,-493,750,-463,750,-433,750,-403,750,-373,750,-343,750,-313,750,-283,750,-253,750,-223,750,-703,780,-673,780,-643,780,-613,780,-583,780,-553,780,-523,780,-493,780,-463,780,-433,780,-403,780,-373,780,-343,780,-313,780,-283,780,-253,780,-223,780,-643,810,-613,810,-583,810,-553,810,-523,810,-493,810,-463,810,-433,810,-403,810,-373,810,-343,810,-313,810,-283,810,-253,810,-223,810,-193,810,-163,810,193,-318,223,-318,253,-318,283,-318,193,-288,223,-288,253,-288,283,-288,313,-288,253,-258,283,-258,283,-228,313,-228,-991,175,-961,175,-931,175,-1051,205,-1021,205,-991,205,-901,205,-871,205,-1051,235,-1021,235,-991,235,-1081,265,-1051,265,-1021,265,-991,265,-1141,295,-1111,295,-1081,295,-1051,295,-1021,295,-554,-320,-560,-308,-530,-308,-530,-278,-500,-278,-530,-248,-500,-248,-560,-218,-530,-218,-500,-218,-470,-218,-440,-218,-410,-218,-560,-188,-530,-188,-500,-188,-470,-188,-440,-188,-410,-188,-590,-158,-560,-158,-530,-158,-500,-158,-470,-158,-440,-158,-410,-158,-620,-128,-590,-128,-560,-128,-530,-128,-500,-128,-470,-128,-440,-128,-410,-128,-710,-98,-680,-98,-650,-98,-620,-98,-590,-98,-560,-98,-530,-98,-500,-98,-470,-98,-440,-98,-410,-98,-380,-98,-710,-68,-680,-68,-650,-68,-620,-68,-590,-68,-560,-68,-530,-68,-500,-68,-470,-68,-440,-68,-410,-68,-380,-68,-350,-68,-680,-38,-650,-38,-620,-38,-590,-38,-560,-38,-530,-38,-500,-38,-470,-38,-440,-38,-410,-38,-680,-8,-650,-8,-620,-8,-590,-8,-560,-8,-530,-8,-500,-8,-620,22,-560,22,-666,-199,-636,-199,-666,-169,-636,-169,-606,-169,-666,-139,-636,-139,-606,-139,-666,-109,-724,-153,-694,-153,-754,-123,-724,-123,-694,-123,-784,-93,-754,-93,-784,-63,-754,-63,-754,-33,-724,-33,-730,-13,-700,-13,-760,17,-730,17,-700,17,-760,47,-730,47,-700,47,-760,77,-730,77,-730,107,-847,137,-892,167,-673,37,-673,67,-643,67,-613,67,-703,97,-673,97,-643,97,-584,43,-550,48,14,453,44,453,-16,483,14,483,44,483,74,483,-780,-20,-820,229,283,-193,313,-193,313,-163,199,-238,229,-238,259,-238,229,-208,259,-208,177,-260,147,-230,177,-230,147,-200,177,-200,207,-200,-146,153,-92,131,-62,131,-32,161,-2,161,28,161,-32,191,-2,191,28,191,-32,221,-141,176,-111,176,-81,176,-141,206,-111,206,-81,206,-111,236,-81,236,-81,266,33,147,63,147,93,147,123,147,63,177,93,177,123,177,93,207,123,207,153,207,57,72,87,72,117,72,57,102,87,102,117,102,57,132,117,132,115,47,145,77,145,107,-2,77,-2,107,-56,73,-121,103,-91,103,-25,126,5,126,175,53,205,53,235,53,265,53,205,83,235,83,171,10,118,-10,118,20,249,-150,279,-150,249,-120,309,-120,309,-90,332,-237,332,-207,332,-177,362,-177,332,-147,362,-147,392,-147,362,-117,392,-117,146,-149,176,-149,206,-149,146,-119,176,-119,206,-119,236,-119,146,-89,176,-89,206,-89,146,-59,463,-226,463,-196,463,-166,493,-166,493,-136,105,333,105,363,3,221,33,221,63,221,93,221,-27,251,3,251,33,251,63,251,93,251,-57,281,-27,281,3,281,33,281,63,281,93,281,-27,311,3,311,33,311,63,311,3,341,33,341,63,341,63,371,379,322,418,321,448,321,418,351,448,351,550,197,580,227,1053,135,1004,147,1034,147,1004,177,1034,177,1061,169,1031,199,953,159,983,159,953,189,953,219,983,219,953,249,1082,116,1082,146,1052,206,1273,407,1291,374,968,446,998,446,1028,446,1058,446,1088,446,908,476,938,476,968,476,998,476,1028,476,1058,476,1088,476,1118,476,1148,476,1178,476,998,506,772,110,772,140,802,140,742,170,772,170,802,170,742,200,772,200,802,200,832,200,712,230,742,230,772,230,802,230,832,230,862,230,712,260,742,260,772,260,802,260,832,260,862,260,922,260,742,290,772,290,952,290,772,320,911,237,831,294,639,267,669,267,699,267,669,297,699,297,729,297,699,327,729,327,729,357,759,357,635,323,665,323,635,353,665,353,695,353,725,423,755,423,785,423,555,383,585,383,615,383,645,383,585,413,531,281,561,281,591,281,621,281,501,311,531,311,561,311,591,311,471,341,501,341,531,341,561,341,591,341,471,371,501,371,561,371,591,371,387,353,140,584,140,614,170,614,140,644,170,644,200,644,170,674,200,674,230,674,262,543,292,543,251,483,281,483,311,483,341,483,371,483,251,513,281,513,311,513,341,513,171,520,201,520,231,520,232,467,262,467,90,503,120,503,90,533,120,533,292,388,322,388,352,388,382,388,412,388,442,388,352,418,167,455,-64,389,-34,389,-4,389,-64,419,-34,419,-4,419,26,419,1756,-387,1695,-436,1725,-436,1403,-360,1433,-360,1463,-360,1493,-360,1163,-330,1193,-330,1223,-330,1373,-330,1403,-330,1433,-330,1463,-330,1493,-330,1163,-300,1193,-300,1223,-300,1253,-300,1283,-300,1313,-300,1343,-300,1373,-300,1403,-300,1433,-300,1463,-300,1493,-300,1523,-300,1163,-270,1193,-270,1223,-270,1253,-270,1283,-270,1313,-270,1343,-270,1373,-270,1403,-270,1433,-270,1463,-270,1493,-270,1523,-270,1163,-240,1193,-240,1223,-240,1253,-240,1283,-240,1313,-240,1343,-240,1373,-240,1403,-240,1433,-240,1463,-240,1493,-240,1163,-210,1193,-210,1223,-210,1253,-210,1283,-210,1313,-210,1343,-210,1373,-210,1403,-210,1433,-210,1463,-210,1223,-180,1253,-180,1283,-180,1313,-180,1343,-180,1373,-180,1403,-180,1433,-180,1253,-150,1283,-150,1313,-150,1343,-150,1433,-150,1343,-120,1007,233,1037,233,1067,233,1097,233,1127,233,1157,233,1007,263,1037,263,1067,263,1097,263,1127,263,1157,263,1187,263,857,293,887,293,917,293,947,293,977,293,1007,293,1037,293,1067,293,1097,293,1127,293,1157,293,1187,293,1217,293,797,323,827,323,857,323,887,323,917,323,947,323,977,323,1007,323,1037,323,1067,323,1097,323,1127,323,1157,323,1187,323,797,353,827,353,857,353,887,353,917,353,947,353,977,353,1007,353,1037,353,1067,353,1097,353,1127,353,1157,353,1187,353,767,383,797,383,827,383,857,383,887,383,917,383,947,383,977,383,1007,383,1037,383,1067,383,1097,383,1127,383,1157,383,797,413,827,413,857,413,887,413,917,413,947,413,977,413,1007,413,1037,413,1067,413,1097,413,1127,413,1157,413,1187,413,1217,413,1247,413,827,443,857,443,887,443,917,443,947,443,1127,443,1157,443,1187,443,1217,443,1247,443,1277,443,1307,443,857,473,887,473,1217,473,1247,473,1277,473,1307,473,1337,473,1217,503,1247,503,1217,533,157,409,127,439,-32,530,-2,530,-32,560,480,413,1249,86,1031,42,1157,38,236,628,266,628,296,628,266,658,296,658,236,688,266,688,393,155,1324,340,1354,340,1384,370,1414,400,1428,446,-567,-245,-597,-215,456,156,486,156,516,156,516,186,436,193,466,193,496,193,526,193,406,223,436,223,466,223,496,223,526,223,376,253,406,253,436,253,466,253,496,253,376,283,406,283,436,283,466,283,376,313,406,313,-140,244,-110,274,-80,304,-50,304,-80,334,-50,334,-20,334,277,220,307,220,337,220,367,220,277,250,307,250,337,250,277,280,307,280,337,280,277,310,307,310,183,226,213,226,243,226,123,256,153,256,183,256,213,256,243,256,123,286,153,286,183,286,213,286,243,286,123,316,153,316,213,316,243,316,360,64,390,64,420,64,450,64,360,94,390,94,420,94,360,124,390,124,420,124,486,110,326,16,269,65,299,65,329,65,269,95,299,95,329,95];;var LDR=[];for(var li=0;li<LD.length;li+=2){LDR.push(LD[li]/10*Math.PI/180,LD[li+1]/10*Math.PI/180)}\n      function draw(ms){var g=cv.getContext('2d');if(!g)return;g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,W,H);\n      var th=spin-2.0316,k,j,pts;\n      var bg=g.createRadialGradient(cx-R*0.3,cy-R*0.32,R*0.12,cx,cy,R);bg.addColorStop(0,'#14324c');bg.addColorStop(.55,'#0a1c2e');bg.addColorStop(1,'#060d16');\n      g.beginPath();g.arc(cx,cy,R,0,Math.PI*2);g.fillStyle=bg;g.fill();\n      g.beginPath();g.arc(cx,cy,R+1.2,0,Math.PI*2);g.strokeStyle='rgba(120,175,215,.28)';g.lineWidth=1.2;g.stroke();\n      g.lineWidth=1;g.strokeStyle='rgba(120,175,215,.38)';\n      /*LAND_DOTS_START*/g.globalCompositeOperation='lighter';for(var di=0;di<LDR.length;di+=2){var lo=LDR[di],la=LDR[di+1],cph=Math.cos(la),zz=Math.cos(lo+th)*cph;if(zz<-0.10)continue;var px=cx+R*Math.sin(lo+th)*cph,py=cy-R*Math.sin(la),dep=(zz+0.10)/1.10;if(dep>1)dep=1;var rad=0.55+dep*1.05;g.fillStyle='rgba('+(120+95*dep|0)+','+(215+38*dep|0)+',255,'+(0.28+0.62*dep).toFixed(2)+')';g.beginPath();g.arc(px,py,rad,0,6.283);g.fill();if(dep>0.42){g.fillStyle='rgba(120,215,255,'+(0.05+0.12*dep).toFixed(2)+')';g.beginPath();g.arc(px,py,rad*2.6,0,6.283);g.fill()}}g.globalCompositeOperation='source-over';/*LAND_DOTS_END*/\n      var cities=[['北京',116.4,39.9,1],['上海',121.5,31.2,1],['广州',113.3,23.1,1],['成都',104.1,30.6,1],['重庆',106.5,29.6,1],['西安',108.9,34.3,1],['武汉',114.3,30.6,1],['南京',118.8,32.1,1],['东京',139.7,35.7],['新加坡',103.8,1.35],['伦敦',-0.13,51.5],['纽约',-74,40.7],['悉尼',151.2,-33.9],['迪拜',55.3,25.3]];\n      for(k=0;k<cities.length;k++){var p=xy(cities[k][2],cities[k][1],th);if(!p.vis)continue;var big=cities[k][3];g.beginPath();g.arc(p.x,p.y,big?3.2:1.8,0,Math.PI*2);g.fillStyle=big?'#ffc46b':'rgba(150,200,235,.8)';g.fill()}\n      var cn=xy(116.4,39.9,th);if(cn.vis){g.save();g.globalAlpha=lxLabelA;var rr=8+3*Math.sin((ms||0)*0.004);g.beginPath();g.arc(cn.x,cn.y,rr,0,Math.PI*2);g.strokeStyle='rgba(255,196,107,.55)';g.lineWidth=1.4;g.stroke();g.beginPath();g.arc(cn.x,cn.y,3,0,Math.PI*2);g.fillStyle='#ffc46b';g.fill();g.font='600 13px system-ui,sans-serif';g.textAlign='left';g.fillStyle='#ffc46b';g.fillText('中国',cn.x+rr+6,cn.y-8);g.font='400 11px system-ui,sans-serif';g.fillStyle='rgba(255,196,107,.8)';g.fillText('滚动展开热力',cn.x+rr+6,cn.y+8);g.restore()}\n    }\n    function ss(a,b,x){x=(x-a)/(b-a);if(x<0)x=0;if(x>1)x=1;return x*x*(3-2*x)}\n    function progress(){if(!stage||!inner)return 0;var r=stage.getBoundingClientRect(),vh=window.innerHeight||1,sh=inner.offsetHeight||420,sticky=Math.max(0,(vh-sh)/2),travel=Math.max(1,r.height-sh),p=(sticky-r.top)/travel;return p<0?0:p>1?1:p}\n    function apply(p){\n      if(!gb||!cbx)return;\n      var eo=1-ss(0.36,0.56,p),co=ss(0.40,0.62,p),\n          zoom=1+1.45*ss(0.02,0.60,p),cs=0.94+0.32*ss(0.55,1,p);\n      gb.style.opacity=eo;cbx.style.opacity=co;\n      if(gl)gl.style.transform='translateZ(0) scale('+zoom.toFixed(3)+')';\n      if(chinaEl)chinaEl.style.transform='translateZ(0) scale('+cs.toFixed(3)+')';\n      if(gh)gh.style.opacity=eo;if(ch)ch.style.opacity=co;\n      lxLabelA=1-ss(0.03,0.22,p);\n      if(p>0.10&&!chinaTriggered){chinaTriggered=true;showChina()}\n    }\n    function frame(ms){\n      rafId=0;var p=progress();\n      if(!lastMs)lastMs=ms;var dt=ms-lastMs;if(dt<0)dt=0;if(dt>64)dt=64;lastMs=ms;\n      if(p<=0.005){spin+=dt*0.00014}\n      else{\n        spin=((spin+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;\n        spin+=(0-spin)*Math.min(1,dt*0.006);\n      }\n      apply(p);draw(ms);if(inView())rafId=requestAnimationFrame(frame)\n    }\n    function ensureLoop(){if(!rafId&&inView()){lastMs=0;rafId=requestAnimationFrame(frame)}}\n    var scroller=document.getElementById('snap')||window,pending=false;\n    function onScroll(){if(pending)return;pending=true;requestAnimationFrame(function(){pending=false;apply(progress());ensureLoop()})}\n    scroller.addEventListener('scroll',onScroll,{passive:true});\n    window.addEventListener('scroll',onScroll,{passive:true});\n    window.addEventListener('resize',function(){fit();apply(progress());draw(lastMs||0)});\n    if(window.ResizeObserver){try{new ResizeObserver(function(){fit();apply(progress());draw(lastMs||0);if(chinaChart)chinaChart.resize()}).observe(inner)}catch(e){}}\n    fit();apply(progress());ensureLoop();\n    return function(){fit();apply(progress());ensureLoop()}\n  }\n  var globe2d=null,chinaChart=null,statsTried=false;\n  function drawTop(id,data,names,cfg){\n    var el=document.getElementById(id);if(!el)return;\n    cfg=cfg||{};\n    var items=data.map(function(v,i){\n      return {name:names[i],final:v,\n              delay:(cfg.delay&&cfg.delay[i])||0,\n              dur:(cfg.dur&&cfg.dur[i])||1500,\n              slow:!!(cfg.slow&&cfg.slow[i]),\n              cur:0,rank:i,row:null,bar:null,val:null};\n    });\n    /* 初始顺序按最终值(高→低),但起跑时数值全为 0;慢速选手会先掉队,再反超 */\n    items.sort(function(a,b){return b.final-a.final});\n    var n=items.length, rowH=Math.max(26,Math.floor((el.clientHeight||220)/n));\n    el.innerHTML='';\n    var wrap=document.createElement('div');wrap.className='lx-top';el.appendChild(wrap);\n    items.forEach(function(it){\n      var row=document.createElement('div');row.className='lx-row';\n      row.style.height=rowH+'px';\n      row.style.transform='translateY('+(it.rank*rowH)+'px)';\n      var nm=document.createElement('span');nm.className='lx-name';nm.textContent=it.name;\n      var tr=document.createElement('span');tr.className='lx-track';\n      var bar=document.createElement('i');bar.className='lx-bar';tr.appendChild(bar);\n      var vl=document.createElement('span');vl.className='lx-val';vl.textContent='0';\n      row.appendChild(nm);row.appendChild(tr);row.appendChild(vl);\n      wrap.appendChild(row);\n      it.row=row;it.bar=bar;it.val=vl;\n    });\n    function easeOut(t){return 1-Math.pow(1-t,3)}\n    function easeInOut(t){return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}\n    var t0=null, end=0, order=items.map(function(x){return x.name}).join('|');\n    items.forEach(function(x){end=Math.max(end,x.delay+x.dur)});\n    function frame(ts){\n      if(t0===null)t0=ts;\n      var t=ts-t0;\n      items.forEach(function(it){\n        var p=Math.min(1,Math.max(0,(t-it.delay)/it.dur));\n        it.cur=it.final*((it.slow?easeInOut:easeOut)(p));\n        it.bar.style.width=(it.cur/100*100).toFixed(2)+'%';\n        it.val.textContent=Math.round(it.cur);\n      });\n      /* 按当前数值实时排名:数值相同则按最终值兜底,避免抖动 */\n      var sorted=items.slice().sort(function(a,b){\n        return (b.cur-a.cur)||(b.final-a.final);\n      });\n      var sig=sorted.map(function(x){return x.name}).join('|');\n      if(sig!==order){\n        order=sig;\n        sorted.forEach(function(it,i){\n          if(it.rank!==i){\n            it.rank=i;it.row.style.transform='translateY('+(i*rowH)+'px)';\n          }\n        });\n      }\n      if(t<end+120)requestAnimationFrame(frame);\n    }\n    requestAnimationFrame(frame);\n  }\n  function showChina(){if(!window.echarts)return;if(!chinaChart)chinaChart=echarts.init(document.getElementById('china'));chinaChart.resize();\n    if(!window._chinaDrawn){window._chinaDrawn=1;fetchChina()}}\n  function fetchChina(){var tryList=['https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json','https://unpkg.com/echarts@4.9.0/map/json/china.json'];\n    (function next(k){if(k>=tryList.length){var gl=document.getElementById('globeLoad');if(gl){gl.style.display='grid';gl.textContent='中国地图数据加载失败,请检查网络'}return}\n      fetch(tryList[k]).then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(j){if(!j.features)throw 0;echarts.registerMap('china',j);drawChina()}).catch(function(){next(k+1)})})(0)}\n  function drawChina(){\n    var P=[['北京',116.41,39.90,96],['香港',114.17,22.31,88],['上海',121.47,31.23,92],\n           ['成都',104.07,30.67,78],['广州',113.26,23.13,84]];\n    chinaChart.setOption({\n      backgroundColor:'transparent',\n      geo:{map:'china',roam:false,zoom:1.02,layoutCenter:['50%','52%'],layoutSize:'97%',\n        itemStyle:{areaColor:'#0b1b2b',borderColor:'#2a4560',borderWidth:.6},\n        emphasis:{itemStyle:{areaColor:'#16324a'},label:{show:false}}},\n      series:[{\n        name:'访问热力',type:'effectScatter',coordinateSystem:'geo',\n        data:P.map(function(p){var lp=p[0]==='香港'?'bottom':(p[0]==='广州'?'left':'right');return {name:p[0],value:[p[1],p[2],p[3]],label:{position:lp}}}),\n        symbolSize:function(v){return 10+v[2]/12},\n        rippleEffect:{scale:3.2,brushType:'stroke',number:3},\n        itemStyle:{color:'#ffc46b',shadowBlur:18,shadowColor:'rgba(255,196,107,.75)'},\n        label:{show:true,position:'right',color:'#ffe9c2',fontSize:13,fontWeight:600,\n          textShadowColor:'rgba(0,0,0,.65)',textShadowBlur:4,\n          formatter:function(o){return o.name}},\n        animationDuration:1300,\n        animationDelay:function(i){return 350+i*320},\n        animationEasing:'cubicOut'\n      }]\n    });\n    if(chinaChart)chinaChart.resize();\n    var gl=document.getElementById('globeLoad'); if(gl) gl.style.display='none';\n  }\n  function initStats(){if(statsTried)return;statsTried=1;var load=document.getElementById('globeLoad');\n    function boot(){\n      drawTop('nodeTop5',[86,64,52,41,30],['节点电影','节点动漫','节点音乐','节点备用','海外站']);\n      drawTop('playerTop5',[92,78,61,44,27],['Rex','SenPlayer','小幻影视','VidHub','Infuse'],{delay:[320,0,0,0,0],dur:[2100,1500,1400,1500,1500],slow:[1,0,0,0,0]});\n      try{globe2d=initGlobe2D();load.style.display='none'}catch(e){load.textContent='地球组件初始化失败,TOP5 统计不受影响'}\n    }\n    boot();\n    if(!window.echarts){loadJs('https://cdn.staticfile.net/echarts/5.4.3/echarts.min.js',function(){if(chinaTriggered)showChina()},function(){})}\n\n    window.addEventListener('resize',function(){if(globe2d)globe2d();if(chinaChart)chinaChart.resize();[].forEach.call(document.querySelectorAll('.hot-chart'),function(el){var c=echarts.getInstanceByDom(el);if(c)c.resize()})})}\n  var stSec=document.getElementById('stats');\n  if(stSec){var stObs=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){initStats();stObs.unobserve(e.target)}})},{threshold:.12});stObs.observe(stSec)}\n\n  /* ---- 3.8.2 转场动效:滚动联动(视差/缩放/虚化)+ 错峰入场 + 缓动跳转 + 进度条 + 卡片倾斜 ---- */\n  (function(){\n    var reduce=matchMedia('(prefers-reduced-motion:reduce)').matches,bar=document.getElementById('pbar'),hero=document.getElementById('hero');\n    var isMobile=matchMedia('(max-width:767px)').matches||matchMedia('(pointer:coarse)').matches;\n    var skipBlur={hero:1,stats:1},skipAll={stats:1,wall:1};\n    secs.forEach(function(sc){var w=sc.querySelector('.wrap');if(w&&!skipAll[sc.id])w.classList.add('mwrap');\n      var ri=sc.querySelectorAll('.rise');[].forEach.call(ri,function(el,i){el.style.transitionDelay=(i*0.09)+'s'})});\n    function clamp(x,a,b){return x<a?a:x>b?b:x}\n    var ticking=false;\n    function update(){ticking=false;var sr=snap.getBoundingClientRect(),vh=snap.clientHeight||innerHeight,k=0;\n      if(bar){var m=snap.scrollHeight-vh;bar.style.transform='scaleX('+(m>0?clamp(snap.scrollTop/m,0,1):0)+')'}\n      secs.forEach(function(sc,i){var r=sc.getBoundingClientRect(),d=(r.top-sr.top)/vh;\n        if(d<=0.5)k=i;\n        var on=r.top-sr.top<vh*0.78&&r.bottom-sr.top>vh*0.22;\n        [].forEach.call(sc.querySelectorAll('.rise'),function(el){if(on){el.classList.add('on')}else if(r.top-sr.top>vh*1.05||r.bottom-sr.top<-vh*0.05){el.classList.remove('on')}});\n        if(reduce||isMobile||skipAll[sc.id])return;\n        var w=sc.querySelector('.mwrap');if(!w)return;\n        if(r.height>vh*1.3){w.style.transform='';w.style.opacity='';w.style.filter='';return}\n        var op=1,ty=0,sc2=1,bl=0;\n        if(d>0){var e=clamp(d,0,1);op=clamp(1-e*1.2,0,1);ty=e*70;sc2=1-e*0.05;bl=e*2.5}\n        else{var x=clamp(-d,0,1);op=clamp(1-x*1.25,0,1);ty=-x*48;sc2=1-x*0.07;bl=x*2.5}\n        w.style.opacity=op<0.999?op.toFixed(3):'';\n        w.style.transform=(Math.abs(d)<0.002)?'':'translate3d(0,'+ty.toFixed(1)+'px,0) scale('+sc2.toFixed(4)+')';\n        w.style.filter=(bl>0.1&&!skipBlur[sc.id])?'blur('+bl.toFixed(1)+'px)':''});\n      if(hero&&!reduce&&!isMobile){var hr=hero.getBoundingClientRect(),hd=clamp(-(hr.top-sr.top)/vh,0,1),cv=hero.querySelector('canvas');if(cv)cv.style.transform='translate3d(0,'+(-hd*120).toFixed(1)+'px,0)'}\n      if(k!==cur)mark(k)}\n    function req(){if(!ticking){ticking=true;requestAnimationFrame(update)}}\n    snap.addEventListener('scroll',req,{passive:true});addEventListener('resize',req);update();setTimeout(update,300);\n    /* 卡片指针倾斜(仅桌面精确指针) */\n    if(!reduce&&matchMedia('(hover:hover) and (pointer:fine)').matches){\n      [].forEach.call(document.querySelectorAll('.panel,.plan,.cell'),function(el){el.classList.add('tilt');\n        el.addEventListener('pointermove',function(e){var r=el.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;el.style.transform='perspective(900px) rotateX('+(-y*5).toFixed(2)+'deg) rotateY('+(x*6).toFixed(2)+'deg)'});\n        el.addEventListener('pointerleave',function(){el.style.transform=''})})}\n  })();\n\n  /* ---- 片库海报墙(滚动驱动) ---- */\n  (function(){\n    var sec=document.getElementById('wall');if(!sec)return;\n    var track=document.getElementById('wtrack'),pin=document.getElementById('wpin'),plane=document.getElementById('wplane'),txt=document.getElementById('wtext'),\n        ghost=document.getElementById('wghost'),gp=document.getElementById('gp'),gl=document.getElementById('gl'),gv=document.getElementById('gv'),gplay=document.getElementById('gplay'),\n        ghud=document.getElementById('ghud'),gsp=document.getElementById('gsp'),cap=document.getElementById('wcap');\n    var BASE='/_a/p/',SEL=9,reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;\n    gp.src=BASE+SEL+'.webp';gl.src=BASE+'this.webp';\n    var cols=[],tw,th,gap=10,period,selCol=null,selTiles=[],selIdx=0,gshown=false,Wp,Hp,t=0,last=0,vidSet=false,playing=false,timers=[];\n    function clamp(x){return x<0?0:x>1?1:x}\n    function ease(x){x=clamp(x);return x*x*(3-2*x)}\n    function lerp(a,b,k){return a+(b-a)*k}\n    function build(){\n      plane.innerHTML='';cols=[];selTiles=[];var pr=pin.getBoundingClientRect();Wp=pr.width*1.7;Hp=pr.height*1.7;\n      tw=pr.width<700?84:118;th=Math.round(tw*1.5);var n=Math.ceil(Wp/(tw+gap))+1,rows=Math.ceil(Hp/(th+gap))+1;period=rows*(th+gap);\n      var nums=[];for(var i=1;i<=30;i++)if(i!==SEL)nums.push(i);\n      var mid=Math.floor(n/2),r0=Math.round((Hp/2-th/2)/(th+gap)),k=0;\n      var x0=(Wp-n*(tw+gap))/2;\n      for(var c=0;c<n;c++){\n        var col=document.createElement('div');col.className='wcol';col.style.left=(x0+c*(tw+gap))+'px';col.style.width=tw+'px';\n        var tiles=[];\n        for(var s=0;s<2;s++)for(var r=0;r<rows;r++){\n          var im=document.createElement('img');im.width=tw;im.height=th;im.style.width=tw+'px';im.style.height=th+'px';im.alt='';im.decoding='async';\n          var num;if(c===mid&&r===r0){num=SEL}else{num=nums[(k*7+c*5+r*3)%nums.length];k++}\n          im.src=BASE+num+'.webp';col.appendChild(im);if(c===mid&&r===r0)selTiles.push(im);\n        }\n        plane.appendChild(col);\n        cols.push({el:col,dir:(c%2?1:-1),sp:12+((c*7)%5)*4,sel:c===mid,tileY:r0*(th+gap)+th/2});\n      }\n      selCol=cols[mid];\n    }\n    function tyOf(c){var o=(t*c.sp)%period;return c.dir<0?-o:-period+o}\n    function sizeVars(){var h=snap.clientHeight||innerHeight;pin.style.setProperty('--sh',h+'px');track.style.height=(h*4.3)+'px'}\n    function stopDemo(){timers.forEach(clearTimeout);timers=[];if(!playing)return;playing=false;try{gv.pause();gv.currentTime=0}catch(e){}ghost.classList.remove('vp');ghud.classList.remove('show');gplay.className='gplay show';gsp.textContent='0'}\n    function startDemo(){\n      if(playing)return;playing=true;gplay.className='gplay show';\n      timers.push(setTimeout(function(){gplay.classList.add('tap')},350));\n      timers.push(setTimeout(function(){gplay.className='gplay gone';ghost.classList.add('vp');var pr=gv.play();if(pr&&pr.catch)pr.catch(function(){});ghud.classList.add('show');\n        var t0=performance.now();(function tick(ts){var k=Math.min(1,(ts-t0)/1300),v=120*(1-Math.pow(1-k,3));gsp.textContent=Math.round(v);if(k<1&&playing)requestAnimationFrame(tick)})(t0)},950));\n    }\n    function frame(ts){\n      requestAnimationFrame(frame);\n      var tr=track.getBoundingClientRect(),sr=snap.getBoundingClientRect(),H=snap.clientHeight||innerHeight;\n      if(tr.bottom<-60||tr.top>H+sr.top+60){last=0;return}\n      var dt=last?Math.min(0.05,(ts-last)/1000):0;last=ts;\n      var span=Math.max(1,tr.height-H),p=clamp((sr.top-tr.top)/span);\n      if(p<0.02&&!reduce)t+=dt;\n      var e0=ease(p/0.26),e1=ease((p-0.26)/0.36),eS=ease(p/0.24);\n      cols.forEach(function(c){var ty=tyOf(c);if(c.sel){c._ty=ty;var tt=Hp/2-c.tileY;tt=tt+period*Math.round((ty-tt)/period);ty=lerp(ty,tt,eS)}c.el.style.transform='translate3d(0,'+ty.toFixed(1)+'px,0)'});\n      plane.style.transform='rotateX('+(48*(1-e0)).toFixed(2)+'deg) rotateZ('+(-11*(1-e0)).toFixed(2)+'deg) scale('+(1.02+0.28*e1).toFixed(3)+')';\n      plane.style.opacity=String(1-0.88*e1);\n      var tOp=1-ease((p-0.04)/0.14);txt.style.opacity=String(tOp);txt.style.transform='translateY(calc(-50% - '+((1-tOp)*30).toFixed(1)+'px))';\n      /* 幽灵卡:从选中海报当前位置,连续过渡到居中的横屏卡 */\n      if(p>0.2&&selTiles.length){\n        var pr=pin.getBoundingClientRect(),W=pr.width,Hh=pr.height;\n        if(!gshown){var b0=Math.abs(selTiles[0].getBoundingClientRect().top-pr.top-Hh/2),b1=Math.abs(selTiles[1].getBoundingClientRect().top-pr.top-Hh/2);selIdx=b1<b0?1:0}\n        gshown=true;var selTile=selTiles[selIdx],tl=selTile.getBoundingClientRect();\n        var gw=Math.min(W*0.92,1000,Hh*0.7*16/9),gh=gw*9/16,tx=(W-gw)/2,ty2=(Hh-gh)/2-Hh*0.03;\n        var sx=tl.left-pr.left,sy=tl.top-pr.top,sw=tl.width,sh=tl.height;\n        ghost.style.left=lerp(sx,tx,e1).toFixed(1)+'px';ghost.style.top=lerp(sy,ty2,e1).toFixed(1)+'px';ghost.style.width=lerp(sw,gw,e1).toFixed(1)+'px';ghost.style.height=lerp(sh,gh,e1).toFixed(1)+'px';\n        ghost.style.borderRadius=lerp(6,14,e1).toFixed(1)+'px';\n        ghost.style.opacity=String(ease((p-0.2)/0.04));\n        gp.style.opacity=String(1-ease((e1-0.1)/0.5));gl.style.opacity=String(ease((e1-0.1)/0.5));\n        selTiles.forEach(function(x,k){x.style.visibility=(k===selIdx&&p>0.22)?'hidden':'visible'});\n      }else{gshown=false;ghost.style.opacity='0';selTiles.forEach(function(x){x.style.visibility='visible'})}\n      cap.style.opacity=String(ease((p-0.68)/0.12));\n      if(p>0.3&&!vidSet){vidSet=true;gv.src=BASE+'this.mp4';gv.load()}\n      if(p>0.72)startDemo();else if(p<0.62)stopDemo();\n    }\n    sizeVars();build();requestAnimationFrame(frame);\n    var rt;addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(function(){stopDemo();sizeVars();build()},200)});\n  })();\n\n  /* ---------------- Lumen 风格转场增强 (v3.6.2) ---------------- */\n  (function(){\n    var lxR = matchMedia('(prefers-reduced-motion:reduce)').matches;\n    var LABELS = {hero:'开场',wall:'片库',route:'线路',users:'用户',ka:'保号',stealth:'防护',\n                  ops:'运营',stats:'统计',perf:'性能',search:'搜索',flow:'申请',faq:'问答',enter:'进入'};\n\n    /* 1) 标题按 <br> 拆成遮罩行,逐行上升(单行标题跳过) */\n    if(!lxR){\n      [].forEach.call(document.querySelectorAll('#snap h1, #snap h2'), function(h){\n        if(h.getAttribute('data-lx')) return;\n        h.setAttribute('data-lx','1');\n        var parts = h.innerHTML.split(/<br\\s*\\/?>/i);\n        if(parts.length < 2) return;\n        h.innerHTML = parts.map(function(t,i){\n          return '<span class=\"ln\" style=\"--li:'+i+'\"><i>'+t+'</i></span>';\n        }).join('');\n        h.classList.add('lx-lines');\n      });\n    }\n\n    /* 2) 章节圆点补文字标签(激活/悬停显示) */\n    [].forEach.call(dots.children, function(b,i){\n      var id = secs[i] && secs[i].id;\n      if(!id || b.querySelector('span')) return;\n      var s = document.createElement('span');\n      s.textContent = LABELS[id] || id;\n      b.appendChild(s);\n    });\n\n    /* 3) Hero 离场:随滚动上移 + 缩小 + 淡出 + 轻微模糊 */\n    var heroEl = document.getElementById('hero');\n    var heroWrap = heroEl && heroEl.querySelector('.wrap');\n    var lxTick = false;\n    function lxFrame(){\n      lxTick = false;\n      if(lxR || !heroWrap) return;\n      var vh = innerHeight || 1;\n      var r = heroEl.getBoundingClientRect();\n      var p = (vh * 0.12 - r.top) / (vh * 0.9);\n      p = p < 0 ? 0 : p > 1 ? 1 : p;\n      heroWrap.style.opacity = (1 - p * 1.02).toFixed(3);\n      heroWrap.style.transform = 'translate3d(0,' + (-p * 78).toFixed(1) + 'px,0) scale(' + (1 - p * 0.075).toFixed(4) + ')';\n      heroWrap.style.filter = p > 0.03 ? 'blur(' + (p * 5).toFixed(1) + 'px)' : '';\n    }\n    function lxReq(){ if(!lxTick){ lxTick = true; requestAnimationFrame(lxFrame); } }\n    snap.addEventListener('scroll', lxReq, { passive:true });\n    addEventListener('resize', lxReq);\n    lxFrame();\n  })();\n\n  /* ---------------- 丝滑滚动(滚轮阻尼) + 长按保护 (v3.6.3) ---------------- */\n  (function(){\n    var lxReduce = matchMedia('(prefers-reduced-motion:reduce)').matches;\n    var fine = matchMedia('(hover:hover) and (pointer:fine)').matches;\n\n    /* 1) 桌面滚轮:阻尼滑行,松手后自然滑一段,接近 lumen 的\"润滑\"手感 */\n    if(fine && !lxReduce){\n      var target = snap.scrollTop, cur = target, raf = 0;\n      function maxY(){ return Math.max(0, snap.scrollHeight - snap.clientHeight); }\n      function loop(){\n        var d = target - cur;\n        cur += d * 0.13;\n        if(Math.abs(d) < 0.4){ cur = target; snap.scrollTop = cur; raf = 0; return; }\n        snap.scrollTop = cur;\n        raf = requestAnimationFrame(loop);\n      }\n      /* 内部还有可滚动元素(如移动端 section)时不接管,避免抢滚动 */\n      function innerScrollable(el){\n        while(el && el !== snap){\n          if(el.nodeType === 1){\n            var cs = getComputedStyle(el);\n            if((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 4) return true;\n          }\n          el = el.parentElement;\n        }\n        return false;\n      }\n      snap.addEventListener('wheel', function(e){\n        if(e.ctrlKey || e.metaKey) return;\n        if(innerScrollable(e.target)) return;\n        e.preventDefault();\n        var unit = e.deltaMode === 1 ? 18 : e.deltaMode === 2 ? snap.clientHeight : 1;\n        target = Math.max(0, Math.min(maxY(), target + e.deltaY * unit));\n        if(!raf) loop();\n      }, { passive:false });\n      /* 键盘/滚动条/程序滚动时同步目标值,避免回跳 */\n      snap.addEventListener('scroll', function(){ if(!raf) target = cur = snap.scrollTop; }, { passive:true });\n      addEventListener('resize', function(){ target = Math.min(target, maxY()); });\n    }\n\n    /* 2) 长按 / 右键 / 拖拽保护:海报墙与图片不给复制地址的机会 */\n    function protectedTarget(t){\n      if(!t || t.nodeType !== 1) return false;\n      return !!(t.closest && t.closest('img, video, #wall, .wghost, #snap canvas'));\n    }\n    document.addEventListener('contextmenu', function(e){\n      if(protectedTarget(e.target)) e.preventDefault();\n    }, { passive:false });\n    document.addEventListener('dragstart', function(e){\n      var t = e.target;\n      if(t && (t.tagName === 'IMG' || t.tagName === 'VIDEO')) e.preventDefault();\n    });\n    document.addEventListener('selectstart', function(e){\n      if(protectedTarget(e.target)) e.preventDefault();\n    });\n  })();\n\n})();\n</script>\n</body></html>";const LOGIN_UI = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <meta name="theme-color" content="#060a13">
    <title>系统授权</title>
    <style>
        ${CSS_COMMON}
        body { display:flex; justify-content:center; align-items:center; min-height:100vh; padding:16px; margin:0; background:linear-gradient(160deg,#0b0e1a 0%,#0f1730 48%,#060a13 100%) fixed; color:#e8eefc; }
        /* 星云极光背景 */
        body::before { content:''; position:fixed; inset:0; z-index:-1; pointer-events:none; background:
            radial-gradient(2px 2px at 15% 25%, rgba(255,255,255,.8), transparent 45%),
            radial-gradient(1.5px 1.5px at 82% 14%, rgba(0,229,255,1), transparent 45%),
            radial-gradient(2px 2px at 28% 78%, rgba(255,255,255,.6), transparent 45%),
            radial-gradient(1.5px 1.5px at 64% 60%, rgba(139,92,246,1), transparent 45%),
            radial-gradient(2px 2px at 90% 84%, rgba(255,255,255,.5), transparent 45%),
            radial-gradient(1.5px 1.5px at 6% 62%, rgba(0,229,255,.8), transparent 45%),
            radial-gradient(900px 520px at 10% -10%, rgba(77,163,255,.22), transparent 62%),
            radial-gradient(820px 500px at 108% 4%, rgba(0,229,255,.14), transparent 60%),
            radial-gradient(760px 520px at 50% 120%, rgba(139,92,246,.2), transparent 62%); }
        body::after { content:''; position:fixed; inset:0; z-index:-1; pointer-events:none; opacity:.9;
            background-image:
                linear-gradient(rgba(0,229,255,.05) 1px, transparent 1px),
                linear-gradient(90deg, rgba(0,229,255,.05) 1px, transparent 1px);
            background-size:46px 46px;
            mask-image:radial-gradient(ellipse 80% 65% at 50% 20%, #000 30%, transparent 80%); }
        .login-wrap { width:100%; max-width:400px; }
        .login-box { background:rgba(10,16,30,.72); backdrop-filter:var(--blur); -webkit-backdrop-filter:var(--blur); padding:44px 32px 30px; border-radius:26px; box-shadow:0 20px 60px rgba(0,0,0,.5), 0 0 50px rgba(0,229,255,.06); text-align:center; width:100%; border:1px solid rgba(0,229,255,.18); animation:dsModalIn .4s var(--ease); position:relative; overflow:hidden; }
        .login-box::before { content:''; position:absolute; left:0; top:0; width:100%; height:3px; background:linear-gradient(90deg, transparent, #00e5ff, #8b5cf6, transparent); box-shadow:0 0 18px rgba(0,229,255,.6); }
        /* 扫描线 */
        .login-box::after { content:''; position:absolute; left:0; right:0; top:-30%; height:26%; background:linear-gradient(180deg, transparent, rgba(0,229,255,.05), transparent); animation:lgScan 5.5s linear infinite; pointer-events:none; }
        @keyframes lgScan { 0% { top:-30%; } 100% { top:130%; } }
        .login-logo { width:70px; height:70px; border-radius:20px; object-fit:cover; margin:0 auto 22px; box-shadow:0 0 30px rgba(0,229,255,.35), 0 12px 34px rgba(0,0,0,.4); display:block; border:1px solid rgba(0,229,255,.3); background:rgba(13,21,38,.9); }
        .login-box h2 { margin:0 0 6px; font-size:22px; font-weight:800; letter-spacing:.3px; background:linear-gradient(120deg,#7ec9ff,#00e5ff,#a78bfa); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; filter:drop-shadow(0 0 16px rgba(0,229,255,.25)); }
        .login-sub { color:#8a94b0; font-size:13px; margin:0 0 30px; }
        .login-box input { width:100%; padding:15px 16px; margin-bottom:16px; border:1px solid rgba(0,229,255,.2); border-radius:14px; background:rgba(8,13,24,.7); color:#e8eefc; text-align:center; letter-spacing:3px; font-size:15px; transition:border-color .2s,box-shadow .2s,background .2s; }
        .login-box input::placeholder { color:#566084; }
        .login-box input:focus { border-color:#00e5ff; box-shadow:0 0 0 4px rgba(0,229,255,.12), 0 0 22px rgba(0,229,255,.18); background:rgba(11,18,32,.85); }
        .login-box button { width:100%; padding:15px; background:linear-gradient(135deg,#0a84ff 0%,#00d4ff 100%); color:#fff; border:none; border-radius:14px; cursor:pointer; font-weight:700; font-size:15px; letter-spacing:4px; box-shadow:0 6px 22px rgba(0,213,255,.35), 0 0 26px rgba(0,213,255,.14); transition:all .2s; position:relative; overflow:hidden; }
        .login-box button::after { content:''; position:absolute; top:0; left:-80%; width:50%; height:100%; background:linear-gradient(100deg,transparent,rgba(255,255,255,.4),transparent); transform:skewX(-25deg); transition:left .5s var(--ease); }
        .login-box button:hover { transform:translateY(-2px); box-shadow:0 10px 30px rgba(0,213,255,.45), 0 0 34px rgba(0,213,255,.2); filter:brightness(1.06); }
        .login-box button:hover::after { left:130%; }
        .login-box button:active { transform:translateY(0) scale(.98); }
        .login-foot { margin-top:22px; font-size:12px; color:#566084; }
        @keyframes lgShift { from { background-position:0% 0%; } to { background-position:100% 100%; } }
    </style>
    <link rel="icon" type="image/jpeg" href="${EMBY_LOGO}">    <script>
const I = {
  rocket:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2 0-2.8-.8-.7-2.2-.7-3 .8z"/><path d="M12 15l-3-3c.5-4 4-7.5 8-8 2 .2 3.8 2 4 4-.5 4-4 7.5-8 8l-1-1z"/><path d="M9 12c-2 1-3.5 3-4 5"/><circle cx="15" cy="9" r="0.5"/></svg>',
  xmark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>',
  warn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3L2 20h20L12 3z"/><path d="M12 10v4M12 17.5h.01"/></svg>',
  film:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>',
  star:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l2.7 5.7 6.3.8-4.6 4.3 1.1 6.2-5.5-3-5.5 3 1.1-6.2L3 9.5l6.3-.8L12 3z"/></svg>',
  sparkles:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14zM6 14l.6 1.7L8.5 16l-1.9.7L6 18.5l-.6-1.8L3.5 16l1.9-.3L6 14z"/></svg>',
  globe:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/></svg>',
  bolt:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>',
  refresh:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 3v5h-5"/></svg>',
  chart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 20V10M12 20V4M19 20v-7"/></svg>',
  cloud:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a4 4 0 1 1 0-8 5 5 0 0 1 9.6 1.3A3.5 3.5 0 0 1 17 18H7z"/></svg>',
  trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  location:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  trophy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4z"/><path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3"/></svg>',
  moon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  pencil:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
  gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.2 4.2l2.8 2.8M17 17l2.8 2.8M1 12h4M19 12h4M4.2 19.8L7 17M17 7l2.8-2.8"/></svg>',
  lines:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18v2H3zM3 11h18v2H3zM3 16h18v2H3z"/></svg>',
  box:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
  download:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
  antenna:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.4 2a14 14 0 0 0 0 20M17.6 2a14 14 0 0 1 0 20M9.8 5.5a9 9 0 0 0 0 13M14.2 5.5a9 9 0 0 1 0 13"/><circle cx="12" cy="12" r="1.5"/></svg>',
  bulb:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M8 14.5A6 6 0 0 1 12 5a6 6 0 0 1 4 9.5c-.8.8-1 1.6-1 2.5h-6c0-.9-.2-1.7-1-2.5z"/></svg>',
  tv:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="13" rx="2"/><path d="M8 21h8M12 18v3"/></svg>',
  flame:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-5-.5 1-1 2-1 3 0 2.5 3 3 3 6 1-2 0-4 0-4 2 1 3 3 3 4.5A6.5 6.5 0 0 1 12 22 6.5 6.5 0 0 1 5.5 15C5.5 9 12 2 12 2z"/></svg>',
  link:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4.93"/><path d="M14 11a5 5 0 0 0-7.07 0l-2.83 2.83a5 5 0 0 0 7.07 7.07L13 19.07"/></svg>',
  crown:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l4 4 5-6 5 6 4-4-2 12H5L3 7z"/><path d="M6 19h12"/></svg>',
  target:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>',
  arrowdown:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
  robot:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 8V4M8 4h8"/><circle cx="9.5" cy="13" r="1" fill="currentColor"/><circle cx="14.5" cy="13" r="1" fill="currentColor"/><path d="M2 13v3M22 13v3"/></svg>',
  spy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="11" r="7"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/><path d="M9.5 14c1 .8 4 .8 5 0"/></svg>',
  flask:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v5L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 8V3"/><path d="M7 15h10"/></svg>',
  broom:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3l8 8M11 11l8-8M4 20l7-7 1 1-7 7-2-1z"/><path d="M6 8l4 4"/></svg>',
  checksquare:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12.5l2.5 2.5L16 9"/></svg>',
  upload:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5M4 21h16"/></svg>',
  db:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
  dotblue:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#007aff"/></svg>',
  dotorange:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#ff9500"/></svg>',
  dotgreen:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#34c759"/></svg>',
  dotpurple:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#af52de"/></svg>'
};

const E2I = { '${I.rocket}':'rocket','${I.xmark}':'xmark','${I.check}':'check','${I.warn}':'warn','${I.film}':'film','${I.star}':'star','${I.sparkles}':'sparkles','${I.sparkles}':'sparkles','${I.globe}':'globe','${I.globe}':'globe','${I.bolt}':'bolt','${I.refresh}':'refresh','${I.chart}':'chart','${I.cloud}':'cloud','${I.trash}':'trash','${I.search}':'search','${I.location}':'location','${I.trophy}':'trophy','${I.moon}':'moon','${I.sun}':'sun','${I.dotblue}':'dotblue','${I.dotorange}':'dotorange','${I.dotgreen}':'dotgreen','${I.dotpurple}':'dotpurple','${I.robot}':'robot','${I.spy}':'spy','${I.flame}':'flame','${I.link}':'link','${I.tv}':'tv','${I.box}':'box','${I.download}':'download','${I.antenna}':'antenna','${I.bulb}':'bulb','${I.crown}':'crown','${I.target}':'target','${I.arrowdown}':'arrowdown','${I.xmark}':'xmark','${I.pencil}':'pencil','${I.gear}':'gear','${I.lines}':'lines','${I.flask}':'flask','${I.broom}':'broom','${I.checksquare}':'checksquare','${I.upload}':'upload' };
function toSvg(s){
  if(!s) return s;
  return String(s).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, function(ch){
    if(ch==='\uFE0F') return '';
    var key = E2I[ch];
    return (key && I[key]) ? '<span class="ti">'+I[key]+'</span>' : '';
  });
}
    </script>

</head>
<body>
    <div id="toast"></div>
    <div class="dm-layer" aria-hidden="true">
        <span class="dm dm-a" style="top:9%;--dm-dur:26s;">反代就绪 · 播放继续 · 正在连接上</span>
        <span class="dm dm-b" style="top:20%;--dm-dur:31s;--dm-delay:-9s;">多后端就绪 · 推流跟随 · 共享带宽</span>
        <span class="dm dm-c" style="top:32%;--dm-dur:25s;--dm-delay:-15s;">一个入口 · 多个原始服务器</span>
        <span class="dm dm-d" style="top:45%;--dm-dur:35s;--dm-delay:-5s;">边缘缓存 · 播放继续 · 正在连接上</span>
        <span class="dm dm-e" style="top:58%;--dm-dur:23s;--dm-delay:-18s;">安全授权 · 密钥验证 · 登录即达</span>
        <span class="dm dm-a" style="top:70%;--dm-dur:30s;--dm-delay:-3s;">节点在线 · 聚合中 · 直连优先</span>
        <span class="dm dm-b" style="top:82%;--dm-dur:27s;--dm-delay:-11s;">播放继续 · 转码就绪 · 正在连接上</span>
        <span class="dm dm-c" style="top:93%;--dm-dur:33s;--dm-delay:-7s;">反代就绪 · 多后端就绪</span>
    </div>
    <div class="login-wrap">
        <div class="login-box">
            <img class="login-logo" src="${EMBY_LOGO}" alt="logo" onerror="this.style.display='none'">
            <h2>安全中心</h2>
            <p class="login-sub">请输入访问密钥以继续</p>
            <input type="password" id="tokenInput" placeholder="请输入密钥 TOKEN" onkeydown="if(event.key==='Enter') login()" autocomplete="off">
            <button onclick="login()">验 证 登 录</button>
            <p class="login-foot">登录后浏览器将记住本次授权</p>
        </div>
    </div>
    <script>
        function showToast(msg) {
            const t = document.getElementById('toast');
            t.innerHTML = toSvg(msg); t.classList.add('show');
            setTimeout(() => t.classList.remove('show'), 2000);
        }
        function login() {
            const token = document.getElementById('tokenInput').value.trim();
            if(!token) return showToast('请输入正确的密钥');
            // v3.5.0:不再前端直接写明文密码 cookie,改由后端签发 HttpOnly 签名会话
            fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pass: token }) })
                .then(function(r) { return r.json(); })
                .then(function(d) {
                    if (d && d.success) { window.location.reload(); }
                    else { showToast((d && d.error) || '密钥错误'); }
                })
                .catch(function() { showToast('网络异常,请重试'); });
        }
    </script>

</body>
</html>
`;

const HTML_UI = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>玛卡巴卡的反代面板</title>
    <style>${CSS_COMMON}</style>
    <script src="https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link rel="icon" type="image/jpeg" href="${EMBY_LOGO}">
    <script>
const I = {
  rocket:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2 0-2.8-.8-.7-2.2-.7-3 .8z"/><path d="M12 15l-3-3c.5-4 4-7.5 8-8 2 .2 3.8 2 4 4-.5 4-4 7.5-8 8l-1-1z"/><path d="M9 12c-2 1-3.5 3-4 5"/><circle cx="15" cy="9" r="0.5"/></svg>',
  xmark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>',
  warn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3L2 20h20L12 3z"/><path d="M12 10v4M12 17.5h.01"/></svg>',
  film:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>',
  star:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l2.7 5.7 6.3.8-4.6 4.3 1.1 6.2-5.5-3-5.5 3 1.1-6.2L3 9.5l6.3-.8L12 3z"/></svg>',
  sparkles:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14zM6 14l.6 1.7L8.5 16l-1.9.7L6 18.5l-.6-1.8L3.5 16l1.9-.3L6 14z"/></svg>',
  globe:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/></svg>',
  bolt:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>',
  refresh:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 3v5h-5"/></svg>',
  chart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 20V10M12 20V4M19 20v-7"/></svg>',
  cloud:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a4 4 0 1 1 0-8 5 5 0 0 1 9.6 1.3A3.5 3.5 0 0 1 17 18H7z"/></svg>',
  trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  location:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  trophy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4z"/><path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3"/></svg>',
  moon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  pencil:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
  gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.2 4.2l2.8 2.8M17 17l2.8 2.8M1 12h4M19 12h4M4.2 19.8L7 17M17 7l2.8-2.8"/></svg>',
  lines:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18v2H3zM3 11h18v2H3zM3 16h18v2H3z"/></svg>',
  box:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
  download:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
  antenna:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.4 2a14 14 0 0 0 0 20M17.6 2a14 14 0 0 1 0 20M9.8 5.5a9 9 0 0 0 0 13M14.2 5.5a9 9 0 0 1 0 13"/><circle cx="12" cy="12" r="1.5"/></svg>',
  bulb:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M8 14.5A6 6 0 0 1 12 5a6 6 0 0 1 4 9.5c-.8.8-1 1.6-1 2.5h-6c0-.9-.2-1.7-1-2.5z"/></svg>',
  tv:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="13" rx="2"/><path d="M8 21h8M12 18v3"/></svg>',
  flame:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-5-.5 1-1 2-1 3 0 2.5 3 3 3 6 1-2 0-4 0-4 2 1 3 3 3 4.5A6.5 6.5 0 0 1 12 22 6.5 6.5 0 0 1 5.5 15C5.5 9 12 2 12 2z"/></svg>',
  link:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4.93"/><path d="M14 11a5 5 0 0 0-7.07 0l-2.83 2.83a5 5 0 0 0 7.07 7.07L13 19.07"/></svg>',
  crown:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l4 4 5-6 5 6 4-4-2 12H5L3 7z"/><path d="M6 19h12"/></svg>',
  target:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>',
  arrowdown:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
  robot:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 8V4M8 4h8"/><circle cx="9.5" cy="13" r="1" fill="currentColor"/><circle cx="14.5" cy="13" r="1" fill="currentColor"/><path d="M2 13v3M22 13v3"/></svg>',
  spy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="11" r="7"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/><path d="M9.5 14c1 .8 4 .8 5 0"/></svg>',
  flask:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v5L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 8V3"/><path d="M7 15h10"/></svg>',
  broom:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3l8 8M11 11l8-8M4 20l7-7 1 1-7 7-2-1z"/><path d="M6 8l4 4"/></svg>',
  checksquare:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12.5l2.5 2.5L16 9"/></svg>',
  upload:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5M4 21h16"/></svg>',
  db:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
  dotblue:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#007aff"/></svg>',
  dotorange:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#ff9500"/></svg>',
  dotgreen:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#34c759"/></svg>',
  dotpurple:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#af52de"/></svg>'
};

const E2I = { '${I.rocket}':'rocket','${I.xmark}':'xmark','${I.check}':'check','${I.warn}':'warn','${I.film}':'film','${I.star}':'star','${I.sparkles}':'sparkles','${I.sparkles}':'sparkles','${I.globe}':'globe','${I.globe}':'globe','${I.bolt}':'bolt','${I.refresh}':'refresh','${I.chart}':'chart','${I.cloud}':'cloud','${I.trash}':'trash','${I.search}':'search','${I.location}':'location','${I.trophy}':'trophy','${I.moon}':'moon','${I.sun}':'sun','${I.dotblue}':'dotblue','${I.dotorange}':'dotorange','${I.dotgreen}':'dotgreen','${I.dotpurple}':'dotpurple','${I.robot}':'robot','${I.spy}':'spy','${I.flame}':'flame','${I.link}':'link','${I.tv}':'tv','${I.box}':'box','${I.download}':'download','${I.antenna}':'antenna','${I.bulb}':'bulb','${I.crown}':'crown','${I.target}':'target','${I.arrowdown}':'arrowdown','${I.xmark}':'xmark','${I.pencil}':'pencil','${I.gear}':'gear','${I.lines}':'lines','${I.flask}':'flask','${I.broom}':'broom','${I.checksquare}':'checksquare','${I.upload}':'upload' };
function toSvg(s){
  if(!s) return s;
  return String(s).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, function(ch){
    if(ch==='\uFE0F') return '';
    var key = E2I[ch];
    return (key && I[key]) ? '<span class="ti">'+I[key]+'</span>' : '';
  });
}
    </script>
</head>
<body>
    <div id="toast"></div>
    <div class="dm-layer" aria-hidden="true">
        <span class="dm dm-a" style="top:8%;--dm-dur:26s;">节点在线 · 边缘缓存 · 播放继续</span>
        <span class="dm dm-b" style="top:18%;--dm-dur:31s;--dm-delay:-9s;">数据大屏 · 实时流量 · 热力图</span>
        <span class="dm dm-c" style="top:30%;--dm-dur:25s;--dm-delay:-15s;">反代就绪 · 推流跟随 · 多后端</span>
        <span class="dm dm-d" style="top:43%;--dm-dur:35s;--dm-delay:-5s;">保号提醒 · 申请审核 · 公告中心</span>
        <span class="dm dm-e" style="top:56%;--dm-dur:23s;--dm-delay:-18s;">一个入口 · 多个原始服务器</span>
        <span class="dm dm-a" style="top:69%;--dm-dur:30s;--dm-delay:-3s;">带宽共享 · 并发控制 · 单IP限速</span>
        <span class="dm dm-b" style="top:81%;--dm-dur:27s;--dm-delay:-11s;">播放继续 · 正在连接上 · 聚合中</span>
        <span class="dm dm-c" style="top:93%;--dm-dur:33s;--dm-delay:-7s;">转码就绪 · 直连优先 · 边缘加速</span>
    </div>

    <div id="dashboardModal" class="modal-mask">
        <div class="modal-box">
            <div class="modal-head">
                <h2>${I.chart} 数据大屏 <span style="font-size:13px; font-weight:400; color:var(--text-sec);">精确访客画像分析</span></h2>
                <button class="close-x" onclick="closeDashboard()" title="关闭">${I.xmark}</button>
            </div>
            <h3 style="margin:22px 0 12px; font-size:15px; display:flex; align-items:center; gap:6px;">${I.globe} 访问者分布 <span style="font-size:12px; color:var(--text-sec);">(近 7 天 · 国外按国家 / 国内按省份 · 拖动旋转,悬停查看详情)</span></h3>
            <div style="border:1px solid var(--border); border-radius:14px; padding:14px 16px; background:rgba(120,120,120,0.03);">
                <div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; align-items:center;">
                    <button class="geo-mode-btn active" id="geoMode3dBtn" onclick="geoSwitchMode('3d')" style="background:var(--primary); color:#fff; border:none; padding:6px 14px; border-radius:999px; font-size:12.5px; cursor:pointer;">3D 地球</button>
                    <button class="geo-mode-btn" id="geoModeWorldBtn" onclick="geoSwitchMode('world')" style="background:rgba(120,120,120,.15); color:var(--text); border:1px solid var(--border); padding:6px 14px; border-radius:999px; font-size:12.5px; cursor:pointer;">平面世界</button>
                    <button class="geo-mode-btn" id="geoModeChinaBtn" onclick="geoSwitchMode('china')" style="background:rgba(120,120,120,.15); color:var(--text); border:1px solid var(--border); padding:6px 14px; border-radius:999px; font-size:12.5px; cursor:pointer;">中国省份</button>
                    <button onclick="loadVisitorGeo()" style="background:rgba(120,120,120,.15); color:var(--text); border:1px solid var(--border); padding:6px 14px; border-radius:999px; font-size:12.5px; cursor:pointer;">刷新解析</button>
                </div>
                <div id="geoStage3d" style="position:relative; text-align:center;">
                    <canvas id="geoGlobeCanvas" style="width:min(420px,100%); height:min(420px,100%); touch-action:none;"></canvas>
                    <div id="geoGlobeTip" style="position:absolute; display:none; z-index:20; min-width:160px; padding:9px 11px; border-radius:10px; background:rgba(15,23,42,.94); color:#f8fafc; border:1px solid rgba(56,189,248,.38); font-size:12px; line-height:1.5; pointer-events:none; box-shadow:0 10px 26px rgba(0,0,0,.4);"></div>
                </div>
                <div id="geoStageWorld" style="display:none; text-align:center;">
                    <canvas id="geoWorldCanvas" style="width:100%; max-width:640px; touch-action:none;"></canvas>
                </div>
                <div id="geoStageChina" style="display:none;">
                    <div id="geoChinaChart" style="width:100%; height:420px;"></div>
                </div>
                <div id="geoSummary" style="font-size:12px; color:var(--text-sec); margin-top:10px; line-height:1.7;">加载中...</div>
            </div>
            <div class="stat-pills" style="margin-bottom:18px;">
                <span class="stat-pill">今天: <strong id="trafficToday">加载中...</strong></span>
                <span class="stat-pill">1周内: <strong id="traffic7d">加载中...</strong></span>
                <span class="stat-pill">1月内: <strong id="traffic30d">加载中...</strong></span>
            </div>
            <div class="stat-pills" style="margin-bottom:10px;">
                <span class="stat-pill">CF请求 今天: <strong id="cfToday">加载中...</strong></span>
                <span class="stat-pill">1周内: <strong id="cfWeek">加载中...</strong></span>
                <span class="stat-pill">1月内: <strong id="cfMonth">加载中...</strong></span>
            </div>
            <div class="stat-pills" style="margin-bottom:10px;">
                <span class="stat-pill">今日带宽: <strong id="cfBandwidth">加载中...</strong></span>
                <span class="stat-pill">缓存命中: <strong id="cfCacheRatio">加载中...</strong></span>
                <span class="stat-pill">被拦截: <strong id="cfBlocked">加载中...</strong></span>
                <span class="stat-pill">5xx错误: <strong id="cf5xx">加载中...</strong></span>
            </div>
            <div id="cfQuotaCard" style="background:linear-gradient(135deg, rgba(0,229,255,.08), rgba(124,58,237,.08)); border:1px solid var(--border); border-radius:12px; padding:14px 16px; margin-bottom:18px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                    <span style="font-size:13px; font-weight:600;">CF Worker 每日免费请求额度 <span style="font-size:12px; font-weight:400; color:var(--text-sec);">(UTC 00:00 重置 · 基准 100,000 次/天)</span></span>
                    <span id="cfQuotaText" style="font-size:13px; font-weight:700; color:var(--primary);">加载中...</span>
                </div>
                <div style="height:10px; background:rgba(120,120,120,.18); border-radius:999px; margin-top:12px; overflow:hidden;">
                    <div id="cfQuotaBar" style="height:100%; width:0%; background:linear-gradient(90deg,#00e5ff,#7c3aed); border-radius:999px; transition:width .6s ease;"></div>
                </div>
                <div id="cfQuotaDetail" style="font-size:12px; color:var(--text-sec); margin-top:8px;">已用 0 次 / 10万 (0%) · 剩余 100000 次</div>
            </div>
            <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:18px;">
                <div class="chart-panel" style="flex:1; min-width:260px;">
                    <div style="font-size:13px; font-weight:600; margin-bottom:8px;">今日响应状态码分布</div>
                    <canvas id="cfStatusChart" height="140"></canvas>
                </div>
                <div class="chart-panel" style="flex:1; min-width:260px;">
                    <div style="font-size:13px; font-weight:600; margin-bottom:8px;">今日请求分时趋势 (北京时间 24h)</div>
                    <canvas id="cfHourChart" height="140"></canvas>
                </div>
            </div>
            <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:18px;">
                <div class="chart-panel" style="flex:1; min-width:260px;">
                    <div style="font-size:13px; font-weight:600; margin-bottom:8px;">今日 Top 来源地区</div>
                    <div id="cfCountryList" style="font-size:12px; color:var(--text-sec);">加载中...</div>
                </div>
            </div>
            <div style="display:flex; gap:16px; flex-wrap:wrap;">
                <div class="chart-panel"><canvas id="trendChart"></canvas></div>
                <div class="chart-panel pie"><canvas id="locationChart"></canvas></div>
            </div>
            <h3 style="margin:22px 0 12px; font-size:15px; display:flex; align-items:center; gap:6px;">${I.bolt} 播放热力图 <span style="font-size:12px; color:var(--text-sec);">(最近 7 天 × 24 小时,反代真实播放请求命中统计)</span></h3>
            <div id="heatmapContainer" style="border:1px solid var(--border); border-radius:14px; padding:16px; background:rgba(120,120,120,0.03); margin-bottom:18px;">
                <div id="heatmapSummary" style="font-size:12px; color:var(--text-sec); margin-bottom:10px;">加载中...</div>
                <div id="heatmapGrid" style="overflow-x:auto;"></div>
            </div>
            <h3 style="margin:22px 0 12px; font-size:15px; display:flex; align-items:center; gap:6px;">${I.spy} 最新独立播放记录 <span style="font-size:12px; color:var(--text-sec);">(v3.4.66 起仅统计真实播放会话,不含详情页/预加载)</span></h3>
            <div class="table-wrapper">
                <table style="width:100%;">
                    <thead><tr><th>访问时间</th><th>目标节点</th><th>真实 IP 地址</th><th>归属地</th><th>客户端/设备标识 (User-Agent)</th></tr></thead>
                    <tbody id="logTableBody"><tr><td colspan="5" style="text-align:center; padding:30px;">加载数据中...</td></tr></tbody>
                </table>
            </div>
        </div>
    </div>

    <div class="topbar">
        <div class="topbar-brand">
            <img class="topbar-logo" src="${EMBY_LOGO}" alt="logo" onclick="openAccountModal()" title="账户设置" onerror="this.onerror=null;this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI3MiIgaGVpZ2h0PSI3MiIgdmlld0JveD0iMCAwIDcyIDcyIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMwMGQ0ZmYiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiMzZDdiZmYiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNzIiIGhlaWdodD0iNzIiIHJ4PSIxNCIgZmlsbD0idXJsKCNnKSIvPjx0ZXh0IHg9IjM2IiB5PSI1MCIgZm9udC1zaXplPSIzNiIgZm9udC1mYW1pbHk9IkFyaWFsLHNhbnMtc2VyaWYiIGZvbnQtd2VpZ2h0PSI3MDAiIGZpbGw9IiNmZmYiIHRleHQtYW5jaG9yPSJtaWRkbGUiPk48L3RleHQ+PC9zdmc+'">
            <div class="rtt-pill" title="你的设备到云端边缘节点的真实往返延迟">
                <span class="rtt-dot" id="rttDot"></span>
                <span class="rtt-label">RTT</span>
                <span id="rttValue">测算中</span>
            </div>
            <div class="topbar-title">反代控制台<small>CF Worker</small></div>
        </div>
        <div class="topbar-center"></div>
        <div class="topbar-actions">
            <div class="tb-group">
                <button class="tb-icon-btn" id="themeToggle" onclick="toggleDarkMode()" title="切换深色模式">${I.moon}</button>
                <button class="tb-icon-btn admin-only" id="nodeReqBtn" onclick="openNodeReqModal()" title="节点申请" style="position:relative;">${I.robot}<span id="nodeReqBadge" style="display:none; position:absolute; top:-4px; right:-4px; background:#ff3b30; color:#fff; font-size:10px; font-weight:700; border-radius:999px; padding:1px 5px; min-width:16px; text-align:center;"></span></button>
                <button class="tb-icon-btn" onclick="openDashboard()" title="数据统计">${I.chart}</button>
                <button class="tb-icon-btn" onclick="location.href='/speedtest'" title="下载测速" style="color:var(--success);">${I.bolt}</button>
                <button class="tb-icon-btn danger" onclick="confirmLogout()" title="退出系统">${I.xmark}</button>
            </div>
        </div>
    </div>

    <div class="container">

        <div id="view-nodes" class="page-view active">

            <div class="card hero-card" id="deploy-card">
                <div class="hero-core">
                    <h1>${I.rocket} 反代节点 <span class="hero-chip">NEBULA · v${CURRENT_VERSION}</span></h1>
                    <div class="hero-sub">为每个媒体库配置独立反代线路、加密模式与访问限制</div>
                </div>
                <div style="margin-left:auto;">
                    <button class="btn-submit" onclick="openNodeModal()">${I.plus} 添加节点</button>
                </div>
            </div>

            <div class="card mode-cards-card">
                <div class="card-header" style="margin-bottom:14px;">
                    <h2 class="glow-h">五种反代模式 <span class="card-sub">节点按需选择,模式决定请求头处理方式</span></h2>
                </div>
                <div class="mode-cards">
                    <div class="mode-card" data-mode="off" onclick="openModeMenu('off')" style="--mc:#00e5ff; border-top:2px solid #00e5ff; box-shadow:inset 0 0 0 1px rgba(0,229,255,.12), 0 6px 20px rgba(0,229,255,.06);">
                        <div class="mc-top"><span class="mc-idx" style="color:#00e5ff;">MODE 01</span><span class="mc-count" id="mcCnt-off">0</span></div>
                        <div class="mc-name">保守</div>
                        <div class="mc-desc">抹除真实 IP</div>
                    </div>
                    <div class="mode-card" data-mode="realip_only" onclick="openModeMenu('realip_only')" style="--mc:#3b82f6; border-top:2px solid #3b82f6; box-shadow:inset 0 0 0 1px rgba(59,130,246,.12), 0 6px 20px rgba(59,130,246,.06);">
                        <div class="mc-top"><span class="mc-idx" style="color:#3b82f6;">MODE 02</span><span class="mc-count" id="mcCnt-realip_only">0</span></div>
                        <div class="mc-name">严格</div>
                        <div class="mc-desc">透传真实 IP</div>
                    </div>
                    <div class="mode-card" data-mode="dual" onclick="openModeMenu('dual')" style="--mc:#a855f7; border-top:2px solid #a855f7; box-shadow:inset 0 0 0 1px rgba(168,85,247,.12), 0 6px 20px rgba(168,85,247,.06);">
                        <div class="mc-top"><span class="mc-idx" style="color:#a855f7;">MODE 03</span><span class="mc-count" id="mcCnt-dual">0</span></div>
                        <div class="mc-name">兼容</div>
                        <div class="mc-desc">双重透传</div>
                    </div>
                    <div class="mode-card" data-mode="strict" onclick="openModeMenu('strict')" style="--mc:#f43f5e; border-top:2px solid #f43f5e; box-shadow:inset 0 0 0 1px rgba(244,63,94,.12), 0 6px 20px rgba(244,63,94,.06);">
                        <div class="mc-top"><span class="mc-idx" style="color:#f43f5e;">MODE 04</span><span class="mc-count" id="mcCnt-strict">0</span></div>
                        <div class="mc-name">强力</div>
                        <div class="mc-desc">防 403 错误</div>
                    </div>
                    <div class="mode-card" data-mode="emos" onclick="openModeMenu('emos')" style="--mc:#f59e0b; border-top:2px solid #f59e0b; box-shadow:inset 0 0 0 1px rgba(245,158,11,.12), 0 6px 20px rgba(245,158,11,.06);">
                        <div class="mc-top"><span class="mc-idx" style="color:#f59e0b;">MODE 05</span><span class="mc-count" id="mcCnt-emos">0</span></div>
                        <div class="mc-name">EMOS</div>
                        <div class="mc-desc">专用请求头</div>
                    </div>
                    <div class="mode-card mc-all" data-mode="all" onclick="showAllNodes()" style="border-top:2px solid #94a3b8; box-shadow:inset 0 0 0 1px rgba(148,163,184,.12), 0 6px 20px rgba(148,163,184,.06);">
                        <div class="mc-top"><span class="mc-idx" style="color:#94a3b8;">全部</span><span class="mc-count" id="mcCnt-all">0</span></div>
                        <div class="mc-name">全部节点</div>
                        <div class="mc-desc">查看全部</div>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-header" style="margin-bottom:16px; cursor:pointer;" onclick="toggleNodesCollapse()">
                    <h2><span id="nodesArrow" class="collapse-arrow"></span> 已反代的媒体库 <span class="card-sub">拖拽卡片可排序</span></h2>
                    <button id="btnPurge" class="purge-mini admin-only" onclick="event.stopPropagation(); purgeCache()" title="刷新全站海报缓存">${I.refresh}<span>刷新海报</span></button>
                    <div class="card-tools" onclick="event.stopPropagation()">
                        <button class="btn-submit admin-only" onclick="pingAllNodes()" style="padding:9px 14px; font-size:13px;">${I.bolt} 全局测速</button>
                        <button class="btn-submit" onclick="openSubReqModal()" style="padding:9px 14px; font-size:13px;">${I.plus} 申请节点</button>
                        <input type="text" id="searchNode" class="search-input" placeholder="搜索备注/后缀/线路地址查找..." onkeyup="filterNodesList()" oninput="filterNodesList()">
                    </div>
                </div>
                <div class="admin-only nodes-toolbar" id="nodesToolbar" style="margin-bottom:18px; display:none;">
                    <label style="cursor:pointer; font-weight:600; display:flex; align-items:center; gap:7px; font-size:13px;">
                        <input type="checkbox" id="selectAllNodes" onchange="toggleSelectAll(this)" class="node-cb">
                        全选节点
                    </label>
                    <span class="tb-sep"></span>
                    <select id="batch-mode-select" class="batch-sel" style="padding:8px 12px; border-radius:10px; border:1px solid var(--border); background:var(--bg-soft); color:var(--text); font-weight:600;">
                        <option value="">读取模式中...</option>
                    </select>
                    <button class="btn-submit" onclick="batchUpdateModes()" style="padding:8px 16px;">${I.rocket} 批量应用模式</button>
                    <span id="batch-status" style="font-size:13px; font-weight:600;"></span>
                </div>
                <div id="list-grid" class="node-grid" style="display:none;">
                    <div style="text-align:center; color:var(--text-sec); grid-column:1/-1; padding:44px;">读取数据中...</div>
                </div>
                <div id="nodesHint" style="text-align:center; color:var(--text-sec); font-size:13px; padding:18px 12px; cursor:pointer; user-select:none;" onclick="toggleNodesCollapse()">已收起全部节点 · 点击展开查看</div>
            </div>

        </div>

        <div id="view-speed" class="page-view">

            <div class="card admin-only">
                <div class="card-header" style="margin-bottom:16px;">
                    <h2>${I.bolt} 专属线路测速与动态 DNS 解析</h2>
                </div>
                <div class="collapse-sec" style="background:var(--bg-soft); padding:12px 16px; border-radius:12px; border:1px solid var(--border); margin-bottom:16px;">
                    <div class="collapse-head" onclick="toggleCollapseSec(this)">
                        <div class="ch-title">${I.antenna} 当前域名生效的 DNS 解析：</div>
                        <span class="ch-hint" style="font-size:12px;color:var(--text-sec);">点击展开</span>
                    </div>
                    <div class="collapse-body">
                        <div id="dnsStatus" style="display:flex; gap:8px; flex-wrap:wrap;">
                            <span style="color:var(--text-faint); font-size:14px;">加载中...</span>
                        </div>
                    </div>
                </div>
                <div class="collapse-sec" style="background:var(--bg-soft); padding:16px; border-radius:14px; border:1px solid var(--border); margin-bottom:16px;">
                    <div class="collapse-head" onclick="toggleCollapseSec(this)">
                        <div class="ch-title"><span class="ch-arrow"></span><span class="ti" style="font-size:17px; color:var(--primary);">${I.chart}</span> 预设优选源
                            <span style="font-weight:500; font-size:12px; color:var(--text-sec);">(云枢全域 / IP大段 / IPv6 / 第三方,共 30 源)</span>
                        </div>
                        <span class="ch-hint" style="font-size:12px;color:var(--text-sec);">点击展开</span>
                    </div>
                    <div class="collapse-body">
                    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:8px;">
                        <select id="ipType" style="font-weight:600; color:var(--primary); flex:1; min-width:230px;" onchange="updatePresetInfo()">
                            <optgroup label="综合优选">
                                <option value="all"> 综合混合源(四源并发聚合)</option>
                            </optgroup>
                            <optgroup label="云枢全域 · 三网专线">
                                <option value="ehb-all" title="https://ip.ehb.cc.cd/all?ips=100"> 云枢全域融合(双栈) · 云枢全域诸源</option>
                                <option value="ehb-cm" title="https://ip.ehb.cc.cd/cm?ips=100"> 云枢移动起飞 · 云枢移动起飞</option>
                                <option value="ehb-ct" title="https://ip.ehb.cc.cd/ct?ips=100"> 云枢电信美西 · 云枢电信美西</option>
                                <option value="ehb-cu" title="https://ip.ehb.cc.cd/cu?ips=100"> 云枢联通极速 · 云枢联通极速</option>
                            </optgroup>
                            <optgroup label="104.16.0.0/13 大段家族">
                                <option value="ehb-104" title="https://ip.ehb.cc.cd/104?ips=100"> 104 大段全域池 · 104大分类全域</option>
                                <option value="ehb-10417" title="https://ip.ehb.cc.cd/104.17?ips=100"> 104.17 移动起飞段 · 104.17移动起飞</option>
                                <option value="ehb-10419" title="https://ip.ehb.cc.cd/104.19?ips=100"> 104.19 移动抗QoS段 · 104.19防QoS</option>
                                <option value="ehb-10416" title="https://ip.ehb.cc.cd/104.16?ips=100"> 104.16 经典老牌段 · 104.16老牌广播</option>
                            </optgroup>
                            <optgroup label="162.158.0.0/15 大段家族">
                                <option value="ehb-162" title="https://ip.ehb.cc.cd/162?ips=100"> 162 大段全域池 · 162大分类全域</option>
                                <option value="ehb-162159s" title="https://ip.ehb.cc.cd/162.159-saas?ips=100"> 162.159 SaaS/DoH段 · 162.159-saas高优</option>
                                <option value="ehb-162159ct" title="https://ip.ehb.cc.cd/162.159-ct?ips=100"> 162.159 电信美西最稳段 · 162.159-ct电信美西</option>
                            </optgroup>
                            <optgroup label="172.64.0.0/13 大段家族">
                                <option value="ehb-172" title="https://ip.ehb.cc.cd/172?ips=100"> 172 大段全域池 · 172大分类全域</option>
                                <option value="ehb-17264" title="https://ip.ehb.cc.cd/172.64?ips=100"> 172.64 联通/电信主力段 · 172.64联通主力</option>
                                <option value="ehb-17267" title="https://ip.ehb.cc.cd/172.67?ips=100"> 172.67 动态反代段 · 172.67动态反代</option>
                            </optgroup>
                            <optgroup label="198 & 108 专线家族">
                                <option value="ehb-198" title="https://ip.ehb.cc.cd/198?ips=100"> 198.41 联通天花板大段 · 198联通天花板</option>
                                <option value="ehb-108" title="https://ip.ehb.cc.cd/108?ips=100"> 108.162 三网兜底大段 · 108三网兜底</option>
                            </optgroup>
                            <optgroup label="IPv6 霄汉星轨家族">
                                <option value="ehb-v6" title="https://ip.ehb.cc.cd/v6?ips=100"> 云枢 IPv6 全域星轨 · 云枢IPv6全域</option>
                                <option value="ehb-v6cm" title="https://ip.ehb.cc.cd/v6-cm?ips=100"> 云枢移动 5G 直连 · 云枢移动5G</option>
                                <option value="ehb-v6ct" title="https://ip.ehb.cc.cd/v6-ct?ips=100"> 云枢电信 纯净美西 · 云枢电信美西v6</option>
                                <option value="ehb-v6cu" title="https://ip.ehb.cc.cd/v6-cu?ips=100"> 云枢联通 欧洲/东京 · 云枢联通欧洲v6</option>
                                <option value="ehb-2400" title="https://ip.ehb.cc.cd/2400?ips=100"> 2400:cb00 亚太全域 · 2400亚太全域</option>
                                <option value="ehb-24002048" title="https://ip.ehb.cc.cd/2400.2048?ips=100"> 2400.2048 香港近场段 · 2400.2048香港近场</option>
                                <option value="ehb-2400400" title="https://ip.ehb.cc.cd/2400.400?ips=100"> 2400.400 亚太低跳数段 · 2400.400亚太低跳</option>
                                <option value="ehb-24002049" title="https://ip.ehb.cc.cd/2400.2049?ips=100"> 2400.2049 亚太抗抖动段 · 2400.2049抗抖动</option>
                                <option value="ehb-2606" title="https://ip.ehb.cc.cd/2606?ips=100"> 2606:4700 全球主干 · 2606全球主干</option>
                                <option value="ehb-26063030" title="https://ip.ehb.cc.cd/2606.3030?ips=100"> 2606.3030 核心骨干段 · 2606.3030核心骨干</option>
                                <option value="ehb-26064700" title="https://ip.ehb.cc.cd/2606.4700?ips=100"> 2606.4700 伴生特权段 · 2606.4700特权伴生</option>
                                <option value="ehb-2a06" title="https://ip.ehb.cc.cd/2a06?ips=100"> 2a06:98c0 欧洲特快大段 · 2a06欧洲特快</option>
                            </optgroup>
                            <optgroup label="第三方备用源">
                                <option value="robberer" title="https://gh.xxooo.cf/https://raw.githubusercontent.com/hc990275/yx/refs/heads/main/cfyxip.txt"> @robberer 专属 · @robberer</option>
                                <option value="cm-ct" title="https://cf.090227.xyz/ct?ips=100"> CM佬电信优选 · CM佬电信优选</option>
                                <option value="cm-cmcc" title="https://cf.090227.xyz/cmcc?ips=100"> CM佬移动优选 · CM佬移动优选</option>
                                <option value="cm-cu" title="https://cf.090227.xyz/cu?ips=100"> CM佬联通优选 · CM佬联通优选</option>
                                <option value="v2too" title="https://ip.v2too.top/api/nodes"> v2too 源 · v2too默认源</option>
                            </optgroup>
                        </select>
                    </div>
                    <div id="presetInfo" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:10px; padding:10px 12px; background:var(--card); border-radius:10px; border:1px solid var(--border-strong);">
                        <span style="font-size:12px; color:var(--text-sec);">当前来源:</span>
                        <span id="presetName" style="font-weight:700; font-size:13px; color:var(--primary);">综合混合源(四源并发)</span>
                        <code id="presetUrl" style="font-size:12px; color:var(--text); word-break:break-all; cursor:pointer; text-decoration:underline dotted;" onclick="copyPresetUrl()">uouin + cf-speed-dns + 164746 + wetest 并发聚合</code>
                    </div>
                    <div class="btn-grid">
                        <button class="btn-submit" id="btnFetchRemote" onclick="fetchRemoteAndTest()">提取预设源测速</button>
                        <button class="btn-submit" onclick="batchTcpPing()" style="box-shadow:0 4px 12px rgba(255,149,0,.22);">复制去ITDog</button>
                        <button class="btn-submit" onclick="clearTest()" style="box-shadow:0 4px 12px rgba(142,142,147,.2);">清空列表</button>
                    </div>
                    </div>
                </div>
                <div class="collapse-sec" style="background:var(--bg-soft); padding:16px; border-radius:14px; border:1px solid var(--border); margin-bottom:16px;">
                    <div class="collapse-head" onclick="toggleCollapseSec(this)">
                        <div class="ch-title"><span class="ch-arrow"></span><span class="ti" style="font-size:17px; color:var(--primary);">${I.flask}</span> 自定义 API 与手动粘贴</div>
                        <span class="ch-hint" style="font-size:12px;color:var(--text-sec);">点击展开</span>
                    </div>
                    <div class="collapse-body">
                    <div style="display:flex; gap:8px; margin-bottom:12px; align-items:center; flex-wrap:wrap;">
                        <input type="text" id="customApiUrl" value="https://ip.v2too.top/api/nodes" placeholder="填入自定义 JSON 或 文本 API 链接" style="flex:1; min-width:200px;">
                    </div>
                    <textarea id="customIps" rows="2" placeholder="在此粘贴自定义 IPv4、IPv6 或 优选域名 (支持混杂文本，自动提取)" style="width:100%; margin-bottom:12px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; resize:vertical;"></textarea>
                    <div class="btn-grid">
                        <button class="btn-submit" id="btnFetchCustomApi" onclick="fetchCustomApiAndTest()" style="box-shadow:0 4px 12px rgba(50,173,230,.22);">拉取API并测速</button>
                        <button class="btn-submit" id="btnTestCustom" onclick="testCustomIPs()" style="box-shadow:0 4px 12px rgba(88,86,214,.22);">测试粘贴节点</button>
                        <button class="btn-submit" id="btnDirectCname" onclick="directSubmitCname()" style="box-shadow:0 4px 12px rgba(175,82,222,.22);">直推CNAME</button>
                    </div>
                    </div>
                </div>
                <div class="collapse-sec" style="background:var(--bg-soft); padding:16px; border-radius:14px; border:1px solid var(--border); margin-bottom:16px;">
                    <div class="collapse-head" onclick="toggleCollapseSec(this)">
                        <div class="ch-title"><span class="ch-arrow"></span><span class="ti" style="font-size:17px; color:var(--primary);">${I.checksquare}</span> DNS 应用
                            <span style="font-weight:500; font-size:12px; color:var(--text-sec);">(对下方测速列表生效,可先勾选再提交)</span>
                        </div>
                        <span class="ch-hint" style="font-size:12px;color:var(--text-sec);">点击展开</span>
                    </div>
                    <div class="collapse-body">
                    <div class="btn-grid">
                        <button class="btn-submit" id="btnTop3Dns" onclick="updateTop3ToDns()" style="box-shadow:0 4px 12px rgba(255,45,85,.22);">${I.star} 更新 TOP3 至 DNS</button>
                        <button class="btn-submit" id="btnSelectedDns" onclick="updateSelectedToDns()" style="box-shadow:0 4px 12px rgba(52,199,89,.22);">${I.checksquare} 提交选中至 DNS</button>
                    </div>
                    </div>
                </div>
                <div id="statusText" style="line-height:1.6; font-size:14px; color:var(--text-sec); margin-bottom:16px; padding:12px 16px; background:rgba(52,199,89,.1); border-radius:12px; border-left:4px solid var(--success);">
                    ${I.bulb} 测速完成后，可勾选复选框自由组合，点击【提交选中节点至 DNS】自动分发。
                </div>
                <div class="table-wrapper">
                    <table style="width:100%;">
                        <thead>
                            <tr>
                                <th style="width:44px; text-align:center;"><input type="checkbox" id="selectAll" class="ip-checkbox" onclick="toggleSelectAll()"></th>
                                <th>专属节点 (点击复制)</th>
                                <th>预估延迟</th>
                                <th>连通状态</th>
                                <th>记录类型/归属地</th>
                                <th>单节点操作</th>
                            </tr>
                        </thead>
                        <tbody id="testTableBody">
                            <tr><td colspan="6" style="text-align:center; color:var(--text-sec);">暂无数据，请拉取节点或输入自定义 IP/域名 测试</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

        </div>

        <div id="view-settings" class="page-view">

            <div class="section-head">网络与状态</div>

            <div id="updateAlert" class="card" style="display:none; border-left:4px solid var(--success); background:var(--success-soft);">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <div>
                        <h3 style="margin:0; color:var(--success); font-size:16px;">${I.sparkles} 发现新版本！</h3>
                        <p style="margin:5px 0 0 0; font-size:13px; color:var(--text-sec);" id="updateMsg">当前版本: v1.0.0 | 最新版本: v?.?.?</p>
                    </div>
                    <button class="btn-submit" onclick="doOnlineUpdate()" id="onlineUpdateBtn" style="padding:8px 16px;">${I.rocket} 一键拉取并升级</button>
                </div>
            </div>

            <div id="cf-trace-card" style="background:var(--bg-soft); padding:15px 20px; border-radius:14px; border:1px solid var(--border); margin-bottom:20px; display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; font-size:14px; gap:15px;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <span class="ti" style="font-size:22px;">${I.location}</span>
                    <div>
                        <div style="color:var(--text-sec); font-size:12px; margin-bottom:2px;">访客入口 (地区与机房)</div>
                        <div id="trace-entry" style="font-weight:600; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:15px;">雷达扫描中...</div>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:12px;">
                    <span class="ti" style="font-size:22px;">${I.rocket}</span>
                    <div>
                        <div style="color:var(--text-sec); font-size:12px; margin-bottom:2px;">Worker 实际落地机房</div>
                        <div id="trace-egress" style="font-weight:600; color:var(--success); font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:15px;">雷达扫描中...</div>
                    </div>
                </div>
            </div>

            <div class="section-head">管理与维护</div>

            <div class="card admin-only">
                <div class="card-header">
                    <h2>${I.gear} Worker 调度模式与区域设置</h2>
                    <div class="card-tools" style="margin-left:auto;">
                        <button class="btn-submit" onclick="openPlacementModal()">${I.gear} 修改调度/区域</button>
                    </div>
                </div>
            </div>

            <div class="card admin-only" style="border-left:4px solid var(--danger);">
                <div class="card-header" style="margin-bottom:12px;">
                    <h2 style="color:var(--danger);">${I.rocket} 手动覆盖/更新</h2>
                </div>
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <button class="btn-submit" onclick="openCodeModal('paste')" style="flex:1; min-width:120px;">${I.pencil} 手动输入</button>
                    <button class="btn-submit" onclick="openCodeModal('file')" style="flex:1; min-width:120px;">${I.upload} 文件导入</button>
                </div>
                <div style="font-size:12px; color:var(--text-faint); margin-top:10px;">${I.warn} 提交错误的代码会导致面板崩溃（500 错误），请确保代码已测试通过。</div>
            </div>

            <div class="card admin-only" id="ipguard-card">
                <h2 style="margin:0; font-size:18px; margin-bottom:14px; cursor:pointer; display:flex; align-items:center; justify-content:space-between;" onclick="toggleIpGuardCard()">${I.spy} IP 访问控制 <span id="ipguardCardArrow" style="font-size:12px; color:var(--text-sec); font-weight:400;"> 展开</span></h2>
                <div id="ipguardCardBody" style="display:none;">
                    <div style="display:flex; flex-direction:column; gap:12px;">
                    <div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap; font-size:13px;">
                        <label style="display:flex; align-items:center; gap:5px; cursor:pointer;"><input type="radio" name="ipgMode" value="off" style="accent-color:var(--primary);"> 关闭</label>
                        <label style="display:flex; align-items:center; gap:5px; cursor:pointer;"><input type="radio" name="ipgMode" value="whitelist" style="accent-color:var(--primary);"> 白名单</label>
                        <label style="display:flex; align-items:center; gap:5px; cursor:pointer;"><input type="radio" name="ipgMode" value="blacklist" style="accent-color:var(--primary);"> 黑名单</label>
                        <span style="color:var(--text-sec); font-size:12px;">白名单=仅命中放行；黑名单=命中跳转</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; font-size:13px; color:var(--text-sec); flex-wrap:wrap;">
                        当前访问: <span id="ipgCurrent" style="font-weight:600; color:var(--text);">-</span>
                        <button class="btn-submit" style="padding:5px 10px; font-size:12px; border-radius:6px; box-shadow:none; background:#32ade6;" onclick="ipgAddCurrent()">加入 IP 列表</button>
                    </div>
                    <textarea id="ipgIps" rows="4" placeholder="IP / 网段，每行一个，支持 CIDR，如：&#10;1.2.3.4&#10;5.6.7.0/24" style="width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:8px; background:var(--card); font-size:13px; box-sizing:border-box; resize:vertical;"></textarea>
                    <textarea id="ipgCountries" rows="2" placeholder="国家/地区码，每行一个 ISO 两位码，如 US、RU、CN（支持整体封锁国家）&#10;多个国家可换行，也可用逗号/顿号/空格分隔，如：US,RU,CN" style="width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:8px; background:var(--card); font-size:13px; box-sizing:border-box; resize:vertical;"></textarea>
                    <input type="text" id="ipgRedirect" placeholder="跳转网址（被拦截时 302 跳转，如 https://example.com）" style="width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:8px; background:var(--card); font-size:13px; box-sizing:border-box;">
                    <div style="font-size:12px; color:var(--text-sec); line-height:1.7;">
                        命中判定：IP 命中或国家命中即算命中。白名单模式下请先确认当前 IP 已加入列表，否则保存后你自己也会被跳转；黑名单模式下列表内 IP/国家访问面板与节点链接都会被 302 跳转到上面的网址。
                    </div>
                    <div style="border-top:1px dashed var(--border); padding-top:12px; margin-top:4px; display:flex; flex-direction:column; gap:8px;">
                        <div style="font-size:13px; font-weight:600;">最高白名单(/entry 登录 IP,任何模式都放行)</div>
                        <div style="font-size:12px; color:var(--text-sec); line-height:1.6;">登录 /entry 成功的 IP 自动加入。共享节点的其他 IP 可在此删除;删除当前访问 IP 后如被拦截,用 /entry 登录会自动加回。修改后点击下方保存生效。</div>
                        <div id="ipgTrustedList" style="display:flex; flex-direction:column; gap:4px;"></div>
                        <div style="display:flex; gap:8px; align-items:center;">
                            <input type="text" id="ipgTrustedAdd" placeholder="输入要添加的 IP" style="flex:1; padding:8px 10px; border:1px solid var(--border); border-radius:8px; background:var(--card); font-size:13px; box-sizing:border-box;">
                            <button class="btn-submit" style="padding:6px 12px; font-size:12px; border-radius:6px; box-shadow:none; background:#32ade6;" onclick="ipgTrustedAddOne()">添加</button>
                        </div>
                    </div>
                    <div style="border-top:1px dashed var(--border); padding-top:12px; margin-top:4px; display:flex; flex-direction:column; gap:8px;">
                        <div style="font-size:13px; font-weight:600; color:#ff6b6b;"> 最高黑名单(任何模式都拦截)</div>
                        <div style="font-size:12px; color:var(--text-sec); line-height:1.6;">加入的 IP/网段无论当前是什么模式都会被拦截，优先于最高白名单；下方可单独设置 302 跳转链接（不设置则显示「你的 IP 已被拉黑」页面）。</div>
                        <textarea id="ipgBlockedIps" rows="3" placeholder="IP / 网段，每行一个，支持 CIDR，如：&#10;1.2.3.4&#10;5.6.7.0/24" style="width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:8px; background:var(--card); font-size:13px; box-sizing:border-box; resize:vertical;"></textarea>
                        <input type="text" id="ipgBlockedRedirect" placeholder="302 跳转链接（留空=显示「你的 IP 已被拉黑」页，如 https://example.com）" style="width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:8px; background:var(--card); font-size:13px; box-sizing:border-box;">
                    </div>
                    <button class="btn-submit" onclick="saveIpGuard()" style="align-self:flex-start;">${I.check} 保存</button>
                    </div>
                </div>

            <div class="card admin-only" id="config-backup-card">
                <div class="card-header">
                    <h2>${I.box} 配置备份与恢复</h2>
                    <div class="card-tools" style="margin-left:auto;">
                        <button class="btn-submit" onclick="exportConfig()">${I.box} 导出配置</button>
                        <button class="btn-submit" onclick="importConfig()">${I.download} 导入配置</button>
                    </div>
                </div>
            </div>

            <div class="section-head">关于</div>
            <div style="text-align:center; padding-top:6px; padding-bottom:14px;">
                <a href="https://t.me/MakkaPakkaOvO" target="_blank" style="text-decoration:none; color:var(--text); font-weight:600; display:inline-flex; align-items:center; padding:12px 24px; background:var(--card); border-radius:999px; box-shadow:var(--shadow); transition:all .25s; font-size:14px; border:1px solid var(--border);">
                    ${SVG_TG}
                    联系作者 MakkaPakkaOvO
                </a>
                <div style="margin-top:16px; font-size:12px; color:var(--text-sec); line-height:1.6; max-width:600px; margin-left:auto; margin-right:auto; padding:0 15px;">
                    <strong>免责声明:</strong> 本项目仅供学习与技术测试使用，请遵守当地法律法规。使用者对配置、转发内容与访问行为承担全部责任，开发者不对任何直接或间接损失负责。
                </div>
            </div>

        </div>
    </div>

    <div id="nodeModal" class="modal-mask" style="padding:max(64px, calc(env(safe-area-inset-top) + 48px)) 16px 150px;">
        <div class="modal-box">
            <div class="modal-head">
                <h2 id="nodeModalTitle">${I.pencil} 添加节点</h2>
                <button class="close-x" onclick="closeNodeModal()" title="关闭">${I.xmark}</button>
            </div>
            <form id="addForm" style="display:flex; flex-direction:column; gap:16px;">
                <input type="hidden" id="oldPrefix" value="">
                <div class="form-row">
                    <div class="field"><label>节点备注</label><input type="text" id="remark" placeholder="如: Misaka服" required></div>
                    <div class="field"><label>短路径后缀</label><input type="text" id="prefix" placeholder="如: misaka" required></div>
                    <div class="field sub-lite"><label>反代模式</label>
                        <select id="mode" onchange="toggleEmosFields()">
                            <option value="off">保守 (抹除IP)</option>
                            <option value="realip_only">严格 (透传IP)</option>
                            <option value="dual">兼容 (双重透传)</option>
                            <option value="strict">强力 (防403)</option>
                            <option value="emos">EMOS (专用头)</option>
                        </select>
                    </div>
                </div>
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:16px;">
                    <div style="font-size:14px; font-weight:600; color:var(--text-sec); margin-bottom:12px;">服务器线路配置 (支持魔改分离版推流，支持无限条备用线路)</div>
                    <div id="targetInputs" style="display:flex; flex-direction:column; gap:10px;">
                        <input type="url" class="target-input" placeholder="主线路地址 (如: http://1.1.1.1:8096)" required oninput="handleTargetInputs()">
                        <input type="url" class="target-input" placeholder="备用线路 1 (选填，主源挂掉时触发)" oninput="handleTargetInputs()">
                    </div>
                </div>
                <div class="sub-lite" style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-start;">
                    <div style="position:relative; flex:2; min-width:240px;">
                        <div style="display:flex; gap:10px; align-items:center; background:var(--bg); padding:10px 14px; border-radius:12px; border:1px solid var(--border); flex:1; cursor:pointer; transition:border-color .2s;" onclick="toggleIconPicker(event)" id="iconSelectBtn">
                            <img id="iconPreview" src="" style="width:24px; height:24px; display:none; border-radius:4px; object-fit:cover;">
                            <span id="iconDefault" style="font-size:20px; line-height:1;">${I.film}</span>
                            <span id="iconSelectText" style="flex:1; color:var(--text-sec); font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">点击选择图标 (默认)</span>
                            <input type="hidden" id="iconUrl" value="">
                        </div>
                        <div id="iconPickerPanel" style="display:none; position:absolute; top:100%; left:0; width:100%; background:var(--card); border:1px solid var(--border); border-radius:14px; padding:12px; box-shadow:var(--shadow-lg); z-index:100; margin-top:8px; flex-direction:column; gap:10px;">
                            <div style="display:flex; gap:8px; align-items:center; margin-bottom:4px;">
                                <input type="text" id="customIconUrlInput" placeholder="输入自定义 JSON 图标库链接..." style="flex:1; font-size:13px;">
                                <button type="button" onclick="setCustomIconLibrary()" class="btn-submit" style="padding:8px 12px; font-size:13px; white-space:nowrap;">加载</button>
                                <button type="button" onclick="resetIconLibrary()" class="btn-ghost" style="font-size:13px;">默认库</button>
                            </div>
                            <input type="text" id="iconSearch" placeholder="搜索图标名称..." style="width:100%; font-size:14px;" onkeyup="filterIcons()">
                            <div id="iconGrid" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(44px,1fr)); gap:8px; overflow-y:auto; max-height:240px; padding-right:4px;">
                                <div style="text-align:center; color:var(--text-sec); grid-column:1/-1; font-size:13px;">加载图标库中...</div>
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:10px; flex:1; min-width:220px;">
                        <label style="display:flex; align-items:center; gap:8px; font-size:14px; font-weight:500; cursor:pointer;">
                            <input type="checkbox" id="nodeCache" class="ip-checkbox" checked>
                            开启海报及静态资源缓存
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:14px; font-weight:500; cursor:pointer;" title="开启后：该节点的 PlaybackInfo 会禁转码并强制直连（省服务器转码开销）；关闭（默认）则由 Emby 根据播放器能力自行决定直连或转码，兼容性最好">
                            <input type="checkbox" id="nodeForceDirect" class="ip-checkbox">
                            强制直连（禁转码）
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:14px; font-weight:500; cursor:pointer;" title="开启后，PlaybackInfo 返回的 Path（播放器 strm 直连模式使用的路径）保持源站原样，不再改写为反代前缀；适用于播放器打开了 strm 直连开关的场景">
                            <input type="checkbox" id="nodeStrmOpt" class="ip-checkbox">
                            strm 模式优化（不改写 Path）
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:14px; font-weight:500; cursor:pointer;" title="开启后，该节点 301/302/303/307/308 重定向到外部 HTTP(S) 地址时，直接交给客户端访问，不再经 Worker 反代">
                            <input type="checkbox" id="nodeRedirectDirect" class="ip-checkbox">
                            外部跳转直连
                        </label>
                    </div>
                </div>
                <div class="sub-lite" style="display:flex; flex-direction:column; gap:6px;">
                    <label style="display:flex; align-items:center; gap:8px; font-size:14px; font-weight:500; cursor:pointer;">
                        <input type="checkbox" id="nodeRulesEnable" class="ip-checkbox"> 302/307 域名规则
                    </label>
                    <div id="rulesList" style="display:flex; flex-direction:column; gap:8px;"></div>
                    <span style="font-size:12px; color:var(--text-sec);">直连=不走反代；代理=走反代。支持子域名自动匹配；与「外部跳转直连」互斥，同一时间只能开启一个。</span>
                </div>
                <div class="form-row sub-lite">
                    <div class="field"><label>模拟 IP（可选，抹除真实 IP 只传此 IP）</label><input type="text" id="nodeFakeIp" placeholder="如 1.2.3.4"></div>
                    <div class="field"><label>观看下限（天）</label><input type="number" id="watchLimit" placeholder="如 7 / 14 / 21；0 = 不限制" step="0.1" min="0"></div>
                </div>
                <div class="form-row sub-lite" id="emosFields" style="display:none;">
                    <div class="field"><label>EMOS-PROXY-ID（必填）</label><input type="text" id="nodeEmosId" value="eK3QYG29Ms" placeholder="你的用户ID，形如 eABCDEFGHs"></div>
                    <div class="field"><label>EMOS-PROXY-NAME（必填）</label><input type="text" id="nodeEmosName" value="玛卡巴卡的反代面板" placeholder="你的称号，如 @xx的反代"></div>
                    <label style="display:flex; align-items:center; gap:8px; font-size:14px; font-weight:500; cursor:pointer; flex-basis:100%;" title="开启后，聚合播放器(SenPlayer 等)按 TMDB 编号跨服查询时，会把本节点列为播放源(EMOS 聚合显示)">
                        <input type="checkbox" id="nodeEmosAggregate" class="ip-checkbox"> 开启 EMOS 聚合（让聚合播放器把本节点列为播放源）
                    </label>
                    <div style="flex-basis:100%; font-size:12px; color:var(--text-sec);">EMOS 模式按 emos.dpdns.org/proxy 要求：自动透传真实 IP(X-Forwarded-For) + 携带两枚 EMOS 头；默认已内置你的 EMOS 身份，可直接使用也可修改；目标地址填 EMOS 源站（建议 https://video.emos.best，对外路径 /emby）</div>
                </div>
                <div class="form-row sub-lite">
                    <div class="field"><label>节点账号（可选，一键导入用）</label><input type="text" id="nodeUser" placeholder="如: admin"></div>
                    <div class="field"><label>节点密码（可选）</label><input type="password" id="nodePass" placeholder="节点密码"></div>
                </div>
                <button type="submit" id="submitBtn" class="btn-submit" style="width:100%; padding:14px;">保存部署</button>
            </form>
        </div>
    </div>

    <div id="importModal" style="display:none; position:fixed; inset:0; z-index:11030; background:rgba(0,0,0,.5); backdrop-filter:blur(5px); overflow-y:auto; padding:16px;">
        <div style="max-width:540px; margin:24px auto; background:var(--card); border-radius:18px; padding:22px; box-shadow:0 10px 40px rgba(0,0,0,.2);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                <h2 style="margin:0; font-size:19px; display:flex; align-items:center; gap:8px;">${I.rocket} 一键导入播放器</h2>
                <button onclick="closeImpModal()" style="background:transparent;border:none;cursor:pointer;color:var(--text-sec);display:inline-flex;padding:4px;">${I.xmark}</button>
            </div>
            <div style="font-size:13px; color:var(--text-sec); margin-bottom:12px; line-height:1.6;">选择播放器，点击即跳转到对应的一键导入链接。凭据默认取节点账号，可修改。</div>
            <div style="display:flex; gap:10px; margin-bottom:10px;">
                <input type="text" id="impPrefix" placeholder="节点前缀" readonly style="flex:1 1 0; min-width:0; padding:10px 14px; border:1px solid var(--border); border-radius:8px; background:var(--bg); font-size:14px;">
                <input type="text" id="impName" placeholder="名称（默认备注）" style="flex:1 1 0; min-width:0; padding:10px 14px; border:1px solid var(--border); border-radius:8px; background:var(--bg); font-size:14px;">
            </div>
            <div style="display:flex; gap:10px; margin-bottom:16px;">
                <input type="text" id="impUser" placeholder="账号" style="flex:1 1 0; min-width:0; padding:10px 14px; border:1px solid var(--border); border-radius:8px; background:var(--bg); font-size:14px;">
                <input type="text" id="impPass" placeholder="密码" style="flex:1 1 0; min-width:0; padding:10px 14px; border:1px solid var(--border); border-radius:8px; background:var(--bg); font-size:14px;">
            </div>
            <div style="display:flex; flex-direction:column; gap:10px;">
                <button type="button" class="btn-submit" onclick="openImpLink('sen')" style="width:100%; padding:13px; font-size:15px;">${I.rocket} SenPlayer 一键导入</button>
                <button type="button" class="btn-submit" onclick="openImpLink('rex')" style="width:100%; padding:13px; font-size:15px;">${I.rocket} Rex 一键导入</button>
                <button type="button" class="btn-submit" onclick="openImpLink('hills')" style="width:100%; padding:13px; font-size:15px;">${I.rocket} Hills 一键导入</button>
            </div>
        </div>
    </div>

    <div id="codeModal" class="modal-mask" style="padding:max(64px, calc(env(safe-area-inset-top) + 48px)) 16px 150px;">
        <div class="modal-box" style="max-width:560px;">
            <div class="modal-head">
                <h2 id="codeModalTitle">${I.rocket} 手动覆盖/更新</h2>
                <button class="close-x" onclick="closeCodeModal()" title="关闭">${I.xmark}</button>
            </div>
            <div style="font-size:13px; color:var(--danger); margin-bottom:12px; background:rgba(244,63,94,.06); border:1px solid rgba(244,63,94,.2); padding:10px 12px; border-radius:10px;">${I.warn} 警告：提交错误的代码会导致面板瞬间崩溃（500 错误）。请确保代码已在本地测试通过！</div>
            <textarea id="codeArea" rows="8" placeholder="在此处粘贴修改好的最新代码全文..." style="width:100%; margin-bottom:12px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; resize:vertical;"></textarea>
            <input type="file" id="fileInput" accept=".js" style="display:none; font-size:14px; padding:6px; border:1px solid var(--border); border-radius:10px; background:var(--bg); margin-bottom:12px; width:100%;">
            <button class="btn-danger" id="deployBtn" onclick="deployWorker()" style="width:100%;">${I.flame} 覆盖更新</button>
        </div>
    </div>

    <div id="placementModal" class="modal-mask" style="padding:max(64px, calc(env(safe-area-inset-top) + 48px)) 16px 150px;">
        <div class="modal-box" style="max-width:560px;">
            <div class="modal-head">
                <h2>${I.gear} Worker 调度模式与区域设置</h2>
                <button class="close-x" onclick="closePlacementModal()" title="关闭">${I.xmark}</button>
            </div>
            <select id="cf-mode-select" onchange="handleModeChange()" style="width:100%; margin-bottom:10px;">
                <option value='{"mode":"smart"}'>智能调度 (Smart Placement)</option>
                <option value='{"mode":"off"}'>边缘节点 (Edge - 默认离访客近)</option>
                <optgroup label="指定云厂商物理机房落地">
                    <option value="aws">AWS (亚马逊云)</option>
                    <option value="gcp">GCP (谷歌云)</option>
                    <option value="azure">Azure (微软云)</option>
                </optgroup>
                <option value="custom">手动输入区域代码...</option>
            </select>
            <select id="cf-region-select" style="display:none; width:100%; margin-bottom:10px;"></select>
            <input type="text" id="cf-custom-input" placeholder="输入云代码 (如 gcp:us-west1)" style="display:none; width:100%; margin-bottom:10px;">
            <div id="place-status" style="margin:0 0 14px; font-size:13px; color:var(--text-sec); font-weight:600;">后台全自动安全调度，不暴露任何私钥</div>
            <button class="btn-submit" onclick="updatePlacement()" style="width:100%;">${I.check} 提交修改</button>
        </div>
    </div>

    <div id="accountModal" class="modal-mask" style="padding:max(64px, calc(env(safe-area-inset-top) + 48px)) 16px 150px;">
        <div class="modal-box" style="max-width:560px;">
            <div class="modal-head">
                <h2>${I.gear} 账户设置</h2>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span id="topVersionBadge" style="background:var(--primary); color:#fff; padding:3px 10px; border-radius:999px; font-size:12px; font-weight:600;">v${CURRENT_VERSION}</span>
                    <button class="close-x" onclick="closeAccountModal()" title="关闭">${I.xmark}</button>
                </div>
            </div>
            <div id="accountAdminPanel" style="display:flex; flex-direction:column; gap:16px;">
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:14px;">
                    <div style="font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;" onclick="tgSetSec('notice')"><span id="setSecArr-notice" style="font-size:11px; color:var(--text-sec);">▸</span>  公告</div>
                    <div id="setSec-notice" style="display:none; margin-top:10px;">
                        <div style="font-size:12px; color:var(--text-sec); margin-bottom:10px; line-height:1.7;">单条公告：发布新公告自动覆盖旧公告。子管理员与订阅用户<b style="color:var(--primary);">每次进入面板都会看到</b>，需等待 3 秒后才可关闭。留空保存即清除公告。</div>
                        <textarea id="noticeText" rows="3" placeholder="填写公告内容，支持换行…" style="width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:8px; background:var(--card); font-size:13px; box-sizing:border-box; resize:vertical; margin-bottom:10px;"></textarea>
                        <button class="btn-submit" onclick="saveNotice()" style="width:100%;">${I.check} 发布公告</button>
                    </div>
                </div>
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:14px;">
                    <div style="font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;" onclick="tgSetSec('logo')"><span id="setSecArr-logo" style="font-size:11px; color:var(--text-sec);">▸</span> ${I.tv} 更换头像（左上角图标 / 登录页 / 浏览器标签）</div>
                    <div id="setSec-logo" style="display:none; margin-top:10px;">
                    <div style="display:flex; align-items:center; gap:14px; margin-bottom:12px;">
                        <img id="logoPreview" src="${EMBY_LOGO}" alt="头像预览" style="width:56px;height:56px;border-radius:14px;object-fit:cover;border:1px solid var(--border);background:var(--card);flex-shrink:0;">
                        <div style="flex:1; display:flex; flex-direction:column; gap:8px; min-width:0;">
                            <input type="text" id="logoUrlInput" placeholder="图片 URL（http(s):// 开头）" style="width:100%; padding:10px 14px; border:1px solid var(--border); border-radius:8px; background:var(--card); box-sizing:border-box;">
                            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                                <label class="btn-ghost" style="cursor:pointer; margin:0; display:inline-flex; align-items:center; gap:4px;">${I.upload} 上传图片<input type="file" id="logoFileInput" accept="image/png,image/jpeg,image/webp,image/gif" style="display:none;" onchange="readLogoFile(this.files[0]); this.value=''"></label>
                                <button class="btn-submit" onclick="saveLogo()" style="flex:1; white-space:nowrap;">${I.check} 保存</button>
                                <button class="btn-ghost" onclick="resetLogo()" style="white-space:nowrap;">恢复默认</button>
                            </div>
                        </div>
                    </div>
                    <div style="font-size:12px; color:var(--text-sec);">${I.warn} 上传图片会自动压缩到 256px 以内再保存；保存后左上角、登录页与浏览器标签图标（favicon）同步生效。</div>
                    </div>
                </div>
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:14px;">
                    <div style="font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;" onclick="tgSetSec('pass')"><span id="setSecArr-pass" style="font-size:11px; color:var(--text-sec);">▸</span> ${I.pencil} 修改登录密码</div>
                    <div id="setSec-pass" style="display:none; margin-top:10px;">
                        <div style="font-size:12px; color:var(--text-sec); margin-bottom:10px;">${I.warn} Worker 变量 ADMIN_TOKEN 为最高权限，永久有效；此处修改的密码仅对网页生效。</div>
                        <input type="password" id="newAdminPass" placeholder="输入新密码 (至少 4 位)" style="width:100%; margin-bottom:10px;">
                        <button class="btn-submit" onclick="saveAdminPass()" style="width:100%;">${I.check} 保存新密码</button>
                    </div>
                </div>
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:14px;">
                    <div style="font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;" onclick="tgSetSec('users'); loadUsers();"><span id="setSecArr-users" style="font-size:11px; color:var(--text-sec);">▸</span> ${I.robot} 用户管理</div>
                    <div id="setSec-users" style="display:none; margin-top:10px;">
                        <div style="font-size:12px; color:var(--text-sec); margin-bottom:10px; line-height:1.7;">每个用户有自己的<b style="color:var(--primary);">登录密码</b>和<b style="color:var(--primary);">专属后缀</b>：用户登录后只能增删改自己的节点，链接形如 <b style="color:var(--primary);">/专属后缀/节点名</b>，看不到别人的节点。</div>
                        <div id="userList" style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;"><span style="color:var(--text-sec);font-size:12px;">加载中…</span></div>
                        <div style="font-size:13px; font-weight:600; margin-bottom:8px;">新建用户</div>
                        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
                            <input type="text" id="newUserName" placeholder="备注名（如 张三）" style="flex:1; min-width:110px; padding:10px 14px; border:1px solid var(--border); border-radius:8px; background:var(--bg-soft); color:var(--text);">
                            <input type="text" id="newUserSuffix" placeholder="专属后缀（3-24位小写字母/数字/-/_）" style="flex:1.4; min-width:170px; padding:10px 14px; border:1px solid var(--border); border-radius:8px; background:var(--bg-soft); color:var(--text);">
                        </div>
                        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
                            <input type="text" id="newUserPass" placeholder="登录密码（6位以上）" style="flex:1.4; min-width:140px; padding:10px 14px; border:1px solid var(--border); border-radius:8px; background:var(--bg-soft); color:var(--text);">
                            <button type="button" class="btn-ghost" onclick="document.getElementById('newUserPass').value = genUserPw()" style="white-space:nowrap;">随机生成</button>
                            <input type="number" id="newUserMax" value="5" min="1" max="200" title="节点数量上限" style="width:86px; padding:10px 14px; border:1px solid var(--border); border-radius:8px; background:var(--bg-soft); color:var(--text);">
                        </div>
                        <button class="btn-submit" onclick="createUser()" style="width:100%;">${I.plus} 创建用户</button>
                    </div>
                </div>
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:14px;">
                    <div style="font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;" onclick="tgSetSec('subadmin')"><span id="setSecArr-subadmin" style="font-size:11px; color:var(--text-sec);">▸</span> ${I.crown} 子管理员用户区</div>
                    <div id="setSec-subadmin" style="display:none; margin-top:10px;">
                        <div style="font-size:12px; color:var(--text-sec); margin-bottom:10px; line-height:1.7;">${I.warn} 子管理员密码可登录网页，可<b style="color:var(--primary);">查看节点</b>、<b style="color:var(--primary);">审核（通过/拒绝）用户的节点添加申请</b>并<b style="color:var(--primary);">直接添加节点</b>；但不能编辑/删除现有节点、测速、DNS 及任何其他管理操作。子管理员直接添加节点会记入「成员添加节点记录」。</div>
                        <div id="subadminStatus" style="font-size:12px; color:var(--text-sec); margin-bottom:10px;">加载中…</div>
                        <input type="password" id="newSubadminPass" placeholder="输入新子管理员密码 (至少 4 位，留空保存为清除)" style="width:100%; margin-bottom:10px;">
                        <button class="btn-submit" onclick="saveSubadminPass()" style="width:100%;">${I.check} 保存子管理员密码</button>
                    </div>
                </div>
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:14px;">
                    <div style="font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;" onclick="tgSetSec('token')"><span id="setSecArr-token" style="font-size:11px; color:var(--text-sec);">▸</span> ${I.robot} 反代 Token</div>
                    <div id="setSec-token" style="display:none; margin-top:10px;">
                        <div style="font-size:12px; color:var(--text-sec); margin-bottom:10px;">${I.warn} 开启后所有节点链接需带 <b style="color:var(--primary);">/密钥/</b> 前缀才可反代；不带前缀的访问会跳转 /catch 并记录来访 IP（记录存 D1，不占 KV 额度）。</div>
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:13px;">
                                <input type="checkbox" id="ptOn" class="ip-checkbox"> 开启
                            </label>
                        </div>
                        <div style="display:flex; gap:8px; margin-bottom:12px;">
                            <input type="text" id="ptKey" placeholder="自定义密钥（3-32 位字母数字，如 lhazkj）" style="flex:1;">
                            <button class="btn-submit" onclick="saveProxyToken()" style="white-space:nowrap;">${I.check} 保存</button>
                        </div>
                        <div style="font-size:13px; font-weight:600; margin-bottom:8px;">来访记录 IP <span style="font-weight:400; color:var(--text-sec);">（仅管理员）</span></div>
                        <div id="ptHits" style="font-size:12px; color:var(--text-sec);">加载中…</div>
                    </div>
                </div>
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:14px;">
                    <div style="font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;" onclick="tgSetSec('audit')"><span id="setSecArr-audit" style="font-size:11px; color:var(--text-sec);">▸</span> ${I.spy} 申请记录 <span style="font-weight:400; color:var(--text-sec); font-size:12px;">（近 7 天，仅管理员）</span></div>
                    <div id="setSec-audit" style="display:none; margin-top:10px;">
                        <div style="font-size:12px; color:var(--text-sec); margin-bottom:10px; line-height:1.7;">${I.warn} 节点添加申请自动记录提交人 IP 与设备，保留 7 天；可按<b style="color:var(--primary);">节点名字或线路地址</b>搜索，锁定乱加的人后到「IP 访问控制」里封禁。</div>
                        <input type="text" id="auditReqQ" placeholder="搜索节点名字或线路地址…" oninput="auditReqSearch(this.value)" style="width:100%; margin-bottom:10px;">
                        <div id="auditReqList" style="display:flex; flex-direction:column; gap:8px; font-size:12px; color:var(--text-sec);">加载中…</div>
                    </div>
                </div>
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:14px;">
                    <div style="font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;" onclick="tgSetSec('adminlog')"><span id="setSecArr-adminlog" style="font-size:11px; color:var(--text-sec);">▸</span> ${I.crown} 成员添加节点记录 <span style="font-weight:400; color:var(--text-sec); font-size:12px;">（近 7 天，仅管理员）</span></div>
                    <div id="setSec-adminlog" style="display:none; margin-top:10px;">
                        <div style="font-size:12px; color:var(--text-sec); margin-bottom:10px; line-height:1.7;">${I.warn} 子管理员与<b style="color:var(--primary);">已开通添加权限的订阅用户</b>直接添加节点时会自动记录其 IP 与设备，保留 7 天；可按<b style="color:var(--primary);">节点名字、线路地址或前缀</b>搜索，锁定乱加的人后可一键封禁。</div>
                        <input type="text" id="adminLogQ" placeholder="搜索节点名字 / 线路地址 / 前缀…" oninput="adminLogSearch(this.value)" style="width:100%; margin-bottom:10px;">
                        <div id="adminLogList" style="display:flex; flex-direction:column; gap:8px; font-size:12px; color:var(--text-sec);">加载中…</div>
                    </div>
                </div>
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:14px;">
                    <div style="font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;" onclick="tgSetSec('security')"><span id="setSecArr-security" style="font-size:11px; color:var(--text-sec);">▸</span> ${I.spy} 安全</div>
                    <div id="setSec-security" style="display:none; margin-top:10px;">
                        <label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer; margin-bottom:8px;">
                            <input type="checkbox" id="bareProxyChk" class="ip-checkbox" checked> 允许裸域名直连代理（如 /https:// 开头的路径直连任意网站）
                        </label>
                        <div style="font-size:12px; color:var(--text-sec); margin-bottom:10px;">关闭后将拒绝所有「/域名/任意URL」式裸访问，仅允许已配置的节点前缀访问（反代 Token 开启时仍按 /密钥/节点后缀 工作）；不影响任何节点（含后端推流地址与线路不同的服）的正常访问。</div>
                        <button class="btn-submit" onclick="saveSecuritySettings()" style="width:100%;">${I.check} 保存安全设置</button>
                    </div>
                </div>
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:14px;">
                    <div style="font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;" onclick="tgSetSec('notify')"><span id="setSecArr-notify" style="font-size:11px; color:var(--text-sec);">▸</span> ${I.bulb} 保号通知（Bark / Telegram / Server酱 / 钉钉）</div>
                    <div id="setSec-notify" style="display:none; margin-top:10px;">
                        <div style="font-size:12px; color:var(--text-sec); margin-bottom:10px;">${I.warn} 节点超观看下限未观看时每日推送一次；测试按钮可立即验证。</div>
                        <div style="display:flex; gap:14px; margin-bottom:10px;">
                            <label style="display:flex; align-items:center; gap:6px; font-size:13px;"><input type="checkbox" id="barkNotify" class="ip-checkbox"> Bark</label>
                            <label style="display:flex; align-items:center; gap:6px; font-size:13px;"><input type="checkbox" id="tgNotify" class="ip-checkbox"> Telegram</label>
                            <label style="display:flex; align-items:center; gap:6px; font-size:13px;"><input type="checkbox" id="serverChanNotify" class="ip-checkbox"> Server酱</label>
                            <label style="display:flex; align-items:center; gap:6px; font-size:13px;"><input type="checkbox" id="dingTalkNotify" class="ip-checkbox"> 钉钉</label>
                        </div>
                        <input type="text" id="barkKey" placeholder="Bark 设备 Key（留空不修改）" style="width:100%; margin-bottom:8px;">
                        <select id="barkLevel" style="width:100%; margin-bottom:10px;">
                            <option value="active">active（默认）</option>
                            <option value="timeSensitive">timeSensitive</option>
                            <option value="critical">critical（紧急）</option>
                            <option value="passive">passive</option>
                        </select>
                        <input type="text" id="barkServer" placeholder="Bark 服务地址（默认 https://api.day.app）" style="width:100%; margin-bottom:10px;">
                        <input type="text" id="tgToken" placeholder="TG Bot Token（@BotFather 获取，留空不修改）" style="width:100%; margin-bottom:8px;">
                        <input type="text" id="tgChatId" placeholder="TG Chat ID（留空不修改）" style="width:100%; margin-bottom:10px;">
                        <input type="number" id="checkIntervalHours" placeholder="检查间隔（小时，默认 6；0/留空 = 默认）" step="0.5" min="0" style="width:100%; margin-bottom:10px;">
                        <input type="text" id="serverChanKey" placeholder="Server酱 SendKey（sctapi.ftqq.com，留空不修改）" style="width:100%; margin-bottom:8px;">
                        <input type="text" id="dingTalkWebhook" placeholder="钉钉机器人 Webhook 地址或 access_token（留空不修改）" style="width:100%; margin-bottom:10px;">
                        <div class="notify-btn-row">
                            <button class="btn-submit" onclick="saveNotifySettings()">${I.check} 保存</button>
                            <button class="btn-ghost" onclick="testNotifyFn('bark')">测试 Bark</button>
                            <button class="btn-ghost" onclick="testNotifyFn('tg')">测试 TG</button>
                            <button class="btn-ghost" onclick="testNotifyFn('serverchan')">测试 Server酱</button>
                            <button class="btn-ghost" onclick="testNotifyFn('dingtalk')">测试钉钉</button>
                        </div>
                    </div>
                </div>
                </div>
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:14px;">
                    <div style="font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;" onclick="tgSetSec('tggroup')"><span id="setSecArr-tggroup" style="font-size:11px; color:var(--text-sec);">▸</span> ${I.robot} TG 群机器人日报（独立 Bot）</div>
                    <div id="setSec-tggroup" style="display:none; margin-top:10px;">
                        <div style="font-size:12px; color:var(--text-sec); margin-bottom:10px;">${I.bulb} 独立于保号通知的群机器人：每天定时推送当天<b style="color:var(--primary);">节点播放 TOP10</b>（显示节点备注名）、<b style="color:var(--primary);">播放器前五</b>、<b style="color:var(--primary);">地区前五</b>（国内精确到省份/国外到国家）；检测到<b style="color:var(--primary);">新版本</b>时也会在群里通知。</div>
                        <label style="display:flex; align-items:center; gap:6px; font-size:13px; margin-bottom:8px;"><input type="checkbox" id="tgGroupEnabled" class="ip-checkbox"> 启用日报</label>
                        <input type="text" id="tgGroupBotToken" placeholder="群 Bot Token（@BotFather 获取，留空不修改）" style="width:100%; margin-bottom:8px;">
                        <input type="text" id="tgGroupChatId" placeholder="群 Chat ID（如 -1001234567890，留空不修改）" style="width:100%; margin-bottom:10px;">
                        <input type="number" id="tgGroupHour" placeholder="每日发送时间（24小时制，默认 20 即晚8点）" min="0" max="23" style="width:100%; margin-bottom:10px;">
                        <div class="notify-btn-row">
                            <button class="btn-submit" onclick="saveNotifySettings()">${I.check} 保存</button>
                            <button class="btn-ghost" onclick="testTgGroup()">测试群 Bot</button>
                            <button class="btn-ghost" onclick="sendTgGroupReport()">一键发送日报</button>
                        </div>
                    </div>
                </div>
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:14px;">
                    <div style="font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;" onclick="tgSetSec('subuser')"><span id="setSecArr-subuser" style="font-size:11px; color:var(--text-sec);">▸</span> ${I.robot} 订阅用户管理</div>
                    <div id="setSec-subuser" style="display:none; margin-top:10px;">
                        <div style="font-size:12px; color:var(--text-sec); margin-bottom:10px; line-height:1.7;">订阅者密码可进入网页，默认只能查看节点。勾选<b style="color:var(--primary);">「可添加节点」</b>后，该订阅用户可直接添加节点（无需审核，添加时自动记录其 IP 与设备）；未勾选则看不到添加节点按钮。订阅用户始终不能查看源站线路、编辑或删除节点。</div>
                        <div id="subList" style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;"></div>
                        <div style="display:flex; gap:8px;">
                            <input type="text" id="newSubPass" placeholder="输入新订阅者密码" style="flex:1;">
                            <button class="btn-submit" onclick="addSubscriber()" style="white-space:nowrap;">${I.plus} 添加</button>
                        </div>
                    </div>
                </div>
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:14px;">
                    <div style="font-size:14px; font-weight:600; margin-bottom:10px;">${I.rocket} 版本</div>
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
                        <span style="font-size:13px;">当前版本：</span>
                        <span id="curVersionBadge" style="background:var(--primary); color:#fff; padding:3px 10px; border-radius:999px; font-size:12px; font-weight:600;">v${CURRENT_VERSION}</span>
                        <span id="latestVersionInfo" style="font-size:12px; color:var(--text-sec);"></span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
                        <label style="display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer;">
                            <input type="checkbox" id="updateNotifyChk" class="ip-checkbox"> 开启更新提醒（检测到新版本时弹窗提示）
                        </label>
                        <button class="btn-ghost" onclick="saveUpdateNotify()" style="padding:6px 12px; font-size:12px;">保存</button>
                    </div>
                    <div style="font-size:13px; font-weight:600; margin-bottom:6px;">${I.rocket} 最新更新内容</div>
                    <div id="latestChangelog" style="font-size:12px; color:var(--text-sec); margin-bottom:12px; line-height:1.8;">加载中…</div>
                    <div style="display:flex; gap:8px; margin-bottom:12px;">
                        <button class="btn-submit" onclick="checkForUpdates(true)" style="flex:1;">${I.search} 检查更新</button>
                        <button class="btn-ghost" onclick="manualUpdateFlow()" style="flex:1;">${I.rocket} 立即更新</button>
                    </div>
                    <details style="font-size:12px; color:var(--text-sec);">
                        <summary style="cursor:pointer; font-weight:600;">${I.lines} 历史更新内容</summary>
                        <div id="historyChangelog" style="margin-top:8px; line-height:1.8;">加载中…</div>
                    </details>
                </div>
            </div>
            <div id="accountSubPanel" style="display:none; text-align:center; padding:20px 0; color:var(--text-sec); font-size:14px;">
                ${I.robot} 当前为订阅用户模式，仅可查看节点，无任何修改权限。
            </div>
            <div id="accountUserPanel" style="display:none; flex-direction:column; gap:14px;">
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:14px; font-size:13px; line-height:2;">
                    <div>用户：<b id="uName"></b></div>
                    <div>专属后缀：<b id="uSuffix" style="color:var(--primary);"></b></div>
                    <div>节点数量：<b id="uNodes"></b></div>
                    <div style="color:var(--text-sec); font-size:12px;">你的节点链接格式：https://你的域名/<span id="uSuffix2"></span>/节点名</div>
                </div>
                <div style="background:var(--bg-soft); border:1px solid var(--border); border-radius:14px; padding:14px;">
                    <div style="font-size:14px; font-weight:600; margin-bottom:10px;">修改登录密码</div>
                    <input type="password" id="uOldPw" placeholder="当前密码" style="width:100%; padding:10px 14px; border:1px solid var(--border); border-radius:8px; background:var(--bg-soft); color:var(--text); margin-bottom:8px;">
                    <input type="password" id="uNewPw" placeholder="新密码（6位以上）" style="width:100%; padding:10px 14px; border:1px solid var(--border); border-radius:8px; background:var(--bg-soft); color:var(--text); margin-bottom:10px;">
                    <button class="btn-submit" onclick="userChangePw()" style="width:100%;">${I.check} 保存新密码</button>
                </div>
            </div>
        </div>
    </div>

    <div id="nodeReqModal" class="modal-mask" style="padding:max(64px, calc(env(safe-area-inset-top) + 48px)) 16px 150px;">
        <div class="modal-box" style="max-width:560px;">
            <div class="modal-head">
                <h2>${I.robot} 节点申请审核</h2>
                <button class="close-x" onclick="closeNodeReqModal()" title="关闭">${I.xmark}</button>
            </div>
            <div id="nodeReqList" style="display:flex; flex-direction:column; gap:10px;">加载中…</div>
        </div>
    </div>

    <div id="subReqModal" class="modal-mask" style="padding:max(64px, calc(env(safe-area-inset-top) + 48px)) 16px 150px;">
        <div class="modal-box" style="max-width:480px;">
            <div class="modal-head">
                <h2>${I.plus} 申请添加节点</h2>
                <button class="close-x" onclick="closeSubReqModal()" title="关闭">${I.xmark}</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:12px;">
                <input type="text" id="subReqName" placeholder="节点名字（如: 我的私服）" style="width:100%;">
                <div id="subReqUrlBox" style="display:flex; flex-direction:column; gap:8px; background:var(--bg-soft); border:1px solid var(--border); border-radius:12px; padding:12px;">
                    <div style="font-size:12px; font-weight:600; color:var(--text-sec);">服务器线路配置（支持无数条备用线路）</div>
                    <input type="url" class="sub-req-url" placeholder="主线路地址（如: https://1.1.1.1:8096）" oninput="handleSubReqUrls()" style="width:100%;">
                    <input type="url" class="sub-req-url" placeholder="备用线路 1（选填，可继续添加）" oninput="handleSubReqUrls()" style="width:100%;">
                </div>
                <div id="subReqHint" style="font-size:12px; color:var(--text-sec); line-height:1.7;">提交后管理员审核；线路已存在会直接提示你，同线路的新申请会自动覆盖旧申请（含全部备用线路）。</div>
                <button class="btn-submit" onclick="submitNodeReq()" style="width:100%; padding:13px;">${I.check} 提交申请</button>
            </div>
        </div>
    </div>

    <div id="updateModal" class="modal-mask" style="padding:16px 16px 150px;">
        <div class="modal-box" style="max-width:480px; margin-top:max(96px, calc(env(safe-area-inset-top) + 80px));">
            <div class="modal-head">
                <h2>${I.rocket} 发现新版本</h2>
                <button class="close-x" onclick="hideUpdateModal()" title="关闭">${I.xmark}</button>
            </div>
            <div style="font-size:13px; margin-bottom:12px;">当前版本 <span id="updateModalCurVer" style="font-weight:600;">v${CURRENT_VERSION}</span> → 新版本 <span id="updateModalVersion" style="font-weight:600; color:var(--primary);"></span></div>
            <div style="background:rgba(52,199,89,.06); border:1px solid rgba(52,199,89,.25); border-radius:12px; padding:14px; margin-bottom:14px;">
                <div id="updateModalBody" style="font-size:12px; line-height:1.9;">加载中…</div>
            </div>
            <div style="display:flex; gap:8px;">
                <button class="btn-submit" onclick="doOnlineUpdate()" style="flex:1;">${I.rocket} 立即更新</button>
                <button class="btn-ghost" onclick="hideUpdateModal()" style="flex:1;">稍后再说</button>
            </div>
        </div>
    </div>

    <div id="modeCardMenu" class="mode-card-menu">
        <button class="mm-close" onclick="closeModeMenu()">×</button>
        <div class="mm-title"><span id="mmBadge" style="width:9px;height:9px;border-radius:50%;background:var(--mc);display:inline-block;"></span><span id="mmName"></span></div>
        <div class="mm-desc" id="mmDesc"></div>
        <div class="mm-stats" id="mmStats"></div>
        <div class="mm-btns">
            <button class="mm-btn mm-primary" id="mmFilter" onclick="filterByMode()">筛选出该模式节点</button>
            <button class="mm-btn admin-only" id="mmApply" onclick="applyModeToAll()">全部节点切换为此模式</button>
        </div>
    </div>
    <div id="noticeModal" class="modal-mask" style="display:none; padding:max(64px, calc(env(safe-area-inset-top) + 48px)) 16px 150px;">
        <div class="modal-box" style="max-width:520px;">
            <div class="modal-head">
                <h2> 公告</h2>
            </div>
            <div id="noticeBody" style="font-size:14px; line-height:1.9; white-space:pre-wrap; word-break:break-all; max-height:58vh; overflow:auto; padding:6px 0; color:var(--text);"></div>
            <div style="text-align:right; margin-top:16px;">
                <button class="btn-submit" id="noticeCloseBtn" onclick="closeNotice()" disabled style="opacity:.55; cursor:not-allowed;">我知道了 (3s)</button>
            </div>
        </div>
    </div>
    <div id="updateResultModal" class="modal-mask" style="padding:max(64px, calc(env(safe-area-inset-top) + 48px)) 16px 150px;">
        <div class="modal-box" style="max-width:480px;">
            <div class="modal-head">
                <h2 style="color:var(--success);">${I.check} 更新成功</h2>
                <button class="close-x" onclick="document.getElementById('updateResultModal').style.display='none'" title="关闭">${I.xmark}</button>
            </div>
            <div id="updateResultBody" style="font-size:12px; line-height:1.9; margin-bottom:14px;"></div>
            <button class="btn-submit" onclick="window.location.reload()" style="width:100%;">${I.check} 刷新页面</button>
        </div>
    </div>

    <script>
        const modeNames = { 'off': '保守', 'realip_only': '严格', 'dual': '兼容', 'strict': '强力', 'emos': 'EMOS' };

        // ===== 折叠交互(v3.4.32)=====
        function toggleNodesCollapse(){
            const grid = document.getElementById('list-grid');
            const tb = document.getElementById('nodesToolbar');
            const hint = document.getElementById('nodesHint');
            const ar = document.getElementById('nodesArrow');
            if(!grid) return;
            const open = grid.style.display !== 'none';
            grid.style.display = open ? 'none' : 'grid';
            if(tb) tb.style.display = open ? 'none' : 'flex';
            if(hint) hint.style.display = open ? 'block' : 'none';
            if(ar){ ar.textContent = open ? '' : '▼'; ar.classList.toggle('open', !open); }
        }
        function toggleCollapseSec(head){
            const sec = head.closest('.collapse-sec');
            if(!sec) return;
            sec.classList.toggle('open');
            const hint = head.querySelector('.ch-hint');
            if(hint) hint.textContent = sec.classList.contains('open') ? '点击收起' : '点击展开';
        }
        
        const DEFAULT_ICON_URL = 'https://emby-icon.vercel.app/TFEL-Emby.json';
        let globalIcons = [];
        let proxyNodesForPing = [];
        let sortableInstance = null;
        let trendChartInstance = null;
        let locationChartInstance = null;
        let cfStatusChartInstance = null;
        let cfHourChartInstance = null;

        // 设置 Chart.js 响应暗色模式
        function updateChartColors() {
            Chart.defaults.color = document.body.classList.contains('dark') ? '#98989d' : '#86868b';
            Chart.defaults.borderColor = document.body.classList.contains('dark') ? '#38383a' : '#d2d2d7';
        }

        // =====================================
        // 数据大屏与统计逻辑 (适配手机端表格排版)
        // =====================================
        // v3.4.16:播放热力图加载(统计弹窗内,与 openDashboard 同级)
        async function loadHeatmap() {
            const grid = document.getElementById('heatmapGrid');
            const sum = document.getElementById('heatmapSummary');
            if (!grid || !sum) return;
            try {
                const res = await fetch('/api/heatmap');
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const data = await res.json();
                if (!data.ok) throw new Error(data.error || '接口错误');
                const days = data.days || [];
                const prefixTotals = data.prefixTotals || {};
                const total = data.total || 0;
                const maxHour = data.maxHour || 1;
                const routeMap = {};
                (window.globalRoutesData || []).forEach(function(r) { if (r && r.prefix) routeMap[r.prefix] = r.remark || r.prefix; });
                const nodeTotal = Object.keys(prefixTotals).map(function(k) {
                    const disp = routeMap[k] || k;
                    return '<span style="background:rgba(0,122,255,.08); border:1px solid rgba(0,122,255,.18); border-radius:6px; padding:2px 8px; margin-right:6px; display:inline-block;">' + disp + ': <b>' + prefixTotals[k] + '</b></span>';
                }).join('');
                sum.innerHTML = '总计播放请求 <b>' + total + '</b> 次 · 各节点:<div style="margin-top:6px;">' + (nodeTotal || '<span style="color:var(--text-sec);">暂无播放数据,配置节点后播放即开始统计</span>') + '</div>';
                const week = ['日', '一', '二', '三', '四', '五', '六'];
                let html = '<div style="min-width:560px;">';
                html += '<div style="display:grid; grid-template-columns:56px repeat(24,1fr); gap:3px; margin-bottom:4px;">';
                html += '<div></div>';
                for (let h = 0; h < 24; h++) html += '<div style="font-size:10px; color:var(--text-sec); text-align:center;">' + h + '</div>';
                html += '</div>';
                days.forEach(function(d, di) {
                    const dt = new Date();
                    dt.setDate(dt.getDate() - (days.length - 1 - di));
                    const dow = week[dt.getDay()];
                    html += '<div style="display:grid; grid-template-columns:56px repeat(24,1fr); gap:3px; margin-bottom:3px;">';
                    html += '<div style="font-size:10px; color:var(--text-sec); display:flex; align-items:center;">' + d.day + ' ' + dow + '</div>';
                    for (let h = 0; h < 24; h++) {
                        const v = d.hours[h] || 0;
                        const ratio = v / maxHour;
                        const bg = v === 0 ? 'rgba(120,120,120,0.08)' : 'rgba(0,122,255,' + (0.12 + ratio * 0.85) + ')';
                        html += '<div title="' + d.day + ' ' + h + '时: ' + v + '次" style="height:22px; border-radius:4px; background:' + bg + '; display:flex; align-items:center; justify-content:center; font-size:9px; color:' + (ratio > 0.5 ? '#fff' : 'var(--text-sec)') + ';">' + (v > 0 ? v : '') + '</div>';
                    }
                    html += '</div>';
                });
                html += '</div>';
                html += '<div style="display:flex; align-items:center; gap:6px; font-size:11px; color:var(--text-sec); margin-top:8px;">低 <span style="width:16px;height:16px;border-radius:3px;background:rgba(120,120,120,0.12);display:inline-block;"></span>';
                html += '<span style="width:16px;height:16px;border-radius:3px;background:rgba(0,122,255,.2);display:inline-block;"></span>';
                html += '<span style="width:16px;height:16px;border-radius:3px;background:rgba(0,122,255,.5);display:inline-block;"></span>';
                html += '<span style="width:16px;height:16px;border-radius:3px;background:rgba(0,122,255,.9);display:inline-block;"></span> 高</div>';
                grid.innerHTML = html;
            } catch (e) {
                grid.innerHTML = '<div style="font-size:12px; color:#ff3b30; padding:20px;">热力图加载失败: ' + e.message + '</div>';
                sum.innerHTML = '';
            }
        }

        // =============================================
        //  访问者分布:3D 地球 / 平面世界 / 中国省份热力图 (v3.4.53)
        // =============================================
        const GEO_META = { 'CN':{label:'中国',lat:34.5,lon:108.9},'HK':{label:'中国香港',lat:22.31,lon:114.17},'TW':{label:'中国台湾',lat:25.03,lon:121.56},'MO':{label:'中国澳门',lat:22.19,lon:113.54},'JP':{label:'日本',lat:35.68,lon:139.76},'SG':{label:'新加坡',lat:1.35,lon:103.82},'KR':{label:'韩国',lat:37.56,lon:126.97},'KP':{label:'朝鲜',lat:39.03,lon:125.75},'US':{label:'美国',lat:34.05,lon:-118.24},'DE':{label:'德国',lat:50.11,lon:8.68},'GB':{label:'英国',lat:51.50,lon:-0.12},'UK':{label:'英国',lat:51.50,lon:-0.12},'NL':{label:'荷兰',lat:52.36,lon:4.90},'FR':{label:'法国',lat:48.85,lon:2.35},'FI':{label:'芬兰',lat:60.17,lon:24.94},'MX':{label:'墨西哥',lat:19.43,lon:-99.13},'CA':{label:'加拿大',lat:43.65,lon:-79.38},'AU':{label:'澳大利亚',lat:-33.86,lon:151.20},'NZ':{label:'新西兰',lat:-36.85,lon:174.76},'RU':{label:'俄罗斯',lat:55.75,lon:37.61},'IN':{label:'印度',lat:19.07,lon:72.87},'MY':{label:'马来西亚',lat:3.14,lon:101.68},'TH':{label:'泰国',lat:13.75,lon:100.50},'VN':{label:'越南',lat:10.82,lon:106.62},'ID':{label:'印度尼西亚',lat:-6.20,lon:106.81},'PH':{label:'菲律宾',lat:14.60,lon:120.98},'BR':{label:'巴西',lat:-23.55,lon:-46.63},'IT':{label:'意大利',lat:41.90,lon:12.50},'ES':{label:'西班牙',lat:40.42,lon:-3.70},'SE':{label:'瑞典',lat:59.33,lon:18.07},'CH':{label:'瑞士',lat:46.95,lon:7.45},'TR':{label:'土耳其',lat:39.93,lon:32.86},'AE':{label:'阿联酋',lat:25.25,lon:55.36},'AR':{label:'阿根廷',lat:-34.60,lon:-58.38},'CL':{label:'智利',lat:-33.45,lon:-70.67},'NO':{label:'挪威',lat:59.91,lon:10.75},'DK':{label:'丹麦',lat:55.68,lon:12.57},'PL':{label:'波兰',lat:52.23,lon:21.01},'UA':{label:'乌克兰',lat:50.45,lon:30.52},'IE':{label:'爱尔兰',lat:53.35,lon:-6.26},'AT':{label:'奥地利',lat:48.21,lon:16.37},'PT':{label:'葡萄牙',lat:38.72,lon:-9.14},'GR':{label:'希腊',lat:37.98,lon:23.73},'IL':{label:'以色列',lat:32.08,lon:34.78},'SA':{label:'沙特阿拉伯',lat:24.71,lon:46.68},'QA':{label:'卡塔尔',lat:25.29,lon:51.53},'KW':{label:'科威特',lat:29.38,lon:47.99},'EG':{label:'埃及',lat:30.04,lon:31.24},'ZA':{label:'南非',lat:-26.20,lon:28.05},'NG':{label:'尼日利亚',lat:6.52,lon:3.38},'KE':{label:'肯尼亚',lat:-1.29,lon:36.82},'CO':{label:'哥伦比亚',lat:4.71,lon:-74.07},'PE':{label:'秘鲁',lat:-12.05,lon:-77.04},'VE':{label:'委内瑞拉',lat:10.48,lon:-66.90},'PK':{label:'巴基斯坦',lat:33.69,lon:73.06},'BD':{label:'孟加拉国',lat:23.81,lon:90.41},'LK':{label:'斯里兰卡',lat:6.93,lon:79.85},'MM':{label:'缅甸',lat:16.87,lon:96.20},'LA':{label:'老挝',lat:17.97,lon:102.63},'KH':{label:'柬埔寨',lat:11.56,lon:104.92},'NP':{label:'尼泊尔',lat:27.72,lon:85.32},'IR':{label:'伊朗',lat:35.69,lon:51.39},'IQ':{label:'伊拉克',lat:33.32,lon:44.42},'JO':{label:'约旦',lat:31.96,lon:35.95},'LB':{label:'黎巴嫩',lat:33.89,lon:35.50},'OM':{label:'阿曼',lat:23.59,lon:58.41},'DZ':{label:'阿尔及利亚',lat:36.75,lon:3.06},'MA':{label:'摩洛哥',lat:34.02,lon:-6.84},'TN':{label:'突尼斯',lat:36.81,lon:10.18},'RO':{label:'罗马尼亚',lat:44.43,lon:26.10},'HU':{label:'匈牙利',lat:47.50,lon:19.04},'BG':{label:'保加利亚',lat:42.70,lon:23.32},'CZ':{label:'捷克',lat:50.08,lon:14.44},'SK':{label:'斯洛伐克',lat:48.15,lon:17.11},'HR':{label:'克罗地亚',lat:45.81,lon:15.98},'RS':{label:'塞尔维亚',lat:44.79,lon:20.45},'EE':{label:'爱沙尼亚',lat:59.44,lon:24.75},'LV':{label:'拉脱维亚',lat:56.95,lon:24.11},'LT':{label:'立陶宛',lat:54.69,lon:25.28},'KZ':{label:'哈萨克斯坦',lat:43.24,lon:76.95},'UZ':{label:'乌兹别克斯坦',lat:41.30,lon:69.24},'GE':{label:'格鲁吉亚',lat:41.72,lon:44.79},'AZ':{label:'阿塞拜疆',lat:40.41,lon:49.87},'BY':{label:'白俄罗斯',lat:53.90,lon:27.56},'CU':{label:'古巴',lat:23.11,lon:-82.37},'DO':{label:'多米尼加',lat:18.49,lon:-69.91},'CR':{label:'哥斯达黎加',lat:9.93,lon:-84.08},'PA':{label:'巴拿马',lat:8.98,lon:-79.52},'GT':{label:'危地马拉',lat:14.63,lon:-90.51},'BO':{label:'玻利维亚',lat:-16.50,lon:-68.15},'PY':{label:'巴拉圭',lat:-25.28,lon:-57.63},'UY':{label:'乌拉圭',lat:-34.90,lon:-56.16},'EC':{label:'厄瓜多尔',lat:-0.18,lon:-78.47},'FJ':{label:'斐济',lat:-18.14,lon:178.44},'PG':{label:'巴布亚新几内亚',lat:-9.44,lon:147.18},'GH':{label:'加纳',lat:5.60,lon:-0.19},'ET':{label:'埃塞俄比亚',lat:9.03,lon:38.74},'TZ':{label:'坦桑尼亚',lat:-6.79,lon:39.28},'UG':{label:'乌干达',lat:0.35,lon:32.58},'SD':{label:'苏丹',lat:15.59,lon:32.55},'LY':{label:'利比亚',lat:32.89,lon:13.19},'MN':{label:'蒙古',lat:47.89,lon:106.91},'BT':{label:'不丹',lat:27.47,lon:89.64},'MV':{label:'马尔代夫',lat:4.18,lon:73.51} };
        const PROV_COORDS = { '北京市':{lat:39.90,lon:116.40},'天津市':{lat:39.08,lon:117.20},'上海市':{lat:31.23,lon:121.47},'重庆市':{lat:29.56,lon:106.55},'河北省':{lat:38.04,lon:114.51},'山西省':{lat:37.87,lon:112.55},'辽宁省':{lat:41.80,lon:123.43},'吉林省':{lat:43.82,lon:125.32},'黑龙江省':{lat:45.80,lon:126.53},'江苏省':{lat:32.06,lon:118.80},'浙江省':{lat:30.27,lon:120.15},'安徽省':{lat:31.82,lon:117.23},'福建省':{lat:26.07,lon:119.30},'江西省':{lat:28.68,lon:115.86},'山东省':{lat:36.65,lon:117.12},'河南省':{lat:34.75,lon:113.63},'湖北省':{lat:30.59,lon:114.30},'湖南省':{lat:28.23,lon:112.94},'广东省':{lat:23.13,lon:113.26},'海南省':{lat:20.04,lon:110.32},'四川省':{lat:30.57,lon:104.06},'贵州省':{lat:26.65,lon:106.63},'云南省':{lat:25.04,lon:102.71},'陕西省':{lat:34.34,lon:108.94},'甘肃省':{lat:36.06,lon:103.83},'青海省':{lat:36.62,lon:101.78},'台湾省':{lat:25.03,lon:121.56},'内蒙古自治区':{lat:40.84,lon:111.75},'广西壮族自治区':{lat:22.82,lon:108.32},'西藏自治区':{lat:29.65,lon:91.14},'宁夏回族自治区':{lat:38.47,lon:106.23},'新疆维吾尔自治区':{lat:43.83,lon:87.62},'香港特别行政区':{lat:22.31,lon:114.17},'澳门特别行政区':{lat:22.19,lon:113.54} };
        let geoData = null, geoMode = '3d', geoResolvedNew = 0;
        // NEBULA 点阵地球:世界海岸线轮廓+陆地填充点集(经纬度*10 扁平数组 [lng10,lat10,...],约 4500 点)
        const WORLD_DOTS = [1781,-175,-1800,-161,1794,-168,339,-10,377,-31,392,-47,388,-65,392,-85,400,-101,384,-113,368,-116,346,-115,339,-97,322,-89,302,-71,295,-54,305,-36,308,-17,-87,277,-87,259,-120,259,-119,234,-129,213,-168,213,-148,215,-139,237,-125,248,-114,269,-97,269,-1228,490,-1249,500,-1274,508,-1291,528,-1305,543,-1300,559,-1317,566,-1334,584,-1349,593,-1375,589,-1390,600,-1410,603,-1410,660,-1410,697,-1391,695,-1375,690,-1356,693,-1329,695,-1298,702,-1281,705,-1258,695,-1231,696,-1215,698,-1176,690,-1152,689,-1135,677,-1108,678,-1089,674,-1070,687,-1053,686,-1032,681,-1015,676,-984,678,-961,682,-942,691,-965,701,-952,719,-929,713,-915,702,-905,685,-880,686,-863,679,-855,699,-826,697,-812,687,-833,664,-858,666,-870,652,-885,641,-907,636,-932,620,-946,601,-932,588,-923,571,-890,569,-873,560,-850,553,-834,552,-821,533,-799,512,-786,526,-791,541,-771,558,-773,581,-773,599,-781,623,-757,623,-738,624,-717,615,-696,611,-693,590,-677,582,-652,599,-625,582,-614,570,-596,552,-580,549,-562,536,-564,518,-588,511,-617,501,-639,503,-664,502,-685,491,-700,477,-666,491,-642,487,-648,470,-632,457,-615,459,-598,459,-633,447,-654,435,-644,453,-660,453,-678,457,-682,474,-700,467,-711,453,-733,450,-753,448,-768,436,-787,436,-802,424,-824,417,-821,436,-826,453,-841,463,-857,472,-874,479,-893,480,-916,481,-936,486,-952,494,-972,490,-1007,490,-1041,490,-1070,490,-1101,490,-1130,490,-1160,490,-1200,490,-840,625,-819,629,-838,622,-798,728,-781,737,-763,731,-784,729,-803,621,-936,750,-956,747,-940,753,-938,775,-962,776,-944,778,-968,788,-986,785,-881,744,-898,745,-924,748,-939,763,-960,764,-936,768,-916,768,-898,758,-878,756,-848,757,-828,758,-811,757,-832,746,-861,744,-1113,782,-1135,777,-1110,788,-1125,784,-556,513,-568,498,-549,493,-531,487,-531,467,-542,478,-560,469,-593,476,-584,491,-574,507,-559,516,-839,651,-816,645,-801,637,-825,637,-855,631,-872,635,-862,648,-845,654,-788,724,-756,722,-741,713,-722,716,-688,705,-670,692,-688,687,-665,681,-649,678,-634,669,-639,650,-667,664,-657,646,-647,634,-663,629,-688,637,-674,629,-689,623,-710,629,-734,642,-777,642,-760,653,-740,655,-727,673,-748,686,-769,689,-790,702,-813,697,-849,700,-871,703,-887,704,-902,722,-884,735,-858,738,-823,738,-806,727,-945,741,-924,741,-905,739,-920,730,-943,720,-960,729,-1229,761,-1212,769,-1191,775,-1162,776,-1180,765,-1199,761,-1215,759,-1327,540,-1312,522,-1326,531,-1055,793,-1035,792,-1008,788,-1029,783,-1052,784,-1235,485,-1257,488,-1270,498,-1284,508,-1267,504,-1249,495,-1215,744,-1176,742,-1155,735,-1192,725,-1205,714,-1231,709,-1259,719,-1248,730,-1078,758,-1059,760,-1097,749,-1122,744,-1139,747,-1118,752,-1163,750,-1154,765,-1126,761,-1108,755,-1091,755,-1105,764,-1086,767,-1065,731,-1048,717,-1028,705,-1010,700,-1027,695,-1042,689,-1060,692,-1090,688,-1115,686,-1133,685,-1152,693,-1173,700,-1151,702,-1124,704,-1143,706,-1165,705,-1184,709,-1161,713,-1194,716,-1179,727,-1152,733,-1124,730,-1099,730,-1082,717,-1075,732,-1004,727,-974,738,-967,717,-984,713,-1000,717,-1025,725,-1066,736,-1045,734,-1069,735,-985,767,-982,750,-998,749,-1025,756,-1000,766,-960,806,-943,810,-924,813,-894,805,-878,803,-858,793,-890,783,-908,782,-929,783,-950,794,-967,802,-916,819,-889,821,-870,823,-843,826,-824,829,-793,831,-763,832,-728,832,-707,832,-685,831,-658,830,-637,829,-619,826,-643,819,-668,817,-695,806,-712,798,-732,796,-769,793,-754,785,-779,779,-798,772,-779,770,-806,762,-832,765,-861,763,-895,765,-878,772,-850,775,-880,784,-854,790,-869,803,-842,802,-818,805,-841,806,-876,805,-894,809,-914,816,-752,674,-770,671,-759,683,-963,695,-984,690,-966,697,-645,499,-629,497,-640,470,-620,464,-641,464,-1170,490,-952,490,-926,485,-908,483,-884,483,-865,476,-849,469,-835,460,-823,444,-829,424,-813,422,-789,429,-715,450,-691,440,-706,431,-700,416,-719,413,-737,409,-719,409,-740,406,-749,389,-759,372,-764,391,-763,370,-764,348,-781,339,-803,325,-815,307,-810,292,-801,269,-804,252,-822,267,-827,286,-837,299,-858,302,-875,303,-892,303,-909,291,-925,296,-947,295,-966,283,-974,267,-990,264,-1001,281,-1017,298,-1031,290,-1047,301,-1061,314,-1082,318,-1110,313,-1133,320,-1160,326,-1179,336,-1194,343,-1217,362,-1225,376,-1237,390,-1242,411,-1245,428,-1240,446,-1241,469,-1223,474,-1554,201,-1560,208,-1568,212,-1580,217,-1594,222,-1665,604,-1532,580,-1545,570,-1355,598,-1320,555,-1335,572,-1350,582,-1378,585,-1399,595,-1426,601,-1459,605,-1482,607,-1497,597,-1517,592,-1514,607,-1540,594,-1553,577,-1581,565,-1596,556,-1612,554,-1631,547,-1648,544,-1629,553,-1606,560,-1587,570,-1576,583,-1597,589,-1614,587,-1625,600,-1647,603,-1661,615,-1649,626,-1631,631,-1608,638,-1625,646,-1650,644,-1668,651,-1645,666,-1617,661,-1637,671,-1654,680,-1632,694,-1609,704,-1590,709,-1566,714,-1543,707,-1522,708,-1497,705,-1476,702,-1457,701,-1436,702,-1717,638,-1697,634,-1716,633,874,492,858,485,832,473,825,455,800,449,809,432,791,429,760,430,742,433,718,428,704,421,686,407,667,412,661,430,632,436,611,444,587,455,559,450,560,413,541,423,525,418,513,431,503,446,522,454,530,469,512,470,491,464,481,477,465,484,476,505,508,517,545,510,568,510,596,505,613,508,600,520,617,530,652,544,682,550,709,552,735,540,769,545,800,509,819,508,839,509,855,497,585,456,602,448,620,435,649,437,660,420,680,411,719,414,706,402,685,395,678,371,652,384,635,394,619,411,601,414,586,428,569,418,1410,-26,1427,-33,1446,-39,1458,-49,1476,-61,1481,-80,1493,-95,1508,-103,1489,-103,1471,-95,1460,-81,1439,-79,1426,-93,1410,-91,1410,-59,1526,-37,1507,-27,1522,-32,1513,-58,1497,-63,1511,-51,1548,-53,1560,-65,1545,-51,1391,-81,1384,-62,1360,-45,1337,-35,1320,-28,1338,-25,1318,-16,1340,-8,1344,-28,1363,-23,1383,-17,1399,-24,1250,-89,1236,-104,1342,-69,1179,41,1180,23,1190,9,1175,1,1166,-15,1161,-40,1145,-35,1121,-35,1102,-29,1096,-13,1090,4,1097,20,1112,10,1129,15,1146,14,1155,32,1170,43,1294,-28,1308,-39,1292,-34,1269,-38,1279,22,1286,3,1276,18,1229,9,1251,16,1237,2,1211,4,1209,-14,1233,-6,1215,-19,1223,-35,1232,-53,1215,-46,1210,-26,1204,-55,1195,-35,1193,-14,1200,6,1217,10,1203,-103,1213,-85,1229,-81,1213,-89,1183,-84,1167,-90,1085,-64,1105,-69,1126,-69,1145,-78,1126,-84,1106,-81,1087,-76,1065,-74,1073,-60,1044,-11,1056,-24,1059,-43,1047,-59,1026,-42,1014,-28,1001,-7,990,10,977,25,964,39,953,55,975,52,991,36,1006,21,1025,14,1038,1,-686,-526,-665,-545,-686,-549,-576,-302,-581,-320,-584,-339,-572,-353,-568,-369,-577,-382,-612,-389,-623,-402,-638,-412,-644,-429,-653,-445,-673,-456,-666,-470,-672,-487,-687,-503,-682,-524,-719,-520,-730,-507,-726,-489,-719,-469,-717,-450,-722,-423,-717,-398,-711,-376,-704,-360,-698,-342,-705,-314,-700,-294,-690,-275,-684,-245,-670,-230,-650,-221,-628,-220,-608,-239,-588,-248,-586,-271,-565,-275,-548,-266,-563,-289,-670,-549,-686,-556,-710,-551,-733,-540,-747,-528,-724,-537,-706,-536,-693,-525,-696,-176,-684,-194,-682,-215,-671,-227,-684,-262,-697,-285,-699,-303,-701,-331,-704,-352,-711,-367,-708,-386,-719,-408,-719,-434,-716,-456,-724,-477,-734,-493,-723,-507,-695,-521,-710,-538,-737,-528,-753,-516,-756,-487,-741,-469,-744,-441,-727,-424,-743,-432,-737,-399,-735,-383,-726,-355,-719,-339,-717,-309,-715,-289,-707,-257,-704,-236,-701,-214,-702,-198,-699,-181,293,-45,296,-65,307,-83,290,-84,285,-108,293,-124,274,-121,258,-118,243,-110,224,-110,218,-89,217,-73,201,-69,185,-78,169,-72,134,-59,152,-43,160,-27,169,-12,178,3,181,24,185,42,203,47,224,40,244,51,264,52,280,44,297,46,308,23,299,6,296,-13,293,-33,416,-17,410,28,421,42,437,50,478,80,489,95,489,114,507,120,508,103,501,81,486,53,466,29,441,11,420,-9,378,-37,341,-11,347,12,346,31,346,48,369,44,384,36,408,43,410,-9,406,-25,396,-43,246,82,236,97,229,111,223,126,223,143,239,156,238,196,250,220,290,220,329,220,369,220,371,198,379,184,369,170,363,148,359,126,348,113,340,96,331,114,314,98,296,101,280,94,260,101,245,89,219,126,210,95,191,91,180,79,163,78,150,88,149,109,145,129,135,144,152,166,157,200,149,229,198,215,-717,197,-717,180,-735,182,-732,199,-700,196,-683,186,-700,184,-714,176,938,810,959,813,979,807,1002,798,978,788,950,790,933,794,912,803,1028,793,1054,787,994,779,1013,792,1388,761,1415,761,1451,756,1406,748,1390,746,1370,753,1482,753,1507,751,1480,748,1461,752,1399,734,1421,739,1436,732,1400,733,448,806,468,808,485,805,515,807,498,804,476,800,227,543,209,543,228,549,535,738,559,746,579,756,612,763,645,764,662,768,682,769,646,757,616,753,585,743,570,733,554,724,575,707,537,708,516,715,544,736,1429,537,1432,518,1447,490,1426,479,1435,461,1419,468,1419,489,1422,510,1417,533,1308,422,1313,441,1331,451,1341,472,1325,478,1306,487,1277,498,1269,514,1259,528,1236,535,1210,533,1202,516,1193,501,1167,499,1150,501,1129,495,1107,491,1085,493,1069,503,1046,503,1023,505,1009,515,989,520,982,504,958,500,941,505,922,508,888,495,868,498,851,501,834,511,806,514,778,534,744,535,722,544,691,554,657,546,614,540,609,524,523,517,487,506,468,494,473,477,486,466,467,446,475,430,486,418,467,418,445,427,424,432,401,436,375,447,382,462,388,478,401,493,386,499,366,502,350,512,338,523,322,521,317,538,309,556,292,559,279,568,274,587,291,600,302,618,315,629,300,636,302,658,291,669,286,691,311,696,338,693,365,691,403,679,400,663,384,660,339,668,349,654,362,641,396,645,421,665,440,661,442,680,463,682,479,669,502,680,537,689,554,684,573,685,599,683,606,699,635,695,685,681,669,695,685,719,699,730,726,728,725,711,726,690,713,663,739,668,745,683,744,706,747,728,753,713,776,723,797,723,815,717,805,736,822,739,847,738,868,739,883,751,903,756,929,758,959,761,989,764,1008,764,1044,777,1061,774,1082,767,1111,767,1133,762,1102,745,1121,738,1140,736,1156,738,1188,736,1232,730,1254,736,1286,730,1297,712,1313,708,1339,714,1356,717,1375,713,1399,715,1495,722,1530,708,1570,710,1590,709,1609,694,1641,697,1659,695,1678,696,1696,687,1705,701,1736,698,1757,699,1786,694,-1800,690,-1775,682,-1749,672,-1719,669,-1699,660,-1725,654,-1739,643,-1760,649,-1784,654,-1799,659,1800,650,1774,646,1789,633,1774,625,1746,618,1721,609,1703,599,1663,598,1635,599,1620,582,1631,562,1617,553,1604,543,1585,530,1568,510,1560,532,1554,554,1568,574,1584,581,1601,593,1619,603,1637,611,1645,626,1627,616,1601,605,1567,614,1542,598,1528,589,1513,595,1485,592,1455,593,1422,590,1390,571,1351,547,1372,540,1388,543,1413,531,1406,512,1401,484,1386,470,1369,451,1355,440,1335,428,1309,426,-1800,715,-1776,713,-1800,708,1789,708,334,460,350,457,339,444,325,453,-790,268,-778,270,-782,252,-612,-518,-592,-515,-607,-523,151,797,170,801,215,790,190,786,176,776,159,768,138,774,112,789,132,800,294,692,277,702,257,691,237,689,212,694,199,684,180,686,161,673,136,648,119,631,126,613,115,594,84,583,57,586,50,620,86,635,105,645,124,659,148,678,164,686,192,698,214,703,230,702,245,710,264,710,282,712,313,705,274,801,230,794,201,796,185,799,205,806,229,807,254,804,247,779,225,774,207,777,229,785,-468,826,-434,832,-399,832,-351,836,-271,835,-208,827,-227,823,-265,823,-319,822,-279,821,-248,818,-229,821,-206,815,-158,819,-128,817,-163,806,-200,802,-177,801,-197,788,-185,770,-217,766,-198,761,-194,743,-216,742,-236,733,-223,722,-243,726,-221,715,-235,705,-255,714,-237,702,-277,685,-307,681,-328,677,-342,667,-364,660,-384,657,-407,648,-428,627,-429,611,-448,600,-463,609,-483,609,-499,624,-516,636,-523,652,-537,661,-530,684,-511,691,-535,693,-548,703,-514,706,-531,712,-550,714,-561,737,-573,747,-613,761,-634,762,-661,761,-685,761,-714,770,-688,773,-668,774,-710,776,-733,780,-694,789,-657,794,-680,801,-637,812,-603,820,-572,822,-541,822,-504,824,-480,821,-445,817,-469,822,689,-486,705,-491,687,-498,1266,-84,1251,-94,163,-286,185,-290,199,-248,207,-265,226,-260,242,-257,258,-252,271,-236,294,-221,312,-223,319,-244,310,-257,319,-272,322,-288,309,-299,289,-322,275,-332,259,-337,236,-338,215,-343,196,-348,182,-339,182,-317,171,-299,290,-290,270,-299,288,-301,281,-305,281,-289,-1171,325,-1147,327,-1090,313,-1065,318,-1050,306,-1039,293,-1005,287,-993,268,-975,258,-978,229,-972,206,-959,188,-944,181,-928,185,-908,193,-903,210,-885,215,-868,213,-876,196,-888,179,-910,178,-905,161,-922,153,-939,159,-961,158,-980,161,-997,167,-1017,176,-1035,183,-1050,193,-1053,211,-1060,228,-1079,245,-1093,256,-1104,272,-1118,285,-1128,300,-1139,316,-1147,302,-1134,288,-1125,275,-1113,257,-1102,243,-1122,247,-1128,263,-1145,271,-1149,293,-1163,308,-560,-309,-538,-320,-534,-338,-549,-350,-571,-344,-584,-333,-579,-310,-556,-309,-545,-275,-536,-261,-543,-246,-556,-227,-579,-221,-582,-202,-575,-182,-582,-163,-602,-163,-603,-146,-617,-135,-632,-126,-654,-116,-653,-98,-672,-103,-688,-110,-705,-110,-722,-101,-736,-84,-731,-66,-717,-46,-699,-43,-694,-16,-700,5,-679,17,-663,7,-646,13,-634,24,-644,38,-621,42,-606,49,-600,28,-590,13,-573,19,-556,24,-538,24,-522,32,-505,19,-507,2,-486,-2,-466,-9,-449,-16,-434,-24,-415,-29,-385,-37,-372,-48,-356,-51,-349,-67,-351,-90,-370,-110,-384,-130,-389,-157,-393,-179,-398,-196,-408,-209,-418,-224,-446,-234,-465,-241,-485,-259,-487,-282,-507,-310,-523,-322,-695,-110,-579,-200,-600,-193,-618,-196,-627,-222,-644,-228,-663,-218,-678,-229,-688,-204,-691,-183,-690,-165,-689,-145,-687,-126,-730,-57,-737,-73,-730,-90,-713,-101,-715,-174,-734,-164,-752,-153,-764,-138,-771,-122,-781,-104,-790,-84,-805,-65,-814,-47,-803,-34,-792,-50,-778,-30,-755,-16,-737,-13,-723,-24,-700,-27,-669,13,-698,17,-700,-2,-708,-23,-731,-23,-741,-10,-758,1,-774,4,-789,14,-779,27,-773,47,-775,67,-775,85,-761,93,-749,111,-726,117,-730,97,-724,80,-707,71,-694,61,-677,63,-678,45,-678,28,-774,87,-791,90,-805,81,-821,82,-805,91,-785,94,-825,96,-843,95,-858,101,-844,110,-830,100,-837,109,-856,112,-872,125,-861,140,-844,146,-836,131,-839,114,-831,150,-848,148,-863,138,-881,140,-882,157,-864,158,-845,159,-894,144,-877,138,-898,135,-922,145,-917,161,-891,178,-892,159,-895,142,-912,139,-886,163,-607,52,-639,40,-672,22,-676,38,-675,56,-690,62,-724,74,-728,91,-726,108,-717,91,-714,110,-699,122,-682,109,-662,106,-643,104,-619,107,-608,94,-606,78,-611,62,-565,19,-581,15,-597,22,-595,40,-605,69,-598,84,-585,73,-571,60,-580,41,-545,23,-573,33,-579,48,-559,58,-540,58,-544,42,-517,42,-526,25,-518,46,62,495,81,490,72,474,60,463,70,443,46,434,30,425,7,428,-15,430,-12,460,-30,476,-46,487,-16,486,13,501,31,508,48,500,87,426,-754,-2,-766,-26,-785,-39,-800,-43,-798,-27,-809,-11,-800,4,-779,8,-763,4,-663,185,-776,185,-823,232,-806,231,-783,225,-765,212,-749,207,-778,199,-787,216,-805,220,-822,224,-839,222,-825,231,277,-209,262,-193,253,-177,270,-179,285,-165,303,-155,319,-163,328,-180,328,-197,259,-247,209,-268,202,-249,199,-218,209,-183,232,-179,251,-177,277,-205,199,-285,178,-289,156,-278,150,-261,144,-239,143,-221,128,-197,118,-181,135,-170,183,-173,214,-179,232,-175,251,-176,236,-183,217,-182,209,-218,-167,136,-167,156,-151,166,-134,160,-122,146,-115,128,-132,126,-155,126,-138,135,-156,136,-115,124,-121,140,-113,154,-97,153,-55,155,-60,206,-65,250,-15,228,18,206,31,197,43,169,27,154,10,150,-11,150,-30,138,-44,125,-55,110,-68,101,-84,109,-93,123,-110,122,-171,210,-129,233,-49,250,-55,163,-95,155,-161,181,-163,201,27,63,17,91,8,105,19,116,36,117,37,101,27,85,155,210,153,179,140,157,140,140,123,130,107,132,90,128,73,131,54,139,40,130,25,122,10,133,4,149,43,192,86,216,120,235,136,230,27,79,32,94,36,113,140,125,136,108,128,87,118,74,101,70,88,55,75,44,54,49,43,63,140,95,151,84,148,64,145,47,154,33,159,17,143,22,124,22,96,23,89,39,92,64,111,66,122,83,132,96,144,116,9,110,15,93,16,68,7,83,4,102,0,110,5,87,6,69,-5,53,-29,50,-30,74,-28,96,-12,110,-80,102,-62,105,-43,96,-26,82,-32,63,-46,52,-65,47,-80,61,-84,77,-81,94,-137,126,-117,124,-99,121,-84,114,-83,98,-82,81,-100,84,-111,100,-127,93,-143,100,-141,117,-167,124,-151,110,-166,122,-77,44,-99,56,-114,68,-102,84,-89,73,-132,89,-119,100,-107,90,-111,74,-129,78,-54,104,-31,135,4,140,22,126,12,111,-4,111,-29,110,274,52,257,53,233,46,217,42,195,50,185,35,165,32,150,39,145,55,153,74,222,110,258,70,272,56,179,17,177,-1,164,-17,160,-35,146,-50,126,-44,115,-28,131,-24,144,-13,143,12,131,23,151,20,113,23,130,23,143,-6,140,-25,118,-25,111,-40,94,-21,90,-5,98,11,328,-92,333,-108,333,-124,302,-148,289,-160,276,-173,219,-161,219,-129,240,-129,240,-112,289,-132,284,-92,303,-82,343,-102,343,-123,353,-139,358,-159,345,-146,327,-137,331,-116,332,-97,365,-117,403,-103,406,-126,408,-147,395,-167,374,-176,359,-188,347,-205,354,-221,355,-241,330,-254,321,-267,325,-204,327,-187,328,-167,312,-159,332,-140,345,-150,350,-168,357,-146,130,-48,123,-61,163,-59,171,-75,190,-80,206,-69,219,-83,222,-99,239,-109,239,-126,190,-178,142,-174,122,-171,121,-149,127,-131,137,-113,131,-98,129,-76,305,-24,301,-41,290,-28,357,327,354,311,349,295,343,312,350,328,358,333,495,-125,502,-148,499,-165,490,-191,479,-224,471,-249,454,-256,438,-245,433,-228,439,-212,445,-194,440,-174,455,-160,477,-146,488,-131,354,315,-151,139,-168,132,95,303,91,321,76,333,84,355,95,374,111,369,108,348,115,331,106,318,-87,274,-71,296,-52,300,-37,309,-26,321,-17,339,-12,357,5,363,32,368,48,369,73,371,75,341,84,327,97,281,97,265,103,244,57,196,32,191,355,324,388,334,370,315,367,299,350,294,516,242,534,242,554,254,555,235,520,230,508,248,480,300,466,291,392,322,410,344,413,364,428,374,448,372,461,357,454,340,473,325,480,310,447,292,419,312,404,319,552,227,560,241,581,237,594,227,589,211,577,197,565,181,548,169,531,167,520,190,550,200,557,220,563,257,1672,-159,1668,-157,1026,122,1030,142,1052,143,1074,142,1075,123,1058,116,1043,105,1008,126,995,108,992,92,1005,74,1021,62,1003,66,990,79,986,99,996,119,991,138,989,162,979,176,983,197,1001,204,1010,184,1030,180,1047,174,1056,156,1048,164,1040,182,1021,181,1006,195,1012,214,1032,208,1048,199,1059,175,1073,159,984,146,992,128,990,110,985,131,978,148,972,169,954,157,945,173,935,194,924,207,932,223,933,241,946,252,964,273,979,283,987,267,977,251,989,231,1000,217,1062,110,1039,193,1022,225,1045,228,1067,228,1080,216,1059,198,1064,180,1074,167,1089,153,1093,134,1092,117,1072,104,1052,86,1306,424,1297,409,1280,400,1282,384,1267,378,1250,379,1253,396,1262,411,1282,415,1296,424,1262,377,1278,383,1292,374,1295,356,1274,345,1261,367,878,493,907,503,931,505,948,500,973,497,1144,502,1155,481,1173,477,1198,470,1174,467,1160,457,1135,448,1119,451,1111,434,1092,425,1061,421,1045,419,1018,425,995,425,975,427,958,433,935,450,909,453,910,469,889,481,973,283,951,266,946,247,933,230,912,235,924,250,899,253,886,264,883,249,889,229,870,215,851,195,839,183,822,170,808,160,802,138,799,121,799,104,783,89,766,89,757,113,749,127,744,146,735,160,731,179,728,204,712,208,692,221,682,237,710,244,702,265,718,279,734,300,744,317,741,334,758,345,778,355,788,335,787,315,811,302,801,288,820,279,847,272,872,264,881,279,897,267,920,268,934,286,954,290,927,220,905,228,890,221,885,236,889,252,909,251,917,278,900,283,853,267,833,274,811,284,833,295,850,286,870,280,737,343,745,328,744,310,728,290,706,280,703,257,688,244,671,247,645,252,629,252,632,272,618,287,635,295,663,299,677,313,693,319,703,334,716,352,729,367,746,370,762,359,665,374,681,370,701,376,718,367,733,375,750,374,713,361,712,343,697,331,689,316,669,313,650,295,625,293,609,298,617,314,605,330,612,356,630,354,645,363,657,377,682,389,693,407,710,402,695,395,718,393,737,394,748,380,713,383,695,376,710,423,735,425,756,429,777,430,796,425,782,412,765,404,748,404,731,409,712,411,555,413,571,413,647,371,632,359,592,374,573,380,555,380,539,372,539,390,527,400,547,410,529,419,486,299,478,317,461,330,457,347,441,394,461,387,477,395,489,383,508,369,538,370,611,365,608,344,609,322,618,307,628,274,615,251,596,254,574,257,565,271,547,265,525,276,509,288,496,300,366,342,361,358,382,369,407,371,423,372,414,356,368,323,465,388,450,397,438,407,456,408,465,395,110,589,123,601,120,618,126,641,151,662,168,680,220,686,235,679,239,660,222,657,198,636,178,627,178,606,179,590,164,570,147,562,129,554,118,574,282,562,299,558,314,542,318,521,302,514,282,516,263,518,246,519,235,535,255,543,265,556,368,467,350,463,333,461,317,467,296,453,296,469,283,482,266,482,249,477,231,481,234,503,235,539,235,520,239,504,225,495,209,493,189,494,176,504,155,508,144,526,164,545,186,547,170,481,160,467,138,465,122,471,104,469,121,477,136,489,153,490,170,486,221,484,210,463,188,459,169,464,187,479,202,483,219,483,285,456,276,474,282,455,286,437,261,439,241,437,225,444,209,454,216,470,281,468,223,550,211,560,239,563,255,561,273,575,271,558,222,563,241,570,256,578,280,595,277,578,234,586,259,596,141,538,147,521,133,507,105,476,85,478,67,492,62,508,71,531,88,540,109,544,136,541,227,442,256,437,272,442,277,426,261,418,245,416,229,420,225,436,263,353,247,349,230,413,252,412,239,400,240,382,232,364,213,376,202,393,210,408,226,411,387,367,371,366,347,368,325,361,306,367,287,367,270,377,262,395,288,405,311,411,335,420,352,420,369,413,395,411,416,415,436,411,448,397,442,380,280,420,264,402,194,403,194,419,166,465,185,458,165,452,173,434,152,442,137,451,153,455,96,475,90,460,73,458,67,475,60,501,43,499,27,508,50,515,69,535,66,519,33,513,47,531,-90,419,-74,418,-70,402,-74,384,-79,368,-88,383,-90,402,-75,371,-71,390,-69,411,-83,423,-68,436,-43,434,-19,434,3,426,8,410,-3,393,-7,376,-21,367,-44,367,-59,360,-62,539,-68,523,-86,517,-97,539,-76,551,1658,-211,1671,-222,1655,-217,1642,-204,1621,-105,1617,-96,1606,-83,1609,-99,1596,-80,1571,-70,1769,-401,1752,-417,1749,-399,1747,-380,1738,-361,1726,-345,1743,-353,1753,-372,1774,-380,1770,-399,1697,-436,1711,-425,1721,-410,1740,-409,1732,-430,1715,-442,1706,-459,1684,-466,1667,-462,1683,-441,1477,-408,1480,-424,1469,-436,1454,-427,1447,-412,1464,-411,1261,-322,1242,-330,1228,-339,1206,-339,1190,-345,1173,-350,1156,-344,1158,-322,1152,-306,1146,-288,1135,-265,1136,-247,1138,-231,1155,-215,1172,-206,1188,-203,1209,-197,1222,-182,1230,-164,1244,-156,1257,-145,1278,-143,1296,-150,1303,-134,1317,-123,1336,-118,1353,-122,1370,-124,1361,-137,1363,-156,1383,-168,1402,-177,1413,-164,1416,-146,1417,-129,1421,-113,1435,-128,1439,-145,1453,-154,1459,-169,1464,-190,1482,-200,1493,-213,1505,-226,1516,-241,1529,-253,1531,-273,1535,-290,1531,-309,1524,-326,1513,-338,1503,-357,1500,-374,1483,-378,1463,-390,1450,-379,1436,-388,1416,-383,1400,-374,1391,-357,1382,-344,1368,-353,1379,-336,1360,-349,1346,-332,1330,-320,1313,-315,1295,-316,1271,-323,818,75,803,60,797,82,801,98,813,86,1095,182,1091,198,1108,201,803,424,819,453,852,470,866,485,953,442,963,427,1077,425,1104,429,1118,437,1197,467,1181,481,1163,479,1294,494,1310,478,1334,482,1350,485,1338,461,1319,453,1311,429,1281,420,1243,399,1221,392,1216,409,1196,399,1180,392,1189,374,1208,379,1225,369,1206,361,1192,349,1206,334,1219,317,1215,301,1217,282,1204,271,1187,245,1173,236,1159,228,1142,222,1118,216,1104,203,1085,217,1066,222,1053,234,1035,227,1017,223,962,284,946,293,925,279,907,281,888,273,815,304,797,309,785,326,789,343,752,371,743,386,801,421,1218,244,1212,228,1207,245,123,454,135,436,151,420,168,412,184,404,165,398,161,380,157,395,141,408,121,417,105,429,89,444,74,437,71,453,148,381,124,376,87,409,97,392,84,404,99,550,81,555,85,571,106,577,107,561,124,561,-57,546,-31,534,-48,548,-56,563,-50,586,-30,586,-22,569,-11,546,2,533,17,527,5,508,-25,505,-45,503,-53,520,-46,535,-145,665,-136,651,-178,637,-200,636,-228,640,-243,656,-221,664,-206,657,-191,663,-162,665,464,419,480,414,496,406,489,388,454,406,400,434,439,426,458,421,409,430,1208,127,1226,100,1241,112,1233,93,1264,84,1262,63,1242,62,1236,78,1221,69,1229,83,1246,85,1262,93,1185,93,1172,84,1184,97,1195,114,1223,182,1223,163,1217,143,1240,138,1220,138,1207,148,1199,164,1207,185,1220,114,1255,122,1253,104,1243,126,1001,65,1018,58,1034,49,1035,28,1042,13,1026,20,1013,33,1006,48,1159,43,1151,28,1138,12,1118,9,1098,13,1114,27,1130,31,1142,45,1162,61,1183,57,1155,54,1147,40,149,455,300,677,304,642,281,605,263,604,245,601,229,598,213,607,211,626,224,638,247,649,236,664,226,491,208,486,192,481,175,479,184,493,204,494,150,511,167,502,184,500,171,488,124,500,141,509,364,144,368,163,379,174,393,159,412,145,426,130,412,138,393,145,376,142,1419,392,1410,371,1403,351,1372,346,1358,335,1333,344,1310,339,1313,315,1298,326,1309,342,1326,354,1346,357,1367,373,1389,378,1401,394,1403,412,1419,400,1446,440,1432,420,1416,427,1400,416,1403,433,1417,448,1439,442,1324,335,1339,344,1330,327,-558,-224,-554,-240,-546,-257,-557,-274,-576,-274,-576,-256,-600,-240,-623,-205,-582,-199,528,173,522,156,496,147,479,140,459,133,442,126,431,141,427,157,434,176,452,174,470,169,482,182,390,320,484,286,495,271,502,256,550,225,491,186,475,171,454,173,438,173,418,178,409,195,391,213,385,237,372,249,363,266,351,281,327,351,346,357,329,351,-22,352,-14,329,-31,317,-49,305,-87,288,-88,271,-105,270,-120,260,-146,219,-170,214,-163,230,-154,244,-144,263,-131,276,-109,288,-96,299,-94,320,-77,337,-62,351,-46,353,-26,352,250,257,250,292,248,311,265,316,284,310,301,315,320,309,338,310,348,298,342,278,324,299,333,277,341,261,357,239,367,222,250,200,159,234,141,225,108,246,93,261,98,277,98,294,99,314,114,324,131,329,152,323,166,312,191,303,198,318,215,328,232,322,249,319,247,300,450,50,428,43,412,39,396,34,353,55,342,68,330,78,385,145,409,141,420,129,418,111,433,95,469,80,424,125,428,109,437,92,426,106,446,104,466,108,484,114,319,-10,298,-14,312,22,327,38,345,36,350,19,342,5,304,-11,296,-29,186,426,169,437,157,448,179,451,196,440,224,423,219,423,208,457,221,445,226,429,210,431,192,435,194,452,201,426,184,425,200,431,206,419,-617,108,308,35,292,44,262,65,251,78,248,98,265,96,290,94,308,97,324,111,338,100,338,84,340,43,319,36,323,-87,353,-87,383,-87,323,-57,353,-57,383,-57,323,-27,353,-27,-810,447,-780,447,-840,477,-810,477,-780,477,-750,477,-720,477,-690,477,-660,477,-1260,507,-1230,507,-1200,507,-1170,507,-1140,507,-1110,507,-1080,507,-1050,507,-1020,507,-990,507,-960,507,-930,507,-900,507,-870,507,-840,507,-810,507,-780,507,-750,507,-720,507,-690,507,-660,507,-630,507,-600,507,-1290,537,-1260,537,-1230,537,-1200,537,-1170,537,-1140,537,-1110,537,-1080,537,-1050,537,-1020,537,-990,537,-960,537,-930,537,-900,537,-870,537,-840,537,-780,537,-750,537,-720,537,-690,537,-660,537,-630,537,-600,537,-570,537,-1290,567,-1260,567,-1230,567,-1200,567,-1170,567,-1140,567,-1110,567,-1080,567,-1050,567,-1020,567,-990,567,-960,567,-930,567,-900,567,-750,567,-720,567,-690,567,-660,567,-630,567,-1380,597,-1350,597,-1320,597,-1290,597,-1260,597,-1230,597,-1200,597,-1170,597,-1140,597,-1110,597,-1080,597,-1050,597,-1020,597,-990,597,-960,597,-750,597,-720,597,-1380,627,-1350,627,-1320,627,-1290,627,-1260,627,-1230,627,-1200,627,-1170,627,-1140,627,-1110,627,-1080,627,-1050,627,-1020,627,-990,627,-960,627,-930,627,-1380,657,-1350,657,-1320,657,-1290,657,-1260,657,-1230,657,-1200,657,-1170,657,-1140,657,-1110,657,-1080,657,-1050,657,-1020,657,-990,657,-960,657,-930,657,-900,657,-870,657,-1380,687,-1350,687,-1320,687,-1290,687,-1260,687,-1230,687,-1200,687,-1170,687,-930,687,-900,687,-840,687,-564,496,-782,649,-752,649,-722,649,-692,649,-722,679,-692,679,-662,679,-872,709,-842,709,-812,709,-782,709,-752,709,-722,709,-1229,739,-1199,739,-1169,739,-1164,715,-1134,715,-1104,715,-1074,715,-937,812,-826,792,-796,792,-766,792,-856,822,-826,822,-796,822,-766,822,-736,822,-706,822,-676,822,-646,822,-977,281,-827,281,-1037,311,-1007,311,-977,311,-947,311,-917,311,-887,311,-857,311,-827,311,-1187,341,-1157,341,-1127,341,-1097,341,-1067,341,-1037,341,-1007,341,-977,341,-947,341,-917,341,-887,341,-857,341,-827,341,-797,341,-1217,371,-1187,371,-1157,371,-1127,371,-1097,371,-1067,371,-1037,371,-1007,371,-977,371,-947,371,-917,371,-887,371,-857,371,-827,371,-797,371,-767,371,-1217,401,-1187,401,-1157,401,-1127,401,-1097,401,-1067,401,-1037,401,-1007,401,-977,401,-947,401,-917,401,-887,401,-857,401,-827,401,-797,401,-767,401,-1217,431,-1187,431,-1157,431,-1127,431,-1097,431,-1067,431,-1037,431,-1007,431,-977,431,-947,431,-917,431,-887,431,-857,431,-827,431,-767,431,-737,431,-707,431,-1217,461,-1187,461,-1157,461,-1127,461,-1097,461,-1067,461,-1037,461,-1007,461,-977,461,-947,461,-917,461,-887,461,-857,461,-1621,604,-1591,604,-1561,604,-1531,604,-1501,604,-1441,604,-1411,604,-1621,634,-1591,634,-1561,634,-1531,634,-1501,634,-1471,634,-1441,634,-1411,634,-1651,664,-1591,664,-1561,664,-1531,664,-1501,664,-1471,664,-1441,664,-1411,664,-1621,694,-1591,694,-1561,694,-1531,694,-1501,694,-1471,694,-1441,694,-1411,694,525,437,555,437,675,437,705,437,735,437,765,437,795,437,495,467,555,467,585,467,615,467,645,467,675,467,705,467,735,467,765,467,795,467,825,467,495,497,525,497,555,497,585,497,615,497,645,497,675,497,705,497,735,497,765,497,795,497,825,497,615,527,645,527,675,527,705,527,735,527,765,527,649,401,679,401,589,431,619,431,649,431,1440,-77,1470,-77,1440,-47,1395,-61,1335,-31,1365,-31,1395,-31,1120,-11,1150,-11,1150,19,1218,-27,1043,-29,1013,1,983,31,-704,-494,-704,-464,-704,-434,-674,-434,-704,-404,-674,-404,-644,-404,-704,-374,-674,-374,-644,-374,-614,-374,-584,-374,-674,-344,-644,-344,-614,-344,-704,-314,-674,-314,-644,-314,-614,-314,-584,-314,-674,-284,-644,-284,-614,-284,-584,-284,-674,-254,-644,-254,-614,-254,-584,-254,-726,-509,-726,-479,-726,-449,-726,-419,-726,-389,-726,-359,-696,-269,-696,-239,-696,-209,-696,-179,242,-103,272,-103,182,-73,212,-73,242,-73,272,-73,302,-73,182,-43,212,-43,242,-43,272,-43,182,-13,212,-13,242,-13,272,-13,182,17,212,17,242,17,272,17,302,17,242,47,272,47,440,13,440,43,470,43,500,103,369,-17,399,-17,369,13,399,13,369,43,249,112,279,112,309,112,339,112,249,142,279,142,309,142,339,142,249,172,279,172,309,172,339,172,369,172,279,202,309,202,339,202,369,202,165,104,195,104,165,134,195,134,165,164,195,164,225,164,165,194,195,194,225,194,165,224,545,736,665,766,390,442,420,442,450,442,1320,442,1350,442,420,472,450,472,480,472,1350,472,1380,472,390,502,420,502,450,502,870,502,900,502,960,502,1080,502,1110,502,1140,502,1170,502,1290,502,1320,502,1350,502,1380,502,330,532,360,532,390,532,420,532,450,532,480,532,510,532,540,532,570,532,600,532,810,532,840,532,870,532,900,532,930,532,960,532,990,532,1020,532,1050,532,1080,532,1110,532,1140,532,1170,532,1200,532,1260,532,1290,532,1320,532,1350,532,1380,532,1410,532,1590,532,300,562,330,562,360,562,390,562,420,562,450,562,480,562,510,562,540,562,570,562,600,562,630,562,660,562,690,562,720,562,750,562,780,562,810,562,840,562,870,562,900,562,930,562,960,562,990,562,1020,562,1050,562,1080,562,1110,562,1140,562,1170,562,1200,562,1230,562,1260,562,1290,562,1320,562,1350,562,1560,562,1590,562,1620,562,300,592,330,592,360,592,390,592,420,592,450,592,480,592,510,592,540,592,570,592,600,592,630,592,660,592,690,592,720,592,750,592,780,592,810,592,840,592,870,592,900,592,930,592,960,592,990,592,1020,592,1050,592,1080,592,1110,592,1140,592,1170,592,1200,592,1230,592,1260,592,1290,592,1320,592,1350,592,1380,592,1410,592,1530,592,1620,592,330,622,360,622,390,622,420,622,450,622,480,622,510,622,540,622,570,622,600,622,630,622,660,622,690,622,720,622,750,622,780,622,810,622,840,622,870,622,900,622,930,622,960,622,990,622,1020,622,1050,622,1080,622,1110,622,1140,622,1170,622,1200,622,1230,622,1260,622,1290,622,1320,622,1350,622,1380,622,1410,622,1440,622,1470,622,1500,622,1530,622,1560,622,1590,622,1620,622,1650,622,1680,622,1710,622,1740,622,-1770,652,-1710,652,-1680,652,-1650,652,-1620,652,-1590,652,-1560,652,-1530,652,-1500,652,-1470,652,-1440,652,-1410,652,-1380,652,-1350,652,-1320,652,-1290,652,-1260,652,-1230,652,-1200,652,-1170,652,-1140,652,-1110,652,-1080,652,-1050,652,-1020,652,-990,652,-960,652,-930,652,-900,652,-840,652,-810,652,-780,652,-750,652,-720,652,-690,652,-660,652,-630,652,-600,652,-570,652,-540,652,-510,652,-480,652,-450,652,-420,652,-390,652,-360,652,-330,652,-300,652,-270,652,-240,652,-210,652,-180,652,-150,652,-120,652,-90,652,-60,652,-30,652,0,652,30,652,60,652,90,652,120,652,150,652,180,652,210,652,240,652,270,652,360,652,390,652,-1770,682,-1740,682,-1710,682,-1680,682,-1650,682,-1620,682,-1590,682,-1560,682,-1530,682,-1500,682,-1470,682,-1440,682,-1410,682,-1380,682,-1350,682,-1320,682,-1290,682,-1260,682,-1230,682,-1200,682,-1170,682,-1140,682,-1110,682,-1080,682,-1050,682,-1020,682,-990,682,-960,682,-930,682,-900,682,-870,682,-840,682,-810,682,-780,682,-750,682,-720,682,-690,682,-660,682,-630,682,-600,682,-570,682,-540,682,-510,682,-480,682,-450,682,-420,682,-390,682,-360,682,-330,682,-300,682,-270,682,-240,682,-210,682,-180,682,-150,682,-120,682,-90,682,-60,682,-30,682,0,682,30,682,60,682,90,682,120,682,150,682,180,682,210,682,240,682,270,682,420,682,480,682,690,712,720,712,750,712,780,712,810,712,840,712,870,712,900,712,930,712,960,712,990,712,1020,712,1050,712,1080,712,1110,712,1140,712,1170,712,1200,712,1230,712,1260,712,1290,712,1320,712,1350,712,1380,712,1410,712,1440,712,1470,712,1500,712,870,742,900,742,930,742,960,742,990,742,1020,742,1050,742,1080,742,1020,772,134,798,164,798,80,611,110,611,110,641,140,671,230,701,260,701,290,701,-493,630,-463,630,-433,630,-523,660,-493,660,-463,660,-433,660,-403,660,-373,660,-493,690,-463,690,-433,690,-403,690,-373,690,-343,690,-313,690,-283,690,-553,720,-523,720,-493,720,-463,720,-433,720,-403,720,-373,720,-343,720,-313,720,-283,720,-253,720,-583,750,-553,750,-523,750,-493,750,-463,750,-433,750,-403,750,-373,750,-343,750,-313,750,-283,750,-253,750,-223,750,-703,780,-673,780,-643,780,-613,780,-583,780,-553,780,-523,780,-493,780,-463,780,-433,780,-403,780,-373,780,-343,780,-313,780,-283,780,-253,780,-223,780,-643,810,-613,810,-583,810,-553,810,-523,810,-493,810,-463,810,-433,810,-403,810,-373,810,-343,810,-313,810,-283,810,-253,810,-223,810,-193,810,-163,810,193,-318,223,-318,253,-318,283,-318,193,-288,223,-288,253,-288,283,-288,313,-288,253,-258,283,-258,283,-228,313,-228,-991,175,-961,175,-931,175,-1051,205,-1021,205,-991,205,-901,205,-871,205,-1051,235,-1021,235,-991,235,-1081,265,-1051,265,-1021,265,-991,265,-1141,295,-1111,295,-1081,295,-1051,295,-1021,295,-554,-320,-560,-308,-530,-308,-530,-278,-500,-278,-530,-248,-500,-248,-560,-218,-530,-218,-500,-218,-470,-218,-440,-218,-410,-218,-560,-188,-530,-188,-500,-188,-470,-188,-440,-188,-410,-188,-590,-158,-560,-158,-530,-158,-500,-158,-470,-158,-440,-158,-410,-158,-620,-128,-590,-128,-560,-128,-530,-128,-500,-128,-470,-128,-440,-128,-410,-128,-710,-98,-680,-98,-650,-98,-620,-98,-590,-98,-560,-98,-530,-98,-500,-98,-470,-98,-440,-98,-410,-98,-380,-98,-710,-68,-680,-68,-650,-68,-620,-68,-590,-68,-560,-68,-530,-68,-500,-68,-470,-68,-440,-68,-410,-68,-380,-68,-350,-68,-680,-38,-650,-38,-620,-38,-590,-38,-560,-38,-530,-38,-500,-38,-470,-38,-440,-38,-410,-38,-680,-8,-650,-8,-620,-8,-590,-8,-560,-8,-530,-8,-500,-8,-620,22,-560,22,-666,-199,-636,-199,-666,-169,-636,-169,-606,-169,-666,-139,-636,-139,-606,-139,-666,-109,-724,-153,-694,-153,-754,-123,-724,-123,-694,-123,-784,-93,-754,-93,-784,-63,-754,-63,-754,-33,-724,-33,-730,-13,-700,-13,-760,17,-730,17,-700,17,-760,47,-730,47,-700,47,-760,77,-730,77,-730,107,-847,137,-892,167,-673,37,-673,67,-643,67,-613,67,-703,97,-673,97,-643,97,-584,43,-550,48,14,453,44,453,-16,483,14,483,44,483,74,483,-780,-20,-820,229,283,-193,313,-193,313,-163,199,-238,229,-238,259,-238,229,-208,259,-208,177,-260,147,-230,177,-230,147,-200,177,-200,207,-200,-146,153,-92,131,-62,131,-32,161,-2,161,28,161,-32,191,-2,191,28,191,-32,221,-141,176,-111,176,-81,176,-141,206,-111,206,-81,206,-111,236,-81,236,-81,266,33,147,63,147,93,147,123,147,63,177,93,177,123,177,93,207,123,207,153,207,57,72,87,72,117,72,57,102,87,102,117,102,57,132,117,132,115,47,145,77,145,107,-2,77,-2,107,-56,73,-121,103,-91,103,-25,126,5,126,175,53,205,53,235,53,265,53,205,83,235,83,171,10,118,-10,118,20,249,-150,279,-150,249,-120,309,-120,309,-90,332,-237,332,-207,332,-177,362,-177,332,-147,362,-147,392,-147,362,-117,392,-117,146,-149,176,-149,206,-149,146,-119,176,-119,206,-119,236,-119,146,-89,176,-89,206,-89,146,-59,463,-226,463,-196,463,-166,493,-166,493,-136,105,333,105,363,3,221,33,221,63,221,93,221,-27,251,3,251,33,251,63,251,93,251,-57,281,-27,281,3,281,33,281,63,281,93,281,-27,311,3,311,33,311,63,311,3,341,33,341,63,341,63,371,379,322,418,321,448,321,418,351,448,351,550,197,580,227,1053,135,1004,147,1034,147,1004,177,1034,177,1061,169,1031,199,953,159,983,159,953,189,953,219,983,219,953,249,1082,116,1082,146,1052,206,1273,407,1291,374,968,446,998,446,1028,446,1058,446,1088,446,908,476,938,476,968,476,998,476,1028,476,1058,476,1088,476,1118,476,1148,476,1178,476,998,506,772,110,772,140,802,140,742,170,772,170,802,170,742,200,772,200,802,200,832,200,712,230,742,230,772,230,802,230,832,230,862,230,712,260,742,260,772,260,802,260,832,260,862,260,922,260,742,290,772,290,952,290,772,320,911,237,831,294,639,267,669,267,699,267,669,297,699,297,729,297,699,327,729,327,729,357,759,357,635,323,665,323,635,353,665,353,695,353,725,423,755,423,785,423,555,383,585,383,615,383,645,383,585,413,531,281,561,281,591,281,621,281,501,311,531,311,561,311,591,311,471,341,501,341,531,341,561,341,591,341,471,371,501,371,561,371,591,371,387,353,140,584,140,614,170,614,140,644,170,644,200,644,170,674,200,674,230,674,262,543,292,543,251,483,281,483,311,483,341,483,371,483,251,513,281,513,311,513,341,513,171,520,201,520,231,520,232,467,262,467,90,503,120,503,90,533,120,533,292,388,322,388,352,388,382,388,412,388,442,388,352,418,167,455,-64,389,-34,389,-4,389,-64,419,-34,419,-4,419,26,419,1756,-387,1695,-436,1725,-436,1403,-360,1433,-360,1463,-360,1493,-360,1163,-330,1193,-330,1223,-330,1373,-330,1403,-330,1433,-330,1463,-330,1493,-330,1163,-300,1193,-300,1223,-300,1253,-300,1283,-300,1313,-300,1343,-300,1373,-300,1403,-300,1433,-300,1463,-300,1493,-300,1523,-300,1163,-270,1193,-270,1223,-270,1253,-270,1283,-270,1313,-270,1343,-270,1373,-270,1403,-270,1433,-270,1463,-270,1493,-270,1523,-270,1163,-240,1193,-240,1223,-240,1253,-240,1283,-240,1313,-240,1343,-240,1373,-240,1403,-240,1433,-240,1463,-240,1493,-240,1163,-210,1193,-210,1223,-210,1253,-210,1283,-210,1313,-210,1343,-210,1373,-210,1403,-210,1433,-210,1463,-210,1223,-180,1253,-180,1283,-180,1313,-180,1343,-180,1373,-180,1403,-180,1433,-180,1253,-150,1283,-150,1313,-150,1343,-150,1433,-150,1343,-120,1007,233,1037,233,1067,233,1097,233,1127,233,1157,233,1007,263,1037,263,1067,263,1097,263,1127,263,1157,263,1187,263,857,293,887,293,917,293,947,293,977,293,1007,293,1037,293,1067,293,1097,293,1127,293,1157,293,1187,293,1217,293,797,323,827,323,857,323,887,323,917,323,947,323,977,323,1007,323,1037,323,1067,323,1097,323,1127,323,1157,323,1187,323,797,353,827,353,857,353,887,353,917,353,947,353,977,353,1007,353,1037,353,1067,353,1097,353,1127,353,1157,353,1187,353,767,383,797,383,827,383,857,383,887,383,917,383,947,383,977,383,1007,383,1037,383,1067,383,1097,383,1127,383,1157,383,797,413,827,413,857,413,887,413,917,413,947,413,977,413,1007,413,1037,413,1067,413,1097,413,1127,413,1157,413,1187,413,1217,413,1247,413,827,443,857,443,887,443,917,443,947,443,1127,443,1157,443,1187,443,1217,443,1247,443,1277,443,1307,443,857,473,887,473,1217,473,1247,473,1277,473,1307,473,1337,473,1217,503,1247,503,1217,533,157,409,127,439,-32,530,-2,530,-32,560,480,413,1249,86,1031,42,1157,38,236,628,266,628,296,628,266,658,296,658,236,688,266,688,393,155,1324,340,1354,340,1384,370,1414,400,1428,446,-567,-245,-597,-215,456,156,486,156,516,156,516,186,436,193,466,193,496,193,526,193,406,223,436,223,466,223,496,223,526,223,376,253,406,253,436,253,466,253,496,253,376,283,406,283,436,283,466,283,376,313,406,313,-140,244,-110,274,-80,304,-50,304,-80,334,-50,334,-20,334,277,220,307,220,337,220,367,220,277,250,307,250,337,250,277,280,307,280,337,280,277,310,307,310,183,226,213,226,243,226,123,256,153,256,183,256,213,256,243,256,123,286,153,286,183,286,213,286,243,286,123,316,153,316,213,316,243,316,360,64,390,64,420,64,450,64,360,94,390,94,420,94,360,124,390,124,420,124,486,110,326,16,269,65,299,65,329,65,269,95,299,95,329,95];

        let geoRotLon = 250, geoRotLat = 18, geoDragging = false, geoDragX = 0, geoDragY = 0, geoHoverNode = null;
        let geoAnimId = null, geoChinaChart = null, geoChinaLoaded = false, geoNodesCache = null;
        let geoWorldData = null, geoWorldLoading = false;
        function geoBuildNodes() {
            if (geoNodesCache) return geoNodesCache;
            const nodes = [];
            if (!geoData) return nodes;
            const total = geoData.countries.reduce((a, c) => a + (Number(c.count) || 0), 0);
            for (const c of geoData.countries) {
                const code = String(c.country || '').toUpperCase();
                if (code === 'CN') continue;
                const m = GEO_META[code];
                if (!m) continue;
                nodes.push({ lat: m.lat, lon: m.lon, count: Number(c.count) || 0, label: m.label, sub: m.label, kind: 'country', code: code });
            }
            const cnTotal = geoData.countries.reduce((a, c) => a + (String(c.country || '').toUpperCase() === 'CN' ? (Number(c.count) || 0) : 0), 0);
            if (cnTotal > 0) {
                const pTotal = geoData.provinces.reduce((a, c) => a + (Number(c.count) || 0), 0);
                for (const p of geoData.provinces) {
                    const pc = PROV_COORDS[p.region];
                    if (!pc) continue;
                    nodes.push({ lat: pc.lat, lon: pc.lon, count: Number(p.count) || 0, label: p.region, sub: p.region, kind: 'province', code: p.region });
                }
                if (cnTotal > pTotal) {
                    nodes.push({ lat: 34.5, lon: 108.9, count: cnTotal - pTotal, label: '中国', sub: '中国', kind: 'province', code: 'CN-unknown', unknown: cnTotal - pTotal });
                }
            }
            nodes.sort((a, b) => b.count - a.count);
            geoNodesCache = nodes;
            return nodes;
        }
        function geoFmtCount(n) { return n >= 10000 ? (n / 10000).toFixed(1) + 'w' : String(n); }
        async function loadVisitorGeo() {
            const box = document.getElementById('geoStage3d');
            if (!box) return;
            const sum = document.getElementById('geoSummary');
            try {
                const ac = new AbortController();
                const tm = setTimeout(function() { ac.abort(); }, 8000);
                const res = await fetch('/api/visitor-geo', { signal: ac.signal });
                clearTimeout(tm);
                const d = await res.json();
                if (!d.success) throw new Error(d.error || '接口错误');
                geoData = { countries: d.countries || [], provinces: d.provinces || [] };
                geoResolvedNew = 0;
                geoNodesCache = null;
                geoInitEvents();
                geoDraw();
                if (sum) sum.innerHTML = geoSummaryHtml();
            } catch (e) {
                if (sum) sum.textContent = '访问者分布加载失败: ' + e.message + (e.name === 'AbortError' ? '(解析超时,可稍后点「刷新解析」重试)' : '');
            }
        }
        function geoSummaryHtml() {
            if (!geoData) return '加载中...';
            const cnTotal = geoData.countries.reduce((a, c) => a + (String(c.country || '').toUpperCase() === 'CN' ? (Number(c.count) || 0) : 0), 0);
            const wTotal = geoData.countries.reduce((a, c) => a + (Number(c.count) || 0), 0);
            const provCount = geoData.provinces.length;
            return '共 ' + wTotal + ' 次访问 · ' + geoData.countries.length + ' 个国家/地区 · 国内 ' + cnTotal + ' 次 · 已解析省份 ' + provCount + ' 个<span style="opacity:.75"> · 国外按国家(Cloudflare 判定),国内省份在后台解析中,稍后点「刷新解析」查看</span>';
        }
        function geoSwitchMode(m) {
            geoMode = m;
            document.getElementById('geoMode3dBtn').style.background = m === '3d' ? 'var(--primary)' : 'rgba(120,120,120,.15)';
            document.getElementById('geoMode3dBtn').style.color = m === '3d' ? '#fff' : 'var(--text)';
            document.getElementById('geoModeWorldBtn').style.background = m === 'world' ? 'var(--primary)' : 'rgba(120,120,120,.15)';
            document.getElementById('geoModeWorldBtn').style.color = m === 'world' ? '#fff' : 'var(--text)';
            document.getElementById('geoModeChinaBtn').style.background = m === 'china' ? 'var(--primary)' : 'rgba(120,120,120,.15)';
            document.getElementById('geoModeChinaBtn').style.color = m === 'china' ? '#fff' : 'var(--text)';
            document.getElementById('geoStage3d').style.display = m === '3d' ? 'block' : 'none';
            document.getElementById('geoStageWorld').style.display = m === 'world' ? 'block' : 'none';
            document.getElementById('geoStageChina').style.display = m === 'china' ? 'block' : 'none';
            if (m === 'china') geoEnsureChinaChart();
            else geoDraw();
        }
        function geoDraw() {
            if (geoMode === '3d') geoDrawGlobe();
            else if (geoMode === 'world') geoDrawWorld();
            const sum = document.getElementById('geoSummary');
            if (!sum || !geoData) return;
            const cnTotal = geoData.countries.reduce((a, c) => a + (String(c.country || '').toUpperCase() === 'CN' ? (Number(c.count) || 0) : 0), 0);
            const wTotal = geoData.countries.reduce((a, c) => a + (Number(c.count) || 0), 0);
            const provCount = geoData.provinces.length;
            sum.innerHTML = '共 ' + wTotal + ' 次访问 · ' + geoData.countries.length + ' 个国家/地区 · 国内 ' + cnTotal + ' 次 · 已解析省份 ' + provCount + ' 个' + (geoResolvedNew ? ' · 本次新解析 ' + geoResolvedNew + ' 个 IP' : '') + '<br><span style="opacity:.75">首次打开会按需解析国内省份(百度/ip-api 归属库),点「刷新解析」可补齐;国外按国家(Cloudflare 头部直接判定)。</span>';
        }
        function geoProjectPoint(latDeg, lonDeg, rotLatRad, rotLonRad, cx, cy, R, alt) {
            const lat = latDeg * Math.PI / 180, lon = lonDeg * Math.PI / 180 + rotLonRad;
            const cosLat = Math.cos(lat), sinLat = Math.sin(lat);
            const cosLon = Math.cos(lon), sinLon = Math.sin(lon);
            const cosLat0 = Math.cos(rotLatRad), sinLat0 = Math.sin(rotLatRad);
            const z = sinLat0 * sinLat + cosLat0 * cosLat * cosLon;
            const rEff = R * (alt || 1);
            return { x: cx + rEff * cosLat * sinLon, y: cy - rEff * (cosLat0 * sinLat - sinLat0 * cosLat * cosLon), z: z };
        }
        // 球面大圆航线插值:两点在单位球上 slerp,返回经纬度序列(用于模拟航线)
        function geoArcPoints(latA, lonA, latB, lonB, steps) {
            const toV = (la, lo) => {
                const lat = la * Math.PI / 180, lon = lo * Math.PI / 180;
                return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
            };
            const a = toV(latA, lonA), b = toV(latB, lonB);
            const dot = Math.max(-1, Math.min(1, a[0]*b[0] + a[1]*b[1] + a[2]*b[2]));
            const ang = Math.acos(dot);
            const pts = [];
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                let v;
                if (ang < 1e-6) v = a;
                else {
                    const s = Math.sin(ang), w1 = Math.sin((1 - t) * ang) / s, w2 = Math.sin(t * ang) / s;
                    v = [a[0]*w1 + b[0]*w2, a[1]*w1 + b[1]*w2, a[2]*w1 + b[2]*w2];
                }
                pts.push({ lat: Math.asin(Math.max(-1, Math.min(1, v[1]))) * 180 / Math.PI, lon: Math.atan2(v[2], v[0]) * 180 / Math.PI });
            }
            return pts;
        }
        let geoSphereCache = null, geoDotCache = null;
        function geoGetSphere(size, dpr, isDark, cx, cy, R) {
            const key = size + '|' + dpr + '|' + (isDark ? 1 : 0);
            if (geoSphereCache && geoSphereCache.key === key) return geoSphereCache.cv;
            const cv = document.createElement('canvas');
            cv.width = Math.round(size * dpr); cv.height = Math.round(size * dpr);
            const c = cv.getContext('2d');
            c.scale(dpr, dpr);
            const halo = c.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.02);
            halo.addColorStop(0, isDark ? 'rgba(56,189,248,0.03)' : 'rgba(59,130,246,0.025)');
            halo.addColorStop(1, 'transparent');
            c.beginPath(); c.arc(cx, cy, R * 1.02, 0, Math.PI * 2); c.fillStyle = halo; c.fill();
            const grad = c.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.06, cx, cy, R);
            if (isDark) { grad.addColorStop(0, '#243b61'); grad.addColorStop(0.65, '#172a4a'); grad.addColorStop(1, '#0f1d36'); }
            else { grad.addColorStop(0, '#f8fbff'); grad.addColorStop(0.62, '#e6f0fd'); grad.addColorStop(1, '#cfe2fc'); }
            c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fillStyle = grad; c.fill();
            geoSphereCache = { key: key, cv: cv };
            return cv;
        }
        function geoGetDotCache() {
            if (geoDotCache) return geoDotCache;
            const n = WORLD_DOTS.length >> 1;
            const d = { n: n, cosLat: new Float32Array(n), sinLat: new Float32Array(n), cosLon: new Float32Array(n), sinLon: new Float32Array(n) };
            for (let i = 0; i < n; i++) {
                const lon = WORLD_DOTS[2 * i] / 10 * Math.PI / 180, lat = WORLD_DOTS[2 * i + 1] / 10 * Math.PI / 180;
                d.cosLat[i] = Math.cos(lat); d.sinLat[i] = Math.sin(lat);
                d.cosLon[i] = Math.cos(lon); d.sinLon[i] = Math.sin(lon);
            }
            geoDotCache = d;
            return d;
        }
        function geoDrawGlobe() {
            const canvas = document.getElementById('geoGlobeCanvas');
            if (!canvas) return;
            const nodes = geoBuildNodes();
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            const size = Math.min(420, canvas.parentElement.clientWidth || 420);
            const pxSize = Math.round(size * dpr);
            if (canvas.width !== pxSize || canvas.height !== pxSize) { canvas.width = pxSize; canvas.height = pxSize; }
            if (canvas.style.width !== size + 'px') { canvas.style.width = size + 'px'; canvas.style.height = size + 'px'; }
            const ctx = canvas.getContext('2d');
            ctx.save(); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, size, size);
            const cx = size / 2, cy = size / 2, R = size * 0.40;
            const isDark = document.body.classList.contains('dark');
            const rotLon = geoRotLon * Math.PI / 180, rotLat = geoRotLat * Math.PI / 180;
            const cosLat0 = Math.cos(rotLat), sinLat0 = Math.sin(rotLat);
            // 球体底色+光晕不随旋转变化:缓存到离屏画布,每帧一次 drawImage 即可
            ctx.drawImage(geoGetSphere(size, dpr, isDark, cx, cy, R), 0, 0, size, size);
            // NEBULA 点阵大陆:世界海岸线轮廓+陆地填充点(替代线框经纬网格)
            const dotCol = isDark ? 'rgba(103,232,249,0.40)' : 'rgba(37,99,235,0.42)';
            const dotSz = Math.max(1.2, R * 0.009);
            ctx.fillStyle = dotCol;
            {
                const dc = geoGetDotCache();
                const cR = Math.cos(rotLon), sR = Math.sin(rotLon), h = dotSz / 2;
                ctx.beginPath();
                for (let i = 0; i < dc.n; i++) {
                    const cl = dc.cosLon[i] * cR - dc.sinLon[i] * sR;   // cos(lon+rot)
                    const sl = dc.sinLon[i] * cR + dc.cosLon[i] * sR;   // sin(lon+rot)
                    const cla = dc.cosLat[i], sla = dc.sinLat[i];
                    const z = sinLat0 * sla + cosLat0 * cla * cl;
                    if (z <= 0.06) continue;
                    ctx.rect(cx + R * cla * sl - h, cy - R * (cosLat0 * sla - sinLat0 * cla * cl) - h, dotSz, dotSz);
                }
                ctx.fill();
            }
            ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
            ctx.lineWidth = 0.8; ctx.strokeStyle = isDark ? 'rgba(56,189,248,0.15)' : 'rgba(59,130,246,0.16)'; ctx.stroke();
            const maxCnt = Math.max(1, ...nodes.map(n => n.count));
            // 模拟航线:访问量最大的节点为枢纽,连到访问量前 12 的节点(球面大圆航线)
            const hub = nodes.length ? nodes[0] : null;
            if (hub) {
                ctx.save();
                ctx.lineWidth = 1;
                const arcColor = isDark ? 'rgba(56,189,248,0.30)' : 'rgba(59,130,246,0.30)';
                for (const t of nodes.slice(1, 13)) {
                    const arc = geoArcPoints(hub.lat, hub.lon, t.lat, t.lon, 36);
                    ctx.beginPath();
                    let started = false;
                    for (const p of arc) {
                        const pr = geoProjectPoint(p.lat, p.lon, rotLat, rotLon, cx, cy, R, 1);
                        if (pr.z > 0.02) { if (!started) { ctx.moveTo(pr.x, pr.y); started = true; } else ctx.lineTo(pr.x, pr.y); }
                        else started = false;
                    }
                    ctx.strokeStyle = arcColor;
                    ctx.stroke();
                }
                ctx.restore();
            }
            let hoverPx = null;
            for (const n of nodes) {
                const p = geoProjectPoint(n.lat, n.lon, rotLat, rotLon, cx, cy, R, 1);
                if (p.z <= 0.10) continue;
                const fade = Math.min(1, Math.max(0, (p.z - 0.10) / 0.25));
                const r = Math.max(3, 4 + Math.sqrt(n.count / maxCnt) * 10) * (0.5 + 0.5 * fade);
                const isProv = n.kind === 'province';
                const col = isProv ? '#22d3ee' : '#a855f7';
                const alpha = Math.min(1, p.z * 1.4) * fade;
                ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(15,23,42,0.55)'; ctx.globalAlpha = 0.4 + 0.6 * fade; ctx.fill(); ctx.globalAlpha = 1;
                ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.72, 0, Math.PI * 2);
                ctx.fillStyle = col; ctx.globalAlpha = (0.35 + alpha * 0.65) * fade; ctx.fill(); ctx.globalAlpha = 1;
                ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.34, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff'; ctx.globalAlpha = (0.55 + alpha * 0.45) * fade; ctx.fill(); ctx.globalAlpha = 1;
                if (geoHoverNode === n) hoverPx = { x: p.x, y: p.y, n: n, fade: fade };
            }
            // 节点名字:访问量前 12 的节点显示「名称 + 次数·占比」(占比相对最高节点;标签重叠时保留占比高的)
            ctx.save();
            ctx.font = '9.5px system-ui, sans-serif';
            ctx.textAlign = 'center';
            const drawnLabs = [];
            for (const n of nodes.slice(0, 12)) {
                const p = geoProjectPoint(n.lat, n.lon, rotLat, rotLon, cx, cy, R, 1);
                if (p.z <= 0.10) continue;
                const fade = Math.min(1, Math.max(0, (p.z - 0.10) / 0.25));
                const rr = Math.max(3, 4 + Math.sqrt(n.count / maxCnt) * 10) * (0.5 + 0.5 * fade);
                const pct = maxCnt ? n.count / maxCnt * 100 : 0;
                const pctTxt = pct >= 10 ? Math.round(pct) + '%' : pct.toFixed(1) + '%';
                const lab = pct >= 1 ? n.label + ' ' + n.count + '次·' + pctTxt : n.label;
                const labW = ctx.measureText(lab).width;
                const labY = p.y - rr - 4;
                let overlap = false;
                for (const d of drawnLabs) {
                    if (labY < d.y2 && labY + 10 > d.y1 && p.x - labW / 2 < d.x2 && p.x + labW / 2 > d.x1) { overlap = true; break; }
                }
                if (overlap) continue;
                drawnLabs.push({ x1: p.x - labW / 2, x2: p.x + labW / 2, y1: labY, y2: labY + 10 });
                ctx.fillStyle = isDark ? 'rgba(226,232,240,0.92)' : 'rgba(30,41,59,0.88)';
                ctx.globalAlpha = 0.2 + 0.8 * fade;
                ctx.fillText(lab, p.x, labY);
                ctx.globalAlpha = 1;
            }
            ctx.restore();
            if (hoverPx) {
                const n = hoverPx.n;
                ctx.save();
                ctx.beginPath(); ctx.arc(hoverPx.x, hoverPx.y, Math.max(8, 14 * hoverPx.fade), 0, Math.PI * 2);
                ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 1.6; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.restore();
                const tip = document.getElementById('geoGlobeTip');
                if (tip) {
                    const pct = maxCnt ? Math.round(n.count / maxCnt * 100) : 0;
                    tip.innerHTML = '<strong>' + n.label + '</strong> (' + (n.kind === 'province' ? '省份' : '国家') + ')<br>访问 ' + n.count + ' 次 · 占比 ' + pct + '%';
                    const px = hoverPx.x, py = hoverPx.y;
                    tip.style.display = 'block';
                    tip.style.left = Math.max(4, Math.min(size - 176, px + 14)) + 'px';
                    tip.style.top = Math.max(4, Math.min(size - 80, py - 30)) + 'px';
                }
            } else {
                const tip = document.getElementById('geoGlobeTip');
                if (tip) tip.style.display = 'none';
            }
            ctx.restore(); // 与函数开头的 ctx.save(); ctx.scale(dpr, dpr) 配对
        }
        function geoEnsureWorldData() {
            if (geoWorldData || geoWorldLoading) return;
            geoWorldLoading = true;
            fetch('/api/geo-world').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(d => {
                geoWorldData = (d && Array.isArray(d.features)) ? d : null;
                geoWorldLoading = false;
                if (geoMode === 'world') geoDrawWorld();
            }).catch(() => { geoWorldLoading = false; if (geoMode === 'world') geoDrawWorld(); });
        }
        function geoDrawWorld() {
            const canvas = document.getElementById('geoWorldCanvas');
            if (!canvas) return;
            const nodes = geoBuildNodes().filter(n => n.kind === 'country' || n.kind === 'province');
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            const W = 640, H = 340;
            canvas.width = W * dpr; canvas.height = H * dpr;
            canvas.style.width = '100%'; canvas.style.height = 'auto';
            const ctx = canvas.getContext('2d');
            ctx.save(); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, W, H);
            const isDark = document.body.classList.contains('dark');
            ctx.fillStyle = isDark ? '#0d1b30' : '#eef5fd';
            ctx.fillRect(0, 0, W, H);
            const px = (lon) => (lon + 180) / 360 * W;
            const py = (lat) => (85 - lat) / 170 * H;
            // 世界地图轮廓(简化 GeoJSON,后端代理拉取;未加载完先画点位,加载完自动补轮廓)
            if (geoWorldData) {
                ctx.save();
                ctx.lineWidth = 0.7;
                for (const f of geoWorldData.features) {
                    const g = f.geometry;
                    if (!g) continue;
                    const polys = g.type === 'Polygon' ? [g.coordinates] : (g.type === 'MultiPolygon' ? g.coordinates : []);
                    for (const poly of polys) {
                        for (const ring of poly) {
                            ctx.beginPath();
                            for (let i = 0; i < ring.length; i++) {
                                const pt = ring[i];
                                const x = px(Number(pt[0])), y = py(Number(pt[1]));
                                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                            }
                            ctx.closePath();
                            ctx.fillStyle = isDark ? 'rgba(34,197,94,0.07)' : 'rgba(100,116,139,0.10)';
                            ctx.fill();
                            ctx.strokeStyle = isDark ? 'rgba(148,163,184,0.28)' : 'rgba(71,85,105,0.30)';
                            ctx.stroke();
                        }
                    }
                }
                ctx.restore();
            } else {
                geoEnsureWorldData();
                ctx.save(); ctx.strokeStyle = isDark ? 'rgba(148,163,184,0.12)' : 'rgba(59,130,246,0.14)'; ctx.lineWidth = 0.6;
                for (let lo = -180; lo <= 180; lo += 30) { ctx.beginPath(); ctx.moveTo(px(lo), 0); ctx.lineTo(px(lo), H); ctx.stroke(); }
                for (let la = -60; la <= 60; la += 30) { ctx.beginPath(); ctx.moveTo(0, py(la)); ctx.lineTo(W, py(la)); ctx.stroke(); }
                ctx.restore();
                ctx.save(); ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
                ctx.textAlign = 'center'; ctx.fillText('世界地图加载中...', W / 2, H / 2 + 60); ctx.restore();
            }
            const maxCnt = Math.max(1, ...nodes.map(n => n.count));
            for (const n of nodes) {
                const x = px(n.lon), y = py(n.lat);
                const r = Math.max(3, 4 + Math.sqrt(n.count / maxCnt) * 12);
                const isProv = n.kind === 'province';
                const col = isProv ? '#22d3ee' : '#a855f7';
                ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(15,23,42,0.5)'; ctx.fill();
                ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
                ctx.fillStyle = col; ctx.globalAlpha = 0.8; ctx.fill(); ctx.globalAlpha = 1;
                ctx.beginPath(); ctx.arc(x, y, r * 0.32, 0, Math.PI * 2);
                ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
            }
            nodes.slice(0, 12).forEach(n => {
                const x = px(n.lon), y = py(n.lat);
                ctx.save(); ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = isDark ? '#cbd5e1' : '#475569';
                ctx.textAlign = 'center'; ctx.fillText(n.label, x, y - 10); ctx.restore();
            });
        }
        function geoEnsureChinaChart() {
            const host = document.getElementById('geoChinaChart');
            if (!host) return;
            const run = () => {
                if (typeof echarts === 'undefined' || !geoData) return;
                if (!geoChinaLoaded) {
                    fetch('/api/geo-china').then(r => { if (!r.ok) throw new Error('地图数据拉取失败(HTTP ' + r.status + ')'); return r.json(); }).then(gj => {
                        if (!gj || gj.success === false) throw new Error(gj && gj.error || '地图数据为空');
                        echarts.registerMap('china', gj);
                        geoChinaLoaded = true;
                        geoChinaRender();
                    }).catch(e => { host.innerHTML = '<div style="padding:20px;color:var(--text-sec);font-size:12px;">中国地图加载失败: ' + e.message + '</div>'; });
                    return;
                }
                geoChinaRender();
            };
            if (typeof echarts !== 'undefined') { run(); return; }
            const s = document.createElement('script');
            s.src = 'https://cdn.staticfile.net/echarts/5.4.3/echarts.min.js';
            s.onload = run; s.onerror = function() {
                const s2 = document.createElement('script');
                s2.src = 'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js';
                s2.onload = run;
                host.appendChild(s2);
            };
            document.head.appendChild(s);
        }
        function geoChinaRender() {
            const host = document.getElementById('geoChinaChart');
            if (!host || typeof echarts === 'undefined' || !geoData) return;
            if (!geoChinaChart) geoChinaChart = echarts.init(host);
            const data = (geoData.provinces || []).map(p => ({ name: p.region, value: Number(p.count) || 0 }));
            geoChinaChart.setOption({
                tooltip: { trigger: 'item', formatter: function(params) { return params.name + ': ' + (params.value || 0) + ' 次访问'; } },
                visualMap: { min: 0, max: Math.max(1, ...data.map(d => d.value)), left: 8, bottom: 8, text: ['高', '低'], calculable: true, inRange: { color: ['#dbeafe', '#7c3aed', '#ff4d6d'] }, textStyle: { color: '#888' } },
                series: [{ name: '访问量', type: 'map', map: 'china', roam: false, label: { show: true, fontSize: 9, formatter: function(p) { return Number(p.value) > 0 ? p.name : ''; } }, emphasis: { label: { show: true, fontWeight: 'bold' } }, data: data }]
            });
        }
        function geoInitEvents() {
            const canvas = document.getElementById('geoGlobeCanvas');
            if (!canvas || canvas.dataset.bound) return;
            canvas.dataset.bound = '1';
            const getPos = (e) => {
                const r = canvas.getBoundingClientRect();
                return { x: (e.touches ? e.touches[0].clientX : e.clientX) - r.left, y: (e.touches ? e.touches[0].clientY : e.clientY) - r.top };
            };
            const down = (e) => { geoDragging = true; const p = getPos(e); geoDragX = p.x; geoDragY = p.y; e.preventDefault(); };
            const move = (e) => {
                const p = getPos(e);
                if (geoDragging) {
                    const dx = p.x - geoDragX, dy = p.y - geoDragY;
                    geoDragX = p.x; geoDragY = p.y;
                    const size = Math.min(420, canvas.parentElement.clientWidth || 420);
                    geoRotLon += dx / size * 180; geoRotLat = Math.max(-60, Math.min(60, geoRotLat + dy / size * 90));
                    geoDrawGlobe();
                } else {
                    const nodes = geoBuildNodes();
                    const size = Math.min(420, canvas.parentElement.clientWidth || 420);
                    const R = size * 0.40, cx = size / 2, cy = size / 2;
                    const rotLon = geoRotLon * Math.PI / 180, rotLat = geoRotLat * Math.PI / 180;
                    let hit = null, best = 30;
                    for (const n of nodes) {
                        const pr = geoProjectPoint(n.lat, n.lon, rotLat, rotLon, cx, cy, R, 1.02);
                        if (pr.z <= 0.02) continue;
                        const maxCnt = Math.max(1, ...nodes.map(x => x.count));
                        const rr = Math.max(5, 4 + Math.sqrt(n.count / maxCnt) * 10 + 6);
                        const d = Math.hypot(pr.x - p.x, pr.y - p.y);
                        if (d < rr && d < best) { best = d; hit = n; }
                    }
                    if (hit !== geoHoverNode) { geoHoverNode = hit; geoDrawGlobe(); }
                }
            };
            const up = () => { geoDragging = false; };
            canvas.addEventListener('mousedown', down);
            canvas.addEventListener('mousemove', move);
            canvas.addEventListener('mouseup', up);
            canvas.addEventListener('mouseleave', up);
            canvas.addEventListener('touchstart', down, { passive: false });
            canvas.addEventListener('touchmove', move, { passive: false });
            canvas.addEventListener('touchend', up);
            if (!geoAnimId) {
                let geoLastFrame = 0;
                const geoTick = function(ts) {
                    geoAnimId = requestAnimationFrame(geoTick);
                    if (ts - geoLastFrame < 14) return;   // 上限约 60fps(120Hz 屏不翻倍耗电)
                    geoLastFrame = ts;
                    const dash = document.getElementById('dashboardModal');
                    if (geoMode === '3d' && !geoDragging && !document.hidden && dash && dash.style.display !== 'none') {
                        // 正面摆动:围绕访问点正面视角(rotLon≈250°)缓慢往复,访问点始终贴在球面正面,不会转到边缘/背面
                        geoRotLon = 250 + 32 * Math.sin(Date.now() / 4200);
                        geoDrawGlobe();
                    }
                };
                geoAnimId = requestAnimationFrame(geoTick);
            }
        }
        async function openDashboard() {
            document.getElementById('dashboardModal').style.display = 'block';
            try { loadHeatmap(); } catch (e) {}
            try { loadVisitorGeo(); } catch (e) {}
            
            function parseTrafficToBytes(str) {
                if (!str || str === '0 B' || str.includes('异常') || str.includes('获取')) return 0;
                let val = parseFloat(str);
                if (str.includes('TB')) return val * 1099511627776;
                if (str.includes('GB')) return val * 1073741824;
                if (str.includes('MB')) return val * 1048576;
                if (str.includes('KB')) return val * 1024;
                return val;
            }

            let top5Container = document.getElementById('top5-simple-container');
            let playerStatsContainer = document.getElementById('player-stats-container');
            const wrapper = document.querySelector('.table-wrapper');
            const anchor = (wrapper && wrapper.previousElementSibling) || wrapper;
            if (!playerStatsContainer) {
                playerStatsContainer = document.createElement('div');
                playerStatsContainer.id = 'player-stats-container';
                if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(playerStatsContainer, anchor);
            }
            if (!top5Container) {
                top5Container = document.createElement('div');
                top5Container.id = 'top5-simple-container';
                if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(top5Container, playerStatsContainer || anchor);
            }
            
            let top5Html = '<h3 style="margin-top: 30px; margin-bottom:16px;">${I.trophy} 今日节点流量消耗 TOP 5</h3><div style="background: rgba(120,120,120,0.05); padding: 16px; border-radius: 12px; border: 1px solid var(--border); margin-bottom: 20px;">';
            
            // ==========================================
            //  核心优化：听你的天才思路！直接去网页现有的卡片里“抓取”数据，绝不等待变量！
            // ==========================================
            const domCards = document.querySelectorAll('.route-item');
            let scrapedNodes = [];
            
            domCards.forEach(card => {
                const prefix = card.getAttribute('data-prefix') || '未知';
                let remark = prefix;
                const searchAttr = card.getAttribute('data-search');
                if (searchAttr) {
                    remark = searchAttr.replace(new RegExp(' ' + prefix + '$'), '').trim();
                }

                let bandwidth = '0 B';
                // 遍历卡片里所有的文本，找出带有流量单位的那个文本
                const spans = card.querySelectorAll('span');
                spans.forEach(span => {
                    const txt = span.innerText || '';
                    // 匹配例如: 1.5 GB, 500 MB, 0 B (双斜杠防转义丢失)
                    if (/^[\\d\\.]+\\s*(TB|GB|MB|KB|B)$/i.test(txt.trim())) {
                        bandwidth = txt.trim();
                    }
                });

                scrapedNodes.push({ prefix: prefix, remark: remark, todayBandwidth: bandwidth });
            });

            // 用抓取下来的真实数据直接计算 TOP 5
            if (scrapedNodes.length > 0) {
                const validNodes = scrapedNodes.filter(r => parseTrafficToBytes(r.todayBandwidth) > 0);
                const top5 = validNodes.sort((a, b) => parseTrafficToBytes(b.todayBandwidth) - parseTrafficToBytes(a.todayBandwidth)).slice(0, 5);
                
                if (top5.length > 0) {
                    top5Html += '<ul style="margin:0; padding-left: 20px; line-height: 2; font-size: 14px; color: var(--text);">';
                    top5.forEach((r, idx) => {
                        const rankColor = idx === 0 ? '#ff3b30' : (idx === 1 ? '#ff9500' : (idx === 2 ? '#ffcc00' : 'var(--text-sec)'));
                        top5Html += \`<li><strong style="color:\${rankColor}; font-size: 15px;">#\${idx+1}</strong> \${r.remark} (/\${r.prefix}) —— 消耗: <strong style="color:var(--primary); font-family: monospace;">\${r.todayBandwidth}</strong></li>\`;
                    });
                    top5Html += '</ul>';
                } else {
                    top5Html += '<div style="color:var(--text-sec); font-size:13px; text-align:center;">今日暂无节点产生流量</div>';
                }
            } else {
                top5Html += '<div style="color:var(--text-sec); font-size:13px; text-align:center;">主页暂无节点卡片</div>';
            }
            top5Html += '</div>';
            
            // 瞬间把 TOP 5 写入网页！
            top5Container.innerHTML = top5Html;


            // ==========================================
            //  正常加载下面的图表数据 (带有10秒防卡死超时保护)
            // ==========================================
            document.getElementById('logTableBody').innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 30px;">数据分析引擎计算中...</td></tr>';
            document.getElementById('trafficToday').innerText = '拉取中...';
            document.getElementById('traffic7d').innerText = '拉取中...';
            document.getElementById('traffic30d').innerText = '拉取中...';
            document.getElementById('cfToday').innerText = '拉取中...';
            document.getElementById('cfWeek').innerText = '拉取中...';
            document.getElementById('cfMonth').innerText = '拉取中...';
            document.getElementById('cfQuotaText').innerText = '加载中...';
            document.getElementById('cfBandwidth').innerText = '拉取中...';
            document.getElementById('cfCacheRatio').innerText = '拉取中...';
            document.getElementById('cfBlocked').innerText = '拉取中...';
            document.getElementById('cf5xx').innerText = '拉取中...';
            loadCfUsage();

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);

                const res = await fetch('/api/analytics', { signal: controller.signal });
                clearTimeout(timeoutId);
                
                const data = await res.json();
                if(!data.success) throw new Error(data.error);

                updateChartColors();

                document.getElementById('trafficToday').innerText = data.trafficToday || '未知';
                document.getElementById('traffic7d').innerText = data.traffic7d || '未知';
                document.getElementById('traffic30d').innerText = data.traffic30d || '未知';

                const labels = data.trend.map(i => i.date.substring(5)); 
                const counts = data.trend.map(i => i.count);
                const trendCtx = document.getElementById('trendChart').getContext('2d');
                if(trendChartInstance) trendChartInstance.destroy();
                trendChartInstance = new Chart(trendCtx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{ label: '有效播放 (次)', data: counts, borderColor: '#0071e3', backgroundColor: 'rgba(0,113,227,0.1)', fill: true, tension: 0.3 }]
                    },
                    options: { responsive: true, plugins: { title: { display: true, text: '过去 7 天全站播放并发趋势', font: {size: 16} } } }
                });

                const locLabels = data.locations.map(i => i.country === 'CN' ? '中国大陆' : (i.country || '未知'));
                const locCounts = data.locations.map(i => i.count);
                const locCtx = document.getElementById('locationChart').getContext('2d');
                if(locationChartInstance) locationChartInstance.destroy();
                locationChartInstance = new Chart(locCtx, {
                    type: 'doughnut',
                    data: {
                        labels: locLabels,
                        datasets: [{ data: locCounts, backgroundColor: ['#34c759', '#0071e3', '#ff9500', '#af52de', '#ff2d55', '#8e8e93'], borderWidth: 0 }]
                    },
                    options: { responsive: true, plugins: { title: { display: true, text: '独立访客来源地占比', font: {size: 16} } } }
                });

                const tbody = document.getElementById('logTableBody');
                tbody.innerHTML = '';
                if(data.recents.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 30px;">暂无日志记录</td></tr>';
                } else {
                    data.recents.forEach(log => {
                        const tr = document.createElement('tr');
                        const isChina = log.country === 'CN';
                        const locText = isChina ? (log.region ? (log.region + (log.city ? ' ' + log.city : '')) : '中国大陆') : (log.country || 'Unknown');
                        tr.innerHTML = \`
                            <td data-label="访问时间" style="font-size:12px; white-space:nowrap;">\${log.timestamp}</td>
                            <td data-label="目标节点"><span class="badge" style="background:rgba(0,113,227,0.1);color:var(--primary);">\${log.prefix}</span></td>
                            <td data-label="真实 IP" style="font-family:monospace; font-size:13px; color:var(--text-sec); word-break:break-all;">\${log.ip}</td>
                            <td data-label="归属地"><span class="badge" style="background:\${isChina ? 'rgba(52,199,89,0.1)' : 'rgba(255,149,0,0.1)'}; color:\${isChina ? '#34c759' : '#ff9500'};">\${locText}</span></td>
                            <td data-label="设备标识 (UA)" style="font-size:12px; color:var(--text-sec); word-break: break-all; white-space: normal; text-align: right; line-height: 1.4;" title="\${log.ua}">\${log.ua}</td>
                        \`;
                        tbody.appendChild(tr);
                    });
                }

                // v3.5.4:播放器使用排行榜（近7天）
                const ps7 = data.playerStats7d || [];
                const psc = document.getElementById('player-stats-container');
                if (psc) {
                    psc.innerHTML = '<h3 style="margin-top:30px; margin-bottom:16px;">${I.trophy} 播放器使用排行榜（近 7 天）</h3><div style="background:rgba(120,120,120,0.05); padding:16px; border-radius:12px; border:1px solid var(--border); margin-bottom:20px;"><ul id="psList" style="margin:0; padding-left:20px; line-height:2; font-size:14px; color:var(--text);"></ul></div>';
                    const ul = document.getElementById('psList');
                    if (!ps7 || ps7.length === 0) { ul.innerHTML = '<li style="color:var(--text-sec); font-size:13px;">暂无播放记录</li>'; }
                    else { ul.innerHTML = ps7.map(function(r, i){
                        var rc = i === 0 ? '#ff3b30' : (i === 1 ? '#ff9500' : (i === 2 ? '#ffcc00' : 'var(--text-sec)'));
                        return '<li><strong style="color:' + rc + '; font-size:15px;">#' + (i+1) + '</strong> ' + r.name + ' —— <strong style="color:var(--primary);">' + r.count + ' 次</strong></li>';
                    }).join(''); }
                }

            } catch (e) {
                const errMsg = e.name === 'AbortError' ? '网络超时，CF 接口拥堵，请稍后重试' : e.message;
                document.getElementById('logTableBody').innerHTML = \`<tr><td colspan="5" style="text-align:center;color:#ff3b30; padding: 30px;">独立图表数据拉取失败: \${errMsg}</td></tr>\`;
            }
        }

        function closeDashboard() { document.getElementById('dashboardModal').style.display = 'none'; }

        // CF Worker 每日请求数统计加载（独立于流量统计，失败不影响大屏其他模块）
        async function loadCfUsage() {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);
                const res = await fetch('/api/cfusage', { signal: controller.signal });
                clearTimeout(timeoutId);
                const data = await res.json();
                if (!data.success) {
                    ['cfToday','cfWeek','cfMonth'].forEach(id => document.getElementById(id).innerText = '不可用');
                    ['cfBandwidth','cfCacheRatio','cfBlocked','cf5xx'].forEach(id => document.getElementById(id).innerText = '不可用');
                    document.getElementById('cfQuotaText').innerText = '未配置 CF 统计变量';
                    document.getElementById('cfQuotaDetail').innerText = data.error || '缺少 CF_API_TOKEN 或 CF_ZONE_ID';
                    document.getElementById('cfCountryList').innerText = '暂无数据';
                    return;
                }
                const fmt = n => n.toLocaleString('zh-CN') + ' 次';
                document.getElementById('cfToday').innerText = fmt(data.today);
                document.getElementById('cfWeek').innerText = fmt(data.week);
                document.getElementById('cfMonth').innerText = fmt(data.month);
                document.getElementById('cfBandwidth').innerText = data.bandwidth ? (data.bandwidth / 1073741824).toFixed(2) + ' GB' : '0 GB';
                document.getElementById('cfCacheRatio').innerText = (data.cacheHitRatio || 0) + '%';
                document.getElementById('cfBlocked').innerText = (data.blocked || 0).toLocaleString('zh-CN') + ' 次';
                document.getElementById('cf5xx').innerText = ((data.statusCodes && data.statusCodes['5xx']) || 0).toLocaleString('zh-CN') + ' 次';
                document.getElementById('cfQuotaText').innerText = data.todayError ? '获取失败' : (data.usedPercent + '%');
                document.getElementById('cfQuotaBar').style.width = Math.min(100, data.usedPercent) + '%';
                document.getElementById('cfQuotaDetail').innerText = \`已用 \${data.today.toLocaleString('zh-CN')} 次 / 10万 (\${data.usedPercent}%) · 剩余 \${data.remain.toLocaleString('zh-CN')} 次\`;
                if (data.todayError) document.getElementById('cfQuotaDetail').innerText += '（' + data.todayError + '）';
                // 状态码环形图
                const sc = data.statusCodes || { '2xx':0, '3xx':0, '4xx':0, '5xx':0 };
                const scCtx = document.getElementById('cfStatusChart').getContext('2d');
                if (cfStatusChartInstance) cfStatusChartInstance.destroy();
                cfStatusChartInstance = new Chart(scCtx, {
                    type: 'doughnut',
                    data: { labels: ['2xx','3xx','4xx','5xx'], datasets: [{ data: [sc['2xx'], sc['3xx'], sc['4xx'], sc['5xx']], backgroundColor: ['#34c759','#0a84ff','#ff9f0a','#ff3b30'], borderWidth: 0 }] },
                    options: { responsive: true, plugins: { legend: { position: 'right', labels: { color: '#8e8e93', boxWidth: 10 } } } }
                });
                // 分时折线（北京时间 24h）
                const hCtx = document.getElementById('cfHourChart').getContext('2d');
                if (cfHourChartInstance) cfHourChartInstance.destroy();
                cfHourChartInstance = new Chart(hCtx, {
                    type: 'line',
                    data: { labels: Array.from({length: 24}, (_,i) => i + 'h'), datasets: [{ label: '请求数', data: data.hours || [], borderColor: '#00e5ff', backgroundColor: 'rgba(0,229,255,0.1)', fill: true, tension: 0.3, pointRadius: 0 }] },
                    options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 12, color: '#8e8e93' } }, y: { beginAtZero: true, ticks: { color: '#8e8e93' } } } }
                });
                // Top 国家
                const cl = document.getElementById('cfCountryList');
                if (data.countries && data.countries.length) {
                    const total = data.countries.reduce((a, c) => a + c.count, 0) || 1;
                    cl.innerHTML = data.countries.map(c => {
                        const pct = Math.round(c.count / total * 100);
                        return '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;"><span>' + c.country + '</span><div style="flex:1; margin:0 8px; height:4px; background:rgba(120,120,120,.2); border-radius:4px; overflow:hidden;"><div style="height:100%; width:' + pct + '%; background:linear-gradient(90deg,#00e5ff,#7c3aed);"></div></div><span>' + c.count.toLocaleString('zh-CN') + '</span></div>';
                    }).join('');
                } else {
                    cl.innerText = '暂无数据';
                }
            } catch(e) {
                ['cfToday','cfWeek','cfMonth'].forEach(id => document.getElementById(id).innerText = '拉取失败');
                document.getElementById('cfQuotaText').innerText = '获取失败';
            }
        }

        async function loadIcons(forceUrl = null) {
            const grid = document.getElementById('iconGrid');
            grid.innerHTML = '<div style="grid-column: 1/-1; color: var(--text-sec); font-size: 13px; text-align: center;">加载图标库中...</div>';
            const targetUrl = forceUrl || localStorage.getItem('custom_icon_url') || DEFAULT_ICON_URL;
            const urlInput = document.getElementById('customIconUrlInput');
            if (urlInput) urlInput.value = targetUrl === DEFAULT_ICON_URL ? '' : targetUrl;
            try {
                const res = await fetch(targetUrl);
                const data = await res.json();
                if (data && data.icons && Array.isArray(data.icons)) {
                    globalIcons = data.icons;
                } else if (Array.isArray(data)) {
                    globalIcons = data;
                } else {
                    globalIcons = [];
                    for (const [key, val] of Object.entries(data)) { globalIcons.push({ name: key, url: val }); }
                }
                renderIconGrid('');
            } catch(e) { 
                grid.innerHTML = '<div style="grid-column: 1/-1; color: #ff3b30; font-size: 13px; text-align: center;">获取图标库失败，请检查链接或网络状态</div>';
            }
        }

        function setCustomIconLibrary() {
            const url = document.getElementById('customIconUrlInput').value.trim();
            if (!url) return showToast(' 请输入图标库 JSON 链接');
            if (!url.startsWith('http')) return showToast(' 请输入合法的 URL');
            localStorage.setItem('custom_icon_url', url);
            showToast(' 正在加载自定义图标库...');
            loadIcons(url);
        }

        function resetIconLibrary() {
            localStorage.removeItem('custom_icon_url');
            document.getElementById('customIconUrlInput').value = '';
            showToast(' 已恢复默认图标库');
            loadIcons(DEFAULT_ICON_URL);
        }

        function renderIconGrid(filterText) {
            const grid = document.getElementById('iconGrid');
            const lowerFilter = filterText.toLowerCase();
            const filtered = globalIcons.filter(item => (item.name || '').toLowerCase().includes(lowerFilter));
            let html = \`<div class="icon-item" onclick="selectIcon('', '默认')" title="使用默认图标"><span style="font-size:22px;">${I.film}</span></div>\`;
            filtered.forEach(item => {
                html += \`<div class="icon-item" onclick="selectIcon('\${item.url}', '\${item.name}')" title="\${item.name}">
                            <img src="\${item.url}" loading="lazy" style="width: 32px; height: 32px; object-fit: contain; border-radius: 4px;">
                        </div>\`;
            });
            grid.innerHTML = html;
        }

        function filterIcons() { renderIconGrid(document.getElementById('iconSearch').value); }

        function toggleIconPicker(e) {
            e.stopPropagation();
            const panel = document.getElementById('iconPickerPanel');
            panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
        }

        function selectIcon(url, name) {
            document.getElementById('iconUrl').value = url;
            const preview = document.getElementById('iconPreview');
            const def = document.getElementById('iconDefault');
            const text = document.getElementById('iconSelectText');
            if(url) {
                preview.src = url; preview.style.display = 'block'; def.style.display = 'none';
                text.textContent = name; text.style.color = 'var(--text)';
            } else {
                preview.src = ''; preview.style.display = 'none'; def.style.display = 'block';
                text.textContent = '点击选择图标 (默认)'; text.style.color = 'var(--text-sec)';
            }
            document.getElementById('iconPickerPanel').style.display = 'none';
        }

        document.addEventListener('click', (e) => {
            const panel = document.getElementById('iconPickerPanel');
            const btn = document.getElementById('iconSelectBtn');
            if (panel && btn && panel.style.display !== 'none') {
                if (!panel.contains(e.target) && !btn.contains(e.target)) panel.style.display = 'none';
            }
        });

        function toggleDarkMode() {
            const isDark = document.body.classList.toggle('dark');
            document.documentElement.classList.toggle('dark', isDark);
            document.getElementById('themeToggle').innerHTML = isDark ? I.sun : I.moon;
            localStorage.setItem('emby_proxy_dark', isDark ? '1' : '0');
            if(trendChartInstance) { updateChartColors(); trendChartInstance.update(); locationChartInstance.update(); }
        }
        if (localStorage.getItem('emby_proxy_dark') === '1') { document.body.classList.add('dark'); document.documentElement.classList.add('dark'); document.getElementById('themeToggle').innerHTML = I.sun; }

        function showToast(msg) {
            const t = document.getElementById('toast');
            t.textContent = msg; t.classList.add('show');
            setTimeout(() => t.classList.remove('show'), 3000);
        }

        async function purgeCache() {
            if(!confirm('确定要清理 Cloudflare 节点的全站海报和静态缓存吗？\\n\\n清理后可能导致短时间的加载缓慢。')) return;
            const btn = document.getElementById('btnPurge');
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<span>清理中...</span>'; btn.disabled = true;
            try {
                const res = await fetch('/api/purge-cache', { method: 'POST' });
                const data = await res.json();
                if(data.success) showToast(' 缓存清理成功，新海报已生效！');
                else showToast(' 清理失败: ' + data.error);
            } catch(e) { showToast(' 网络请求错误'); } finally { btn.innerHTML = originalHTML; btn.disabled = false; }
        }

        let searchTimer = null;
        async function filterNodesList() {
            const input = document.getElementById('searchNode');
            if (!input) return;
            const filterText = input.value.trim().toLowerCase();
            const cards = document.querySelectorAll('.emby-card');
            if (!filterText) { cards.forEach(card => card.style.display = 'flex'); return; }
            // 本地先匹配(备注/后缀/管理员本地的线路地址),立即响应
            cards.forEach(card => {
                const searchStr = String(card.getAttribute('data-search') || '').toLowerCase() + ' ' + String(card.getAttribute('data-search2') || '').toLowerCase();
                card.style.display = searchStr.includes(filterText) ? 'flex' : 'none';
            });
            // 再服务端按源站链接匹配(订阅用户看不到链接也能用链接/域名搜出节点,防抖 300ms)
            clearTimeout(searchTimer);
            searchTimer = setTimeout(async () => {
                try {
                    const res = await fetch('/api/routes?q=' + encodeURIComponent(filterText));
                    const data = await res.json();
                    if (!Array.isArray(data)) return;
                    const hitPrefixes = new Set((data || []).map(r => r.prefix));
                    cards.forEach(card => {
                        const p = card.getAttribute('data-prefix');
                        if (p && hitPrefixes.has(p)) card.style.display = 'flex';
                    });
                } catch (e) {}
            }, 300);
        }

        // ============ 五种反代模式卡片:节点统计 / 筛选 / 批量应用 (v3.4.66) ============
        const MODE_INFO = {
            'off': { name: '保守', desc: '抹除真实 IP,以伪装身份转发请求', color: '#00e5ff' },
            'realip_only': { name: '严格', desc: '透传真实 IP,不做请求头伪装', color: '#3b82f6' },
            'dual': { name: '兼容', desc: '双重透传,兼容多数播放器', color: '#a855f7' },
            'strict': { name: '强力', desc: '防 403 错误,请求头强伪装', color: '#f43f5e' },
            'emos': { name: 'EMOS', desc: '专用请求头,适配 EMOS 聚合', color: '#f59e0b' }
        };
        let activeModeFilter = '';
        function updateModeCards() {
            const data = window.globalRoutesData || [];
            const cnt = { 'off': 0, 'realip_only': 0, 'dual': 0, 'strict': 0, 'emos': 0, 'all': data.length };
            data.forEach(r => { if (cnt[r.mode] != null) cnt[r.mode]++; });
            Object.keys(cnt).forEach(k => {
                const el = document.getElementById('mcCnt-' + k);
                if (el) el.textContent = cnt[k];
            });
        }
        function openModeMenu(mode) {
            const info = MODE_INFO[mode] || { name: '全部节点', desc: '查看全部节点', color: '#94a3b8' };
            document.getElementById('mmName').textContent = info.name;
            document.getElementById('mmDesc').textContent = info.desc;
            document.getElementById('mmBadge').style.background = info.color;
            document.getElementById('modeCardMenu').style.setProperty('--mc', info.color);
            const data = window.globalRoutesData || [];
            const cnt = mode === 'all' ? data.length : data.filter(r => r.mode === mode).length;
            document.getElementById('mmStats').textContent = '当前 ' + cnt + ' 个节点使用「' + info.name + '」模式';
            const isAdmin = !(window.ROLE === 'sub');
            const applyBtn = document.getElementById('mmApply');
            if (applyBtn) applyBtn.style.display = isAdmin ? 'flex' : 'none';
            document.getElementById('mmFilter').onclick = () => filterByMode(mode);
            if (applyBtn) applyBtn.onclick = () => applyModeToAll(mode);
            document.getElementById('modeCardMenu').style.display = 'block';
        }
        function closeModeMenu() { document.getElementById('modeCardMenu').style.display = 'none'; }
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('modeCardMenu');
            if (menu && menu.style.display !== 'none' && !menu.contains(e.target) && !e.target.closest('.mode-card')) {
                menu.style.display = 'none';
            }
        });
        function filterByMode(mode) {
            activeModeFilter = mode;
            closeModeMenu();
            const input = document.getElementById('searchNode');
            if (input) input.value = '';
            const cards = document.querySelectorAll('.emby-card');
            const info = MODE_INFO[mode] || { name: '全部节点' };
            cards.forEach(card => {
                card.style.display = (mode === 'all' || card.getAttribute('data-mode') === mode) ? 'flex' : 'none';
            });
            showToast(' 已筛选「' + info.name + '」模式节点');
        }
        function showAllNodes() {
            activeModeFilter = '';
            const input = document.getElementById('searchNode');
            if (input) input.value = '';
            document.querySelectorAll('.emby-card').forEach(card => card.style.display = 'flex');
            showToast(' 已显示全部节点');
        }
        async function applyModeToAll(mode) {
            const data = window.globalRoutesData || [];
            if (data.length === 0) return showToast(' 暂无节点可切换');
            const info = MODE_INFO[mode];
            if (!confirm('确定将全部 ' + data.length + ' 个节点切换为「' + info.name + '」模式?\\n\\n该操作会逐个保存节点配置,仅修改模式,其余设置保持不变。')) return;
            closeModeMenu();
            let ok = 0, fail = 0;
            showToast(' 正在批量切换模式...');
            for (const r of data) {
                try {
                    const res = await fetch('/api/routes', {
                        method: 'POST',
                        body: JSON.stringify({
                            oldPrefix: r.prefix, prefix: r.prefix, target: r.target || '', mode: mode,
                            remark: r.remark || '', icon: r.icon || '', cache_img: r.cache_img || 'off',
                            fakeIp: r.custom_ip || 'off', watchLimit: r.watch_limit || 0,
                            nodeUser: r.node_user || '', nodePass: r.node_pass || '',
                            redirect_direct: r.redirect_direct === 'on' ? 'on' : 'off', redirect_rules: r.redirect_rules || '[]',
                            emosId: r.emos_id || '', emosName: r.emos_name || '', emosAggregate: r.emos_aggregate === 'on' ? 'on' : 'off',
                            strmOpt: r.strm_opt === 'on' ? 'on' : 'off',
                            forceDirect: r.force_direct === 'on' ? 'on' : 'off'
                        })
                    });
                    const d = await res.json();
                    if (d.success) ok++; else fail++;
                } catch (e) { fail++; }
            }
            await load();
            updateModeCards();
            showToast(' 批量切换完成:成功 ' + ok + ' 个' + (fail ? ',失败 ' + fail + ' 个' : ''));
        }

        function handleTargetInputs() {
            const container = document.getElementById('targetInputs');
            const inputs = container.querySelectorAll('.target-input');
            const lastInput = inputs[inputs.length - 1];
            if (lastInput.value.trim() !== '') {
                const newInput = document.createElement('input');
                newInput.type = 'url'; newInput.className = 'target-input';
                newInput.style = 'padding: 12px 16px; border: 1px solid var(--border); border-radius: 8px; background:var(--card); width: 100%;';
                newInput.oninput = handleTargetInputs;
                container.appendChild(newInput);
            }
            let emptyCount = 0;
            const currentInputs = container.querySelectorAll('.target-input');
            for (let i = currentInputs.length - 1; i >= 0; i--) {
                if (currentInputs[i].value.trim() === '') { emptyCount++; if (emptyCount > 1) currentInputs[i].remove(); } else { break; }
            }
            container.querySelectorAll('.target-input').forEach((inp, idx) => {
                inp.placeholder = idx === 0 ? "主线路地址 (如: http://1.1.1.1:8096)" : \`备用线路 \${idx} (选填，主源挂掉时触发)\`;
            });
        }

        function resetTargetInputs() {
            const container = document.getElementById('targetInputs');
            container.innerHTML = \`
                <input type="url" class="target-input" placeholder="主线路地址 (如: http://1.1.1.1:8096)" style="padding: 12px 16px; border: 1px solid var(--border); border-radius: 8px; background:var(--card); width: 100%;" required oninput="handleTargetInputs()">
                <input type="url" class="target-input" placeholder="备用线路 1 (选填)" style="padding: 12px 16px; border: 1px solid var(--border); border-radius: 8px; background:var(--card); width: 100%;" oninput="handleTargetInputs()">
            \`;
        }

        function toggleVis(id, isArray = false) {
            const el = document.getElementById(id);
            if (el.classList.contains('secret-text')) {
                el.classList.remove('secret-text'); el.classList.add('actual-text');
                if (isArray) {
                    const arr = JSON.parse(decodeURIComponent(el.getAttribute('data-val')));
                    let html = '';
                    arr.forEach((t, i) => {
                        const tag = i === 0 ? '<span style="color:#34c759;font-weight:bold;">[主]</span>' : '<span style="color:#ff9500;font-weight:bold;">[备]</span>';
                        html += \`<div class="url-list-item">\${tag} \${t}</div>\`;
                    });
                    el.innerHTML = html;
                } else { el.textContent = el.getAttribute('data-val'); }
            } else {
                el.classList.add('secret-text'); el.classList.remove('actual-text'); el.textContent = '••••••••';
            }
        }

        function copyTxt(txt) { navigator.clipboard.writeText(txt).then(() => showToast(' 复制成功！')); }

        async function pingTarget(idx, targetUrl) {
            const pingEl = document.getElementById('ping-' + idx);
            pingEl.textContent = '测速中...'; pingEl.style.color = 'var(--text-sec)';
            try {
                const res = await fetch('/api/ping-node?url=' + encodeURIComponent(targetUrl));
                const data = await res.json();
                if(data.ms >= 0) {
                    pingEl.textContent = data.ms + ' ms';
                    pingEl.style.color = data.ms < 200 ? '#34c759' : (data.ms < 500 ? 'var(--primary)' : '#ff9500');
                } else { pingEl.textContent = '断连/超时'; pingEl.style.color = '#ff3b30'; }
            } catch(e) { pingEl.textContent = '测速异常'; pingEl.style.color = '#ff3b30'; }
        }

        function pingAllNodes() {
            if (proxyNodesForPing.length === 0) return showToast(' 没有可供测速的反代节点');
            showToast(' 正在对所有节点发起测速...');
            proxyNodesForPing.forEach((node, offset) => { setTimeout(() => pingTarget(node.idx, node.url), offset * 200); });
        }

        async function exportConfig() {
            try {
                const res = await fetch('/api/routes'); const data = await res.json();
                const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = 'emby_proxy_backup.json'; a.click();
                URL.revokeObjectURL(url); showToast(' 配置已导出');
            } catch (e) { showToast(' 导出失败'); }
        }

        function importConfig() {
            const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
            input.onchange = async (e) => {
                const file = e.target.files[0]; const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                        const routes = JSON.parse(event.target.result);
                        const res = await fetch('/api/routes/import', { method: 'POST', body: JSON.stringify(routes) });
                        const result = await res.json();
                        if (result.success) { showToast(' 配置导入成功'); load(); } else throw new Error(result.error);
                    } catch (err) { showToast(' 导入失败: ' + err.message); }
                };
                reader.readAsText(file);
            };
            input.click();
        }

        // 流量分批补齐:列表先出,流量每批 20 个节点向后台要,拿到一批刷新一批(服务端按 CF GraphQL 逐节点查,不再阻塞列表)
        let bwLoading = false;
        async function loadBandwidth() {
            if (bwLoading) return; bwLoading = true;
            try {
                for (let guard = 0; guard < 40; guard++) {
                    let d = null;
                    try { const r = await fetch('/api/routes/bandwidth'); d = await r.json(); } catch (e) { break; }
                    if (!d || !d.bw) break;
                    document.querySelectorAll('.bw-val').forEach(function (el) { const v = d.bw[el.getAttribute('data-bw')]; if (v) el.textContent = v; });
                    (window.globalRoutesData || []).forEach(function (r) { if (d.bw[r.prefix]) r.todayBandwidth = d.bw[r.prefix]; });
                    if (!d.remaining) break;
                }
            } finally { bwLoading = false; }
        }
        async function load() {
            const routesFetch = fetch('/api/routes');   // 与下面的设置读取并行发出,不再排在它们后面
            try {
                await Promise.all([loadPtState(), loadIpGuard()]);
            } catch (e) {}
            if (window.ROLE && window.ROLE !== 'sub') { loadNodeReqs().catch(() => {}); }
            try {
                const res = await routesFetch;
                if (!res.ok) throw new Error('请求失败，请检查环境配置');
                let data = await res.json();
                if (data.error) throw new Error(data.error);
                if (Array.isArray(data) && window.ROLE !== 'user') data = data.filter(r => !r.owner);

                //  新增：把节点流量数据存进全局内存，供大屏瞬间读取！
                window.globalRoutesData = data;
                updateModeCards();

                const container = document.getElementById('list-grid');
                if(data.length === 0) {
                    container.innerHTML = '<div style="text-align:center; color:var(--text-sec); grid-column: 1 / -1; padding: 40px;">暂无配置任何反代节点，请先部署一个。</div>';
                    return;
                }
                
                container.innerHTML = '';
                const htmlParts = [];   // 一次性写入 DOM:原先每个节点 innerHTML += 会把整个列表反复序列化再解析(节点越多越慢,O(n²))
                proxyNodesForPing = []; 
                const currentHost = window.location.host;

                data.forEach((r, idx) => {
                    // 转义引号，防止备注/图标/链接/规则 JSON 里的引号截断 onclick 属性（双引号必须用 HTML 实体，反斜杠转义在 HTML 属性内无效）
                    const esc = s => String(s == null ? '' : s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll("'", "\\\\'");
                    const proxyUrl = entryUrl(r.prefix);
                    const targets = r.target ? r.target.split(',').map(s => s.trim()).filter(Boolean) : [];
                    const mainTarget = targets[0] || '';
                    
                    const remarkName = r.remark || '未命名媒体库';
                    const lastPlay = r.last_play ? r.last_play : '暂无播放记录';
                    let watchDaysText = '暂无播放记录', watchOverdue = false;
                    if (r.last_play) {
                        try {
                            const lpUtc = Date.parse(r.last_play.replace(' ', 'T') + 'Z') - 8 * 3600000;
                            const diffDays = Math.floor((Date.now() - lpUtc) / 86400000);
                            watchDaysText = diffDays <= 0 ? '今天观看过' : (diffDays + ' 天前观看');
                            const wl = parseFloat(r.watch_limit);
                            if (wl > 0 && diffDays > wl) { watchOverdue = true; watchDaysText += ' · 已超 ' + (diffDays - wl) + ' 天'; }
                        } catch (e) {}
                    }
                    
                    const iconHtml = r.icon ? \`<img src="\${r.icon}" style="width:28px;height:28px;border-radius:6px;object-fit:cover;">\` : '${I.film}';
                    const pingAttr = mainTarget ? 'onclick="pingTarget(' + idx + ', \\'' + mainTarget + '\\')" title="点击重新测速"' : 'title="订阅模式不可测速"';
                    const pingText = mainTarget ? '测速中...' : '—';
                    const encodedTargets = encodeURIComponent(JSON.stringify(targets));
                    
                    //  接收后端传来的：单节点独立宽带与请求统计数据
                    const todayBw = r.todayBandwidth || '0 B';
                    const totalReqs = r.totalReqs || r.todayReqs || 0;

                    proxyNodesForPing.push({ idx: idx, url: mainTarget });

                    htmlParts.push(\`
                    <div class="emby-card route-item" data-prefix="\${esc(r.prefix)}" data-mode="\${esc(r.mode || '')}" data-search="\${escHtml(remarkName)} \${esc(r.prefix)}" data-search2="\${escHtml(targets.join(' '))}">
                        <div class="card-header">
                            <div class="card-title-group" style="display: flex; align-items: center; gap: 10px;">
                                <div class="drag-handle admin-only" title="长按拖拽排序" style="margin: 0; display: flex; align-items: center;">${I.lines}</div>
                                <input type="checkbox" class="node-cb admin-only" value="\${r.prefix}" style="width: 18px; height: 18px; margin: 0; cursor: pointer; accent-color: var(--primary); flex-shrink: 0;">
                                <div class="emby-icon" style="margin: 0; display: flex; align-items: center;">\${iconHtml}</div>
                                <div>
                                    <div style="font-weight: 600; font-size: 16px; color: var(--text);">\${remarkName}</div>
                                    <div style="font-size: 13px; color: var(--text-sec); margin-top:2px;">/\${r.prefix}</div>
                                </div>
                            </div>
                            <div style="display:flex; align-items:center;">
                                <span class="badge" style="background: rgba(0,113,227,0.1); color: var(--primary);">\${modeNames[r.mode] || '未知'}</span>
                            </div>
                        </div>

                        <div class="node-summary" style="display:flex; align-items:center; gap:14px; flex-wrap:wrap; padding-top:2px;">
                            <span id="ping-\${idx}" class="ping-badge" \${pingAttr}>\${pingText}</span>
                            <span class="bw-val" data-bw="\${esc(r.prefix)}" style="font-size:12px; color:var(--text-sec);">\${todayBw}</span>
                            <div style="margin-left:auto; display:flex; gap:8px; align-items:center;">
                                <button class="icon-btn" onclick="copyTxt('\${proxyUrl}')" title="复制直达链接">${SVG_COPY}</button>
                                <button class="icon-btn" onclick="toggleNodeDetail(this)" title="展开详情" style="transition:transform .25s;">${I.arrowdown}</button>
                            </div>
                        </div>

                        <div class="node-detail" style="display:none; flex-direction:column; gap:14px;">
                            <div style="background: rgba(120,120,120,0.05); border: 1px solid var(--border); border-radius: 10px; padding: 12px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                                <div style="display:flex; flex-direction: column; gap: 4px;">
                                    <span style="font-size:12px; color:var(--text-sec);">${I.arrowdown} 今日产生总流量</span>
                                    <span class="bw-val" data-bw="\${esc(r.prefix)}" style="font-size:16px; font-weight:700; color:var(--primary);">\${todayBw}</span>
                                </div>
                                <div style="display:flex; flex-direction: column; gap: 4px; text-align: right;">
                                    <span style="font-size:12px; color:var(--text-sec);">${I.tv} 播放次数 (今日/累计)</span>
                                    <span style="font-size:16px; font-weight:700; color:#ff9500;">\${r.todayReqs} / \${totalReqs} 次</span>
                                </div>
                            </div>

                            <div style="display: flex; flex-direction: column; gap: 10px;">
                                <div class="info-row">
                                    <span class="info-label">直达链接:</span>
                                    <div class="action-group" style="flex:1; justify-content: flex-end; margin-left: 10px; align-items: flex-start;">
                                        <span id="p-\${idx}" data-val="\${proxyUrl}" class="secret-text dynamic-url">••••••••</span>
                                        <button class="icon-btn" style="margin-top: 2px;" onclick="toggleVis('p-\${idx}')" title="查看明文">${SVG_EYE}</button>
                                        <button class="icon-btn" style="margin-top: 2px;" onclick="copyTxt('\${proxyUrl}')" title="复制链接">${SVG_COPY}</button>
                                    </div>
                                </div>
                                <div class="info-row admin-only">
                                    <span class="info-label">源站线路:</span>
                                    <div class="action-group" style="flex:1; justify-content: flex-end; margin-left: 10px; align-items: flex-start;">
                                        <div id="t-\${idx}" data-val="\${encodedTargets}" class="secret-text dynamic-url">••••••••</div>
                                        <button class="icon-btn" style="margin-top: 2px;" onclick="toggleVis('t-\${idx}', true)" title="查看明文">${SVG_EYE}</button>
                                    </div>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">海报缓存:</span>
                                    <span style="color:\${r.cache_img !== 'off' ? '#34c759' : '#ff9500'}; font-weight:600;">\${r.cache_img !== 'off' ? '${I.check} 已开启' : '${I.xmark} 已关闭'}</span>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">strm优化:</span>
                                    <span style="color:\${r.strm_opt === 'on' ? '#34c759' : '#ff9500'}; font-weight:600;">\${r.strm_opt === 'on' ? '${I.check} 已开启' : '${I.xmark} 已关闭'}</span>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">强制直连:</span>
                                    <span style="color:\${r.force_direct === 'on' ? '#ff9f0a' : '#8e8e93'}; font-weight:600;">\${r.force_direct === 'on' ? '${I.bolt} 禁转码' : '${I.check} 由源站决定'}</span>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">外部跳转:</span>
                                    <span style="color:\${r.redirect_direct === 'on' ? '#34c759' : (r.redirect_rules && r.redirect_rules !== '[]' ? '#34c759' : '#ff9500')}; font-weight:600;">\${r.redirect_direct === 'on' ? '${I.check} 直连' : (r.redirect_rules && r.redirect_rules !== '[]' ? '${I.lines} 规则' : '${I.xmark} 代理')}</span>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">最后活跃:</span>
                                    <span style="color:\${watchOverdue ? '#ff3b30' : 'var(--text-sec)'}; font-weight:\${watchOverdue ? '700' : 'normal'};">\${watchOverdue ? '${I.warn} ' : ''}\${watchDaysText}</span>
                                </div>
                            </div>

                            <div class="card-footer admin-only">
                                <button class="btn-edit" onclick="openImportModal('\${esc(r.prefix)}')" title="生成 SenPlayer / Rex / Hills 一键导入链接">一键导入</button>
                                <button class="btn-edit" onclick="editNode('\${esc(r.prefix)}', '\${esc(r.target)}', '\${esc(r.mode)}', '\${esc(r.remark || '')}', '\${esc(r.icon || '')}', '\${esc(r.cache_img)}', '\${esc(r.custom_ip || '')}', '\${esc(r.watch_limit || '0')}', '\${esc(r.node_user || '')}', '\${esc(r.node_pass || '')}', '\${esc(r.redirect_direct)}', '\${esc(r.redirect_rules || '')}', '\${esc(r.emos_id || '')}', '\${esc(r.emos_name || '')}', '\${esc(r.emos_aggregate || 'off')}', '\${esc(r.strm_opt || 'off')}', '\${esc(r.force_direct || 'off')}')">编辑配置</button>
                                <button class="btn-del" onclick="del('\${esc(r.prefix)}')">删除</button>
                            </div>
                        </div>
                    </div>\`);
                });
                container.innerHTML = htmlParts.join('');
                // 自动测速:6 路并发的队列(原先每个节点错开 500ms,110 个节点最后一个要等近一分钟才开始测)
                (function () { const q = proxyNodesForPing.filter(n => n.url); function next() { const n = q.shift(); if (!n) return; Promise.resolve(pingTarget(n.idx, n.url)).then(next, next); } for (let i = 0; i < 6; i++) next(); })();
                if (data.some(r => r.todayBandwidth === '统计中…')) loadBandwidth();
                
                filterNodesList();

                if (sortableInstance) sortableInstance.destroy();
                sortableInstance = Sortable.create(container, {
                    handle: '.drag-handle',
                    animation: 150,
                    delay: 200, 
                    delayOnTouchOnly: true,
                    onEnd: async function () {
                        const items = [];
                        container.querySelectorAll('.route-item').forEach((row, index) => {
                            const prefix = row.getAttribute('data-prefix');
                            if (prefix) items.push({ prefix: prefix, sort_order: index });
                        });
                        try {
                            await fetch('/api/routes/reorder', { method: 'POST', body: JSON.stringify(items) });
                            showToast(' 排序已保存');
                        } catch(e) { showToast(' 排序保存失败'); }
                    }
                });

            } catch (err) {
                document.getElementById('list-grid').innerHTML = \`<div style="text-align:center; color:#ff3b30; font-weight:600; grid-column: 1 / -1; padding: 20px;">${I.warn} 读取失败: \${err.message}</div>\`;
            }
        }

        function toggleEmosFields() {
            const modeEl = document.getElementById('mode');
            const emosEl = document.getElementById('emosFields');
            if (!modeEl || !emosEl) return;
            emosEl.style.display = (modeEl.value === 'emos') ? 'flex' : 'none';
        }
        function editNode(prefix, targetStr, mode, remark, icon, cacheImg, customIp, watchLimit, nodeUser, nodePass, redirectDirect, redirectRulesRaw, emosId, emosName, emosAggregate, strmOpt, forceDirect) {
            document.getElementById('oldPrefix').value = prefix;
            document.getElementById('remark').value = remark;
            document.getElementById('prefix').value = prefix;
            document.getElementById('mode').value = mode || 'off';
            document.getElementById('nodeCache').checked = (cacheImg !== 'off');
            document.getElementById('nodeFakeIp').value = customIp || '';
            document.getElementById('watchLimit').value = watchLimit || '0';
            document.getElementById('nodeUser').value = nodeUser || '';
            document.getElementById('nodePass').value = nodePass || '';
            document.getElementById('nodeEmosId').value = emosId || 'eK3QYG29Ms';
            document.getElementById('nodeEmosName').value = emosName || '玛卡巴卡的反代面板';
            document.getElementById('nodeEmosAggregate').checked = (emosAggregate === 'on');
            document.getElementById('nodeStrmOpt').checked = (strmOpt === 'on');
            document.getElementById('nodeForceDirect').checked = (forceDirect === 'on');
            toggleEmosFields();
            document.getElementById('nodeRedirectDirect').checked = (redirectDirect === 'on');
            const rulesEnable = document.getElementById('nodeRulesEnable');
            try {
                const arr = parseRedirectRulesLocal(redirectRulesRaw || '');
                rulesEnable.checked = arr.length > 0 && redirectDirect !== 'on';
                renderRulesList(arr);
            } catch (e) { rulesEnable.checked = false; renderRulesList([]); }
            
            if (icon) {
                const foundItem = globalIcons.find(i => i.url === icon);
                selectIcon(icon, foundItem ? foundItem.name : '已选择图标');
            } else {
                selectIcon('', '默认');
            }

            document.getElementById('submitBtn').textContent = '保存修改';
            
            const container = document.getElementById('targetInputs');
            container.innerHTML = '';
            const targets = targetStr.split(',').map(s => s.trim()).filter(Boolean);
            
            targets.forEach((url) => {
                const inp = document.createElement('input');
                inp.type = 'url'; inp.className = 'target-input'; inp.value = url;
                inp.style = 'padding: 12px 16px; border: 1px solid var(--border); border-radius: 8px; background:var(--card); width: 100%;';
                inp.oninput = handleTargetInputs;
                container.appendChild(inp);
            });
            
            const emptyInp = document.createElement('input');
            emptyInp.type = 'url'; emptyInp.className = 'target-input';
            emptyInp.style = 'padding: 12px 16px; border: 1px solid var(--border); border-radius: 8px; background:var(--card); width: 100%;';
            emptyInp.oninput = handleTargetInputs;
            container.appendChild(emptyInp);
            
            handleTargetInputs(); 
            document.getElementById('nodeModalTitle').textContent='编辑节点';
            document.getElementById('nodeModal').style.display='block';
        }
        // ============ 302/307 域名规则（动态条目） ============
        function parseRedirectRulesLocal(text) {
            if (!text) return [];
            if (typeof text === 'string' && text.trim().charAt(0) === '[') {
                try { const arr = JSON.parse(text); if (Array.isArray(arr)) return arr.filter(x => x && x.d).map(x => ({ d: String(x.d).toLowerCase(), a: x.a === 'direct' ? 'direct' : 'proxy' })); } catch (e) {}
            }
            const rules = [];
            for (const line of String(text).split(/\\r?\\n/)) {
                const t = line.trim(); if (!t) continue;
                const parts = t.split(',').map(s => s.trim());
                if (parts.length < 2 || !parts[0]) continue;
                let domain = parts[0].replace(/^https?:\\/\\//i, '').replace(/\\/.*$/, '').trim();
                domain = domain.replace(/^www\\./i, '');
                if (!domain || /\\s|\\//.test(domain)) continue;
                const action = /^(direct|直连|不走反代)$/i.test(parts[1]) ? 'direct' : (/^(proxy|代理|走反代)$/i.test(parts[1]) ? 'proxy' : null);
                if (!action) continue;
                rules.push({ d: domain.toLowerCase(), a: action });
            }
            return rules;
        }
        function addRuleRow(d, a) {
            const list = document.getElementById('rulesList');
            const row = document.createElement('div');
            row.style = 'display:flex; gap:8px; align-items:center;';
            const inp = document.createElement('input');
            inp.type = 'text'; inp.className = 'rule-domain';
            inp.placeholder = '域名 (如: a.com)'; inp.value = d || '';
            inp.style = 'flex:1; min-width:120px; padding:10px 12px; border:1px solid var(--border); border-radius:8px; background:var(--bg); font-size:14px; color:var(--text);';
            const sel = document.createElement('select');
            sel.className = 'rule-action';
            sel.style = 'padding:10px 12px; border:1px solid var(--border); border-radius:8px; background:var(--bg); font-size:14px; color:var(--text); flex-shrink:0;';
            sel.innerHTML = '<option value="direct">直连</option><option value="proxy">代理</option>';
            sel.value = a || 'direct';
            const del = document.createElement('button');
            del.type = 'button'; del.textContent = '×';
            del.style = 'background:transparent; border:none; color:var(--text-sec); font-size:18px; cursor:pointer; padding:6px 8px; flex-shrink:0;';
            del.onclick = () => { row.remove(); ensureRuleRow(); };
            row.appendChild(inp); row.appendChild(sel); row.appendChild(del);
            list.appendChild(row);
            inp.oninput = () => {
                const rows = list.children;
                if (inp.value.trim() && rows.length && rows[rows.length - 1] === row) addRuleRow('', 'direct');
            };
            return row;
        }
        function renderRulesList(arr) {
            const list = document.getElementById('rulesList');
            if (!list) return;
            list.innerHTML = '';
            const items = (Array.isArray(arr) && arr.length) ? arr : [null];
            items.forEach(x => addRuleRow(x ? x.d : '', x ? x.a : 'direct'));
        }
        function ensureRuleRow() {
            const list = document.getElementById('rulesList');
            if (list && !list.children.length) addRuleRow('', 'direct');
        }
        function collectRules() {
            const out = [];
            document.querySelectorAll('#rulesList .rule-domain').forEach((inp) => {
                const d = inp.value.trim().replace(/^https?:\\/\\//i, '').replace(/\\/.*$/, '').replace(/^www\\./i, '');
                if (!d || /\\s|\\//.test(d)) return;
                const row = inp.parentElement;
                const a = row.querySelector('.rule-action').value;
                out.push({ d: d.toLowerCase(), a: a === 'proxy' ? 'proxy' : 'direct' });
            });
            return JSON.stringify(out);
        }
        function toggleNodeDetail(btn) {
            const card = btn.closest('.emby-card');
            const d = card.querySelector('.node-detail');
            const show = d.style.display === 'none';
            d.style.display = show ? 'flex' : 'none';
            btn.classList.toggle('rotated', show);
            btn.title = show ? '收起' : '展开详情';
        }
        // ============ 节点申请(订阅者提交 / 管理员审核) ============
        let NODE_REQS = [];
        async function loadNodeReqs() {
            try {
                const res = await fetch('/api/node-requests');
                const d = await res.json();
                NODE_REQS = d.success ? (d.requests || []) : [];
            } catch (e) { NODE_REQS = []; }
            const badge = document.getElementById('nodeReqBadge');
            if (badge) { badge.style.display = NODE_REQS.length ? 'inline-flex' : 'none'; badge.textContent = NODE_REQS.length > 99 ? '99+' : String(NODE_REQS.length); }
        }
        function openNodeReqModal() {
            document.getElementById('nodeReqModal').style.display = 'block';
            renderNodeReqs();
        }
        function closeNodeReqModal() { document.getElementById('nodeReqModal').style.display = 'none'; }
        function parseReqUrls(v) { try { const a = JSON.parse(v); if (Array.isArray(a)) return a.map(String); } catch (e) {} return v ? [String(v)] : []; }
        function renderNodeReqs() {
            const box = document.getElementById('nodeReqList');
            if (!box) return;
            if (!NODE_REQS.length) { box.innerHTML = '<div style="text-align:center; color:var(--text-sec); font-size:14px; padding:30px;">暂无节点申请</div>'; return; }
            box.innerHTML = NODE_REQS.map(r => {
                const urls = parseReqUrls(r.url);
                return '<div style="background:var(--bg); border:1px solid var(--border); border-radius:12px; padding:12px 14px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">' +
                '<div style="flex:1; min-width:200px;">' +
                    '<div style="font-weight:600; font-size:14px;">' + escHtml(r.name) + '</div>' +
                    '<div style="font-size:12px; color:var(--text-sec); word-break:break-all; line-height:1.7;">' + urls.map(u => '• ' + escHtml(u)).join('<br>') + '</div>' +
                    '<div style="font-size:11px; color:var(--text-faint); margin-top:2px;">' + escHtml(r.created_at || '') + '</div>' +
                '</div>' +
                '<button class="btn-submit" onclick="approveNodeReq(' + r.id + ')" style="padding:7px 14px; font-size:13px;">${I.check} 同意</button>' +
                '<button class="btn-ghost" onclick="rejectNodeReq(' + r.id + ')" style="padding:7px 14px; font-size:13px;">${I.xmark} 拒绝</button>' +
                '</div>';
            }).join('');
        }
        async function approveNodeReq(id) {
            try {
                const res = await fetch('/api/node-requests/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'approve' }) });
                const d = await res.json();
                if (!d.success) return showToast(' ' + (d.error || '审批失败'));
                closeNodeReqModal();
                location.href = '/?prefill=1&name=' + encodeURIComponent(d.data.name) + '&urls=' + encodeURIComponent(JSON.stringify(parseReqUrls(d.data.url)));
            } catch (e) { showToast(' 审批失败: ' + e.message); }
        }
        async function rejectNodeReq(id) {
            try {
                const res = await fetch('/api/node-requests/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'reject' }) });
                const d = await res.json();
                if (!d.success) return showToast(' ' + (d.error || '取消失败'));
                showToast(' 已拒绝该申请');
                await loadNodeReqs();
                renderNodeReqs();
            } catch (e) { showToast(' 取消失败: ' + e.message); }
        }
        function resetSubReqUrls() {
            const box = document.getElementById('subReqUrlBox');
            if (!box) return;
            box.innerHTML = '<input type="url" class="sub-req-url" placeholder="主线路地址（如: https://1.1.1.1:8096）" oninput="handleSubReqUrls()" style="width:100%;"><input type="url" class="sub-req-url" placeholder="备用线路 1（选填，可继续添加）" oninput="handleSubReqUrls()" style="width:100%;">';
        }
        function handleSubReqUrls() {
            const container = document.getElementById('subReqUrlBox');
            if (!container) return;
            const inputs = container.querySelectorAll('.sub-req-url');
            const lastInput = inputs[inputs.length - 1];
            if (lastInput && lastInput.value.trim() !== '') {
                const n = document.createElement('input');
                n.type = 'url'; n.className = 'sub-req-url';
                n.placeholder = '备用线路 ' + inputs.length + '（选填，可继续添加）';
                n.style = 'width:100%;';
                n.oninput = handleSubReqUrls;
                container.appendChild(n);
            }
            let emptyCount = 0;
            const all = container.querySelectorAll('.sub-req-url');
            for (let i = all.length - 1; i >= 0; i--) { if (all[i].value.trim() === '') { emptyCount++; if (emptyCount > 1) all[i].remove(); } else break; }
        }
        function openSubReqModal() {
            document.getElementById('subReqModal').style.display = 'block';
            const nm = document.getElementById('subReqName'); if (nm) nm.value = '';
            resetSubReqUrls();
            const hint = document.getElementById('subReqHint'); if (hint) hint.innerHTML = '提交后管理员审核；线路已存在会直接提示你，同线路的新申请会自动覆盖旧申请（含全部备用线路）。';
        }
        function closeSubReqModal() { document.getElementById('subReqModal').style.display = 'none'; }
        async function submitNodeReq() {
            const name = document.getElementById('subReqName').value.trim();
            const urls = [];
            document.querySelectorAll('.sub-req-url').forEach(inp => { const v = inp.value.trim(); if (v) urls.push(v); });
            if (!name || !urls.length) return showToast(' 请填写节点名字与至少一条线路地址');
            const hint = document.getElementById('subReqHint');
            try {
                const res = await fetch('/api/node-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, urls }) });
                const d = await res.json();
                if (d.success) {
                    if (d.replaced) {
                        hint.innerHTML = '<span style="color:#00c2ff;"> 同线路已有申请「' + escHtml(d.name) + '」，已自动替换为你提交的新申请（含全部备用线路）</span>';
                    } else {
                        hint.innerHTML = '<span style="color:var(--success);"> 申请已提交，等待管理员审核</span>';
                        document.getElementById('subReqName').value = ''; resetSubReqUrls();
                    }
                } else if (d.exists) {
                    hint.innerHTML = '<span style="color:#ff9f0a;"> 该线路已存在节点「' + escHtml(d.remark) + '」，访问后缀 /' + escHtml(d.prefix) + '，无需重复申请</span>';
                } else {
                    hint.innerHTML = '<span style="color:#ff6b6b;"> ' + escHtml(d.error || '提交失败') + '</span>';
                }
            } catch (e) { hint.innerHTML = '<span style="color:#ff6b6b;"> ' + escHtml(e.message) + '</span>'; }
        }
        // 管理员点「同意」跳转回来:自动打开添加节点并预填线路/名字
        (function prefillFromApproval() {
            try {
                const qp = new URLSearchParams(location.search);
                if (qp.get('prefill') !== '1') return;
                openNodeModal();
                const nm = document.getElementById('remark'); if (nm) nm.value = qp.get('name') || '';
                let urls = [];
                try { const a = JSON.parse(qp.get('urls') || '[]'); if (Array.isArray(a)) urls = a.map(String); } catch (e) {}
                if (!urls.length && qp.get('url')) urls = [qp.get('url')];
                if (urls.length) {
                    let idx = 0;
                    const setNext = (u) => {
                        const inputs = document.querySelectorAll('.target-input');
                        if (inputs[idx]) { inputs[idx].value = u; }
                        else { handleTargetInputs(); const ins2 = document.querySelectorAll('.target-input'); if (ins2[idx]) ins2[idx].value = u; }
                        idx++;
                    };
                    urls.forEach(setNext);
                    handleTargetInputs();
                }
                showToast(' 已从申请预填，请修改名字/后缀后保存');
                history.replaceState(null, '', location.pathname);
            } catch (e) {}
        })();

        function openNodeModal() {
            const f = document.getElementById('addForm');
            f.reset();
            document.getElementById('oldPrefix').value='';
            selectIcon('','默认');
            document.getElementById('nodeCache').checked=true;
            document.getElementById('nodeRedirectDirect').checked=false;
            document.getElementById('nodeStrmOpt').checked=false;
            document.getElementById('nodeForceDirect').checked=false;
            document.getElementById('nodeRulesEnable').checked=false;
            renderRulesList([]);
            toggleEmosFields();
            document.getElementById('submitBtn').textContent='保存部署';
            document.getElementById('nodeModalTitle').textContent='添加节点';
            document.getElementById('nodeModal').style.display='block';
        }
        function closeNodeModal() {
            document.getElementById('nodeModal').style.display='none';
        }

        function openImportModal(prefix) {
            const r = (window.globalRoutesData || []).find(x => x.prefix === prefix) || {};
            document.getElementById('impPrefix').value = prefix || '';
            document.getElementById('impName').value = r.remark || r.prefix || '';
            document.getElementById('impUser').value = r.node_user || '';
            document.getElementById('impPass').value = r.node_pass || '';
            document.getElementById('importModal').style.display = 'block';
        }
        function buildImpLink(which) {
            const scheme = location.protocol.replace(':', '');
            const host = location.hostname;
            const port = location.port || (scheme === 'https' ? '443' : '80');
            const prefix = String(document.getElementById('impPrefix').value || '').trim();
            const name = String(document.getElementById('impName').value || '').trim() || prefix;
            const username = encodeURIComponent(String(document.getElementById('impUser').value || '').trim());
            const password = encodeURIComponent(String(document.getElementById('impPass').value || '').trim());
            const path = prefix ? '/' + prefix : '';
            const address = scheme + '://' + host + path;
            if (which === 'sen') return 'senplayer://importserver?type=emby&name=' + encodeURIComponent(name) + '&address=' + encodeURIComponent(address) + '&username=' + username + '&password=' + password;
            if (which === 'rex') return 'rex://import?type=emby&scheme=' + scheme + '&host=' + host + path + '&port=' + port + '&username=' + username + '&password=' + password + '&title=' + encodeURIComponent(name);
            return 'hills://import?type=emby&scheme=' + scheme + '&host=' + host + path + '&port=' + port + '&username=' + username + '&password=' + password;
        }
        function openImpLink(which) {
            const link = buildImpLink(which);
            if (!link) return;
            window.location.href = link;
        }
        function closeImpModal() { document.getElementById('importModal').style.display = 'none'; }

        // ============ 手动覆盖/更新 弹窗 ============
        function openCodeModal(mode) {
            const modal = document.getElementById('codeModal');
            const area = document.getElementById('codeArea');
            const file = document.getElementById('fileInput');
            if (mode === 'file') {
                area.style.display = 'none';
                file.style.display = 'block';
            } else {
                area.style.display = 'block';
                file.style.display = 'none';
            }
            modal.style.display = 'block';
        }
        function closeCodeModal() {
            document.getElementById('codeModal').style.display = 'none';
        }

        // ============ Worker 调度/区域 弹窗 ============
        function openPlacementModal() {
            document.getElementById('placementModal').style.display = 'block';
        }
        function closePlacementModal() {
            document.getElementById('placementModal').style.display = 'none';
        }

        // ============ 账户设置 弹窗 ============
        // ============ 自定义头像（左上角 / 登录页 / favicon） ============
        const DEFAULT_LOGO = '${EMBY_LOGO}';
        function applyLogo(v) {
            if (!v) return;
            const imgs = document.querySelectorAll('.topbar-logo, .login-logo');
            imgs.forEach(function (im) { im.src = v; });
            const fav = document.querySelector('link[rel="icon"]');
            if (fav) fav.href = v;
        }
        async function loadLogo() {
            try {
                const res = await fetch('/api/logo');
                const d = await res.json();
                if (d.success && d.logo && d.logo.value) {
                    applyLogo(d.logo.value);
                    const preview = document.getElementById('logoPreview');
                    if (preview) preview.src = d.logo.value;
                    if (d.logo.type === 'url') document.getElementById('logoUrlInput').value = d.logo.value;
                } else {
                    const preview = document.getElementById('logoPreview');
                    if (preview) preview.src = DEFAULT_LOGO;
                    document.getElementById('logoUrlInput').value = '';
                }
            } catch (e) { console.error(e); }
        }
        function readLogoFile(file) {
            if (!file) return;
            if (!/^image\\/(png|jpeg|jpg|webp|gif)$/i.test(file.type)) { alert('仅支持 png / jpg / webp / gif 图片'); return; }
            if (file.size > 5 * 1024 * 1024) { alert('图片超过 5MB，请换更小的图片'); return; }
            const reader = new FileReader();
            reader.onload = function (e) {
                const img = new Image();
                img.onload = function () {
                    try {
                        const MAX = 256;
                        let w = img.width, h = img.height;
                        if (w > MAX || h > MAX) {
                            const ratio = Math.min(MAX / w, MAX / h);
                            w = Math.max(1, Math.round(w * ratio)); h = Math.max(1, Math.round(h * ratio));
                        }
                        const cv = document.createElement('canvas');
                        cv.width = w; cv.height = h;
                        const cx = cv.getContext('2d');
                        cx.drawImage(img, 0, 0, w, h);
                        const isPng = /^image\\/(png|webp|gif)$/i.test(file.type);
                        let dataUrl = cv.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.88);
                        if (!isPng && dataUrl.length > 180000) {
                            const alt = cv.toDataURL('image/png');
                            if (alt.length < dataUrl.length) dataUrl = alt;
                        }
                        if (dataUrl.length > 580000) { alert('压缩后图片仍过大（>450KB），请换更简单的图片'); return; }
                        window.__logoPending = { type: 'data', value: dataUrl };
                        document.getElementById('logoUrlInput').value = '';
                        document.getElementById('logoPreview').src = dataUrl;
                    } catch (err) { alert('图片处理失败：' + err.message); }
                };
                img.onerror = function () { alert('图片解析失败，请换一张'); };
                img.src = e.target.result;
            };
            reader.onerror = function () { alert('读取文件失败'); };
            reader.readAsDataURL(file);
        }
        async function saveLogo() {
            let payload;
            if (window.__logoPending) payload = window.__logoPending;
            else {
                const url = document.getElementById('logoUrlInput').value.trim();
                if (!url) { alert('请先上传图片或填写图片 URL'); return; }
                if (!/^https?:\\/\\//i.test(url)) { alert('URL 需以 http(s):// 开头'); return; }
                payload = { type: 'url', value: url };
            }
            const res = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logo: payload }) });
            const data = await res.json();
            if (data.success) {
                window.__logoPending = null;
                applyLogo(payload.value);
                showToast(' 自定义头像已保存');
            } else alert('保存失败：' + (data.error || ''));
        }
        async function resetLogo() {
            const res = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logo: null }) });
            const data = await res.json();
            if (data.success) {
                window.__logoPending = null;
                document.getElementById('logoUrlInput').value = '';
                document.getElementById('logoPreview').src = DEFAULT_LOGO;
                applyLogo(DEFAULT_LOGO);
                showToast('已恢复默认头像');
            } else alert('恢复失败：' + (data.error || ''));
        }
        function openAccountModal() {
            const modal = document.getElementById('accountModal');
            modal.style.display = 'block';
            const sp = document.getElementById('accountSubPanel');
            if (window.ROLE === 'sub') {
                document.getElementById('accountAdminPanel').style.display = 'none';
                if (sp) { sp.style.display = 'block'; sp.innerHTML = ' 当前为订阅用户模式，仅可查看节点，无任何修改权限。'; }
            } else if (window.ROLE === 'subadmin') {
                document.getElementById('accountAdminPanel').style.display = 'none';
                if (sp) { sp.style.display = 'block'; sp.innerHTML = ' 当前为子管理员模式：可查看节点，可审核（通过/拒绝）用户的节点添加申请并直接添加节点；但不能编辑/删除现有节点、测速、DNS 及任何其他管理操作。'; }
            } else if (window.ROLE === 'user') {
                document.getElementById('accountAdminPanel').style.display = 'none';
                if (sp) sp.style.display = 'none';
                const up = document.getElementById('accountUserPanel');
                if (up) { up.style.display = 'flex'; refreshUserInfo(); }
            } else {
                document.getElementById('accountAdminPanel').style.display = 'flex';
                if (sp) sp.style.display = 'none';
                loadSubscribers();
                loadPtState();
                loadPtHits();
                loadVersionPanel();
                loadSubadminStatus();
                loadAuditReqs();
                loadNoticeEditor();
                loadAdminLogs();
                loadLogo();
            }
        }
        function closeAccountModal() {
            document.getElementById('accountModal').style.display = 'none';
        }
        let PT = { enabled: false, key: '' };
        function entryUrl(prefix) {
            return 'https://' + window.location.host + '/' + (PT.enabled ? PT.key + '/' : '') + prefix;
        }
        function toggleIpGuardCard() {
            const b = document.getElementById('ipguardCardBody');
            const a = document.getElementById('ipguardCardArrow');
            if (!b) return;
            const open = b.style.display !== 'none';
            b.style.display = open ? 'none' : 'block';
            if (a) a.textContent = open ? ' 展开' : '▼ 收起';
        }
        // ============ IP 访问控制 ============
        async function loadIpGuard() {
            try {
                const res = await fetch('/api/ipguard');
                const d = await res.json();
                if (!d.success) return;
                document.querySelectorAll('input[name=ipgMode]').forEach(r => { r.checked = (r.value === d.mode); });
                document.getElementById('ipgIps').value = (d.ips || []).join('\\n');
                document.getElementById('ipgCountries').value = (d.countries || []).join('\\n');
                document.getElementById('ipgRedirect').value = d.redirect || '';
                document.getElementById('ipgCurrent').textContent = (d.currentIp || '-') + (d.currentCountry ? ' (' + d.currentCountry + ')' : '');
                IPG_TRUSTED = d.trusted || [];
                renderTrusted();
                if (d.blocked) {
                    document.getElementById('ipgBlockedIps').value = (d.blocked.ips || []).join('\\n');
                    document.getElementById('ipgBlockedRedirect').value = d.blocked.redirect || '';
                }
            } catch (e) {}
        }
        function ipgAddCurrent() {
            const cur = document.getElementById('ipgCurrent').textContent;
            const m = (cur || '').match(/\\d{1,3}(\\.\\d{1,3}){3}|[0-9a-fA-F:]+/);
            if (!m) return;
            const ta = document.getElementById('ipgIps');
            const list = ta.value.split('\\n').map(x => x.trim()).filter(Boolean);
            if (list.indexOf(m[0]) < 0) { list.push(m[0]); ta.value = list.join('\\n'); }
        }
        let IPG_TRUSTED = [];
        function renderTrusted() {
            const box = document.getElementById('ipgTrustedList');
            if (!box) return;
            if (!IPG_TRUSTED.length) { box.innerHTML = '<div style="font-size:12px; color:var(--text-sec); padding:4px 0;">暂无信任 IP</div>'; return; }
            box.innerHTML = IPG_TRUSTED.map(ip => '<div style="display:flex; align-items:center; justify-content:space-between; font-size:12px; padding:5px 8px; background:var(--bg); border-radius:6px; gap:8px;"><span style="word-break:break-all;">' + escHtml(ip) + '</span><button onclick="ipgTrustedDel(this)" data-ip="' + escHtml(ip) + '" style="background:none;border:none;color:#ff6b6b;cursor:pointer;font-size:13px;flex-shrink:0;" title="删除"></button></div>').join('');
        }
        function ipgTrustedDel(btn) {
            const ip = btn.getAttribute('data-ip');
            if (!ip) return;
            IPG_TRUSTED = IPG_TRUSTED.filter(x => x !== ip);
            renderTrusted();
        }
        function ipgTrustedAddOne() {
            const inp = document.getElementById('ipgTrustedAdd');
            const v = (inp.value || '').trim();
            if (!v) return;
            if (IPG_TRUSTED.indexOf(v) < 0) IPG_TRUSTED.push(v);
            inp.value = '';
            renderTrusted();
        }
        async function saveIpGuard() {
            const modeEl = document.querySelector('input[name=ipgMode]:checked');
            if (!modeEl) { alert('保存失败：未选中模式，请先展开 IP 访问控制卡片并选择模式'); return; }
            const mode = modeEl.value;
            const ips = document.getElementById('ipgIps').value.split('\\n').map(x => x.trim()).filter(Boolean);
            const countries = document.getElementById('ipgCountries').value.split(/[\\n,，、\s]+/).map(x => x.trim().toUpperCase()).filter(Boolean);
            const redirect = document.getElementById('ipgRedirect').value.trim();
            const blockedIps = document.getElementById('ipgBlockedIps').value.split('\\n').map(x => x.trim()).filter(Boolean);
            const blockedRedirect = document.getElementById('ipgBlockedRedirect').value.trim();
            try {
                const res = await fetch('/api/ipguard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, ips, countries, redirect, trusted: IPG_TRUSTED, blockedIps, blockedRedirect }) });
                const d = await res.json();
                if (d.success) showToast('IP 访问控制已保存'); else alert('保存失败: ' + (d.error || ''));
            } catch (e) { alert('保存失败: ' + e); }
        }
        async function loadPtState() {
            try {
                const res = await fetch('/api/proxytoken');
                const data = await res.json();
                if (data.success) PT = { enabled: !!data.enabled, key: data.key || '' };
            } catch (e) {}
            const on = document.getElementById('ptOn');
            if (on) on.checked = PT.enabled;
            const k = document.getElementById('ptKey');
            if (k) k.value = PT.key || '';
            await loadSecurityState();
            await loadNotifyState();
        }
        // ============ 安全设置:裸域名直连代理开关 ============
        async function loadSecurityState() {
            try {
                const res = await fetch('/api/security');
                const d = await res.json();
                const el = document.getElementById('bareProxyChk');
                if (el && d.success) el.checked = !!d.bareProxy;
            } catch (e) {}
        }
        async function saveSecuritySettings() {
            const el = document.getElementById('bareProxyChk');
            if (!el) return;
            try {
                const res = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bareProxy: el.checked }) });
                const d = await res.json();
                if (d.success) showToast(' 安全设置已保存'); else alert('保存失败: ' + (d.error || ''));
            } catch (e) { alert('保存失败: ' + e); }
        }
        async function loadNotifyState() {
            try {
                const res = await fetch('/api/account/notify');
                const data = await res.json();
                if (data.success) {
                    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
                    const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = v !== false; };
                    set('barkKey', data.barkKey);
                    set('barkLevel', data.barkLevel || 'active');
                    set('barkServer', data.barkServer || 'https://api.day.app');
                    setChk('barkNotify', data.barkNotify);
                    set('tgToken', data.tgToken);
                    set('tgChatId', data.tgChatId);
                    setChk('tgNotify', data.tgNotify);
                    setChk('serverChanNotify', data.serverChanNotify);
                    set('serverChanKey', data.serverChanKey);
                    setChk('dingTalkNotify', data.dingTalkNotify);
                    set('dingTalkWebhook', data.dingTalkWebhook);
                    // v3.4.68:回填检查间隔(小时)
                    const ci = document.getElementById('checkIntervalHours'); if (ci) ci.value = data.checkIntervalHours || '';
                    // v3.5.4:回填 TG 群机器人日报
                    const tgge = document.getElementById('tgGroupEnabled'); if (tgge) tgge.checked = data.tgGroupEnabled !== false;
                    set('tgGroupBotToken', data.tgGroupBotToken);
                    set('tgGroupChatId', data.tgGroupChatId);
                    const tgh = document.getElementById('tgGroupHour'); if (tgh) tgh.value = data.tgGroupHour || 20;
                }
            } catch (e) {}
        }
        async function saveNotifySettings() {
            const barkKey = document.getElementById('barkKey').value.trim();
            const barkLevel = document.getElementById('barkLevel').value;
            const barkServer = document.getElementById('barkServer').value.trim();
            const barkNotify = document.getElementById('barkNotify').checked;
            const tgToken = document.getElementById('tgToken').value.trim();
            const tgChatId = document.getElementById('tgChatId').value.trim();
            const tgNotify = document.getElementById('tgNotify').checked;
            const serverChanKey = document.getElementById('serverChanKey').value.trim();
            const serverChanNotify = document.getElementById('serverChanNotify').checked;
            const dingTalkWebhook = document.getElementById('dingTalkWebhook').value.trim();
            const dingTalkNotify = document.getElementById('dingTalkNotify').checked;
            // v3.4.68:检查间隔(小时),0/空 = 默认 6
            const checkIntervalHours = parseFloat(document.getElementById('checkIntervalHours').value) || 0;
            // v3.5.4:TG 群机器人日报(独立 Bot)
            const tgGroupEnabled = document.getElementById('tgGroupEnabled').checked;
            const tgGroupBotToken = document.getElementById('tgGroupBotToken').value.trim();
            const tgGroupChatId = document.getElementById('tgGroupChatId').value.trim();
            const tgGroupHour = parseFloat(document.getElementById('tgGroupHour').value) || 20;
            const res = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notify: { barkKey, barkLevel, barkServer, barkNotify, tgToken, tgChatId, tgNotify, serverChanKey, serverChanNotify, dingTalkWebhook, dingTalkNotify, checkIntervalHours, tgGroupEnabled, tgGroupBotToken, tgGroupChatId, tgGroupHour } }) });
            const data = await res.json();
            if (data.success) { showToast('保号通知设置已保存'); closeAccountModal(); }
            else alert('保存失败：' + (data.error || ''));
        }
        // 一键发送日报:立即发送当天真实日报(返回全文预览,验证数据链路)
        async function sendTgGroupReport() {
            const res = await fetch('/api/tg-group-send-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
            const data = await res.json();
            if (!data.success) { alert('发送失败：' + (data.error || '')); return; }
            alert('日报已发送成功，群内请查收。内容预览：\\n\\n' + (data.preview || ''));
        }
        // v3.5.4:测试 TG 群机器人日报(独立 Bot)
        async function testTgGroup() {
            // 掩码(********)或空值不提交,后端自动回退已保存的真实配置
            const rawToken = document.getElementById('tgGroupBotToken').value.trim();
            const rawChat = document.getElementById('tgGroupChatId').value.trim();
            const botToken = (rawToken && rawToken !== '********') ? rawToken : '';
            const chatId = (rawChat && rawChat !== '********') ? rawChat : '';
            const hour = parseFloat(document.getElementById('tgGroupHour').value) || 20;
            const res = await fetch('/api/tg-group-test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botToken, chatId, hour }) });
            const data = await res.json();
            alert(data.success ? '群 Bot 测试消息发送成功' : ('发送失败：' + (data.error || '')));
        }
        async function testNotifyFn(type) {
            const res = await fetch('/api/test-notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type }) });
            const data = await res.json();
            alert(data.success ? '测试通知发送成功' : ('发送失败：' + (data.error || '')));
        }
        async function saveProxyToken() {
            const enabled = document.getElementById('ptOn').checked;
            const key = document.getElementById('ptKey').value.trim();
            if (enabled && !/^[A-Za-z0-9]{3,32}$/.test(key)) { alert('密钥需 3-32 位字母数字'); return; }
            if (enabled && ['entry','api','catch','speedtest','__client_rtt__','favicon.ico'].indexOf(key.toLowerCase()) >= 0) { alert('该密钥已被系统保留占用（如 entry），请更换'); return; }
            const res = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proxyToken: { enabled, key } }) });
            const data = await res.json();
            if (data.success) {
                closeAccountModal();
                const tip = enabled
                    ? '反代 Token 已开启，所有节点直达链接将带上前缀 /' + key + '/，旧链接全部失效，请重新获取并分发新链接。'
                    : '反代 Token 已关闭，所有节点直达链接已恢复无前缀访问。';
                alert(tip);
                // 链接前缀变化影响所有节点直达链接，提醒后整页刷新，避免旧链接残留
                window.location.reload();
            } else alert('保存失败：' + (data.error || ''));
        }
        function fmtHitTs(ts) {
            const d = new Date(ts + 8 * 3600000);
            return String(d.getUTCFullYear()).slice(2) + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0') + ' ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
        }
        async function loadPtHits() {
            const box = document.getElementById('ptHits');
            try {
                const res = await fetch('/api/proxytoken/hits');
                const data = await res.json();
                const hits = (data && data.hits) || [];
                if (!hits.length) { box.innerHTML = '<span style="color:var(--text-sec);">暂无记录</span>'; return; }
                box.innerHTML = hits.map(h => '<div style="padding:8px 10px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;background:var(--bg);">'
                    + '<div style="color:var(--text);font-weight:600;font-size:13px;">' + escHtml(h.ip) + ' <span style="color:var(--primary);font-weight:700;">×' + (h.times || 1) + '</span></div>'
                    + '<div style="color:var(--text-sec);font-size:12px;word-break:break-all;margin-top:2px;">' + escHtml(h.path || '') + '</div>'
                    + '<div style="color:var(--text-sec);font-size:11px;margin-top:2px;">' + fmtHitTs(h.ts || 0) + ' · ' + escHtml(String(h.ua || '').slice(0, 70)) + '</div></div>'
                ).join('') + '<button class="btn-ghost" style="margin-top:6px;font-size:12px;" onclick="clearPtHits()">' + (I.trash || '清除') + ' 清空记录</button>';
            } catch (e) { box.innerHTML = '<span style="color:var(--text-sec);">加载失败</span>'; }
        }
        async function clearPtHits() {
            const res = await fetch('/api/proxytoken/hits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clear: true }) });
            const data = await res.json();
            if (data.success) { showToast('已清空来访记录'); loadPtHits(); }
            else alert('清空失败');
        }
        function escHtml(s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
        }
        async function saveAdminPass() {
            const pw = document.getElementById('newAdminPass').value.trim();
            if (!pw || pw.length < 4) { alert('密码至少 4 位'); return; }
            if (!confirm('确定将网页登录密码修改为「' + pw + '」？\\n\\n注意：Worker 变量 ADMIN_TOKEN 仍为最高权限，永久有效。')) return;
            const res = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
            const data = await res.json();
            if (data.success) { showToast('密码已更新'); document.getElementById('newAdminPass').value = ''; }
            else alert('修改失败：' + (data.error || ''));
        }
        // ============ 子管理员 ============
        async function loadSubadminStatus() {
            try {
                const res = await fetch('/api/account/subadmin-status');
                const d = await res.json();
                const el = document.getElementById('subadminStatus');
                if (!el) return;
                if (d.success && d.enabled) el.innerHTML = '<span style="color:var(--success);"> 已设置子管理员密码</span>，子管理员可在登录页输入该密码进入（查看节点 + 审核/添加节点，不能编辑/删除/测速/DNS）';
                else el.innerHTML = '<span style="color:var(--text-faint);"> 未设置子管理员密码</span>，子管理员暂时无法登录';
            } catch (e) {}
        }
        async function saveSubadminPass() {
            const v = document.getElementById('newSubadminPass').value.trim();
            if (v && v.length < 4) return showToast(' 子管理员密码至少 4 位');
            if (v && !confirm('确定将子管理员密码设置为「' + v + '」？')) return;
            if (!v && !confirm('确定清除子管理员密码？')) return;
            try {
                const res = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subadminPass: v }) });
                const d = await res.json();
                if (!d.success) return showToast(' ' + (d.error || '保存失败'));
                showToast(v ? ' 子管理员密码已设置' : ' 已清除子管理员密码');
                document.getElementById('newSubadminPass').value = '';
                loadSubadminStatus();
            } catch (e) { showToast(' 保存失败: ' + e.message); }
        }
        // ============ 公告(单条覆盖,子管理员/订阅用户每次进面板必看,3 秒后可关闭) ============
        async function saveNotice() {
            const v = document.getElementById('noticeText').value.trim();
            if (v && !confirm('确定发布公告？发布后旧公告自动作废，子管理员与订阅用户每次进入面板都会看到（需停留 3 秒后才能关闭）。')) return;
            if (!v && !confirm('确定清除公告？')) return;
            try {
                const res = await fetch('/api/notice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: v }) });
                const d = await res.json();
                if (!d.success) return showToast(' ' + (d.error || '保存失败'));
                showToast(v ? ' 公告已发布' : ' 公告已清除');
            } catch (e) { showToast(' 保存失败: ' + e.message); }
        }
        async function loadNoticeEditor() {
            try {
                const res = await fetch('/api/notice');
                const d = await res.json();
                const el = document.getElementById('noticeText');
                if (el) el.value = d.success ? (d.text || '') : '';
            } catch (e) {}
        }
        async function checkNotice() {
            if (window.ROLE === 'admin') return;
            try {
                const res = await fetch('/api/notice');
                const d = await res.json();
                if (!d.success || !d.text) return;
                const body = document.getElementById('noticeBody');
                const modal = document.getElementById('noticeModal');
                if (!body || !modal) return;
                body.innerText = d.text;
                modal.style.display = 'block';
                const btn = document.getElementById('noticeCloseBtn');
                btn.disabled = true; btn.style.opacity = '.55'; btn.style.cursor = 'not-allowed'; btn.textContent = '我知道了 (3s)';
                let t = 3;
                const timer = setInterval(() => {
                    t--;
                    if (t <= 0) { clearInterval(timer); btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; btn.textContent = '我知道了'; }
                    else btn.textContent = '我知道了 (' + t + 's)';
                }, 1000);
            } catch (e) {}
        }
        function closeNotice() {
            const modal = document.getElementById('noticeModal');
            if (modal) modal.style.display = 'none';
        }
        // ============ 申请记录审计:近 7 天 IP/设备,可按名字/线路搜索 ============
        function uaParse(ua) {
            if (!ua) return '未知设备';
            let os = '其他';
            if (/iPhone/.test(ua)) os = 'iPhone';
            else if (/iPad/.test(ua)) os = 'iPad';
            else if (/Android/.test(ua)) os = 'Android';
            else if (/Windows/.test(ua)) os = 'Windows';
            else if (/Mac OS X/.test(ua)) os = 'macOS';
            else if (/Linux/.test(ua)) os = 'Linux';
            let br = '其他';
            if (ua.indexOf('Edg/') >= 0) br = 'Edge';
            else if (ua.indexOf('OPR/') >= 0 || ua.indexOf('Opera') >= 0) br = 'Opera';
            else if (ua.indexOf('Firefox/') >= 0) br = 'Firefox';
            else if (ua.indexOf('SamsungBrowser') >= 0) br = 'Samsung';
            else if (ua.indexOf('MicroMessenger') >= 0) br = '微信内置';
            else if (ua.indexOf('Chrome/') >= 0) br = 'Chrome';
            else if (ua.indexOf('Safari/') >= 0) br = 'Safari';
            return os + ' · ' + br;
        }
        let AUDIT_REQS = [];
        let auditReqTimer = null;
        async function loadAuditReqs() {
            try {
                const q = (document.getElementById('auditReqQ') || {}).value || '';
                const res = await fetch('/api/node-requests/audit?q=' + encodeURIComponent(q));
                const d = await res.json();
                AUDIT_REQS = d.success ? (d.requests || []) : [];
            } catch (e) { AUDIT_REQS = []; }
            renderAuditReqs();
        }
        function auditReqSearch(v) {
            clearTimeout(auditReqTimer);
            auditReqTimer = setTimeout(loadAuditReqs, 400);
        }
        // 账户设置内区块收起/展开(申请记录/保号通知/修改密码/子管理员,默认收起防误触)
        function tgSetSec(id) {
            const b = document.getElementById('setSec-' + id);
            if (!b) return;
            const open = b.style.display !== 'none';
            b.style.display = open ? 'none' : '';
            const arr = document.getElementById('setSecArr-' + id);
            if (arr) arr.textContent = open ? '▸' : '▾';
        }
        // 一键封禁:把申请记录的 IP 加入最高黑名单(仅管理员;子管理员审核时无此能力)
        async function blockIp(ip) {
            if (window.ROLE !== 'admin') return showToast(' 仅管理员可封禁 IP');
            if (!ip) return showToast(' 该申请没有记录到 IP，无法封禁');
            if (!confirm('确定将 IP「' + ip + '」加入最高黑名单？\\n\\n该 IP 无论当前是什么模式(白名单/黑名单/关闭)都会被拦截，优先于最高白名单。')) return;
            try {
                const res = await fetch('/api/ipguard/block', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip }) });
                const d = await res.json();
                if (!d.success) return showToast(' ' + (d.error || '封禁失败'));
                showToast(' 已封禁 ' + ip + '（最高黑名单，任何模式拦截）');
            } catch (e) { showToast(' 封禁失败: ' + e.message); }
        }
        function renderAuditReqs() {
            const box = document.getElementById('auditReqList');
            if (!box) return;
            if (!AUDIT_REQS.length) { box.innerHTML = '<div style="text-align:center; padding:16px 0;">近 7 天暂无申请记录</div>'; return; }
            box.innerHTML = AUDIT_REQS.map(r => {
                const urls = parseReqUrls(r.url);
                const dev = uaParse(r.ua || '');
                const st = r.status === 'approved' ? '<span style="color:var(--success);"> 已批准</span>' : (r.status === 'pending' ? '<span style="color:#ff9f0a;"> 待审</span>' : '<span style="color:var(--text-faint);"> 已拒</span>');
                return '<div style="background:var(--bg); border:1px solid var(--border); border-radius:12px; padding:10px 12px;">' +
                    '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">' +
                        '<span style="font-weight:600; color:var(--text); font-size:13px;">' + escHtml(r.name) + '</span>' +
                        st +
                        '<span style="color:var(--text-faint); margin-left:auto; font-size:11px;">' + escHtml((r.created_at || '').replace('T', ' ').slice(0, 16)) + '</span>' +
                    '</div>' +
                    '<div style="font-size:12px; color:var(--text-sec); word-break:break-all; line-height:1.6; margin-top:4px;">' + urls.map(u => '• ' + escHtml(u)).join('<br>') + '</div>' +
                    '<div style="font-size:12px; margin-top:5px; display:flex; gap:10px; flex-wrap:wrap; align-items:center;">' +
                        '<span style="color:#ff9f0a; font-weight:600;"> ' + escHtml(r.ip || '无IP') + '</span>' +
                        (r.ip ? '<button onclick="blockIp(\\'' + escHtml(r.ip) + '\\')" style="background:rgba(255,107,107,.12); border:1px solid rgba(255,107,107,.4); color:#ff6b6b; padding:3px 10px; border-radius:8px; font-size:12px; cursor:pointer;" title="加入最高黑名单,任何模式都拦截"> 封禁此 IP</button>' : '') +
                        '<span style="color:var(--text-sec);"> ' + escHtml(dev) + '</span>' +
                        '<span style="color:var(--text-faint);"> ' + escHtml(r.user || '') + '</span>' +
                    '</div>' +
                '</div>';
            }).join('');
        }
        // ============ 成员添加节点记录:子管理员/已授权订阅用户直接添加节点时记录 IP/设备(近 7 天,可搜索,可一键封禁) ============
        let ADMIN_LOGS = [];
        let adminLogTimer = null;
        async function loadAdminLogs() {
            try {
                const q = (document.getElementById('adminLogQ') || {}).value || '';
                const res = await fetch('/api/admin-node-logs?q=' + encodeURIComponent(q));
                const d = await res.json();
                ADMIN_LOGS = d.success ? (d.logs || []) : [];
            } catch (e) { ADMIN_LOGS = []; }
            renderAdminLogs();
        }
        function adminLogSearch(v) {
            clearTimeout(adminLogTimer);
            adminLogTimer = setTimeout(loadAdminLogs, 400);
        }
        function renderAdminLogs() {
            const box = document.getElementById('adminLogList');
            if (!box) return;
            if (!ADMIN_LOGS.length) { box.innerHTML = '<div style="text-align:center; padding:16px 0;">近 7 天暂无成员添加节点记录</div>'; return; }
            box.innerHTML = ADMIN_LOGS.map(r => {
                const urls = parseReqUrls(r.url);
                const dev = uaParse(r.ua || '');
                const actor = r.actor === 'sub' ? '订阅用户' : '子管理员';
                return '<div style="background:var(--bg); border:1px solid var(--border); border-radius:12px; padding:10px 12px;">' +
                    '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">' +
                        '<span style="font-weight:600; color:var(--text); font-size:13px;">' + escHtml(r.name) + '</span>' +
                        '<span style="color:var(--text-faint); font-size:11px; font-family:monospace;">/' + escHtml(r.prefix || '') + '</span>' +
                        '<span style="color:var(--text-faint); margin-left:auto; font-size:11px;">' + escHtml((r.created_at || '').replace('T', ' ').slice(0, 16)) + '</span>' +
                    '</div>' +
                    '<div style="font-size:12px; color:var(--text-sec); word-break:break-all; line-height:1.6; margin-top:4px;">' + urls.map(u => '• ' + escHtml(u)).join('<br>') + '</div>' +
                    '<div style="font-size:12px; margin-top:5px; display:flex; gap:10px; flex-wrap:wrap; align-items:center;">' +
                        '<span style="color:#ff9f0a; font-weight:600;"> ' + escHtml(r.ip || '无IP') + '</span>' +
                        (r.ip ? '<button onclick="blockIp(\\'' + escHtml(r.ip) + '\\')" style="background:rgba(255,107,107,.12); border:1px solid rgba(255,107,107,.4); color:#ff6b6b; padding:3px 10px; border-radius:8px; font-size:12px; cursor:pointer;" title="加入最高黑名单,任何模式都拦截"> 封禁此 IP</button>' : '') +
                        '<span style="color:var(--text-sec);"> ' + escHtml(dev) + '</span>' +
                        '<span style="color:var(--text-sec);"> ' + escHtml(actor) + '</span>' +
                    '</div>' +
                '</div>';
            }).join('');
        }
        async function loadSubscribers() {
            try {
                const res = await fetch('/api/subscribers');
                const data = await res.json();
                const list = data.subscribers || [];
                const canAdd = data.canAdd || [];
                const box = document.getElementById('subList');
                if (list.length === 0) {
                    box.innerHTML = '<div style="font-size:13px; color:var(--text-sec); padding:6px 0;">暂无订阅用户</div>';
                    return;
                }
                box.innerHTML = '';
                list.forEach(pw => {
                    box.innerHTML += '<div style="display:flex; align-items:center; gap:8px; background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:8px 12px;">' +
                        '<span style="flex:1; font-family:monospace; font-size:13px;">' + pw + '</span>' +
                        '<label style="display:flex; align-items:center; gap:5px; font-size:12px; cursor:pointer; color:var(--text-sec); white-space:nowrap;" title="开通后该订阅用户可直接添加节点(无需审核),添加时会记录其 IP 与设备;未开通则看不到添加节点按钮">' +
                            '<input type="checkbox" class="ip-checkbox" data-pw="' + pw + '" ' + (canAdd.includes(pw) ? 'checked' : '') + ' onchange="setSubAdd(this)"> 可添加节点' +
                        '</label>' +
                        '<button class="icon-btn" onclick="delSubscriber(this)" data-pw="' + pw + '" title="删除">' + I.trash + '</button></div>';
                });
            } catch (e) { alert('加载订阅用户失败'); }
        }
        async function setSubAdd(checkbox) {
            const pw = checkbox.getAttribute('data-pw');
            const add = checkbox.checked;
            try {
                const res = await fetch('/api/subscribers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'setAdd', password: pw, add }) });
                const data = await res.json();
                if (data.success) showToast(add ? ' 已开通「可添加节点」权限' : '已关闭「可添加节点」权限');
                else { checkbox.checked = !add; alert(data.error || '操作失败'); }
            } catch (e) { checkbox.checked = !add; alert('操作失败: ' + e.message); }
        }
        async function addSubscriber() {
            const pw = document.getElementById('newSubPass').value.trim();
            if (!pw || pw.length < 4) { alert('密码至少 4 位'); return; }
            const res = await fetch('/api/subscribers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', password: pw }) });
            const data = await res.json();
            if (data.success) { showToast('已添加订阅者'); document.getElementById('newSubPass').value = ''; loadSubscribers(); }
            else alert(data.error || '添加失败');
        }
        async function delSubscriber(btn) {
            const pw = btn.getAttribute('data-pw');
            if (!confirm('确定删除订阅者「' + pw + '」？')) return;
            const res = await fetch('/api/subscribers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'del', password: pw }) });
            const data = await res.json();
            if (data.success) { showToast('已删除'); loadSubscribers(); }
            else alert(data.error || '删除失败');
        }

        // ============ 真用户系统:管理员用户管理 + 用户个人视图 ============
        const escU = s => String(s == null ? '' : s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll("'", '&#39;');
        function genUserPw() { const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let p = ''; for (let i = 0; i < 12; i++) p += c[Math.floor(Math.random() * c.length)]; return p; }
        async function userApi(body) { const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return res.json(); }
        async function loadUsers() {
            const box = document.getElementById('userList');
            if (!box) return;
            try {
                const res = await fetch('/api/users'); const d = await res.json();
                if (!d.success) { box.innerHTML = '<span style="color:#ff5a5a;font-size:12px;">' + escU(d.error || '加载失败') + '</span>'; return; }
                const us = d.users || [];
                if (!us.length) { box.innerHTML = '<span style="color:var(--text-sec);font-size:12px;">暂无用户</span>'; return; }
                box.innerHTML = us.map(u => {
                    return '<div style="display:flex; flex-direction:column; gap:6px; background:var(--card); border:1px solid var(--border); border-radius:10px; padding:10px 12px;">'
                        + '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;"><b style="font-size:13px;">' + escU(u.name || u.suffix) + '</b>'
                        + '<span style="font-size:12px; color:var(--text-sec);">后缀 /' + escU(u.suffix) + '/</span>'
                        + '<span style="font-size:12px; color:var(--text-sec);">节点 ' + u.node_count + ' / ' + u.max_nodes + '</span>'
                        + '<span style="font-size:12px; ' + (u.enabled ? 'color:var(--primary);' : 'color:#ff5a5a;') + '">' + (u.enabled ? '正常' : '停用') + '</span>'
                        + '<span style="margin-left:auto; display:flex; gap:6px; flex-wrap:wrap;">'
                        + '<button class="btn-ghost" onclick="userEdit(' + u.id + ')">限额</button>'
                        + '<button class="btn-ghost" onclick="userResetPw(' + u.id + ')">重置密码</button>'
                        + '<button class="btn-ghost" onclick="userToggle(' + u.id + ')">' + (u.enabled ? '停用' : '启用') + '</button>'
                        + '<button class="btn-ghost" style="color:#ff5a5a;" onclick="userDelete(' + u.id + ')">删除</button>'
                        + '</span></div></div>';
                }).join('');
            } catch (e) { box.innerHTML = '<span style="color:#ff5a5a;font-size:12px;">加载失败</span>'; }
        }
        async function createUser() {
            const name = document.getElementById('newUserName').value.trim();
            const suffix = document.getElementById('newUserSuffix').value.trim();
            const password = document.getElementById('newUserPass').value.trim();
            const maxNodes = parseInt(document.getElementById('newUserMax').value, 10) || 5;
            if (!suffix || !password) return alert('请填写专属后缀和登录密码');
            const d = await userApi({ action: 'create', name, suffix, password, maxNodes });
            if (!d.success) { alert(d.error || '创建失败'); return; }
            document.getElementById('newUserName').value = '';
            document.getElementById('newUserSuffix').value = '';
            document.getElementById('newUserPass').value = '';
            showToast('用户已创建');
            loadUsers();
        }
        async function _userById(id) { try { const r = await fetch('/api/users'); const d = await r.json(); return (d.users || []).find(x => x.id === id); } catch (e) { return null; } }
        async function userEdit(id) {
            const u = await _userById(id); if (!u) return;
            const nm = prompt('节点上限(1-200),当前: ' + u.max_nodes, String(u.max_nodes));
            if (nm === null) return;
            const d = await userApi({ action: 'update', id, maxNodes: parseInt(nm, 10) || u.max_nodes });
            if (!d.success) alert(d.error || '保存失败'); else { showToast('已保存'); loadUsers(); }
        }
        async function userResetPw(id) {
            const u = await _userById(id); if (!u) return;
            const pw = prompt('为「' + (u.name || u.suffix) + '」设置新密码(6位以上,留空随机生成)', '');
            if (pw === null) return;
            const np = pw.trim() ? pw.trim() : genUserPw();
            if (np.length < 6) return alert('密码至少 6 位');
            const d = await userApi({ action: 'resetpw', id, password: np });
            if (!d.success) { alert(d.error || '重置失败'); return; }
            alert('密码已重置为: ' + np + '\\n请复制发给该用户');
            loadUsers();
        }
        async function userToggle(id) {
            const u = await _userById(id); if (!u) return;
            const d = await userApi({ action: 'update', id, enabled: u.enabled ? 0 : 1 });
            if (!d.success) alert(d.error || '操作失败'); else { showToast(u.enabled ? '已停用' : '已启用'); loadUsers(); }
        }
        async function userDelete(id) {
            const u = await _userById(id); if (!u) return;
            if (!confirm('确定删除用户「' + (u.name || u.suffix) + '」?其所有节点将一并删除。')) return;
            const d = await userApi({ action: 'delete', id });
            if (!d.success) alert(d.error || '删除失败'); else { showToast('已删除'); loadUsers(); }
        }
        async function refreshUserInfo() {
            try {
                const res = await fetch('/api/me'); const d = await res.json();
                if (d.role !== 'user' || !d.user) return;
                const u = d.user;
                const uNameEl = document.getElementById('uName'); if (uNameEl) uNameEl.textContent = u.name || u.suffix;
                const sufText = '/' + escU(u.suffix || '') + '/';
                const sufEl = document.getElementById('uSuffix'); if (sufEl) sufEl.textContent = sufText;
                const suf2El = document.getElementById('uSuffix2'); if (suf2El) suf2El.textContent = sufText;
                const un = document.getElementById('uNodes'); if (un) un.textContent = u.nodeCount + ' / ' + u.maxNodes;
                const banner = document.getElementById('userBanner');
                if (banner) banner.innerHTML = '<b style="color:var(--primary);">你的专属后缀：/' + escU(u.suffix) + '/</b>　·　节点 ' + u.nodeCount + ' / ' + u.maxNodes + '　·　添加节点时只需填「节点名」，会自动带上你的专属后缀';
            } catch (e) {}
        }
        async function userChangePw() {
            const oldPw = document.getElementById('uOldPw').value.trim();
            const newPw = document.getElementById('uNewPw').value.trim();
            if (!oldPw || !newPw) return alert('请填写当前密码和新密码');
            if (newPw.length < 6) return alert('新密码需 6-64 位');
            const res = await fetch('/api/me/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }) });
            const d = await res.json();
            if (!d.success) { alert(d.error || '修改失败'); return; }
            document.getElementById('uOldPw').value = ''; document.getElementById('uNewPw').value = '';
            showToast('密码已修改');
        }
        function applyUserMode() {
            document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
            const dockItems = document.querySelectorAll('.ds-dock-item');
            if (dockItems[1]) dockItems[1].style.display = 'none';
            if (dockItems[2]) dockItems[2].style.display = 'none';
            const speedView = document.getElementById('view-speed');
            if (speedView) speedView.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-sec);font-size:14px;">真用户无测速与 DNS 权限</div>';
            const setView = document.getElementById('view-settings');
            if (setView) setView.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-sec);font-size:14px;">真用户无设置权限</div>';
            const grid = document.getElementById('list-grid');
            if (grid && !document.getElementById('userBanner')) {
                const banner = document.createElement('div');
                banner.id = 'userBanner';
                banner.style.cssText = 'grid-column:1/-1; background:var(--bg-soft); border:1px solid var(--border); border-radius:12px; padding:12px 16px; font-size:13px; color:var(--text); line-height:1.7;';
                grid.parentNode.insertBefore(banner, grid);
            }
            refreshUserInfo();
        }
        // ============ 角色识别与只读模式(订阅者/子管理员) ============
        async function initRole() {
            try {
                const res = await fetch('/api/me');
                const data = await res.json();
                window.ROLE = data.role || 'admin';
                window.CAN_ADD = !!data.canAdd;
            } catch (e) { window.ROLE = 'admin'; window.CAN_ADD = false; }
            if (window.ROLE === 'sub' || window.ROLE === 'subadmin') applySubMode();
            else if (window.ROLE === 'user') applyUserMode();
            checkNotice();
        }
        function applySubMode() {
            document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
            // 订阅用户:隐藏添加节点表单的高级配置项(仅线路+名字+短路径),未开通添加权限则隐藏添加入口
            if (window.ROLE === 'sub') {
                document.querySelectorAll('.sub-lite').forEach(el => el.style.display = 'none');
                if (!window.CAN_ADD) {
                    const dc = document.getElementById('deploy-card');
                    if (dc) dc.style.display = 'none';
                }
            }
            const dockItems = document.querySelectorAll('.ds-dock-item');
            if (dockItems[1]) dockItems[1].style.display = 'none';
            if (dockItems[2]) dockItems[2].style.display = 'none';
            const speedView = document.getElementById('view-speed');
            if (speedView) speedView.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-sec);font-size:14px;">订阅用户无测速与 DNS 权限</div>';
            const setView = document.getElementById('view-settings');
            if (setView) setView.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-sec);font-size:14px;">订阅用户无设置权限</div>';
            // 子管理员:额外开放节点申请审核入口 + 添加节点入口(仍不能编辑/删除/测速/DNS)
            if (window.ROLE === 'subadmin') {
                const reqBtn = document.getElementById('nodeReqBtn');
                if (reqBtn) reqBtn.style.display = 'inline-flex';
                const deployCard = document.getElementById('deploy-card');
                if (deployCard) deployCard.style.display = '';
                loadNodeReqs();
            }
        }

        // 外部跳转直连 与 302/307 域名规则 互斥（可都关，不能同时开）
        {
            const rddEl = document.getElementById('nodeRedirectDirect');
            const rneEl = document.getElementById('nodeRulesEnable');
            if (rddEl) rddEl.addEventListener('change', () => { if (rddEl.checked && rneEl) rneEl.checked = false; });
            if (rneEl) rneEl.addEventListener('change', () => { if (rneEl.checked && rddEl) rddEl.checked = false; });
            if (rneEl) renderRulesList([]);
        }

        document.getElementById('addForm').onsubmit = async (e) => {
            e.preventDefault();
            const oldPrefix = document.getElementById('oldPrefix').value;
            const remark = document.getElementById('remark').value.trim();
            const prefix = document.getElementById('prefix').value.trim().replace(/^\\/+/g, '');
            const mode = document.getElementById('mode').value;
            const icon = document.getElementById('iconUrl').value;
            const cache_img = document.getElementById('nodeCache').checked ? 'on' : 'off';
            const fakeIp = document.getElementById('nodeFakeIp').value.trim();
            const watchLimit = document.getElementById('watchLimit').value.trim() || '0';
            const nodeUser = document.getElementById('nodeUser').value.trim();
            const nodePass = document.getElementById('nodePass').value.trim();
            const emosId = document.getElementById('nodeEmosId').value.trim();
            const emosName = document.getElementById('nodeEmosName').value.trim();
            const emosAggregate = document.getElementById('nodeEmosAggregate').checked ? 'on' : 'off';
            const redirect_direct = document.getElementById('nodeRedirectDirect').checked ? 'on' : 'off';
            const strmOpt = document.getElementById('nodeStrmOpt').checked ? 'on' : 'off';
            const forceDirect = document.getElementById('nodeForceDirect').checked ? 'on' : 'off';
            let redirect_rules = '';
            if (document.getElementById('nodeRulesEnable').checked) redirect_rules = collectRules();

            const inputs = document.querySelectorAll('.target-input');
            let targetsArray = [];
            inputs.forEach(inp => {
                const val = inp.value.trim().replace(/\\/$/g, '');
                if (val) targetsArray.push(val);
            });
            const target = targetsArray.join(',');
            
            if (!target) return showToast(' 请至少填写一个主线路地址');

            try {
                const res = await fetch('/api/routes', { 
                    method: 'POST', 
                    body: JSON.stringify({oldPrefix, prefix, target, mode, remark, icon, cache_img, fakeIp, watchLimit, nodeUser, nodePass, redirect_direct, redirect_rules, emosId, emosName, emosAggregate, strmOpt, forceDirect})
                });
                const data = await res.json();
                if(!data.success) throw new Error(data.error || '部署失败');
                
                document.getElementById('addForm').reset();
                document.getElementById('oldPrefix').value = ''; 
                selectIcon('', '默认');
                document.getElementById('nodeCache').checked = true;
                document.getElementById('nodeRedirectDirect').checked = false;
                document.getElementById('nodeStrmOpt').checked = false;
                document.getElementById('nodeRulesEnable').checked = false;
                renderRulesList([]);
                document.getElementById('submitBtn').textContent = '保存部署'; 
                resetTargetInputs(); 
                
                showToast(' 节点部署成功');
                // 保存成功后自动关窗（编辑与新增一致）
                document.getElementById('nodeModal').style.display = 'none';
                load();
            } catch(err) {
                showToast(' 保存失败: ' + err.message);
            }
        };

        async function del(prefix) {
            if(confirm('确定删除节点 /' + prefix + ' ?')) {
                await fetch('/api/routes?prefix=' + prefix, { method: 'DELETE' });
                showToast(' 节点已移除');
                load();
            }
        }

        function toggleSelectAll() {
            const isChecked = document.getElementById('selectAll').checked;
            document.querySelectorAll('.row-checkbox').forEach(cb => {
                if(!cb.disabled) cb.checked = isChecked;
            });
        }
        function getSelectedIps() {
            const checkboxes = document.querySelectorAll('.row-checkbox:checked');
            return Array.from(checkboxes).map(cb => cb.value);
        }
        function batchTcpPing() {
            const rows = document.querySelectorAll('#testTableBody .test-row');
            let ips = [];
            rows.forEach(tr => {
                const strong = tr.querySelector('.ip-text');
                if (strong && strong.textContent) {
                    let ip = strong.textContent;
                    if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
                    ips.push(ip);
                }
            });
            if (ips.length === 0) return showToast(' 请先提取节点！');
            navigator.clipboard.writeText(ips.join('\\n')).then(() => {
                showToast(' 节点已复制，即将跳转 ITDog...');
                setTimeout(() => { window.open('https://www.itdog.cn/batch_tcping/', '_blank'); }, 1500);
            });
        }
        function directSubmitCname() {
            const input = document.getElementById('customIps').value.trim();
            if (!input) return showToast(' 请先在文本框内粘贴您的优选域名');
            const domainRegex = /\\b([a-zA-Z0-9-]+\\.)+[a-zA-Z]{2,}\\b/g;
            const matchedDomains = input.match(domainRegex) || [];
            const realDomains = matchedDomains.filter(d => !/^\\d+\\.\\d+\\.\\d+\\.\\d+$/.test(d));
            if (realDomains.length === 0) return showToast(' 没有提取到合法的域名格式，请检查输入！');
            if(!confirm(\` 提取到以下域名：\\n\${realDomains.join('\\n')}\\n\\n确定要直接将其设为 CNAME 记录吗？\\n(注意：这会清空你配置的域名下现有的记录)\`)) return;
            const btn = document.getElementById('btnDirectCname');
            sendDnsRequest(realDomains, btn);
        }
        async function testCustomIPs() {
            const input = document.getElementById('customIps').value;
            if (!input.trim()) return showToast(' 请先在输入框粘贴 IP 或优选域名');
            const ipv4Regex = /\\b(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\b/g;
            const ipv6Regex = /(?:[A-F0-9]{1,4}:){7}[A-F0-9]{1,4}|(?:[A-F0-9]{1,4}:)*:[A-F0-9]{1,4}(?::[A-F0-9]{1,4})*/gi;
            const domainRegex = /\\b([a-zA-Z0-9-]+\\.)+[a-zA-Z]{2,}\\b/g;
            let matchedIPv4 = input.match(ipv4Regex) || [];
            let matchedIPv6 = input.match(ipv6Regex) || [];
            let matchedDomains = input.match(domainRegex) || [];
            matchedDomains = matchedDomains.filter(d => !/^\\d+\\.\\d+\\.\\d+\\.\\d+$/.test(d));
            let extractedIps = [...matchedIPv4, ...matchedDomains];
            matchedIPv6.forEach(ip => {
                if (ip.length > 7 && ip.includes(':') && !ip.startsWith('::1')) { extractedIps.push(ip.startsWith('[') ? ip : \`[\${ip}]\`); }
            });
            extractedIps = [...new Set(extractedIps)];
            if (extractedIps.length === 0) return showToast(' 未识别到合法的 IP 或 域名格式');
            const btn = document.getElementById('btnTestCustom');
            const tbody = document.getElementById('testTableBody');
            btn.disabled = true; btn.textContent = ' 测试中...';
            if(tbody.innerHTML.includes('暂无数据')) tbody.innerHTML = '';
            showToast(\` 提取到 \${extractedIps.length} 个节点，开始测速校验\`);
            const promises = [];
            extractedIps.forEach(ip => {
                const tr = document.createElement('tr');
                tr.className = 'test-row';
                tr.innerHTML = \`
                    <td data-label="勾选节点" style="text-align: center;"><input type="checkbox" class="ip-checkbox row-checkbox" value="\${ip}"></td>
                    <td data-label="专属节点"><strong class="ip-text" style="color:var(--primary);cursor:pointer;font-family:monospace;" onclick="copyTxt('\${ip}')" title="点击复制">\${ip}</strong></td>
                    <td data-label="预估延迟" class="latency" data-ms="9999" style="font-weight: 600; color: #888;">测算中...</td>
                    <td data-label="连通状态" class="speed" style="color: #888;">-</td>
                    <td data-label="记录/归属地" class="loc" style="color: #666;">等待解析</td>
                    <td data-label="快捷操作"><button class="btn-dns" disabled onclick="updateSingleDns('\${ip}', this)">唯一解析</button></td>\`;
                tbody.insertBefore(tr, tbody.firstChild);
                promises.push(doLocalPing(ip, tr, '自定义节点'));
            });
            await Promise.all(promises);
            sortTableByLatency(tbody);
            document.querySelectorAll('.btn-dns').forEach(b => b.disabled = false);
            btn.disabled = false; btn.textContent = ' 测试粘贴节点';
            showToast(' 自定义节点测速完成！');
        }
        async function fetchCustomApiAndTest() {
            const apiUrl = document.getElementById('customApiUrl').value.trim();
            if (!apiUrl) return showToast(' 请先填入自定义 API 链接');
            const btn = document.getElementById('btnFetchCustomApi');
            const tbody = document.getElementById('testTableBody');
            const statusTxt = document.getElementById('statusText');
            btn.disabled = true; btn.textContent = ' 拉取中...';
            statusTxt.innerHTML = \`正在从自定义 API 抓取数据...\`;
            if(tbody.innerHTML.includes('暂无数据')) tbody.innerHTML = ''; 
            try {
                const res = await fetch(\`/api/get-custom-api-ips?url=\${encodeURIComponent(apiUrl)}\`);
                const data = await res.json();
                if (!data.ips || data.ips.length === 0) { showToast(' 自定义 API 返回为空'); return; }
                showToast(\` 提取 \${data.totalCount} 个节点，抽取 \${data.ips.length} 个测速\`);
                btn.textContent = ' 测速中...';
                const promises = [];
                data.ips.forEach(ip => {
                    const tr = document.createElement('tr');
                    tr.className = 'test-row';
                    tr.innerHTML = \`
                        <td data-label="勾选节点" style="text-align: center;"><input type="checkbox" class="ip-checkbox row-checkbox" value="\${ip}"></td>
                        <td data-label="专属节点"><strong class="ip-text" style="color:var(--primary);cursor:pointer;font-family:monospace;" onclick="copyTxt('\${ip}')" title="点击复制">\${ip}</strong></td>
                        <td data-label="预估延迟" class="latency" data-ms="9999" style="font-weight: 600; color: #888;">测算中...</td>
                        <td data-label="连通状态" class="speed" style="color: #888;">-</td>
                        <td data-label="记录/归属地" class="loc" style="color: #666;">等待解析</td>
                        <td data-label="快捷操作"><button class="btn-dns" disabled onclick="updateSingleDns('\${ip}', this)">唯一解析</button></td>\`;
                    tbody.insertBefore(tr, tbody.firstChild);
                    promises.push(doLocalPing(ip, tr, '自定义 API'));
                });
                await Promise.all(promises);
                sortTableByLatency(tbody);
                document.querySelectorAll('.btn-dns').forEach(b => b.disabled = false);
                document.getElementById('selectAll').checked = false;
                showToast(' 自定义 API 测速完成！');
                statusTxt.innerHTML = \`${I.check} 测速完毕！您可以自由组合更新 DNS。\`;
            } catch (err) { showToast(' 拉取失败'); } 
            finally { btn.disabled = false; btn.textContent = ' 拉取API并测速'; }
        }
        const PRESET_MAP = {
            'all': { name: '综合混合源(四源并发)', url: 'uouin + cf-speed-dns + 164746 + wetest 并发聚合' },
            'ehb-all': { name: ' 云枢全域融合(双栈)', url: 'https://ip.ehb.cc.cd/all?ips=100' },
            'ehb-cm': { name: ' 云枢移动起飞(IPv4)', url: 'https://ip.ehb.cc.cd/cm?ips=100' },
            'ehb-ct': { name: ' 云枢电信美西(IPv4)', url: 'https://ip.ehb.cc.cd/ct?ips=100' },
            'ehb-cu': { name: ' 云枢联通极速(IPv4)', url: 'https://ip.ehb.cc.cd/cu?ips=100' },
            'ehb-104': { name: ' 104 大段全域池', url: 'https://ip.ehb.cc.cd/104?ips=100' },
            'ehb-10417': { name: ' 104.17 移动起飞段', url: 'https://ip.ehb.cc.cd/104.17?ips=100' },
            'ehb-10419': { name: ' 104.19 移动抗QoS段', url: 'https://ip.ehb.cc.cd/104.19?ips=100' },
            'ehb-10416': { name: ' 104.16 经典老牌段', url: 'https://ip.ehb.cc.cd/104.16?ips=100' },
            'ehb-162': { name: ' 162 大段全域池', url: 'https://ip.ehb.cc.cd/162?ips=100' },
            'ehb-162159s': { name: ' 162.159 SaaS/DoH段', url: 'https://ip.ehb.cc.cd/162.159-saas?ips=100' },
            'ehb-162159ct': { name: ' 162.159 电信美西最稳段', url: 'https://ip.ehb.cc.cd/162.159-ct?ips=100' },
            'ehb-172': { name: ' 172 大段全域池', url: 'https://ip.ehb.cc.cd/172?ips=100' },
            'ehb-17264': { name: ' 172.64 联通/电信主力段', url: 'https://ip.ehb.cc.cd/172.64?ips=100' },
            'ehb-17267': { name: ' 172.67 动态反代段', url: 'https://ip.ehb.cc.cd/172.67?ips=100' },
            'ehb-198': { name: ' 198.41 联通天花板大段', url: 'https://ip.ehb.cc.cd/198?ips=100' },
            'ehb-108': { name: ' 108.162 三网兜底大段', url: 'https://ip.ehb.cc.cd/108?ips=100' },
            'ehb-v6': { name: ' 云枢 IPv6 全域星轨', url: 'https://ip.ehb.cc.cd/v6?ips=100' },
            'ehb-v6cm': { name: ' 云枢移动 5G 直连', url: 'https://ip.ehb.cc.cd/v6-cm?ips=100' },
            'ehb-v6ct': { name: ' 云枢电信 纯净美西', url: 'https://ip.ehb.cc.cd/v6-ct?ips=100' },
            'ehb-v6cu': { name: ' 云枢联通 欧洲/东京', url: 'https://ip.ehb.cc.cd/v6-cu?ips=100' },
            'ehb-2400': { name: ' 2400:cb00 亚太全域', url: 'https://ip.ehb.cc.cd/2400?ips=100' },
            'ehb-24002048': { name: ' 2400.2048 香港近场段', url: 'https://ip.ehb.cc.cd/2400.2048?ips=100' },
            'ehb-2400400': { name: ' 2400.400 亚太低跳数段', url: 'https://ip.ehb.cc.cd/2400.400?ips=100' },
            'ehb-24002049': { name: ' 2400.2049 亚太抗抖动段', url: 'https://ip.ehb.cc.cd/2400.2049?ips=100' },
            'ehb-2606': { name: ' 2606:4700 全球主干', url: 'https://ip.ehb.cc.cd/2606?ips=100' },
            'ehb-26063030': { name: ' 2606.3030 核心骨干段', url: 'https://ip.ehb.cc.cd/2606.3030?ips=100' },
            'ehb-26064700': { name: ' 2606.4700 伴生特权段', url: 'https://ip.ehb.cc.cd/2606.4700?ips=100' },
            'ehb-2a06': { name: ' 2a06:98c0 欧洲特快大段', url: 'https://ip.ehb.cc.cd/2a06?ips=100' },
            'robberer': { name: ' @robberer 专属', url: 'https://gh.xxooo.cf/https://raw.githubusercontent.com/hc990275/yx/refs/heads/main/cfyxip.txt' },
            'cm-ct': { name: ' CM佬电信优选', url: 'https://cf.090227.xyz/ct?ips=100' },
            'cm-cmcc': { name: ' CM佬移动优选', url: 'https://cf.090227.xyz/cmcc?ips=100' },
            'cm-cu': { name: ' CM佬联通优选', url: 'https://cf.090227.xyz/cu?ips=100' },
            'v2too': { name: ' v2too 源', url: 'https://ip.v2too.top/api/nodes' }
        };
        function updatePresetInfo() {
            const v = document.getElementById('ipType').value;
            const p = PRESET_MAP[v];
            if (!p) return;
            document.getElementById('presetName').textContent = p.name;
            const u = document.getElementById('presetUrl');
            u.textContent = p.url;
            u.title = '点击复制 API 地址';
        }
        function copyPresetUrl() {
            const u = document.getElementById('presetUrl').textContent;
            if (!u || u.startsWith('uouin')) return showToast('综合混合源为多源聚合,无单一地址');
            if (navigator.clipboard) { navigator.clipboard.writeText(u).then(() => showToast(' API 地址已复制')).catch(() => { fallbackCopy(u); }); }
            else fallbackCopy(u);
        }
        function fallbackCopy(txt) {
            const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); showToast(' API 地址已复制');
        }
        async function fetchRemoteAndTest() {
            const btn = document.getElementById('btnFetchRemote');
            const tbody = document.getElementById('testTableBody');
            const statusTxt = document.getElementById('statusText');
            const type = document.getElementById('ipType').value;
            const typeText = document.getElementById('ipType').options[document.getElementById('ipType').selectedIndex].text;
            btn.disabled = true; btn.textContent = ' 正在提取节点...';
            statusTxt.innerHTML = \`正在拉取 <strong>\${typeText}</strong> 数据...\`;
            if(tbody.innerHTML.includes('暂无数据')) tbody.innerHTML = ''; 
            try {
                const res = await fetch(\`/api/get-remote-ips?type=\${encodeURIComponent(type)}\`);
                const data = await res.json();
                if (!data.ips || data.ips.length === 0) { showToast(' 未获取到该类型 IP'); return; }
                showToast(\` 从「\${data.name || typeText}」提取 \${data.totalCount} 个可用 IP，抽取 \${data.ips.length} 个测速\`);
                statusTxt.innerHTML = \`正在测速 <strong>\${typeText}</strong> 提取的 \${data.ips.length} 个节点...\`;
                btn.textContent = ' 本地测速中...';
                const promises = [];
                data.ips.forEach(ip => {
                    const tr = document.createElement('tr');
                    tr.className = 'test-row';
                    tr.innerHTML = \`
                        <td data-label="勾选节点" style="text-align: center;"><input type="checkbox" class="ip-checkbox row-checkbox" value="\${ip}"></td>
                        <td data-label="专属节点"><strong class="ip-text" style="color:var(--primary);cursor:pointer;font-family:monospace;" onclick="copyTxt('\${ip}')" title="点击复制">\${ip}</strong></td>
                        <td data-label="预估延迟" class="latency" data-ms="9999" style="font-weight: 600; color: #888;">测算中...</td>
                        <td data-label="连通状态" class="speed" style="color: #888;">-</td>
                        <td data-label="记录/归属地" class="loc" style="color: #666;">等待解析</td>
                        <td data-label="快捷操作"><button class="btn-dns" disabled onclick="updateSingleDns('\${ip}', this)">唯一解析</button></td>\`;
                    tbody.insertBefore(tr, tbody.firstChild);
                    promises.push(doLocalPing(ip, tr, typeText.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')));
                });
                await Promise.all(promises);
                sortTableByLatency(tbody);
                document.querySelectorAll('.btn-dns').forEach(b => b.disabled = false);
                document.getElementById('selectAll').checked = false;
                showToast(' 测速完成！');
                statusTxt.innerHTML = \`${I.check} 测速完毕！\`;
            } catch (err) { showToast(' 拉取或测速失败'); } 
            finally { btn.disabled = false; btn.textContent = ' 提取预设源测速'; }
        }
        function clearTest() {
            document.getElementById('testTableBody').innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-sec);">暂无数据，请拉取节点或输入自定义 IP/域名 测试</td></tr>';
            document.getElementById('statusText').textContent = '列表已清空。';
            document.getElementById('selectAll').checked = false;
        }
        function markTimeout(latTd, spdTd, tr) {
            latTd.textContent = '超时抛弃'; latTd.setAttribute('data-ms', 9999); latTd.style.color = '#ff3b30';
            spdTd.textContent = ' 超时 (>2000ms)'; spdTd.style.color = '#ff3b30';
            const cb = tr.querySelector('.row-checkbox');
            if(cb) { cb.disabled = true; cb.title = '不可用的节点无法被勾选'; }
        }
        async function doLocalPing(ip, tr, sourceLabel) {
            const latTd = tr.querySelector('.latency');
            const spdTd = tr.querySelector('.speed');
            const locTd = tr.querySelector('.loc');
            const queryIp = ip.replace(/[\\[\\]]/g, '');
            const isIPv6 = ip.includes(':'); 
            const isDomain = /[a-zA-Z]/.test(queryIp) && !isIPv6;
            if (isDomain) { locTd.innerHTML = \`<span class="badge" style="background:rgba(175,82,222,0.1);color:#af52de;margin-right:4px;">CNAME</span> \${sourceLabel} | 优选域名\`;
            } else {
                const recordLabel = isIPv6 ? '<span class="badge" style="background:rgba(50,173,230,0.1);color:#32ade6;margin-right:4px;">AAAA</span>' : '<span class="badge" style="background:rgba(0,113,227,0.1);color:#0071e3;margin-right:4px;">A记录</span>';
                fetch(\`https://api.vore.top/api/IPdata?ip=\${queryIp}\`).then(res => res.json()).then(data => {
                    const info = (data && data.data && data.data.info) || {};
                    const loc = [info.country, info.province, info.city].filter(Boolean).join(' ') || '未知';
                    locTd.innerHTML = \`\${recordLabel} \${sourceLabel} | \${loc}\`;
                }).catch(() => fetch(\`https://api.ip.sb/geoip/\${queryIp}\`).then(res => res.json()).then(data => locTd.innerHTML = \`\${recordLabel} \${sourceLabel} | \${data.country || '未知'}\`).catch(() => locTd.innerHTML = \`\${recordLabel} \${sourceLabel} | 解析失败\`));
            }
            const start = performance.now();
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000); 
            const processResult = () => {
                const rawLatency = Math.round(performance.now() - start);
                if (rawLatency > 2000) return markTimeout(latTd, spdTd, tr);
                let displayLatency = rawLatency;
                if (!isIPv6 && !isDomain) {
                    if (rawLatency >= 500) { displayLatency = rawLatency - 400; } 
                    else { const base = 40 + (rawLatency / 500) * 60; displayLatency = Math.floor(base) + Math.floor(Math.random() * 10); }
                }
                updateRowState(latTd, spdTd, displayLatency);
            };
            try { await fetch(\`https://\${ip}/cdn-cgi/trace\`, { mode: 'no-cors', signal: controller.signal }); clearTimeout(timeoutId); processResult();
            } catch (err) { clearTimeout(timeoutId); if (err.name === 'AbortError') markTimeout(latTd, spdTd, tr); else processResult(); }
        }
        function updateRowState(latTd, spdTd, latency) {
            latTd.textContent = latency + ' ms'; latTd.setAttribute('data-ms', latency);
            if (latency < 300) { latTd.style.color = '#34c759'; spdTd.textContent = ' 极佳'; spdTd.style.color = '#34c759'; } 
            else if (latency <= 500) { latTd.style.color = 'var(--primary)'; spdTd.textContent = ' 正常'; spdTd.style.color = 'var(--primary)'; } 
            else { latTd.style.color = '#ff9500'; spdTd.textContent = ' 较高'; spdTd.style.color = '#ff9500'; }
        }
        function sortTableByLatency(tbody) {
            const rows = Array.from(tbody.querySelectorAll('.test-row'));
            rows.sort((a, b) => {
                const msA = parseInt(a.querySelector('.latency').getAttribute('data-ms') || 9999);
                const msB = parseInt(b.querySelector('.latency').getAttribute('data-ms') || 9999);
                return msA - msB;
            });
            rows.forEach(row => tbody.appendChild(row));
        }
        async function sendDnsRequest(ips, btnElement) {
            const originalText = btnElement.textContent;
            btnElement.textContent = ' 更新 DNS 中...'; btnElement.disabled = true;
            try {
                const res = await fetch('/api/update-dns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ips }) });
                const data = await res.json();
                if(data.success) { showToast(data.message); btnElement.textContent = ' 更新成功'; loadDNS(); } 
                else { showToast(' 错误: ' + (data.error || '')); btnElement.textContent = originalText; }
            } catch(e) { showToast(' 网络异常，请重试'); btnElement.textContent = originalText; } 
            finally { setTimeout(() => { if(btnElement.textContent === ' 更新成功') btnElement.textContent = originalText; btnElement.disabled = false; }, 3000); }
        }
        function updateSingleDns(ip, btnElement) {
            if(!confirm(\`确定要将域名解析到：\\n\${ip} \\n警告：这会覆盖域名下的所有解析记录！\`)) return;
            sendDnsRequest([ip], btnElement);
        }
        function updateSelectedToDns() {
            const btn = document.getElementById('btnSelectedDns');
            const ips = getSelectedIps();
            if (ips.length === 0) return showToast(' 请先勾选您想使用的节点');
            if(!confirm(\`将应用勾选的 \${ips.length} 个节点：\\n\${ips.join('\\n')}\\n确定更新 DNS 记录吗？\`)) return;
            sendDnsRequest(ips, btn);
        }
        function updateTop3ToDns() {
            const btn = document.getElementById('btnTop3Dns');
            const rows = document.querySelectorAll('#testTableBody .test-row');
            let topIps = [];
            for(let i = 0; i < rows.length; i++) {
                const ms = parseInt(rows[i].querySelector('.latency').getAttribute('data-ms'));
                if(ms < 2000) topIps.push(rows[i].querySelector('.ip-text').textContent);
                if(topIps.length === 3) break;
            }
            if(topIps.length === 0) return showToast(' 没找到可用节点，请先测速');
            if(!confirm(\`将为您分发当前最快的 \${topIps.length} 个节点：\\n\${topIps.join('\\n')}\\n确定更新 DNS 记录吗？\`)) return;
            sendDnsRequest(topIps, btn);
        }
        async function loadDNS() {
            try {
                const res = await fetch('/api/get-dns'); const data = await res.json(); const container = document.getElementById('dnsStatus');
                if (data.success && data.result) {
                    const records = data.result.filter(r => r.type === 'A' || r.type === 'AAAA' || r.type === 'CNAME');
                    if (records.length === 0) container.innerHTML = '<span class="badge" style="background:rgba(255,149,0,0.1);color:#ff9500;">暂无解析记录</span>';
                    else container.innerHTML = records.map(r => \`<span class="badge" style="background:rgba(0,113,227,0.1);color:var(--primary);border:1px solid rgba(0,113,227,0.2);">\${r.type} | \${r.content}</span>\`).join('');
                } else container.innerHTML = \`<span class="badge" style="background:rgba(255,59,48,0.1);color:#ff3b30;">\${data.error || '获取失败'}</span>\`;
            } catch (e) { document.getElementById('dnsStatus').innerHTML = '<span class="badge" style="background:rgba(255,59,48,0.1);color:#ff3b30;">网络异常</span>'; }
        }
        
        function logout() {
            // v3.5.0:走后端 /api/logout 清除 HttpOnly 签名会话(前端无法直接删 HttpOnly cookie)
            fetch('/api/logout', { method: 'POST' }).catch(function(){}).then(function(){ window.location.reload(); });
        }
        function confirmLogout() {
            if (window.confirm('确定要退出系统吗？')) { logout(); }
        }

        // 初始化加载
        loadIcons().then(() => {
            load();
            loadDNS();
        });

        // ==========================================
        //  新增：RTT 实时监测引擎 (每隔 3 秒探测一次)
        // ==========================================
        async function measureRTT() {
            const start = performance.now();
            try {
                // 加上时间戳强制绕过浏览器本地缓存
                await fetch('/__client_rtt__?t=' + Date.now(), { mode: 'no-cors', cache: 'no-store' });
                const rtt = Math.round(performance.now() - start);
                const rttEl = document.getElementById('rttValue');
                const dotEl = document.getElementById('rttDot');
                
                rttEl.textContent = rtt + ' ms';
                
                // 根据延迟改变呼吸灯颜色
                if (rtt < 80) {
                    dotEl.style.background = '#34c759'; dotEl.style.boxShadow = '0 0 8px #34c759';
                    rttEl.style.color = '#34c759';
                } else if (rtt < 200) {
                    dotEl.style.background = '#ff9500'; dotEl.style.boxShadow = '0 0 8px #ff9500';
                    rttEl.style.color = '#ff9500';
                } else {
                    dotEl.style.background = '#ff3b30'; dotEl.style.boxShadow = '0 0 8px #ff3b30';
                    rttEl.style.color = '#ff3b30';
                }
            } catch (e) {
                document.getElementById('rttValue').textContent = '断连';
                document.getElementById('rttDot').style.background = '#ff3b30';
            }
        }
        
        // 先立即执行一次，然后每 3 秒循环探测
        measureRTT();
        setInterval(measureRTT, 3000);

    //  新增：前端探针自动检测脚本
        async function fetchCfTrace() {
            try {
                const res = await fetch('/api/trace');
                const data = await res.json();
                if (data.success) {
                    // 拼接访客入口信息：国家 城市 (机房代码)
                    let entryText = data.entryCountry;
                    if (data.entryCity && data.entryCity !== '未知') entryText += ' ' + data.entryCity;
                    entryText += ' (' + data.entryColo + ')';
                    
                    document.getElementById('trace-entry').innerText = entryText;
                    
                    // 落地机房处理
                    const egressText = data.egressColo;
                    const egressElem = document.getElementById('trace-egress');
                    egressElem.innerText = egressText;
                    
                    // 核心逻辑：如果入口和落地机房不一致，显示高亮提示（智能调度触发）
                    if (data.entryColo !== egressText && egressText !== '探测中...' && egressText !== '获取失败') {
                        egressElem.style.color = '#ff9500'; // 变成橘黄色警示
                        egressElem.innerText += ' (智能放置/回源)';
                    }
                }
            } catch(e) {
                document.getElementById('trace-entry').innerText = '获取超时';
                document.getElementById('trace-egress').innerText = '获取超时';
            }
        }
        
        // 当网页加载完成时，延迟0.5秒执行探针扫描（避免卡顿主页渲染）
        window.addEventListener('DOMContentLoaded', () => {
            setTimeout(fetchCfTrace, 500);
            loadLogo();
        });
    //  新增：全云厂商节点数据库 (包含 Cloudflare 支持的所有主要区域)
        var cfRegions = {
            aws: [
                { label: " 中国香港", value: "aws:ap-east-1" },
                { label: " 日本 (东京)", value: "aws:ap-northeast-1" },
                { label: " 日本 (大阪)", value: "aws:ap-northeast-3" },
                { label: " 新加坡", value: "aws:ap-southeast-1" },
                { label: " 韩国 (首尔)", value: "aws:ap-northeast-2" },
                { label: " 美国西部 (加州)", value: "aws:us-west-1" },
                { label: " 美国西部 (俄勒冈)", value: "aws:us-west-2" },
                { label: " 美国东部 (弗吉尼亚)", value: "aws:us-east-1" },
                { label: " 澳大利亚 (悉尼)", value: "aws:ap-southeast-2" },
                { label: " 印度 (孟买)", value: "aws:ap-south-1" },
                { label: " 英国 (伦敦)", value: "aws:eu-west-2" },
                { label: " 德国 (法兰克福)", value: "aws:eu-central-1" }
            ],
            gcp: [
                { label: " 中国台湾 (彰化)", value: "gcp:asia-east1" },
                { label: " 中国香港", value: "gcp:asia-east2" },
                { label: " 日本 (东京)", value: "gcp:asia-northeast1" },
                { label: " 日本 (大阪)", value: "gcp:asia-northeast2" },
                { label: " 韩国 (首尔)", value: "gcp:asia-northeast3" },
                { label: " 新加坡", value: "gcp:asia-southeast1" },
                { label: " 美国西部 (洛杉矶)", value: "gcp:us-west2" },
                { label: " 美国西部 (俄勒冈)", value: "gcp:us-west1" },
                { label: " 美国东部 (弗吉尼亚)", value: "gcp:us-east4" },
                { label: " 澳大利亚 (悉尼)", value: "gcp:australia-southeast1" },
                { label: " 英国 (伦敦)", value: "gcp:europe-west2" },
                { label: " 德国 (法兰克福)", value: "gcp:europe-west3" }
            ],
            azure: [
                { label: " 中国香港 (East Asia)", value: "azure:eastasia" },
                { label: " 新加坡 (Southeast Asia)", value: "azure:southeastasia" },
                { label: " 日本东部 (东京)", value: "azure:japaneast" },
                { label: " 日本西部 (大阪)", value: "azure:japanwest" },
                { label: " 韩国中部 (首尔)", value: "azure:koreacentral" },
                { label: " 美国西部 (West US)", value: "azure:westus" },
                { label: " 美国东部 (East US)", value: "azure:eastus" },
                { label: " 英国南部 (伦敦)", value: "azure:uksouth" },
                { label: " 西欧 (荷兰)", value: "azure:westeurope" }
            ]
        };

        //  新增：联动菜单处理逻辑
        function handleModeChange() {
            var mode = document.getElementById('cf-mode-select').value;
            var regionSelect = document.getElementById('cf-region-select');
            var customInput = document.getElementById('cf-custom-input');
            
            regionSelect.style.display = 'none';
            customInput.style.display = 'none';
            
            if (mode === 'aws' || mode === 'gcp' || mode === 'azure') {
                regionSelect.style.display = 'block';
                regionSelect.innerHTML = ''; 
                var regions = cfRegions[mode];
                regions.forEach(function(r) {
                    var opt = document.createElement('option');
                    opt.value = r.value;
                    opt.innerText = r.label;
                    regionSelect.appendChild(opt);
                });
            } else if (mode === 'custom') {
                customInput.style.display = 'block';
            }
        }

        //  新增：调用部署修改接口
        async function updatePlacement() {
            var statusElem = document.getElementById('place-status');
            var modeVal = document.getElementById('cf-mode-select').value;
            var placementPayload = {};
            
            if (modeVal === 'aws' || modeVal === 'gcp' || modeVal === 'azure') {
                var regionVal = document.getElementById('cf-region-select').value;
                placementPayload = { region: regionVal };
            } else if (modeVal === 'custom') {
                var customVal = document.getElementById('cf-custom-input').value;
                if (!customVal || customVal.trim() === '') {
                    statusElem.innerText = " 请填写自定义区域代码（如 gcp:asia-east2）";
                    statusElem.style.color = "#ff3b30";
                    return;
                }
                placementPayload = { region: customVal.trim() };
            } else {
                placementPayload = JSON.parse(modeVal);
            }

            if (modeVal === '{"mode":"off"}') {
                statusElem.innerText = " 正在重新部署 Worker 以关闭 Smart Placement（约需数秒，请勿关闭页面）...";
            } else {
                statusElem.innerText = " 正在提交请求，请稍候...";
            }
            statusElem.style.color = "#ff9500";
            
            try {
                var res = await fetch('/api/placement', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ placement: placementPayload })
                });
                if (!res.ok) {
                    statusElem.innerText = ' 请求被拒绝(' + res.status + ')，请重新登录后重试';
                    statusElem.style.color = "#ff3b30";
                    return;
                }
                var data = await res.json();
                if (data.success) {
                    statusElem.innerText = " " + data.msg;
                    statusElem.style.color = "#34c759";
                } else {
                    statusElem.innerText = " " + data.msg;
                    statusElem.style.color = "#ff3b30";
                }
            } catch(e) {
                statusElem.innerText = " 网络错误: " + e.message;
                statusElem.style.color = "#ff3b30";
            }
        }
    //  魔法功能：自动继承现有的模式选项 (增强稳定版)
        setTimeout(() => {
            const sourceSelect = document.getElementById('mode');
            const batchSelect = document.getElementById('batch-mode-select');
            if (sourceSelect && batchSelect) {
                batchSelect.innerHTML = sourceSelect.innerHTML;
            }
        }, 100); 

        //  全选 / 取消全选逻辑
        function toggleSelectAll(checkbox) {
            const checkboxes = document.querySelectorAll('.node-cb');
            checkboxes.forEach(cb => cb.checked = checkbox.checked);
        }

        //  并发批量修改模式逻辑 (终极多线程逐个击破版)
        async function batchUpdateModes() {
            const statusElem = document.getElementById('batch-status');
            const newMode = document.getElementById('batch-mode-select').value;
            
            const selectedPrefixes = Array.from(document.querySelectorAll('.node-cb:checked')).map(cb => cb.value);

            if (selectedPrefixes.length === 0) {
                statusElem.innerText = " 请先打勾需要修改的节点！";
                statusElem.style.color = "#ff9500";
                return;
            }

            if (!confirm("确定要将勾选的 " + selectedPrefixes.length + " 个节点切换为该模式吗？")) return;

            statusElem.innerText = " 正在多线程并发修改节点...";
            statusElem.style.color = "var(--primary)";

            try {
                // 1. 先获取当前所有的节点详细数据
                const getRes = await fetch('/api/routes');
                const allRoutes = await getRes.json();
                
                // 2. 筛选出你要修改的那些节点
                const nodesToUpdate = allRoutes.filter(r => selectedPrefixes.includes(r.prefix));

                // 3. 核心魔法：Promise.all 并发！瞬间发出多个独立的保存请求
                await Promise.all(nodesToUpdate.map(async (r) => {
                    const payload = Object.assign({}, r);
                    payload.oldPrefix = r.prefix; 
                    payload.mode = newMode; 
                    
                    const postRes = await fetch('/api/routes', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    
                    if (!postRes.ok) {
                        throw new Error("节点 " + r.prefix + " 保存失败");
                    }
                }));
                
                statusElem.innerText = " 批量修改成功！";
                statusElem.style.color = "#34c759";
                setTimeout(() => location.reload(), 1000); 

            } catch (e) {
                statusElem.innerText = " 失败: " + e.message;
                statusElem.style.color = "#ff3b30";
            }
        }
    async function deployWorker() {
            const codeArea = document.getElementById('codeArea');
            const fileInput = document.getElementById('fileInput');
            let codeContent = codeArea.value;
            if (fileInput.files.length > 0) {
                const file = fileInput.files[0];
                codeContent = await file.text();
            }
            if (!codeContent.trim()) {
                alert(' 失败：请先粘贴代码，或者选择一个 .js 文件！');
                return;
            }
            if (!confirm(' 危险操作确认 \\n\\n你即将强行覆盖当前 Worker 的代码。\\n如果新代码有错误，此面板将会瘫痪，只能去网页后台抢修！\\n\\n确定代码 100% 正确并覆盖吗？')) return;
            const btn = document.getElementById('deployBtn');
            const originalText = btn.innerText;
            btn.innerText = ' 正在与 Cloudflare 通信并部署...';
            btn.disabled = true;
            btn.style.opacity = '0.7';
            try {
                const res = await fetch('/api/deploy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ newCode: codeContent })
                });
                const data = await res.json();
                if (data.success) {
                    alert(' 成功！' + data.msg + '\\n\\n点击确定后页面将自动刷新。');
                    window.location.reload(); 
                } else {
                    alert(' 部署失败：\\n' + JSON.stringify(data.error));
                }
            } catch (e) {
                alert(' 异常：\\n' + e.message);
            } finally {
                btn.innerText = originalText;
                btn.disabled = false;
                btn.style.opacity = '1';
            }
        }
        // ==========================================
        //  在线更新模块
        // ==========================================
        // 这里的变量会自动从代码最顶端的配置区读取注入
        const CURRENT_VERSION = "${CURRENT_VERSION}"; 
        const GITHUB_RAW_URL = "${GITHUB_RAW_URL}"; 
        const CHANGELOG_URL = "${CHANGELOG_URL}"; 
        
        let latestCode = ""; 
        let latestVersion = "";
        let changelogCache = null;

        async function loadChangelog() {
            try {
                const res = await fetch(CHANGELOG_URL + '?t=' + new Date().getTime());
                if (!res.ok) return null;
                changelogCache = await res.json();
                return changelogCache;
            } catch (e) { console.log("拉取更新内容失败:", e); return null; }
        }

        async function loadVersionPanel() {
            try {
                const res = await fetch('/api/version');
                const data = await res.json();
                if (data.success) {
                    const badge = document.getElementById('curVersionBadge');
                    if (badge) badge.textContent = 'v' + data.version;
                    const chk = document.getElementById('updateNotifyChk');
                    if (chk) chk.checked = !!data.updateNotify;
                }
            } catch (e) {}
            const cl = await loadChangelog();
            if (cl && cl.versions && cl.versions.length) {
                const latest = cl.versions[0];
                const lc = document.getElementById('latestChangelog');
                if (lc) lc.innerHTML = '<div style="font-weight:600; color:var(--text);">v' + escHtml(latest.version) + ' · ' + escHtml(latest.date || '') + (latest.title ? ' · ' + escHtml(latest.title) : '') + '</div>' + (latest.items || []).map(i => '· ' + escHtml(i)).join('<br>');
                const hc = document.getElementById('historyChangelog');
                if (hc) hc.innerHTML = cl.versions.slice(1).map(v => '<div style="margin-bottom:10px;"><span style="font-weight:600;">v' + escHtml(v.version) + '</span> <span style="color:var(--text-sec);">(' + escHtml(v.date || '') + ')</span>' + (v.title ? ' ' + escHtml(v.title) : '') + '<br>' + (v.items || []).map(i => '&nbsp;&nbsp;· ' + escHtml(i)).join('<br>') + '</div>').join('') || '暂无更多历史记录';
            } else {
                const lc = document.getElementById('latestChangelog');
                if (lc) lc.textContent = '暂无更新内容';
            }
        }

        async function saveUpdateNotify() {
            const chk = document.getElementById('updateNotifyChk');
            const on = chk ? chk.checked : true;
            try {
                const res = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updateNotify: on }) });
                const data = await res.json();
                if (data.success) showToast(on ? '更新提醒已开启' : '更新提醒已关闭');
                else alert('保存失败：' + (data.error || ''));
            } catch (e) { alert('保存失败：' + e.message); }
        }

        function verCmp(a, b) {
            const pa = String(a).replace(/[^0-9.]/g, '').split('.').map(Number);
            const pb = String(b).replace(/[^0-9.]/g, '').split('.').map(Number);
            for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                const x = pa[i] || 0, y = pb[i] || 0;
                if (x > y) return 1; if (x < y) return -1;
            }
            return 0;
        }

        async function checkForUpdates(manual) {
            try {
                const res = await fetch(GITHUB_RAW_URL + '?t=' + new Date().getTime());
                if (!res.ok) { if (manual) alert('检查更新失败：无法访问更新源'); return; }
                latestCode = await res.text();
                
                const versionMatch = latestCode.match(/\\/\\/\\s*VERSION:\\s*"?v?([^"\\n]+)"?/i);
                if (!versionMatch || !versionMatch[1]) { if (manual) alert('未获取到版本信息'); return; }
                latestVersion = versionMatch[1];
                if (latestVersion === CURRENT_VERSION) {
                    if (manual) alert('当前已是最新版本 v' + CURRENT_VERSION);
                    return;
                }
                // 本地版本高于公开版时静默(测试仓预览版不弹反向更新提示)
                if (verCmp(CURRENT_VERSION, latestVersion) > 0) {
                    if (manual) alert('当前已领先公开版:本地 v' + CURRENT_VERSION + ' ≥ 公开版 v' + latestVersion);
                    return;
                }
                const cl = changelogCache || await loadChangelog();
                let items = []; let title = '';
                if (cl && cl.versions && cl.versions.length) {
                    const v = cl.versions.find(x => x.version === latestVersion) || cl.versions[0];
                    items = v.items || []; title = v.title || '';
                }
                if (!manual) {
                    try {
                        const vres = await fetch('/api/version');
                        const vdata = await vres.json();
                        if (vdata.success && !vdata.updateNotify) return;   // 关闭了更新提醒则静默
                    } catch (e) {}
                }
                showUpdateModal(latestVersion, title, items);
            } catch (e) {
                console.log("检测更新失败:", e);
                if (manual) alert('检查更新失败：' + e.message);
            }
        }

        function showUpdateModal(version, title, items) {
            document.getElementById('updateModalVersion').textContent = 'v' + version;
            document.getElementById('updateModalCurVer').textContent = 'v' + CURRENT_VERSION;
            document.getElementById('updateModalBody').innerHTML = '<div style="font-size:13px; font-weight:600; margin-bottom:8px;">' + escHtml(title || '本次更新内容') + '</div>' + (items && items.length ? items.map(i => '· ' + escHtml(i)).join('<br>') : '<span style="color:var(--text-sec);">暂无详细更新内容</span>');
            document.getElementById('updateModal').style.display = 'block';
        }
        function hideUpdateModal() { document.getElementById('updateModal').style.display = 'none'; }

        async function manualUpdateFlow() {
            if (!latestCode) { checkForUpdates(true); return; }
            if (latestVersion === CURRENT_VERSION) { alert('当前已是最新版本 v' + CURRENT_VERSION); return; }
            const cl = changelogCache || await loadChangelog();
            let items = []; let title = '';
            if (cl && cl.versions && cl.versions.length) {
                const v = cl.versions.find(x => x.version === latestVersion) || cl.versions[0];
                items = v.items || []; title = v.title || '';
            }
            showUpdateModal(latestVersion, title, items);
        }

        async function doOnlineUpdate() {
            hideUpdateModal();
            if (!latestCode) { checkForUpdates(true); return; }
            
            const btn = document.getElementById('onlineUpdateBtn');
            if (btn) { btn.innerText = ' 正在拉取并部署...'; btn.disabled = true; btn.style.opacity = '0.7'; }
            try {
                const res = await fetch('/api/deploy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ newCode: latestCode })
                });
                const data = await res.json();
                if (data.success) {
                    const cl = changelogCache || await loadChangelog();
                    let items = [];
                    if (cl && cl.versions && cl.versions.length) {
                        const v = cl.versions.find(x => x.version === latestVersion) || cl.versions[0];
                        items = v.items || [];
                    }
                    document.getElementById('updateResultBody').innerHTML = '<div style="font-size:13px; margin-bottom:8px;">已成功更新到 <b style="color:var(--primary);">v' + escHtml(latestVersion) + '</b>，本次更新内容：</div>' + (items.length ? items.map(i => '· ' + escHtml(i)).join('<br>') : '暂无详细更新内容');
                    document.getElementById('updateResultModal').style.display = 'block';
                } else {
                    alert(' 更新失败：\\n' + JSON.stringify(data.error));
                }
            } catch (e) {
                alert(' 异常：\\n' + e.message);
            } finally {
                if (btn) { btn.innerText = ' 一键拉取并升级'; btn.disabled = false; btn.style.opacity = '1'; }
            }
        }

        // 页面加载完成后自动在后台静默检测更新
        document.addEventListener('DOMContentLoaded', () => checkForUpdates(false));
    </script>
    <style>
    /* 修正页面底部留白，防止被 Dock 挡住 */
    body { padding-bottom: 100px !important; }

    /* 底部dock栏UI（现代化毛玻璃胶囊） */
    .ds-dock {
        position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%);
        width: calc(100% - 28px); max-width: 540px;
        background: var(--card-glass); backdrop-filter: var(--blur); -webkit-backdrop-filter: var(--blur);
        border: 1px solid var(--border); border-radius: 999px; padding: 6px 10px;
        display: flex; justify-content: space-around;
        box-shadow: var(--shadow-lg); z-index: 950;
    }
    .ds-dock-item {
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
        padding: 8px 14px; border-radius: 999px; color: var(--text-sec); font-size: 11px;
        font-weight: 600; transition: all .2s; background: transparent; border: none; cursor: pointer; flex: 1; font-family: inherit;
    }
    .ds-dock-item.active { color: var(--primary); background: rgba(0,160,255,.12); box-shadow: inset 0 0 0 1px rgba(0,160,255,.15); }
    .ds-dock-item:hover { color: var(--primary); }
    .ds-dock-item svg { width: 22px; height: 22px; fill: currentColor; }

    /* ===== 桌面端(>=1024px):面板 dock 始终保持"底部居中横排胶囊" =====
       CSS_COMMON 的桌面媒体查询会把 .ds-dock 改成左侧竖栏(落地页专用),面板不走侧栏。
       上面的横排基础规则只重写了定位,没重置 flex-direction/top,桌面端会被竖栏规则
       混搭成 top+bottom 同时生效、纵向排列、按钮被纵向拉成大椭圆,这里显式全部重置。 */
    @media (min-width:1024px){
        .ds-dock{
            left:50%; right:auto; top:auto; bottom:18px;
            transform:translateX(-50%);
            width:calc(100% - 28px); max-width:540px;
            flex-direction:row; flex-wrap:nowrap; justify-content:space-around; align-items:stretch;
            gap:0; padding:6px 10px; border-radius:999px;
        }
        .ds-dock-item{
            flex:1 1 0; width:auto; min-width:0;
            flex-direction:column; align-items:center; justify-content:center; gap:3px;
            padding:8px 14px; border-radius:999px; font-size:11px; line-height:1.2; text-align:center;
        }
        .ds-dock-item span{ max-width:100%; white-space:normal; overflow-wrap:anywhere; }
        .ds-dock-item svg{ width:22px; height:22px; flex-shrink:0; }
        /* 主内容区不再为左侧竖栏让位,恢复水平居中 */
        .container{ margin-left:auto; margin-right:auto; }
    }

    /* 页脚:内容后留空一截,显示"玛卡巴卡反代面板",点击跳公开仓库 */
    /* 页脚:margin-top auto 贴页面底部;渐变分隔线 + 渐变品牌字(点击跳公开仓库) */
    .page-footer{margin-top:auto;padding:44px 24px 44px;text-align:center;cursor:pointer;position:relative;-webkit-tap-highlight-color:transparent}
    .pf-line{position:absolute;top:0;left:50%;transform:translateX(-50%);width:min(320px,62%);height:1px;background:linear-gradient(90deg,transparent,#00d4ff,#7c5cff,transparent);opacity:.7}
    .pf-brand{display:flex;align-items:center;justify-content:center;gap:9px}
    .pf-brand svg{width:17px;height:17px;fill:#00d4ff;opacity:.9}
    .pf-brand span{font-size:14.5px;font-weight:800;letter-spacing:2.5px;background:linear-gradient(90deg,#00d4ff,#7c5cff);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
    .pf-arrow{margin-top:12px;font-size:11px;letter-spacing:1px;color:var(--text-sec);opacity:.75;transition:all .2s}
    .page-footer:hover .pf-arrow,.page-footer:active .pf-arrow{opacity:1;color:var(--primary)}
</style>

<div class="page-footer" onclick="window.open('https://github.com/MakkaPakka518/ProxyHub_Emby','_blank')" title="前往公开仓库">
    <div class="pf-line"></div>
    <div class="pf-brand">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2 0-2.8-.8-.7-2.2-.7-3 .8z"/><path d="M12 15l-3-3c.5-4 4-7.5 8-8 2 .2 3.8 2 4 4-.5 4-4 7.5-8 8l-1-1z"/></svg>
        <span>玛卡巴卡反代面板</span>
    </div>
    <div class="pf-arrow">查看公开仓库 ↗</div>
</div>

<nav class="ds-dock">
    <button class="ds-dock-item active" onclick="switchDsView('nodes', this)">
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
        <span>节点</span>
    </button>
    <button class="ds-dock-item" onclick="switchDsView('speed', this)">
        <svg viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
        <span>测速与DNS</span>
    </button>
    <button class="ds-dock-item" onclick="switchDsView('settings', this)">
        <svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.33-.02-.64-.06-.94l2.02-1.58c.18-.14.23-.38.12-.56l-1.89-3.28c-.12-.19-.36-.26-.56-.18l-2.38.96c-.5-.38-1.06-.68-1.66-.88L14.45 3.5c-.04-.2-.2-.34-.4-.34h-3.78c-.2 0-.36.14-.4.34l-.3 2.52c-.6.2-1.16.5-1.66.88l-2.38-.96c-.2-.08-.44-.01-.56.18l-1.89 3.28c-.12.19-.07.42.12.56l2.02 1.58c-.04.3-.06.61-.06.94 0 .33.02.64.06.94l-2.02 1.58c-.18.14-.23.38-.12.56l1.89 3.28c.12.19.36.26.56.18l2.38-.96c.5.38 1.06.68 1.66.88l.3 2.52c.04.2.2.34.4.34h3.78c.2 0 .36-.14.4-.34l.3-2.52c.6-.2 1.16-.5 1.66-.88l2.38.96c.2.08.44.01.56-.18l1.89-3.28c.12-.19.07-.42-.12-.56l-2.02-1.58zM12 15c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/></svg>
        <span>控制面板</span>
    </button>
</nav>

<script>
// 切换页面的核心逻辑
function switchDsView(viewId, btn) {
    document.querySelectorAll('.ds-dock-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.page-view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + viewId).classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 页面结构已按 3 个视图静态分好，只需在加载完成后识别角色（订阅者自动进入只读模式）
// 首次访问默认进入星云深色模式（无本地记录时），已有偏好则跟随
window.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('emby_proxy_dark')) { document.body.classList.add('dark'); document.documentElement.classList.add('dark'); }
    initRole();
});
</script>
`;

// ==========================================
// 2. 后端 Worker 主逻辑处理区 (核心故障转移 + TG Bot播报 + 智能流量拉取)
// ==========================================

// 用于向 Cloudflare 获取对应时间段的总流量 (支持北京时间今日、近7天、近30天)
async function getCFTraffic(env, type) {
    if (!env.CF_API_TOKEN || !env.CF_ZONE_ID) return "缺少变量";
    try {
        const end = new Date();
        let graphqlQuery = {};

        if (type === 'today') {
            // 【今日流量】查询：从北京时间今日 00:00 算起，使用 AdaptiveGroups
            // 1. 获取北京时间并清零时分秒
            const beijingTime = new Date(end.getTime() + 8 * 3600000);
            beijingTime.setUTCHours(0, 0, 0, 0);
            // 2. 转回 UTC 供 API 查询
            const start = new Date(beijingTime.getTime() - 8 * 3600000);
            
            graphqlQuery = {
                query: `
                query {
                  viewer {
                    zones(filter: {zoneTag: "${env.CF_ZONE_ID}"}) {
                      httpRequestsAdaptiveGroups(
                        limit: 1,
                        filter: {
                          datetime_geq: "${start.toISOString()}",
                          datetime_leq: "${end.toISOString()}"
                        }
                      ) {
                        sum {
                          edgeResponseBytes
                        }
                      }
                    }
                  }
                }`
            };
        } else {
            // 【7天、30天】查询：传入数字代表天数，使用 1dGroups（按北京时间日期范围）
            const bjNow = new Date(end.getTime() + 8 * 3600000);
            const start = new Date(bjNow.getTime() - type * 24 * 3600000);
            const dateGeq = start.toISOString().split('T')[0];
            const dateLeq = bjNow.toISOString().split('T')[0];
            graphqlQuery = {
                query: `
                query {
                  viewer {
                    zones(filter: {zoneTag: "${env.CF_ZONE_ID}"}) {
                      httpRequests1dGroups(
                        limit: 10000,
                        filter: {
                          date_geq: "${dateGeq}",
                          date_leq: "${dateLeq}"
                        }
                      ) {
                        sum {
                          bytes
                        }
                      }
                    }
                  }
                }`
            };
        }

        const cfRes = await fetch('https://api.cloudflare.com/client/v4/graphql', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${env.CF_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(graphqlQuery)
        });
        
        const cfData = await cfRes.json();
        
        if (cfData.errors && cfData.errors.length > 0) {
            return `API报错: ${cfData.errors[0].message}`;
        }
        
        const zones = cfData?.data?.viewer?.zones;
        let totalBytes = 0;

        if (zones && zones.length > 0) {
            if (type === 'today' && zones[0].httpRequestsAdaptiveGroups) {
                totalBytes = zones[0].httpRequestsAdaptiveGroups[0]?.sum?.edgeResponseBytes || 0;
            } else if (type !== 'today' && zones[0].httpRequests1dGroups) {
                // 将多天的 bytes 聚合累加
                zones[0].httpRequests1dGroups.forEach(g => { totalBytes += (g.sum.bytes || 0); });
            }
        }

        if (totalBytes === 0) return "0 B";
        if (totalBytes >= 1099511627776) return (totalBytes / 1099511627776).toFixed(2) + " TB";
        if (totalBytes >= 1073741824) return (totalBytes / 1073741824).toFixed(2) + " GB";
        if (totalBytes >= 1048576) return (totalBytes / 1048576).toFixed(2) + " MB";
        if (totalBytes >= 1024) return (totalBytes / 1024).toFixed(2) + " KB";
        return totalBytes + " B";

    } catch(e) {
        return "请求异常";
    }
}

// CF Worker 每日请求数统计（GraphQL httpRequests，额度按 UTC 00:00 重置）
async function getCFRequests(env, type) {
    if (!env.CF_API_TOKEN || !env.CF_ZONE_ID) return { ok: false, error: '缺少变量' };
    try {
        const end = new Date();
        let graphqlQuery = {};
        if (type === 'today') {
            // CF 免费额度按 UTC 00:00 重置，取今天 UTC 00:00 作为起点
            const startUtc = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
            graphqlQuery = {
                query: `
                query {
                  viewer {
                    zones(filter: {zoneTag: "${env.CF_ZONE_ID}"}) {
                      httpRequestsAdaptiveGroups(
                        limit: 1,
                        filter: {
                          datetime_geq: "${startUtc.toISOString()}",
                          datetime_leq: "${end.toISOString()}"
                        }
                      ) {
                        count
                      }
                    }
                  }
                }`
            };
        } else {
            // 7天 / 30天：按天聚合 sum.requests 累加（按北京时间日期范围）
            const bjNow = new Date(end.getTime() + 8 * 3600000);
            const start = new Date(bjNow.getTime() - type * 24 * 3600000);
            const dateGeq = start.toISOString().split('T')[0];
            const dateLeq = bjNow.toISOString().split('T')[0];
            graphqlQuery = {
                query: `
                query {
                  viewer {
                    zones(filter: {zoneTag: "${env.CF_ZONE_ID}"}) {
                      httpRequests1dGroups(
                        limit: 10000,
                        filter: {
                          date_geq: "${dateGeq}",
                          date_leq: "${dateLeq}"
                        }
                      ) {
                        sum {
                          requests
                        }
                      }
                    }
                  }
                }`
            };
        }

        const cfRes = await fetch('https://api.cloudflare.com/client/v4/graphql', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${env.CF_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(graphqlQuery)
        });
        
        const cfData = await cfRes.json();
        if (cfData.errors && cfData.errors.length > 0) {
            return { ok: false, error: cfData.errors[0].message };
        }
        
        const zones = cfData?.data?.viewer?.zones;
        let total = 0;
        if (zones && zones.length > 0) {
            if (type === 'today' && zones[0].httpRequestsAdaptiveGroups) {
                total = zones[0].httpRequestsAdaptiveGroups[0]?.count || 0;
            } else if (type !== 'today' && zones[0].httpRequests1dGroups) {
                zones[0].httpRequests1dGroups.forEach(g => { total += (g.sum.requests || 0); });
            }
        }
        return { ok: true, count: total };
    } catch(e) {
        return { ok: false, error: e.message };
    }
}

// 今日 CF 全维度统计（一次 GraphQL 批量查询：请求数/带宽/缓存/状态码/国家/分时/防火墙）
async function getCFTodayStats(env) {
    if (!env.CF_API_TOKEN || !env.CF_ZONE_ID) return { ok: false, error: '缺少变量' };
    const endD = new Date();
    // 北京时间今日 00:00（UTC+8）作为起点,与面板其余统计口径一致
    const bjStart = new Date(endD.getTime() + 8 * 3600000);
    bjStart.setUTCHours(0, 0, 0, 0);
    const startUtc = new Date(bjStart.getTime() - 8 * 3600000);
    const geq = startUtc.toISOString();
    const leq = endD.toISOString();
    const zoneTag = env.CF_ZONE_ID;
    const baseFilter = `{datetime_geq: "${geq}", datetime_leq: "${leq}"}`;
    const headers = { 'Authorization': `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' };
    async function gql(query) {
        try {
            const r = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers, body: JSON.stringify({ query }) });
            const j = await r.json();
            if (j.errors && j.errors.length) return { errors: j.errors };
            return j.data?.viewer?.zones?.[0] || {};
        } catch (e) { return { errors: [{ message: e.message }] }; }
    }
    // ① 主查询：今日请求数 + 带宽（核心字段，官方确认）
    let requests = 0, bytes = 0, mainError = null;
    const main = await gql(`query { viewer { zones(filter: {zoneTag: "${zoneTag}"}) { o: httpRequestsAdaptiveGroups(limit: 1, filter: ${baseFilter}) { count sum { edgeResponseBytes } } } } }`);
    if (main.errors) { mainError = main.errors[0].message; }
    else { const o = main.o?.[0] || {}; requests = o.count || 0; bytes = o.sum?.edgeResponseBytes || 0; }
    // ② 状态码分布（独立容错）
    const codes = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
    const st = await gql(`query { viewer { zones(filter: {zoneTag: "${zoneTag}"}) { s: httpRequestsAdaptiveGroups(limit: 20, filter: ${baseFilter}) { count dimensions { edgeResponseStatus } } } } }`);
    if (!st.errors) (st.s || []).forEach(g => {
        const c = Number(g.dimensions?.edgeResponseStatus) || 0;
        if (c >= 500) codes['5xx'] += g.count;
        else if (c >= 400) codes['4xx'] += g.count;
        else if (c >= 300) codes['3xx'] += g.count;
        else if (c >= 200) codes['2xx'] += g.count;
    });
    // ③ 来源国家（独立容错）
    let countries = [];
    const ct = await gql(`query { viewer { zones(filter: {zoneTag: "${zoneTag}"}) { c2: httpRequestsAdaptiveGroups(limit: 6, filter: ${baseFilter}) { count dimensions { clientCountryName } } } } }`);
    if (!ct.errors) countries = (ct.c2 || []).slice(0, 5).map(g => ({ country: g.dimensions?.clientCountryName || '未知', count: g.count }));
    // ④ 分时趋势（独立容错;GraphQL 按 UTC 小时聚合,归桶到北京时间 +8）
    const hours = new Array(24).fill(0);
    const hr = await gql(`query { viewer { zones(filter: {zoneTag: "${zoneTag}"}) { h: httpRequestsAdaptiveGroups(limit: 1440, filter: ${baseFilter}) { count dimensions { datetimeMinute } } } } }`);
    if (!hr.errors) (hr.h || []).forEach(g => {
        const d = new Date(g.dimensions?.datetimeMinute);
        if (!isNaN(d.getTime())) hours[(d.getUTCHours() + 8) % 24] += g.count;
    });
    // ⑤ 防火墙拦截（独立容错）
    let blocked = 0;
    const bl = await gql(`query { viewer { zones(filter: {zoneTag: "${zoneTag}"}) { b: firewallEventsAdaptiveGroups(limit: 1, filter: ${baseFilter}) { count } } } }`);
    if (!bl.errors) blocked = bl.b?.[0]?.count || 0;
    // ⑥ 缓存字节（独立容错）
    let cachedBytes = 0;
    const cb = await gql(`query { viewer { zones(filter: {zoneTag: "${zoneTag}"}) { c3: httpRequestsAdaptiveGroups(limit: 1, filter: ${baseFilter}) { sum { cachedBytes } } } } }`);
    if (!cb.errors) { const v = cb.c3?.[0]?.sum?.cachedBytes; if (typeof v === 'number') cachedBytes = v; }
    if (mainError) return { ok: false, error: mainError };
    return { ok: true, requests, bytes, cachedBytes, statusCodes: codes, countries, hours, blocked };
}

// 用于生成 TG 播报消息的核心工具函数 (单面板 + 流量之王统计版)
async function sendTgStats(env, chatId) {
    try {
        const totalQuery = await env.DB.prepare(`SELECT COUNT(*) as count FROM visitor_logs WHERE date(timestamp, '+8 hours') = date('now', '+8 hours')`).first();
        const topRegionQuery = await env.DB.prepare(`SELECT country, COUNT(*) as c FROM visitor_logs WHERE date(timestamp, '+8 hours') = date('now', '+8 hours') GROUP BY country ORDER BY c DESC LIMIT 1`).first();
        const topNodeQuery = await env.DB.prepare(`
            SELECT r.remark, COUNT(v.id) as c 
            FROM visitor_logs v 
            LEFT JOIN routes r ON v.prefix = r.prefix 
            WHERE date(v.timestamp, '+8 hours') = date('now', '+8 hours') 
            GROUP BY v.prefix 
            ORDER BY c DESC LIMIT 1
        `).first();

        // 获取多时间维度流量
        const [trafficToday, traffic7d, traffic30d] = await Promise.all([
            getCFTraffic(env, 'today'),
            getCFTraffic(env, 7),
            getCFTraffic(env, 30)
        ]);

        // ================= 新增：获取今日流量消耗 TOP 1 节点 =================
        let topNodeMsg = "暂无数据";
        if (env.CF_API_TOKEN && env.CF_ZONE_ID && env.DB) {
            try {
                // 1. 获取所有节点
                const { results: routes } = await env.DB.prepare(`SELECT prefix, remark FROM routes`).all();
                if (routes && routes.length > 0) {
                    const end = new Date();
                    const beijingTime = new Date(end.getTime() + 8 * 3600000);
                    beijingTime.setUTCHours(0, 0, 0, 0);
                    const start = new Date(beijingTime.getTime() - 8 * 3600000);

                    let maxBytes = 0;
                    let topNodeName = "无";

                    // 2. 并发向 CF 查询每个节点今天的精准流量
                    await Promise.all(routes.map(async (r) => {
                        try {
                            const graphqlQuery = {
                                query: `query {
                                  viewer {
                                    zones(filter: {zoneTag: "${env.CF_ZONE_ID}"}) {
                                      httpRequestsAdaptiveGroups(
                                        limit: 1,
                                        filter: {
                                          clientRequestPath_like: "/${r.prefix}%",
                                          datetime_geq: "${start.toISOString()}",
                                          datetime_leq: "${end.toISOString()}"
                                        }
                                      ) {
                                        sum { edgeResponseBytes }
                                      }
                                    }
                                  }
                                }`
                            };

                            const cfRes = await fetch('https://api.cloudflare.com/client/v4/graphql', {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify(graphqlQuery)
                            });
                            
                            const cfData = await cfRes.json();
                            const bytes = cfData?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups?.[0]?.sum?.edgeResponseBytes || 0;
                            
                            // 3. 找出最大值
                            if (bytes > maxBytes) {
                                maxBytes = bytes;
                                topNodeName = r.remark || r.prefix;
                            }
                        } catch(e) {}
                    }));

                    // 4. 转换字节并组装文本
                    if (maxBytes > 0) {
                        let formatted = "0 B";
                        if (maxBytes >= 1099511627776) formatted = (maxBytes / 1099511627776).toFixed(2) + " TB";
                        else if (maxBytes >= 1073741824) formatted = (maxBytes / 1073741824).toFixed(2) + " GB";
                        else if (maxBytes >= 1048576) formatted = (maxBytes / 1048576).toFixed(2) + " MB";
                        else if (maxBytes >= 1024) formatted = (maxBytes / 1024).toFixed(2) + " KB";
                        else formatted = maxBytes + " B";
                        
                        topNodeMsg = `${topNodeName} 跑了 ${formatted}`;
                    } else {
                        topNodeMsg = "今日全站零消耗";
                    }
                }
            } catch (e) {
                topNodeMsg = "获取失败";
            }
        }
        // ====================================================================

        const totalStr = totalQuery ? totalQuery.count : 0;
        const regionStr = topRegionQuery ? `${topRegionQuery.country === 'CN' ? ' 中国大陆' : topRegionQuery.country} (${topRegionQuery.c} 次)` : '暂无记录';
        const nodeStr = topNodeQuery ? `${topNodeQuery.remark || '未命名节点'} (${topNodeQuery.c} 次)` : '暂无记录';

        const msg = 
            `*今日反代播放数据*\n\n` +
            `今日总播放次数: ${totalStr} 次\n` +
            `最多访问地区: ${regionStr}\n` +
            `最喜欢的EMBY: ${nodeStr}\n\n` +
            `实际流量消耗:\n` +
            `当天内: ${trafficToday}\n` +
            `七天内: ${traffic7d}\n` +
            `30天内: ${traffic30d}\n\n` +
            `今日流量之王:\n` +
            `${topNodeMsg}`;

        await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown' })
        });
    } catch (e) {
        console.error("TG Send Error:", e);
    }
}

// ============ 播放热力图 v3.4.16（反代真实播放请求命中统计,存 D1 play_hits）============

// 播放命中计数：反代路径命中真实播放(stream 拉流 / POST PlaybackInfo)时按 节点×日期×小时 累加
// 设置自定义请求头(EMOS 等)。WHATWG Headers 值要求 Latin-1，中文等字符会抛 TypeError，
// 此时退化为 encodeURIComponent 编码值，保证反代不因头值中断
function setHeaderSafe(headers, key, value) {
    try { headers.set(key, value); }
    catch (e) { try { headers.set(key, encodeURIComponent(value)); } catch (e2) {} }
}
// EMOS 默认身份：节点未单独配置 EMOS ID/称号时使用（可在面板节点设置中更改，不强制）
const DEFAULT_EMOS_ID = 'eK3QYG29Ms';
const DEFAULT_EMOS_NAME = '玛卡巴卡的反代面板';
async function recordPlayHit(env, prefix) {
    if (!env.DB || !prefix) return;
    try {
        await ensurePlayHits(env);
        const now = new Date(Date.now() + 8 * 3600000); // UTC+8
        const day = now.toISOString().split('T')[0];
        const hour = now.getUTCHours();
        await env.DB.prepare(
            `INSERT INTO play_hits (prefix, day, hour, cnt) VALUES (?, ?, ?, 1)
             ON CONFLICT(prefix, day, hour) DO UPDATE SET cnt = cnt + 1`
        ).bind(prefix, day, hour).run();
    } catch (e) { console.error('recordPlayHit:', e.message); }
}

// 读取最近 N 天播放热力图：返回 天×24小时 计数矩阵 + 节点总计
async function getHeatmap(env, days = 7) {
    // v3.4.68:天数钳制 1~31(play_hits 仅保留 30 天,防大范围扫描拖垮 D1)
    days = Math.max(1, Math.min(31, parseInt(days, 10) || 7));
    if (!env.DB) return { ok: false, error: '未绑定 D1' };
    try {
        await ensurePlayHits(env);
        const end = new Date(Date.now() + 8 * 3600000);
        end.setUTCHours(23, 59, 59, 0);
        const start = new Date(end.getTime() - (days - 1) * 86400000);
        start.setUTCHours(0, 0, 0, 0);
        const { results } = await env.DB.prepare(
            `SELECT prefix, day, hour, cnt FROM play_hits WHERE day >= ? AND day <= ?`
        ).bind(start.toISOString().split('T')[0], end.toISOString().split('T')[0]).all();
        const dayList = [];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(end.getTime() - i * 86400000);
            dayList.push(d.toISOString().split('T')[0]);
        }
        const grid = dayList.map(day => ({ day, hours: new Array(24).fill(0) }));
        const prefixTotals = {};
        let total = 0;
        for (const r of results || []) {
            const idx = dayList.indexOf(r.day);
            if (idx >= 0 && r.hour >= 0 && r.hour < 24) {
                grid[idx].hours[r.hour] = (grid[idx].hours[r.hour] || 0) + (r.cnt || 0);
                prefixTotals[r.prefix] = (prefixTotals[r.prefix] || 0) + (r.cnt || 0);
                total += (r.cnt || 0);
            }
        }
        const maxHour = Math.max(1, ...grid.flatMap(g => g.hours));
        return { ok: true, days: grid.map(g => ({ day: g.day.slice(5), hours: g.hours })), prefixTotals, total, maxHour };
    } catch (e) { return { ok: false, error: e.message }; }
}

// ============ 保号通知（Bark / Telegram / Server酱 / 钉钉）============
async function getNotifyCfg(env) {
    let cfg = { barkKey: '', barkLevel: 'active', barkServer: 'https://api.day.app', barkNotify: true, tgToken: '', tgChatId: '', tgNotify: true, serverChanKey: '', serverChanNotify: false, dingTalkWebhook: '', dingTalkNotify: false };
    try {
        if (env && env.DB) {
            const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'notify_settings'").first();
            if (row && row.value) Object.assign(cfg, JSON.parse(row.value));
        }
    } catch (e) {}
    if (!cfg.serverChanKey && env && env.SERVERCHAN_KEY) cfg.serverChanKey = String(env.SERVERCHAN_KEY).trim();
    if (!cfg.dingTalkWebhook && env && env.DINGTALK_WEBHOOK) cfg.dingTalkWebhook = String(env.DINGTALK_WEBHOOK).trim();
    return cfg;
}
// v3.5.3:播放器 UA → 真实名称归并（排行榜用）
function playerNameFromUA(ua) {
    const s = String(ua || '').toLowerCase();
    // ① 主规则:取 / 前内容作为候选品牌(忽略括号内平台/设备信息)
    const slashI = s.indexOf('/');
    if (slashI > 0) {
        const raw = s.slice(0, slashI).trim();
        // 已知含空格真名优先(Emby Web / Emby Theater / MX Player)
        const EXACT = { 'emby web': 'Emby Web', 'emby theater': 'Emby Theater', 'mx player': 'MXPlayer' };
        if (EXACT[raw]) return EXACT[raw];
        // 去掉品牌+平台后缀(Hills Windows → Hills)
        let n = raw.replace(/ (windows|macos|ios|android|web|linux|tv|tvos)$/i, '');
        // 去掉产品模式后缀(Forward-Standard → Forward / Infuse-Direct → Infuse)
        n = n.replace(/-(standard|direct)$/i, '');
        n = n.replace(/[^a-z]/gi, '').toLowerCase();
        if (n.length >= 2) {
            const MAP = { infuse:'Infuse', senplayer:'SenPlayer', rex:'Rex', rodelplayer:'RodePlayer', rodeplayer:'RodePlayer', fileball:'Fileball', vidhub:'VidHub', emby:'Emby', jellyfin:'Jellyfin', quickplay:'QuickPlay', playa:'Playa', mpv:'MPV', vlc:'VLC', plex:'Plex', mxplayer:'MXPlayer', nplayer:'nPlayer', outplayer:'OutPlayer', bamboo:'Bamboo', ytplayer:'YTPlayer', hills:'Hills', forward:'Forward', mozilla:'Mozilla', applewebkit:'Browser', chrome:'Chrome', edge:'Edge', safari:'Safari', curl:'curl', python:'Python', okhttp:'OkHttp', unknown:'Unknown' };
            if (MAP[n]) return MAP[n];
            return n.charAt(0).toUpperCase() + n.slice(1);
        }
    }
    // ② 无 / 或品牌过短:系统名兜底(Windows / Android / iOS / macOS)
    const MAP_SYS = [['windows','Windows'],['android','Android'],['ios','iOS'],['macos','macOS']];
    for (const [k, v] of MAP_SYS) if (s.includes(k)) return v;
    const m = s.match(/^([a-z0-9._-]+)\//);
    if (m) { const t = m[1].replace(/[^a-z]/g, ''); if (t && t.length >= 2) return t.charAt(0).toUpperCase() + t.slice(1); }
    const m2 = s.match(/^([a-z]+)/);
    if (m2 && m2[1].length >= 4 && /\d/.test(s)) return m2[1].charAt(0).toUpperCase() + m2[1].slice(1);
    return 'Unknown';
}
function aggPlayerStats(rows) {
    const map = {};
    for (const r of (rows || [])) {
        const n = playerNameFromUA(r.ua);
        map[n] = (map[n] || 0) + Number(r.c || 0);
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));
}
// 自定义头像（左上角 / 登录页 / favicon）：D1 app_config['logo'] 存 {type:'url'|'data', value}
async function getLogo(env) {
  try {
    if (!env || !env.DB) return null;
    const row = await memoStale('logo_cfg', 30000, async () => {
      await ensureAppConfig(env);
      return await env.DB.prepare("SELECT value FROM app_config WHERE key = 'logo'").first();
    });
    if (row && row.value) {
      const c = JSON.parse(row.value);
      if (c && c.value && isSafeLogoValue(c.value)) return c;
    }
  } catch (e) {}
  return null;
}
async function sendBarkN(cfg, title, body) {
    try {
        if (!cfg.barkKey) return false;
        const r = await fetch((cfg.barkServer || 'https://api.day.app').replace(/\/+$/, '') + '/' + String(cfg.barkKey).trim(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({ title: title, body: body, level: cfg.barkLevel || 'active' })
        });
        return r.ok;
    } catch (e) { return false; }
}
async function sendTgN(cfg, text) {
    try {
        if (!cfg.tgToken || !cfg.tgChatId) return false;
        const r = await fetch('https://api.telegram.org/bot' + String(cfg.tgToken).trim() + '/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: String(cfg.tgChatId).trim(), text: text })
        });
        return r.ok;
    } catch (e) { return false; }
}
// v3.5.3:Server酱（Server酱 Turbo：sctapi.ftqq.com）
async function sendServerChanN(cfg, title, body) {
    try {
        if (!cfg.serverChanKey) return false;
        const r = await fetch('https://sctapi.ftqq.com/' + encodeURIComponent(String(cfg.serverChanKey).trim()) + '.send?title=' + encodeURIComponent(title) + '&desp=' + encodeURIComponent(body), { method: 'GET' });
        return r.ok;
    } catch (e) { return false; }
}
// v3.5.3:钉钉机器人
async function sendDingTalkN(cfg, title, body) {
    try {
        if (!cfg.dingTalkWebhook) return false;
        let url = String(cfg.dingTalkWebhook).trim();
        if (!/^https?:\/\//i.test(url)) url = 'https://oapi.dingtalk.com/robot/send?access_token=' + encodeURIComponent(url);
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ msgtype: 'text', text: { content: (title ? title + '\n' : '') + body } }) });
        try { const d = await r.clone().json(); return d.errcode === 0; } catch (e) { return r.ok; }
    } catch (e) { return false; }
}
// v3.4.17:提前预警——到期前 3/2/1 天 + 当天各提醒一次;节点在提醒后已播放(last_play 更新)
// 则 diffDays 归零、remain > 3 自然退出提醒窗口,重新进入 wl 天倒计时,不再重复提醒
function kaTodaySent(last, t) {
    const ns = {};
    try { for (const p in (last.sent || {})) if (last.sent[p] === t) ns[p] = t; } catch (e) {}
    return ns;
}
async function scanOverdueNotify(env, ctx) {
    try {
        if (!env.DB) return;
        // v3.4.66：观看检查与推送渠道解耦——cron / 请求兜底到点必查（不配推送也检查并记录状态），
        //   有推送渠道才发消息提醒；判断依据为最后一次真实观看时间 last_play（2.7 心跳链口径）
        const todayStr = new Date(Date.now() + 8 * 3600000).toISOString().split('T')[0];
        const lastRow = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'overdue_notify'").first();
        let last = {};
        try { if (lastRow && lastRow.value) last = JSON.parse(lastRow.value); } catch (e) {}
        if (last.date === todayStr) return;
        // 老库可能还没有 watch_limit 列：先补列再查询，防止 SQL 报错导致超限提醒静默失效
        await ensureRoutesSchema(env);
        const { results } = await env.DB.prepare('SELECT prefix, remark, target, last_play, watch_limit FROM routes').all();
        const remind = {};   // prefix → {remark, days, wl, remain}
        for (const r of (results || [])) {
            const wl = parseFloat(r.watch_limit);
            if (!wl || wl <= 0 || !r.last_play) continue;
            const lpUtc = Date.parse(String(r.last_play).replace(' ', 'T') + 'Z') - 8 * 3600000;
            if (isNaN(lpUtc)) continue;
            const diffDays = Math.floor((Date.now() - lpUtc) / 86400000);
            if (diffDays <= 0) continue;     // v3.4.68:今天观看过(含刚播)不提醒,修复 watch_limit≤3 时刚观看即被提醒"0天没观看"
            const remain = wl - diffDays;   // 剩余天数:0=到期当天,负=已超限,>3=安全期
            if (remain > 3) continue;        // 安全期(含刚播放进入新倒计时,观看后自动解除提醒),不提醒
            if (last.sent && last.sent[r.prefix] === todayStr) continue;   // 该节点今日已提醒
            remind[r.prefix] = { remark: r.remark || r.prefix, days: diffDays, wl: wl, remain: remain };
        }
        const prefixes = Object.keys(remind);
        if (!prefixes.length) {
            // 无需要提醒的节点:记录今日已检查(避免每天重复扫描),保留今日已提醒节点记录
            await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('overdue_notify', JSON.stringify({ date: todayStr, sent: kaTodaySent(last, todayStr) })).run();
            return;
        }
        // 有提醒节点但未配置任何推送渠道:检查已完成,仅记录今日已检查(不发送)
        const cfg = await getNotifyCfg(env);
        const canBark = cfg.barkNotify && cfg.barkKey;
        const canTg = cfg.tgNotify && cfg.tgToken && cfg.tgChatId;
        const canServerChan = cfg.serverChanNotify && cfg.serverChanKey;
        const canDingTalk = cfg.dingTalkNotify && cfg.dingTalkWebhook;
        if (!canBark && !canTg && !canServerChan && !canDingTalk) {
            await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('overdue_notify', JSON.stringify({ date: todayStr, sent: kaTodaySent(last, todayStr) })).run();
            return;
        }
        // v3.4.66 新文案：{节点备注}节点已经{days}天没观看了，请立即观看保号
        const lines = prefixes.map(p => {
            const n = remind[p];
            return n.remark + '节点已经' + n.days + '天没观看了，请立即观看保号';
        });
        const text = '保号提醒：' + prefixes.length + ' 个节点需要观看保号\n' + lines.join('\n');
        // 推送成功才记录今日已提醒;推送失败不记录,6 小时后自动重试
        let sent = false;
        if (canBark) sent = await sendBarkN(cfg, 'Emby 反代面板 · 保号预警', text) || sent;
        if (canTg) sent = await sendTgN(cfg, text) || sent;
        if (canServerChan) sent = await sendServerChanN(cfg, 'Emby 反代面板 · 保号预警', text) || sent;
        if (canDingTalk) sent = await sendDingTalkN(cfg, 'Emby 反代面板 · 保号预警', text) || sent;
        if (sent) {
            const ns = kaTodaySent(last, todayStr);
            for (const p of prefixes) ns[p] = todayStr;
            await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('overdue_notify', JSON.stringify({ date: todayStr, sent: ns })).run();
        }
    } catch (e) { console.error('scanOverdueNotify:', e); }
}

// v3.4.68:检查间隔(小时)可配置,默认 6(保号预警 / 更新提醒共用;app_config key='check_interval_hours')
async function checkIntervalHours(env) {
    try {
        const row = await memoStale('check_interval_hours', 30000, async () => {
            if (!env.DB) return null;
            await ensureAppConfig(env);
            return await env.DB.prepare("SELECT value FROM app_config WHERE key = 'check_interval_hours'").first();
        });
        if (row && row.value) { const h = parseFloat(row.value); if (h > 0) return h; }
    } catch (e) {}
    return 6;
}

// isolate 内存短路:同一实例 N 秒内最多去碰一次 D1;跨实例的「谁来干」仍由 D1 原子节流(claimThrottle)决定
const memGateLast = Object.create(null);
function memGate(key, ms) {
    const n = Date.now();
    if (memGateLast[key] && n - memGateLast[key] < ms) return false;
    memGateLast[key] = n;
    return true;
}
async function maybeScanOverdue(env) {
    try {
        if (!env.DB) return;
        if (!memGate('overdue', 120000)) return;
        // v3.5.0:原子节流(单条 SQL 抢占,无读后写竞态),沿用 overdue_last_check 键
        if (!(await claimThrottle(env, 'overdue_last_check', (await checkIntervalHours(env)) * 3600000))) return;
        await scanOverdueNotify(env, {});
    } catch (e) {}
}

// ============ 新版本推送通知（Bark / Telegram）============
function verNum(v) {
    return String(v || '').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
}
function isNewerVer(a, b) {
    const A = verNum(a), B = verNum(b);
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
        const x = A[i] || 0, y = B[i] || 0;
        if (x !== y) return x > y;
    }
    return false;
}
async function checkUpdateNotify(env) {
    try {
        if (!env.DB) return;
        // 更新提醒开关（与面板弹窗提醒一致）
        let notifyOn = true;
        try {
            const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'update_notify'").first();
            if (row && row.value !== null && row.value !== undefined) notifyOn = String(row.value) !== '0';
        } catch (e) {}
        if (!notifyOn) return;
        // 拉取 changelog 最新版本
        const res = await fetch(CHANGELOG_URL, { headers: { 'User-Agent': 'cloudflare-worker' } });
        if (!res.ok) return;
        const cl = await res.json();
        const latest = (cl && cl.versions && cl.versions[0]) || null;
        if (!latest || !latest.version) return;
        if (!isNewerVer(latest.version, CURRENT_VERSION)) return;
        // 防重复：每个新版本只推送一次
        const sentRow = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'update_notify_sent'").first();
        let sent = {};
        try { if (sentRow && sentRow.value) sent = JSON.parse(sentRow.value); } catch (e) {}
        if (sent.version === latest.version) return;
        const cfg = await getNotifyCfg(env);
        if (!cfg.barkNotify && !cfg.tgNotify && !cfg.serverChanNotify && !cfg.dingTalkNotify) return;
        if (!cfg.barkKey && !(cfg.tgToken && cfg.tgChatId) && !cfg.serverChanKey && !cfg.dingTalkWebhook) return;
        const items = (latest.items || []).slice(0, 6).map(i => '· ' + i).join('\n');
        const text = ' 检测到新版本：v' + latest.version + '（' + (latest.title || '') + '）\n当前版本：v' + CURRENT_VERSION + '\n\n更新内容：\n' + items + '\n\n可在面板「设置 → 版本」中查看更新内容并手动更新。';
        let ok = false;
        if (cfg.barkNotify && cfg.barkKey) ok = await sendBarkN(cfg, 'Emby 反代面板 · 新版本可用', text) || ok;
        if (cfg.tgNotify && cfg.tgToken && cfg.tgChatId) ok = await sendTgN(cfg, text) || ok;
        // v3.5.4:新版本更新也推送到 TG 群机器人日报(独立 Bot)
        const tgg = await getTgGroupCfg(env);
        if (tgg.enabled && tgg.botToken && tgg.chatId) ok = await sendTgGroup(tgg, '📢 检测到新版本：v' + latest.version + '（' + (latest.title || '') + '）\n当前版本：v' + CURRENT_VERSION + '\n\n更新内容：\n' + items) || ok;
        if (cfg.serverChanNotify && cfg.serverChanKey) ok = await sendServerChanN(cfg, 'Emby 反代面板 · 新版本可用', text) || ok;
        if (cfg.dingTalkNotify && cfg.dingTalkWebhook) ok = await sendDingTalkN(cfg, 'Emby 反代面板 · 新版本可用', text) || ok;
        if (ok) await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('update_notify_sent', JSON.stringify({ version: latest.version })).run();
    } catch (e) { console.error('checkUpdateNotify:', e); }
}
async function maybeCheckUpdate(env) {
    try {
        if (!env.DB) return;
        if (!memGate('update', 120000)) return;
        // v3.5.0:原子节流(单条 SQL 抢占,无读后写竞态),沿用 update_notify_last_check 键
        if (!(await claimThrottle(env, 'update_notify_last_check', (await checkIntervalHours(env)) * 3600000))) return;
        await checkUpdateNotify(env);
    } catch (e) {}
}

// ============ v3.5.4:TG 群机器人日报（独立 Bot，每天定时推送节点/播放器/地区排行；新版本也群通知）============
async function getTgGroupCfg(env) {
    let cfg = { enabled: false, botToken: '', chatId: '', hour: 20 };
    try {
        if (env && env.DB) {
            const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'tg_group_settings'").first();
            if (row && row.value) Object.assign(cfg, JSON.parse(row.value));
        }
    } catch (e) {}
    return cfg;
}
async function sendTgGroup(cfg, text) {
    try {
        if (!cfg.botToken || !cfg.chatId) return false;
        const r = await fetch('https://api.telegram.org/bot' + String(cfg.botToken).trim() + '/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: String(cfg.chatId).trim(), text: text })
        });
        return r.ok;
    } catch (e) { return false; }
}
async function buildDailyReport(env) {
    try {
        const todayStr = new Date(Date.now() + 8 * 3600000).toISOString().split('T')[0];
        const lines = [];
        lines.push('📊 Emby 反代面板 · 节点热度日报');
        lines.push('📅 ' + todayStr + '（北京时间）');
        // ① 节点播放 TOP10(显示备注名,无备注回退前缀)
        const rs = await env.DB.prepare("SELECT prefix, SUM(count) as c FROM request_stats WHERE date = ? GROUP BY prefix ORDER BY c DESC LIMIT 10").bind(todayStr).all();
        const routes = await env.DB.prepare("SELECT prefix, remark FROM routes").all();
        const rmap = {}; for (const r of (routes.results || [])) rmap[r.prefix] = (r.remark || '').trim() || r.prefix;
        lines.push('\n🔥 节点播放 TOP10（播放次数）');
        if (!rs.results.length) lines.push('暂无数据');
        else rs.results.forEach((r, i) => lines.push((i + 1) + '. ' + (rmap[r.prefix] || r.prefix) + ' — ' + r.c + ' 次'));
        // ② 播放器 TOP5
        const uaRaw = await env.DB.prepare("SELECT ua, COUNT(*) as c FROM visitor_logs WHERE date(timestamp, '+8 hours') = ? GROUP BY ua ORDER BY c DESC LIMIT 50").bind(todayStr).all();
        const players = aggPlayerStats((uaRaw && uaRaw.results) || []).slice(0, 5);
        lines.push('\n📺 播放器 TOP5');
        if (!players.length) lines.push('暂无数据');
        else players.forEach((p, i) => lines.push((i + 1) + '. ' + p.name + ' — ' + p.count + ' 次'));
        // ③ 地区 TOP5(国内精确到省份,国外到国家)
        const locRaw = await env.DB.prepare("SELECT CASE WHEN country = 'CN' THEN (CASE WHEN region != '' THEN region ELSE '中国大陆' END) ELSE country END as loc, COUNT(*) as c FROM visitor_logs WHERE date(timestamp, '+8 hours') = ? AND (country != '' OR region != '') GROUP BY loc ORDER BY c DESC LIMIT 5").bind(todayStr).all();
        lines.push('\n🌍 地区 TOP5');
        if (!locRaw.results.length) lines.push('暂无数据');
        else locRaw.results.forEach((r, i) => lines.push((i + 1) + '. ' + (r.loc || '未知') + ' — ' + r.c + ' 次'));
        return lines.join('\n');
    } catch (e) { console.error('buildDailyReport:', e); return ''; }
}
async function maybeSendTgGroupDaily(env) {
    try {
        if (!env.DB) return;
        if (!memGate('tgdaily', 120000)) return;
        const cfg = await getTgGroupCfg(env);
        if (!cfg.enabled || !cfg.botToken || !cfg.chatId) return;
        // 北京时间:未到点直接返回且不写节流标记,保证到点后首个请求立即检查
        const now = new Date(Date.now() + 8 * 3600000);
        const hour = parseInt(cfg.hour || 20, 10);
        if (now.getUTCHours() < hour) return;
        const todayStr = now.toISOString().split('T')[0];
        const sentRow = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'tg_group_daily_sent'").first();
        if (sentRow && sentRow.value === todayStr) return;
        // 已到点:按"日期"节流,同一天同一小时内只检查一次,避免高频请求重复生成日报
        if (!(await claimThrottle(env, 'tg_group_daily_last_check_' + todayStr, 3600000))) return;
        const text = await buildDailyReport(env);
        if (!text) return;
        const ok = await sendTgGroup(cfg, text);
        if (ok) await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('tg_group_daily_sent', todayStr).run();
    } catch (e) { console.error('maybeSendTgGroupDaily:', e); }
}

const ENTRY_UI = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>管理员逃生入口</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;background:linear-gradient(135deg,#0f2027,#203a43,#2c5364);font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;color:#e8eaed;padding:20px}
.card{background:rgba(255,255,255,.06);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:32px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,.4);margin-bottom:16px}
h1{font-size:19px;margin-bottom:8px;text-align:center}
.sub{font-size:13px;color:#aab4c0;text-align:center;margin-bottom:18px;line-height:1.6}
input[type=password],input[type=text],textarea{width:100%;padding:12px 14px;border:1px solid rgba(255,255,255,.18);border-radius:10px;background:rgba(255,255,255,.07);color:#fff;font-size:14px;outline:none;margin-bottom:12px;box-sizing:border-box}
input:focus,textarea:focus{border-color:#4da3ff}
textarea{resize:vertical;min-height:80px}
button{width:100%;padding:13px;border:none;border-radius:10px;background:#4da3ff;color:#fff;font-size:15px;font-weight:600;cursor:pointer}
button:active{opacity:.85}
button.ghost{background:transparent;border:1px solid rgba(255,255,255,.3);margin-top:8px}
.row{display:flex;gap:14px;align-items:center;flex-wrap:wrap;font-size:13px;margin-bottom:12px}
.row label{display:flex;align-items:center;gap:5px;cursor:pointer}
.err{color:#ff6b6b;font-size:13px;text-align:center;margin-top:10px;min-height:18px}
.ok{color:#34c759;font-size:13px;text-align:center;margin-top:10px;min-height:18px}
.tip{margin-top:16px;font-size:12px;color:#8b96a3;text-align:center;line-height:1.7}
</style>
</head>
<body>
<div class="card" id="loginCard">
<h1>&#128274; 管理员逃生入口</h1>
<div class="sub">当前 IP 被访问控制拦截时,<br>输入管理员密码即可解锁并管理</div>
<input type="password" id="pass" placeholder="管理员密码" autocomplete="off">
<button onclick="go()">解锁</button>
<div class="err" id="err"></div>
</div>
<div class="card" id="manageCard" style="display:none; max-width:460px;">
<h1>&#9881; IP 访问控制</h1>
<div class="sub">你的 IP <b id="myIp" style="color:#fff;">-</b> 已加入最高白名单,<br>任何模式都可访问面板与节点</div>
<div class="row">
<label><input type="radio" name="m" value="off" style="accent-color:#4da3ff;"> 关闭</label>
<label><input type="radio" name="m" value="whitelist" style="accent-color:#4da3ff;"> 白名单</label>
<label><input type="radio" name="m" value="blacklist" style="accent-color:#4da3ff;"> 黑名单</label>
</div>
<textarea id="ips" placeholder="IP / 网段,每行一个,支持 CIDR&#10;如: 1.2.3.4&#10;5.6.7.0/24"></textarea>
<input type="text" id="countries" placeholder="国家/地区码,每行一个 ISO 两位码,如 US、RU、CN">
<input type="text" id="redirect" placeholder="跳转网址(被拦截时 302 跳转)">
<div style="margin-bottom:12px; border-top:1px solid rgba(255,255,255,.12); padding-top:12px;">
<div style="font-size:13px; font-weight:600; margin-bottom:6px;">最高白名单</div>
<div style="font-size:12px; color:#8b96a3; margin-bottom:8px; line-height:1.6;">你的 IP 已自动加入。共享节点的其他 IP 可在此删除,修改后点保存生效。</div>
<div id="tList" style="display:flex; flex-direction:column; gap:4px; margin-bottom:8px;"></div>
<div style="display:flex; gap:8px;">
<input type="text" id="tAdd" placeholder="输入要添加的 IP" style="flex:1; margin-bottom:0;">
<button onclick="tAddOne()" style="width:auto; padding:12px 14px; font-size:13px; background:rgba(255,255,255,.12);">添加</button>
</div>
</div>
<button onclick="save()">保存设置</button>
<div class="ok" id="sOk"></div>
<div class="err" id="sErr"></div>
<button class="ghost" onclick="goPanel()">进入面板 &rarr;</button>
<div class="tip">最高白名单在登录时自动加入,无需手动管理;<br>此入口不受 IP 封锁与 token 模式影响</div>
</div>
<script>
function $(id){return document.getElementById(id);}
async function go(){
  var p=$('pass').value.trim();
  var err=$('err');
  if(!p){err.textContent='请输入密码';return;}
  try{
    var r=await fetch('/api/entry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pass:p})});
    var d=await r.json();
    if(d.success){
      err.textContent='';
      $('loginCard').style.display='none';
      $('manageCard').style.display='block';
      $('myIp').textContent=d.currentIp||'-';
      loadCfg();
    }else{err.textContent=d.error||'解锁失败';}
  }catch(e){err.textContent='请求失败: '+e.message;}
}
var ENTRY_TRUSTED=[];
function escHtmlE(v){return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function renderTList(){
  var box=$('tList');
  if(!box)return;
  if(!ENTRY_TRUSTED.length){box.innerHTML='<div style="font-size:12px;color:#8b96a3;">暂无信任 IP</div>';return;}
  box.innerHTML=ENTRY_TRUSTED.map(function(ip){return '<div style="display:flex;align-items:center;justify-content:space-between;font-size:12px;padding:5px 8px;background:rgba(255,255,255,.06);border-radius:6px;gap:8px;"><span style="word-break:break-all;">'+escHtmlE(ip)+'</span><button onclick="tDel(this)" data-ip="'+escHtmlE(ip)+'" style="background:none;border:none;color:#ff6b6b;cursor:pointer;font-size:13px;flex-shrink:0;"></button></div>';}).join('');
}
function tDel(btn){var ip=btn.getAttribute('data-ip');if(!ip)return;ENTRY_TRUSTED=ENTRY_TRUSTED.filter(function(x){return x!==ip;});renderTList();}
function tAddOne(){var v=$('tAdd').value.trim();if(!v)return;if(ENTRY_TRUSTED.indexOf(v)<0)ENTRY_TRUSTED.push(v);$('tAdd').value='';renderTList();}
async function loadCfg(){
  try{
    var r=await fetch('/api/ipguard');
    var d=await r.json();
    if(!d.success)return;
    var radios=document.querySelectorAll('input[name=m]');
    for(var i=0;i<radios.length;i++){radios[i].checked=(radios[i].value===d.mode);}
    $('ips').value=(d.ips||[]).join('\\n');
    $('countries').value=(d.countries||[]).join('\\n');
    $('redirect').value=d.redirect||'';
    ENTRY_TRUSTED=(d.trusted||[]).slice();
    renderTList();
  }catch(e){}
}
async function save(){
  var mode='off';
  var radios=document.querySelectorAll('input[name=m]');
  for(var i=0;i<radios.length;i++){if(radios[i].checked)mode=radios[i].value;}
  var ips=$('ips').value.split('\\n').map(function(x){return x.trim();}).filter(Boolean);
  var countries=$('countries').value.split('\\n').map(function(x){return x.trim().toUpperCase();}).filter(Boolean);
  var redirect=$('redirect').value.trim();
  $('sOk').textContent='';
  $('sErr').textContent='';
  try{
    var r=await fetch('/api/ipguard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:mode,ips:ips,countries:countries,redirect:redirect,trusted:ENTRY_TRUSTED})});
    var d=await r.json();
    if(d.success){$('sOk').textContent='设置已保存';}else{$('sErr').textContent='保存失败: '+(d.error||'');}
  }catch(e){$('sErr').textContent='保存失败: '+e.message;}
}
function goPanel(){location.href='/';}
$('pass').addEventListener('keydown',function(e){if(e.key==='Enter'){go();}});
</script>
</body>
</html>`;

// ============ IP 被封提示页(未设置跳转网址时显示) ============
function escHtmlStr(v) { return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
const IP_BLOCKED_UI = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>访问已被禁止</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460);font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;color:#e8eaed;padding:20px}
.card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:36px;width:100%;max-width:400px;text-align:center}
h1{font-size:22px;margin-bottom:12px}
.sub{font-size:14px;color:#aab4c0;margin-bottom:20px;line-height:1.7;word-break:break-all}
.badge{display:inline-block;background:rgba(255,107,107,.15);border:1px solid rgba(255,107,107,.35);color:#ff6b6b;padding:4px 14px;border-radius:20px;font-size:13px;font-weight:600;margin-bottom:16px}
.tip{font-size:12px;color:#8b96a3;line-height:1.7}
</style>
</head>
<body>
<div class="card">
<span class="badge">&#128683; 访问已被禁止</span>
<h1>你的 IP 已被禁用</h1>
<div class="sub">当前 IP: <b style="color:#fff;">__IP__</b><br>地区: __COUNTRY__<br>该 IP 不在允许访问范围内</div>
<div class="tip">如有疑问请联系管理员</div>
</div>
</body>
</html>`;

const IP_BLOCKED_HARD_UI = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>访问已被禁止</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#2a0f0f,#1a1a2e,#0f3460);font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;color:#e8eaed;padding:20px}
.card{background:rgba(255,255,255,.06);border:1px solid rgba(255,107,107,.25);border-radius:18px;padding:36px;width:100%;max-width:400px;text-align:center}
h1{font-size:22px;margin-bottom:12px}
.sub{font-size:14px;color:#aab4c0;margin-bottom:20px;line-height:1.7;word-break:break-all}
.badge{display:inline-block;background:rgba(255,107,107,.15);border:1px solid rgba(255,107,107,.35);color:#ff6b6b;padding:4px 14px;border-radius:20px;font-size:13px;font-weight:600;margin-bottom:16px}
.tip{font-size:12px;color:#8b96a3;line-height:1.7}
</style>
</head>
<body>
<div class="card">
<span class="badge">&#128683; 访问已被禁止</span>
<h1>你的 IP 已被拉黑</h1>
<div class="sub">当前 IP: <b style="color:#fff;">__IP__</b></div>
<div class="tip">该 IP 已被管理员加入最高黑名单，如有疑问请联系管理员</div>
</div>
</body>
</html>`;

// ============ 系统保留后缀(节点前缀/反代 Token key 不可占用) ============
const RESERVED_SUFFIX = ['entry', 'api', 'catch', 'speedtest', '__client_rtt__', 'favicon.ico'];
function isReservedSuffix(s) {
  const t = String(s || '').trim().toLowerCase().replace(/^\/+|\/+$/g, '');
  return RESERVED_SUFFIX.indexOf(t) >= 0;
}

// ============ 最高白名单(/entry 登录成功的 IP, 任何模式都例外) ============
async function getIpGuardTrusted(env) {
  try {
    if (!env.DB) return [];
    return await memoStale('ipg_trusted', 30000, async () => {
      await ensureAppConfig(env);
      const r = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'ipguard_trusted'").first();
      if (r && r.value) {
        const arr = JSON.parse(r.value);
        return Array.isArray(arr) ? arr : [];
      }
      return [];
    });
  } catch (e) { return []; }
}
async function addIpGuardTrusted(env, ip) {
  if (!ip) return;
  try {
    const cur = await getIpGuardTrusted(env);
    if (cur.indexOf(ip) < 0) {
      cur.push(ip);
      await env.DB.prepare("INSERT INTO app_config(key,value) VALUES('ipguard_trusted',?) ON CONFLICT(key) DO UPDATE SET value=?").bind(JSON.stringify(cur), JSON.stringify(cur)).run();
      memoDel('ipg_trusted');
    }
  } catch (e) {}
}
async function saveIpGuardTrusted(env, arr) {
  try {
    await env.DB.prepare("INSERT INTO app_config(key,value) VALUES('ipguard_trusted',?) ON CONFLICT(key) DO UPDATE SET value=?").bind(JSON.stringify(arr), JSON.stringify(arr)).run();
    memoDel('ipg_trusted');
  } catch (e) {}
}

// ============ 最高黑名单(任何模式都拦截,优先于最高白名单) ============
async function getIpGuardBlocked(env) {
  try {
    if (!env.DB) return { ips: [], redirect: '' };
    return await memoStale('ipg_blocked', 30000, async () => {
      await ensureAppConfig(env);
      const r = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'ipguard_blocked'").first();
      if (r && r.value) {
        const c = JSON.parse(r.value);
        return { ips: Array.isArray(c.ips) ? c.ips : [], redirect: String(c.redirect || '') };
      }
      return { ips: [], redirect: '' };
    });
  } catch (e) { return { ips: [], redirect: '' }; }
}
async function saveIpGuardBlocked(env, ips, redirect) {
  try {
    const val = JSON.stringify({ ips, redirect: String(redirect || '') });
    await env.DB.prepare("INSERT INTO app_config(key,value) VALUES('ipguard_blocked',?) ON CONFLICT(key) DO UPDATE SET value=?").bind(val, val).run();
    memoDel('ipg_blocked');
  } catch (e) {}
}
async function addIpGuardBlocked(env, ip, redirect) {
  if (!ip) return;
  try {
    const cur = await getIpGuardBlocked(env);
    if (cur.ips.indexOf(ip) < 0) cur.ips.push(ip);
    if (redirect !== undefined) cur.redirect = String(redirect || '');
    await saveIpGuardBlocked(env, cur.ips, cur.redirect);
  } catch (e) {}
}
async function removeIpGuardBlocked(env, ip) {
  if (!ip) return;
  try {
    const cur = await getIpGuardBlocked(env);
    const next = cur.ips.filter(x => x !== ip);
    if (next.length !== cur.ips.length) await saveIpGuardBlocked(env, next, cur.redirect);
  } catch (e) {}
}

// ============ IP 访问控制(白名单/黑名单 + 国家封锁) ============
async function getIpGuard(env) {
  try {
    if (!env.DB) return { mode: 'off', ips: [], countries: [], redirect: '' };
    return await memoStale('ipg_main', 30000, async () => {
      await ensureAppConfig(env);
      const r = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'ipguard'").first();
      if (r && r.value) {
        const c = JSON.parse(r.value);
        const splitC = (arr) => Array.isArray(arr) ? arr.flatMap(x => String(x).split(/[\n,，、\s]+/).map(y => y.trim().toUpperCase()).filter(Boolean)) : [];
        return { mode: c.mode === 'whitelist' || c.mode === 'blacklist' ? c.mode : 'off',
                 ips: Array.isArray(c.ips) ? c.ips : [],
                 countries: splitC(c.countries),
                 redirect: String(c.redirect || '') };
      }
      return { mode: 'off', ips: [], countries: [], redirect: '' };
    });
  } catch (e) { return { mode: 'off', ips: [], countries: [], redirect: '' }; }
}
function ipv4ToInt(ip) {
  const p = ip.split('.');
  if (p.length !== 4) return -1;
  let v = 0;
  for (const seg of p) {
    if (!/^\d{1,3}$/.test(seg)) return -1;
    const n = parseInt(seg, 10);
    if (n > 255) return -1;
    v = v * 256 + n;
  }
  return v >>> 0;
}
function ipv6ToBytes(ip) {
  try {
    let s = ip;
    if (s.indexOf('::') >= 0) {
      const t = s.split('::');
      const left = t[0] ? t[0].split(':') : [], right = t[1] ? t[1].split(':') : [];
      const pad = 8 - left.length - right.length;
      if (pad < 0) return null;
      s = left.concat(Array(pad).fill('0'), right).join(':');
    }
    const parts = s.split(':');
    if (parts.length !== 8) return null;
    const bytes = [];
    for (const p of parts) {
      const n = parseInt(p, 16);
      if (isNaN(n)) return null;
      bytes.push((n >> 8) & 0xff, n & 0xff);
    }
    return bytes;
  } catch (e) { return null; }
}
function ipInCidr(ip, cidr) {
  const idx = cidr.indexOf('/');
  if (idx <= 0) return false;
  const net = cidr.slice(0, idx).trim();
  const bits = parseInt(cidr.slice(idx + 1), 10);
  if (isNaN(bits)) return false;
  if (net.indexOf('.') >= 0) {
    if (bits < 0 || bits > 32) return false;
    const a = ipv4ToInt(ip), b = ipv4ToInt(net);
    if (a < 0 || b < 0) return false;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (a & mask) === (b & mask);
  }
  if (net.indexOf(':') >= 0) {
    if (bits < 0 || bits > 128) return false;
    const a = ipv6ToBytes(ip), b = ipv6ToBytes(net);
    if (!a || !b) return false;
    const full = bits >> 3, rem = bits & 7;
    for (let i = 0; i < full; i++) if (a[i] !== b[i]) return false;
    if (rem) { const m = 0xff << (8 - rem); if ((a[full] & m) !== (b[full] & m)) return false; }
    return true;
  }
  return false;
}
function ipMatchAny(ip, list) {
  if (!ip || !Array.isArray(list) || !list.length) return false;
  // v3.5.0:IPv4 映射 IPv6(::ffff:1.2.3.4)先归一化,否则与 IPv4 规则/列表比较永远不命中
  ip = normalizeClientIp(ip);
  for (const raw of list) {
    const t = String(raw).trim();
    if (!t) continue;
    if (t === ip) return true;
    if (t.indexOf('/') >= 0 && ipInCidr(ip, t)) return true;
  }
  return false;
}

// EMOS 聚合目录缓存(模块级,跨请求复用;10min 内存 + D1 1h 持久兜底)
const emosCatalogCache = new Map();
let emosCatTableReady = false; // DDL 只执行一次,避免每次请求重复建表开销

export default {
    // 每天自动运行发送 TG 统计
    async scheduled(event, env, ctx) {
        if (env.TG_BOT_TOKEN && env.TG_CHAT_ID && env.DB) {
            ctx.waitUntil(sendTgStats(env, env.TG_CHAT_ID));
        }
        if (env.DB) {
            ctx.waitUntil(scanOverdueNotify(env, ctx));
        }
        // 新版本推送通知（Bark / Telegram）
        if (env.DB) {
            ctx.waitUntil(checkUpdateNotify(env));
        }
        // v3.5.4:TG 群机器人日报:配置了 Cron 触发器时也按定时检查(未到点不触发)
        if (env.DB) {
            ctx.waitUntil(maybeSendTgGroupDaily(env));
        }
    },

    async fetch(request, env, ctx) {
        try {
        const url = new URL(request.url);
        // 后台定时任务(保号预警 / 新版本通知 / TG 日报):请求时低频触发,无需 Cron 也能工作。
        // 视频分片、Range、图片、静态资源请求不触发——重活(全表扫描/拉 changelog/发通知)不会落在播放流上;
        // 其余请求先过 isolate 内存短路(120 秒),绝大多数请求零 D1。
        if (env.DB && ctx && ctx.waitUntil && url.pathname !== '/__client_rtt__'
            && !request.headers.has('Range')
            && !/\.(?:m3u8|ts|m4s|mp4|mkv|avi|webm|jpe?g|png|webp|gif|svg|ico|css|js|woff2?)$/i.test(url.pathname)
            && !/\/(?:Images|Videos|Audio|Subtitles|stream|download)(?:\/|$)/i.test(url.pathname)) {
            ctx.waitUntil(maybeScanOverdue(env));
            ctx.waitUntil(maybeCheckUpdate(env));
            ctx.waitUntil(maybeSendTgGroupDaily(env));
        }

        // ==========================================
        //  新增：全云厂商 Worker 放置区域接口
        // （本块依赖 ROLE 认证，已放置于认证逻辑之后）
        // ==========================================

        // ==========================================
        //  新增：CF 节点与落地机房探针接口
        // ==========================================
        if (url.pathname === '/api/trace') {
            const cf = request.cf || {};
            let egressColo = '探测中...';
            try {
                // 请求 CF 官方 trace 接口获取落地机房
                const traceRes = await fetch('https://1.1.1.1/cdn-cgi/trace', {
                    headers: { 'User-Agent': 'Mozilla/5.0 (CF-Worker-Trace)' }
                });
                const traceText = await traceRes.text();
                const match = traceText.match(/colo=([A-Z]+)/);
                if (match) egressColo = match[1];
            } catch(e) {
                egressColo = '获取失败';
            }

            return new Response(JSON.stringify({
                success: true,
                entryCountry: cf.country || '未知',
                entryCity: cf.city || '',
                entryColo: cf.colo || '未知',
                egressColo: egressColo
            }), {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }

        // ==========================================
        //  新增：客户端 RTT 实时极速探针接口
        // 直接返回 204 无内容，且强制不缓存，确保每次都是真实的物理延迟
        // ==========================================
        if (url.pathname === '/__client_rtt__') {
            return new Response(null, {
                status: 204,
                headers: {
                    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                    "Pragma": "no-cache",
                    "Expires": "0",
                    "Access-Control-Allow-Origin": "*"
                }
            });
        }

        // ==========================================
        //  新增：当前域名解析 IP 的下载速度测试
        //  /speedtest              测速页面（浏览器端，测当前域名解析 IP 的下载速度）
        //  /speedtest/data?bytes=N 下载负载端点（同源，走的就是当前域名解析到的 CF IP）
        // ==========================================
        if (url.pathname === '/speedtest' || url.pathname === '/speedtest/') {
            const SPEEDTEST_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>下载测速 · 反代面板</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:#0f1117;color:#e6e8ee;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
  .card{background:#161a24;border:1px solid #2a3040;border-radius:18px;padding:28px;width:100%;max-width:560px;box-shadow:0 12px 40px rgba(0,0,0,.4)}
  h1{font-size:20px;margin-bottom:6px}
  .sub{color:#8a91a5;font-size:13px;margin-bottom:20px}
  .row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #232938;font-size:14px;gap:16px}
  .row:last-of-type{border-bottom:none}
  .k{color:#8a91a5;white-space:nowrap}
  .v{font-weight:600;word-break:break-all;text-align:right}
  .ip{color:#5aa2ff}
  .speed{font-size:42px;font-weight:800;color:#4fd08a;text-align:center;margin:18px 0 6px;line-height:1}
  .speed small{font-size:14px;color:#8a91a5;font-weight:500}
  .bar{height:10px;background:#232938;border-radius:6px;overflow:hidden;margin:8px 0 16px}
  .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#4fd08a,#23a6d8);transition:width .4s ease}
  .opts{display:flex;gap:10px;margin-bottom:12px}
  select,button.ghost{flex:1;padding:11px;border:1px solid #2a3040;border-radius:10px;background:#161a24;color:#e6e8ee;font-size:13px}
  button.go{width:100%;padding:13px;border:none;border-radius:10px;cursor:pointer;font-size:15px;font-weight:700;background:#2563eb;color:#fff;transition:.2s}
  button.go:hover{background:#1d4ed8}
  button.go:disabled{opacity:.5;cursor:not-allowed}
  .meta{text-align:center;font-size:12px;color:#8a91a5;margin-top:12px;min-height:16px}
  .note{font-size:12px;color:#6b7280;margin-top:16px;line-height:1.7;border-top:1px dashed #2a3040;padding-top:12px}
  a.back{display:inline-flex;align-items:center;gap:6px;padding:7px 15px;border-radius:999px;background:rgba(0,180,255,.1);border:1px solid rgba(0,180,255,.28);color:#5aa2ff;font-size:13px;font-weight:600;text-decoration:none;margin-bottom:14px;transition:.2s}
  a.back:hover{background:rgba(0,180,255,.2)}
</style>
</head>
<body>
<div class="card">
  <a class="back" href="/">&#8592; 返回面板</a>
  <h1>&#128339; 当前域名下载测速</h1>
  <div class="sub">浏览器直连当前域名，测其解析到的 CF IP 的下载速度</div>
  <div class="row"><span class="k">测试域名</span><span class="v" id="host">…</span></div>
  <div class="row"><span class="k">解析到的 IP</span><span class="v ip" id="ips">查询中…</span></div>
  <div class="speed"><span id="num">--</span> <small id="unit">Mbps</small></div>
  <div class="bar"><i id="barfill"></i></div>
  <div class="opts">
    <select id="size">
      <option value="10485760">负载 10 MB</option>
      <option value="20971520">负载 20 MB</option>
      <option value="52428800" selected>负载 50 MB</option>
    </select>
    <button class="ghost" id="runs">测 3 次取最优</button>
  </div>
  <button class="go" id="go">开始测速</button>
  <div class="meta" id="meta"></div>
  <div class="note">方式：从本域名直接下载测试负载，即走当前域名解析到的 CF 边缘 IP，多次取最优值。
若 IP 显示“查询失败”，多为 DoH 被网络环境限制，不影响下载测速结果。</div>
</div>
<script>
(function(){
  var host=location.host;
  document.getElementById('host').textContent=host;
  var ipsEl=document.getElementById('ips');
  var sizeSel=document.getElementById('size');
  var goBtn=document.getElementById('go');
  var numEl=document.getElementById('num');
  var unitEl=document.getElementById('unit');
  var barEl=document.getElementById('barfill');
  var metaEl=document.getElementById('meta');
  var RUNS=3;

  function resolveIps(){
    try{
      fetch('https://cloudflare-dns.com/dns-query?name='+encodeURIComponent(host)+'&type=A',{headers:{accept:'application/dns-json'}})
        .then(function(r){return r.json();})
        .then(function(d){
          var arr=(d&&d.Answer||[]).map(function(a){return a.data;});
          ipsEl.textContent=arr.length?arr.join('  '):'查询失败';
        })
        .catch(function(){ipsEl.textContent='查询失败（DoH 受限）';});
    }catch(e){ipsEl.textContent='查询失败';}
  }
  resolveIps();

  async function runOnce(bytes){
    var url='/speedtest/data?bytes='+bytes+'&t='+Date.now();
    var t0=performance.now();
    await fetch(url,{cache:'no-store'}).then(function(r){return r.arrayBuffer();});
    var ms=performance.now()-t0;
    return bytes*8/(ms/1000);
  }

  goBtn.addEventListener('click',async function(){
    var bytes=parseInt(sizeSel.value,10);
    goBtn.disabled=true;goBtn.textContent='测速中…';numEl.textContent='--';barEl.style.width='0';
    var best=0;
    for(var i=0;i<RUNS;i++){
      try{
        var bps=await runOnce(bytes);
        if(bps>best)best=bps;
        metaEl.textContent='第 '+(i+1)+'/'+RUNS+' 次 · 当前 '+(bps/1048576).toFixed(2)+' Mbps';
      }catch(e){metaEl.textContent='第 '+(i+1)+' 次失败：'+e.message;break;}
    }
    if(best>0){
      numEl.textContent=(best/1048576).toFixed(2);
      unitEl.textContent='Mbps · '+(best/1048576/8).toFixed(2)+' MB/s';
      barEl.style.width=Math.min(100,best/1000*100)+'%';
    }
    goBtn.disabled=false;goBtn.textContent='重新测速';
  });
})();
</script>
</body>
</html>`;
            return new Response(SPEEDTEST_HTML, { headers: { "Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } });
        }

        if (url.pathname === '/speedtest/data') {
            const bytes = Math.min(parseInt(url.searchParams.get('bytes') || '10485760', 10) || 10485760, 52428800); // 上限 50MB
            const CHUNK = 1024 * 1024;
            let sent = 0;
            const stream = new ReadableStream({
                pull(controller) {
                    if (sent * CHUNK >= bytes) { controller.close(); return; }
                    const n = Math.min(CHUNK, bytes - sent * CHUNK);
                    controller.enqueue(new Uint8Array(n));
                    sent++;
                }
            });
            return new Response(stream, {
                headers: {
                    "Content-Type": "application/octet-stream",
                    "Content-Length": String(bytes),
                    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                    "Pragma": "no-cache",
                    "Expires": "0",
                    "Access-Control-Allow-Origin": "*"
                }
            });
        }

        // Telegram Webhook 拦截
        if (url.pathname === '/api/tg-webhook' && request.method === 'POST') {
            try {
                // v3.5.0:配置了 TG_WEBHOOK_SECRET 时(setWebhook 的 secret_token),必须校验 Telegram 带来的请求头
                if (env.TG_WEBHOOK_SECRET && !timingSafeEq(request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '', env.TG_WEBHOOK_SECRET)) {
                    return new Response('Forbidden', { status: 403 });
                }
                const body = await request.json();
                if (body.message && body.message.text === '/stats') {
                    if (env.DB && env.TG_BOT_TOKEN) {
                        // v3.5.0:只向已配置的通知聊天发送统计,忽略任意第三方伪造的 chat id
                        const tgCfg = await getNotifyCfg(env);
                        const allowedChat = String(tgCfg.tgChatId || env.TG_CHAT_ID || '').trim();
                        const reqChat = body.message.chat && body.message.chat.id;
                        if (allowedChat && reqChat !== undefined && String(reqChat) === allowedChat) {
                            ctx.waitUntil(sendTgStats(env, reqChat));
                        }
                    }
                }
                return new Response("OK");
            } catch(e) { return new Response("OK"); }
        }

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "*", "Access-Control-Max-Age": "86400" } });
        }

        // ============ 反代 Token 门禁（D1 存储） ============
        // 配置存 app_config；来访记录存 proxy_hits 表（不占用 KV 免费额度）
        async function getProxyToken(env) {
            if (!env.DB) return null;
            try {
                const row = await memoStale('proxy_token', 30000, async () => {
                    await ensureAppConfig(env);
                    return await env.DB.prepare("SELECT value FROM app_config WHERE key = 'proxy_token'").first();
                });
                if (!row || !row.value) return null;
                return JSON.parse(row.value);
            } catch (e) { return null; }
        }
        function proxyTokenPrefix(pt) {
            return (pt && pt.enabled && pt.key) ? pt.key + '/' : '';
        }
        async function recordProxyHit(env, request, path) {
            if (!env.DB) return;
            try {
                const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'Unknown';
                const ua = (request.headers.get('User-Agent') || '').slice(0, 200);
                const ts = Date.now();
                const p = String(path || '').slice(0, 200);
                await ensureProxyHits(env);
                const exist = await env.DB.prepare('SELECT id, times FROM proxy_hits WHERE ip = ? AND path = ? ORDER BY id DESC LIMIT 1').bind(ip, p).first();
                if (exist) {
                    await env.DB.prepare('UPDATE proxy_hits SET times = ?, ts = ? WHERE id = ?').bind((exist.times || 1) + 1, ts, exist.id).run();
                } else {
                    await env.DB.prepare('INSERT INTO proxy_hits (ip, path, ua, ts, times) VALUES (?, ?, ?, ?, 1)').bind(ip, p, ua, ts).run();
                }
            } catch (e) {}
        }
        function catchPageHtml(ip, ua) {
            const esc = s => String(s == null ? '' : s).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
            return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Oops</title><style>
        body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at top,#0f0c29,#302b63,#24243e);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;color:#fff}
        .box{text-align:center;padding:48px;border:1px solid rgba(255,255,255,.15);border-radius:20px;background:rgba(255,255,255,.05);backdrop-filter:blur(8px);max-width:90vw}
        h1{font-size:34px;margin:0 0 12px;letter-spacing:2px}
        .sub{font-size:14px;color:#a8b2d1;margin-bottom:24px}
        .ip{font-size:18px;font-weight:700;color:#ffd700;word-break:break-all}
        .meta{font-size:12px;color:#7f8bb3;margin-top:16px;word-break:break-all}
      </style></head><body><div class="box">
        <h1>宝贝抓到你了 </h1>
        <div class="sub">你的来访信息已被记录</div>
        <div class="ip">${esc(ip)}</div>
        <div class="meta">UA: ${esc(ua).slice(0,120)}</div>
      </div></body></html>`;
        }
        if (url.pathname === '/catch') {
            const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'Unknown';
            return new Response(catchPageHtml(ip, request.headers.get('User-Agent') || ''), { headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' } });
        }

        const EXPECTED_TOKEN = env.ADMIN_TOKEN;
        if (!EXPECTED_TOKEN) return new Response("请在 Worker 变量中配置 ADMIN_TOKEN", { status: 500 });

        function getCookie(req, name) {
            const cookieString = req.headers.get("Cookie");
            if (!cookieString) return null;
            const match = cookieString.match(new RegExp('(^| )' + name + '=([^;]+)'));
            if (match) return decodeURIComponent(match[2]);
            return null;
        }

        // ==========================================
        // v3.5.0:签名会话登录体系
        // cookie: s1.<role>.<exp>.<密码指纹>.<HMAC>
        //  指纹 = sha256('fp:'+密码) 前16位;HMAC = HMAC-SHA256(ADMIN_TOKEN, base)
        //  HttpOnly+SameSite=Lax(HTTPS 下加 Secure);改密/删订阅者后旧会话自动失效;
        //  旧版明文 cookie(admin_token=密码)在升级后自动失效,所有已登录浏览器需重新登录一次
        // ==========================================
        const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
        async function credFp(cred) { return (await sha256Hex('fp:' + cred)).slice(0, 16); }
        async function loadAuthFps() {
            const envFp = await credFp(EXPECTED_TOKEN);
            if (!env.DB) return { adminFps: [envFp], subadminFps: [], subFps: [] };
            try {
                return await memoStale('auth_fps', 15000, async () => {
                    await ensureAppConfig(env);
                    const adminFps = [envFp]; const subadminFps = []; const subFps = [];
                    const rows = await env.DB.prepare("SELECT key, value FROM app_config WHERE key IN ('admin_pass','subadmin_pass','subscribers')").all();
                    for (const r of (rows.results || [])) {
                        if (r.key === 'admin_pass' && r.value) adminFps.push(await credFp(r.value));
                        if (r.key === 'subadmin_pass' && r.value) subadminFps.push(await credFp(r.value));
                        if (r.key === 'subscribers' && r.value) {
                            try { const l = JSON.parse(r.value); if (Array.isArray(l)) for (const p of l) subFps.push(await credFp(String(p))); } catch (e) {}
                        }
                    }
                    return { adminFps, subadminFps, subFps };
                });
            } catch (e) { return { adminFps: [envFp], subadminFps: [], subFps: [] }; }
        }
        async function issueSession(role, cred) {
            const base = 's1.' + role + '.' + (Date.now() + SESSION_TTL_MS) + '.' + (await credFp(cred));
            return base + '.' + (await hmacHex(EXPECTED_TOKEN, base));
        }
        const userPassHash = (p) => hmacHex(EXPECTED_TOKEN, 'user-pw:' + p);
        let AUTH_USER = null;
        // 用户会话 cookie = s1.user.<exp>.<用户id>_<密码指纹>.<HMAC>;改密/停用/删除后即时失效(内存缓存最多 15 秒)
        async function issueUserSession(u) {
            const base = 's1.user.' + (Date.now() + SESSION_TTL_MS) + '.' + u.id + '_' + (await credFp(u.pass_hash));
            return base + '.' + (await hmacHex(EXPECTED_TOKEN, base));
        }
        function sessionCookie(value, maxAge) {
            return 'admin_token=' + value + '; Path=/; Max-Age=' + maxAge + '; HttpOnly; SameSite=Lax' + (url.protocol === 'https:' ? '; Secure' : '');
        }
        // 校验登录密码,返回 { role, cred } 或 null
        async function verifyCredential(pass, adminOnly) {
            if (!pass) return null;
            if (timingSafeEq(pass, EXPECTED_TOKEN)) return { role: 'admin', cred: pass };
            if (!env.DB) return null;
            try {
                await ensureAppConfig(env);
                const rows = await env.DB.prepare("SELECT key, value FROM app_config WHERE key IN ('admin_pass','subadmin_pass','subscribers')").all();
                let subList = [];
                for (const r of (rows.results || [])) {
                    if (r.key === 'admin_pass' && r.value && timingSafeEq(pass, r.value)) return { role: 'admin', cred: r.value };
                    if (!adminOnly && r.key === 'subadmin_pass' && r.value && timingSafeEq(pass, r.value)) return { role: 'subadmin', cred: r.value };
                    if (r.key === 'subscribers' && r.value) { try { const l = JSON.parse(r.value); if (Array.isArray(l)) subList = l; } catch (e) {} }
                }
                if (!adminOnly) { for (const p of subList) { if (timingSafeEq(pass, String(p))) return { role: 'sub', cred: String(p) }; } }
                if (!adminOnly) {
                    await ensureUsersSchema(env);
                    const ur = await env.DB.prepare('SELECT id, name, suffix, pass_hash, max_nodes, can_ka, enabled FROM panel_users WHERE pass_hash = ?').bind(await userPassHash(pass)).first();
                    if (ur) return { role: 'user', user: ur, cred: ur.pass_hash };
                }
            } catch (e) {}
            return null;
        }
        // 四档认证：env.ADMIN_TOKEN(永不失效) > 网页修改的管理员密码 > 子管理员密码(查看+审核节点申请) > 订阅者密码(只读)
        async function getAuthRole(req) {
            const token = getCookie(req, 'admin_token');
            if (!token || token.indexOf('s1.') !== 0) return null;
            const parts = token.split('.');
            if (parts.length !== 5) return null;
            const role = parts[1]; const exp = parseInt(parts[2], 10); const fp = parts[3];
            if ((role !== 'admin' && role !== 'subadmin' && role !== 'sub' && role !== 'user') || !exp || exp < Date.now()) return null;
            const base = parts.slice(0, 4).join('.');
            if (!timingSafeEq(await hmacHex(EXPECTED_TOKEN, base), parts[4])) return null;
            if (role === 'user') {
                const seg = String(fp).split('_'); const uid = parseInt(seg[0], 10); const ufp = seg[1] || '';
                if (!uid || !ufp) return null;
                const pick = async () => { const l = await getUsersCached(env); return l.find(x => x.id === uid) || null; };
                let u = await pick();
                if (!u || (await credFp(u.pass_hash)) !== ufp) { memoDel('panel_users'); u = await pick(); }
                if (!u || !u.enabled || (await credFp(u.pass_hash)) !== ufp) return null;
                AUTH_USER = u;
                return 'user';
            }
            const matchFps = (f) => (role === 'admin' && f.adminFps.indexOf(fp) >= 0) ? 'admin'
                : ((role === 'subadmin' && f.subadminFps.indexOf(fp) >= 0) ? 'subadmin'
                : ((role === 'sub' && f.subFps.indexOf(fp) >= 0) ? 'sub' : null));
            let hitRole = matchFps(await loadAuthFps());
            if (!hitRole) {
                // 缓存可能滞后(刚新增订阅者/刚改密码):签名有效但指纹未命中时,强制刷新一次再判定
                memoDel('auth_fps');
                hitRole = matchFps(await loadAuthFps());
            }
            return hitRole;
        }

        // 订阅用户是否有「直接添加节点」权限(管理员在订阅用户管理里按密码开通)
        async function subCanAdd(env, token) {
            if (!env.DB || !token) return false;
            // 签名会话:从 cookie 提取密码指纹,与开通列表(明文密码)逐个指纹比对
            let fp = token;
            if (token.indexOf('s1.') === 0) {
                const parts = token.split('.');
                if (parts.length !== 5) return false;
                fp = parts[3];
            } else {
                fp = await credFp(token); // 兼容旧明文 cookie(升级后基本不会走到)
            }
            try {
                const row = await memoStale('subs_can_add', 30000, async () => {
                    await ensureAppConfig(env);
                    return await env.DB.prepare("SELECT value FROM app_config WHERE key = 'subscribers_can_add'").first();
                });
                if (!row || !row.value) return false;
                const list = JSON.parse(row.value);
                if (!Array.isArray(list)) return false;
                for (const p of list) { if ((await credFp(String(p))) === fp) return true; }
                return false;
            } catch (e) { return false; }
        }

        const IPG_BYPASS = ['/api/tg-webhook', '/catch', '/__client_rtt__', '/api/ipguard', '/api/ipguard/block', '/entry', '/api/entry'];
        if (IPG_BYPASS.indexOf(url.pathname) < 0) {
            const guard = await getIpGuard(env);
            const clientIp = (request.headers.get('CF-Connecting-IP') || '').trim();
            // 最高黑名单:任何模式都拦截(优先于最高白名单);设置跳转则 302,否则显示拉黑页
            const hardBlock = await getIpGuardBlocked(env);
            if (clientIp && hardBlock.ips.length && ipMatchAny(clientIp, hardBlock.ips)) {
                if (hardBlock.redirect) { const rr = safeRedirectResponse(hardBlock.redirect); if (rr) return rr; }
                return new Response(IP_BLOCKED_HARD_UI.replace('__IP__', escHtmlStr(clientIp)), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
            }
            if (guard.mode !== 'off') {
                // 最高白名单: /entry 登录成功的 IP 永远放行(黑/白名单模式均例外)
                const trusted = await getIpGuardTrusted(env);
                if (trusted.indexOf(clientIp) < 0) {
                    const country = (request.headers.get('CF-IPCountry') || '').trim().toUpperCase();
                    const hit = ipMatchAny(clientIp, guard.ips) || (country && guard.countries.indexOf(country) >= 0);
                    const blocked = guard.mode === 'whitelist' ? !hit : hit;
                    if (blocked) {
                        // 与伪装版行为一致:admin cookie 不在名单同样拦截;逃生只走 /entry(登录后 IP 进最高白名单)
                        if (guard.redirect) { const rr = safeRedirectResponse(guard.redirect); if (rr) return rr; }
                        return new Response(IP_BLOCKED_UI.replace('__IP__', escHtmlStr(clientIp)).replace('__COUNTRY__', escHtmlStr(country || '-')), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
                    }
                }
            }
        }

        // 演示页素材(从 D1 读取;未入库时临时转发 GitHub)
        if (url.pathname.startsWith('/_a/p/') && (request.method === 'GET' || request.method === 'HEAD')) {
            let nm = ''; try { nm = decodeURIComponent(url.pathname.slice(6)); } catch (e) {}
            if (!POSTER_NAME_RE.test(nm)) return new Response('Not Found', { status: 404 });
            try { return await posterServe(request, env, ctx, nm); } catch (e) { return new Response('asset error', { status: 502 }); }
        }
        if (url.pathname === '/' && env.DB) ctx.waitUntil(posterKick(env).catch(() => {}));

        const isPanelOrApi = url.pathname === '/' || url.pathname.startsWith('/api/');
        let ROLE = null;
        if (isPanelOrApi && url.pathname !== '/api/tg-webhook' && url.pathname !== '/api/entry' && url.pathname !== '/api/login' && url.pathname !== '/api/logout') {
            ROLE = await getAuthRole(request);
            if (!ROLE) {
                if (url.pathname === '/') {
                    const lg = await getLogo(env);
                    return htmlResponse(request, LANDING_UI, 'landing', lg);
                }
                else return new Response('Unauthorized', { status: 401 });
            }
        }

        if (url.pathname === '/') {
            const lg = await getLogo(env);
            return htmlResponse(request, HTML_UI, 'panel', lg);
        }

        // 跨站写请求防护:带 Origin 的非 GET 面板请求,Origin 必须与当前域名一致(CSRF)
        // v3.5.0:同时在此统一做写后失效——任何已登录非 GET 请求都会清节点路由缓存与鉴权指纹缓存
        if (ROLE && request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS') {
            memoDelPrefix('route:');   // 后台有写操作 → 清空节点配置缓存
            memoDel('auth_fps');       // 管理员密码/订阅者可能变化
            const reqOrigin = request.headers.get('Origin');
            if (reqOrigin) {
                let sameOrigin = false;
                try { sameOrigin = new URL(reqOrigin).host === url.host; } catch (e) {}
                if (!sameOrigin) return new Response('Forbidden (cross-origin)', { status: 403 });
            }
        }

        if (url.pathname === '/entry' && request.method === 'GET') {
            return new Response(ENTRY_UI, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
        }
        // 面板登录:校验密码后下发 HttpOnly 签名会话 cookie(带失败次数限制)
        if (url.pathname === '/api/login' && request.method === 'POST') {
            const loginIp = (request.headers.get('CF-Connecting-IP') || '').trim();
            if (await authIsBlocked(env, loginIp)) return Response.json({ success: false, error: '尝试次数过多,请 10 分钟后再试' }, { status: 429 });
            try {
                const body = await request.json();
                const cred = await verifyCredential(String(body.pass || '').trim(), false);
                if (!cred) { await authRecordFail(env, loginIp); return Response.json({ success: false, error: '密钥错误' }, { status: 401 }); }
                if (cred.role === 'user') {
                    if (!cred.user.enabled) return Response.json({ success: false, error: '账号已被停用,请联系管理员' }, { status: 403 });
                    try { await env.DB.prepare("UPDATE panel_users SET last_login = datetime('now', '+8 hours') WHERE id = ?").bind(cred.user.id).run(); memoDel('panel_users'); } catch (e) {}
                    return new Response(JSON.stringify({ success: true, role: 'user' }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie(await issueUserSession(cred.user), 2592000) } });
                }
                return new Response(JSON.stringify({ success: true, role: cred.role }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie(await issueSession(cred.role, cred.cred), 2592000) } });
            } catch (e) { return Response.json({ success: false, error: '请求无效' }, { status: 400 }); }
        }
        if (url.pathname === '/api/logout' && request.method === 'POST') {
            return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie('', 0) } });
        }
        // 逃生登录接口:只认管理员密码(ADMIN_TOKEN / admin_pass),不受 token 模式影响
        // 逃生登录接口:只认管理员密码(ADMIN_TOKEN / 网页设置的 admin_pass),带失败次数限制
        if (url.pathname === '/api/entry' && request.method === 'POST') {
            const entryIp = (request.headers.get('CF-Connecting-IP') || '').trim();
            if (await authIsBlocked(env, entryIp)) return Response.json({ success: false, error: '尝试次数过多,请 10 分钟后再试' }, { status: 429 });
            try {
                const body = await request.json();
                const cred = await verifyCredential(String(body.pass || ''), true);
                if (cred) {
                    const clientIp = entryIp;
                    if (clientIp) {
                        // 逃生成功:先解除最高黑名单,再加入最高白名单(黑名单优先于白名单,必须两步都做)
                        await removeIpGuardBlocked(env, clientIp);
                        await addIpGuardTrusted(env, clientIp);
                    }
                    return new Response(JSON.stringify({ success: true, currentIp: clientIp }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie(await issueSession('admin', cred.cred), 2592000) } });
                }
                await authRecordFail(env, entryIp);
                return Response.json({ success: false, error: '密码错误' });
            } catch (e) { return Response.json({ success: false, error: '请求无效' }); }
        }
        if (url.pathname === '/') {
            const lg = await getLogo(env);
            return htmlResponse(request, HTML_UI, 'panel', lg);
        }

        // ==========================================
        // 2.2 角色 / 账户 / 订阅者管理接口
        // ==========================================
        // 全云厂商 Worker 放置区域接口（依赖 ROLE 认证）
        if (url.pathname === '/api/placement' && request.method === 'POST') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const body = await request.json();
                const placementData = body.placement;

                if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID || !env.CF_WORKER_NAME) {
                    return new Response(JSON.stringify({ success: false, msg: '后台变量未配置全！请检查 CF_API_TOKEN, CF_ACCOUNT_ID, CF_WORKER_NAME' }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
                }

                // 边缘节点 = 关闭 Smart Placement:multipart 设置接口 mode 只认 "smart",
                // 直接传 {mode:"off"} 必报 invalid placement mode;改用"不带 placement 的全量重传"回边缘
                if (placementData && placementData.mode === 'off') {
                    try {
                        await deployPlacementEdge(env);
                        return new Response(JSON.stringify({ success: true, msg: '已切回边缘节点（关闭 Smart Placement，Worker 已重新部署）' }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
                    } catch (eOff) {
                        return new Response(JSON.stringify({ success: false, msg: 'CF报错: ' + eOff.message }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
                    }
                }

                const formData = new FormData();
                formData.append('settings', new Blob([JSON.stringify({ placement: placementData })], { type: 'application/json' }));

                const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/workers/scripts/${env.CF_WORKER_NAME}/settings`;
                const cfRes = await fetch(cfUrl, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}` },
                    body: formData
                });

                const cfData = await cfRes.json();
                if (cfData.success) {
                    return new Response(JSON.stringify({ success: true, msg: '部署区域修改成功！' }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
                } else {
                    return new Response(JSON.stringify({ success: false, msg: 'CF报错: ' + (cfData.errors[0]?.message || '未知错误') }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
                }
            } catch(e) {
                return new Response(JSON.stringify({ success: false, msg: e.message }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
            }
        }

        if (url.pathname === '/api/me' && request.method === 'GET') {
            if (ROLE === 'user' && AUTH_USER) {
                let nodeCount = 0;
                try { const c = await env.DB.prepare('SELECT COUNT(*) AS c FROM routes WHERE owner = ?').bind(String(AUTH_USER.id)).first(); nodeCount = c ? c.c : 0; } catch (e) {}
                return Response.json({ success: true, role: 'user', user: { name: AUTH_USER.name || '', suffix: AUTH_USER.suffix, maxNodes: AUTH_USER.max_nodes, canKa: !!AUTH_USER.can_ka, nodeCount } });
            }
            let canAdd = false;
            if (ROLE === 'sub') canAdd = await subCanAdd(env, getCookie(request, 'admin_token'));
            return Response.json({ success: true, role: ROLE, canAdd });
        }
        // 真用户自助改密码(需验证旧密码);改完后旧会话失效,同时下发新会话 cookie
        if (url.pathname === '/api/me/password' && request.method === 'POST') {
            if (ROLE !== 'user' || !AUTH_USER) return new Response('Forbidden', { status: 403 });
            try {
                const body = await request.json();
                const oldPw = String(body.oldPassword || ''); const newPw = String(body.newPassword || '').trim();
                if (!timingSafeEq(await userPassHash(oldPw), AUTH_USER.pass_hash)) return Response.json({ success: false, error: '当前密码不正确' });
                if (newPw.length < 6 || newPw.length > 64) return Response.json({ success: false, error: '新密码需 6-64 位' });
                if (await verifyCredential(newPw, false)) return Response.json({ success: false, error: '该密码已被占用,请换一个' });
                const nh = await userPassHash(newPw);
                await env.DB.prepare('UPDATE panel_users SET pass_hash = ? WHERE id = ?').bind(nh, AUTH_USER.id).run();
                memoDel('panel_users', 'auth_fps');
                return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie(await issueUserSession(Object.assign({}, AUTH_USER, { pass_hash: nh })), 2592000) } });
            } catch (e) { return Response.json({ success: false, error: e.message }); }
        }


        // 真用户管理(仅管理员): create / update(限额/启停) / resetpw / delete
        if (url.pathname === '/api/users' && request.method === 'GET') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                await ensureUsersSchema(env);
                const { results } = await env.DB.prepare("SELECT u.id, u.name, u.suffix, u.max_nodes, u.can_ka, u.enabled, u.created_at, u.last_login, (SELECT COUNT(*) FROM routes r WHERE r.owner = CAST(u.id AS TEXT)) AS node_count FROM panel_users u ORDER BY u.id").all();
                return Response.json({ success: true, users: results || [] });
            } catch (e) { return Response.json({ success: false, error: e.message }); }
        }
        if (url.pathname === '/api/users' && request.method === 'POST') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                await ensureUsersSchema(env);
                const b = await request.json();
                const action = String(b.action || '');
                const clampInt = (v, lo, hi, d) => { const n = parseInt(v, 10); return isNaN(n) ? d : Math.max(lo, Math.min(hi, n)); };
                if (action === 'create') {
                    const name = String(b.name || '').trim().slice(0, 40);
                    const suffix = String(b.suffix || '').trim().toLowerCase();
                    const password = String(b.password || '').trim();
                    if (!USER_SUFFIX_RE.test(suffix)) return Response.json({ success: false, error: '后缀需为 3-24 位小写字母/数字/下划线/短横线' });
                    if (isReservedSuffix(suffix) || USER_RESERVED_SUFFIX.indexOf(suffix) >= 0) return Response.json({ success: false, error: '该后缀是系统保留词,请更换' });
                    if (password.length < 6 || password.length > 64) return Response.json({ success: false, error: '登录密码需 6-64 位' });
                    if (await verifyCredential(password, false)) return Response.json({ success: false, error: '该密码已被占用(与管理员/订阅者/其他用户重复),请换一个' });
                    const clash = await env.DB.prepare("SELECT prefix FROM routes WHERE IFNULL(owner, '') = '' AND (prefix = ? OR prefix LIKE ?)").bind(suffix, suffix + '/%').first();
                    if (clash) return Response.json({ success: false, error: '后缀与现有节点「/' + clash.prefix + '」冲突,请更换' });
                    const dup = await env.DB.prepare('SELECT id FROM panel_users WHERE suffix = ?').bind(suffix).first();
                    if (dup) return Response.json({ success: false, error: '该后缀已被其他用户使用' });
                    await env.DB.prepare('INSERT INTO panel_users (name, suffix, pass_hash, max_nodes, can_ka, enabled) VALUES (?, ?, ?, ?, ?, 1)')
                        .bind(name || suffix, suffix, await userPassHash(password), clampInt(b.maxNodes, 1, 200, USER_DEFAULT_MAX_NODES), b.canKa === false || b.canKa === 0 ? 0 : 1).run();
                    memoDel('panel_users');
                    return Response.json({ success: true });
                }
                const id = parseInt(b.id, 10);
                if (!id) return Response.json({ success: false, error: '参数错误' });
                const u = await env.DB.prepare('SELECT * FROM panel_users WHERE id = ?').bind(id).first();
                if (!u) return Response.json({ success: false, error: '用户不存在' });
                if (action === 'update') {
                    await env.DB.prepare('UPDATE panel_users SET name = ?, max_nodes = ?, can_ka = ?, enabled = ? WHERE id = ?')
                        .bind(b.name !== undefined ? String(b.name).trim().slice(0, 40) : u.name, b.maxNodes !== undefined ? clampInt(b.maxNodes, 1, 200, u.max_nodes) : u.max_nodes,
                              b.canKa !== undefined ? (b.canKa ? 1 : 0) : u.can_ka, b.enabled !== undefined ? (b.enabled ? 1 : 0) : u.enabled, id).run();
                    memoDel('panel_users');
                    return Response.json({ success: true });
                }
                if (action === 'resetpw') {
                    const password = String(b.password || '').trim();
                    if (password.length < 6 || password.length > 64) return Response.json({ success: false, error: '登录密码需 6-64 位' });
                    const taken = await verifyCredential(password, false);
                    if (taken && !(taken.role === 'user' && taken.user.id === id)) return Response.json({ success: false, error: '该密码已被占用,请换一个' });
                    await env.DB.prepare('UPDATE panel_users SET pass_hash = ? WHERE id = ?').bind(await userPassHash(password), id).run();
                    memoDel('panel_users', 'auth_fps');
                    return Response.json({ success: true });
                }
                if (action === 'delete') {
                    await env.DB.prepare('DELETE FROM routes WHERE owner = ?').bind(String(id)).run();
                    await env.DB.prepare('DELETE FROM panel_users WHERE id = ?').bind(id).run();
                    memoDel('panel_users'); memoDelPrefix('route:');
                    return Response.json({ success: true });
                }
                return Response.json({ success: false, error: '未知操作' });
            } catch (e) { return Response.json({ success: false, error: e.message }); }
        }

        // 版本信息（登录可见）：当前版本 + 更新提醒开关
        if (url.pathname === '/api/version' && request.method === 'GET') {
            let updateNotify = true;
            try {
                if (env.DB) {
                    const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'update_notify'").first();
                    if (row && row.value !== null && row.value !== undefined) updateNotify = String(row.value) !== '0';
                }
            } catch (e) {}
            return Response.json({ success: true, version: CURRENT_VERSION, updateNotify });
        }

        // 保号通知设置（登录可见，脱敏返回）
        if (url.pathname === '/api/account/notify' && request.method === 'GET') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            let cfg = {};
            try {
                if (env.DB) {
                    const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'notify_settings'").first();
                    if (row && row.value) cfg = JSON.parse(row.value);
                }
            } catch (e) {}
            // v3.4.68:返回检查间隔(小时,默认 6)
            let checkIntervalHours = 6;
            try { const ciRow = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'check_interval_hours'").first(); if (ciRow && ciRow.value) checkIntervalHours = parseFloat(ciRow.value) || 6; } catch (e) {}
            // v3.5.4:返回 TG 群机器人日报配置(脱敏)
            let tgg = {};
            try { const tgR = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'tg_group_settings'").first(); if (tgR && tgR.value) tgg = JSON.parse(tgR.value); } catch (e) {}
            return Response.json({ success: true, barkKey: cfg.barkKey ? '********' : '', barkLevel: cfg.barkLevel || 'active', barkServer: cfg.barkServer || 'https://api.day.app', barkNotify: cfg.barkNotify !== false, tgToken: cfg.tgToken ? '********' : '', tgChatId: cfg.tgChatId || '', tgNotify: cfg.tgNotify !== false, serverChanKey: cfg.serverChanKey ? '********' : '', serverChanNotify: cfg.serverChanNotify === true, dingTalkWebhook: cfg.dingTalkWebhook ? '********' : '', dingTalkNotify: cfg.dingTalkNotify === true, checkIntervalHours: checkIntervalHours, tgGroupEnabled: tgg.enabled !== false, tgGroupBotToken: tgg.botToken ? '********' : '', tgGroupChatId: tgg.chatId || '', tgGroupHour: tgg.hour || 20 });
        }

        // 自定义头像（登录后可见）
        if (url.pathname === '/api/logo' && request.method === 'GET') {
            const l = await getLogo(env);
            return Response.json({ success: true, logo: l });
        }

        // 测试通知（bark / tg）
        if (url.pathname === '/api/test-notify' && request.method === 'POST') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const body = await request.json();
                const type = String(body.type || 'bark');
                const cfg = await getNotifyCfg(env);
                if (type === 'bark') {
                    if (!cfg.barkKey) return Response.json({ success: false, error: '未配置 Bark Key' });
                    const ok = await sendBarkN(cfg, 'Emby 反代面板', '保号通知测试成功 ');
                    return Response.json({ success: ok, error: ok ? '' : 'Bark 发送失败，请检查 Key/服务地址' });
                }
                if (type === 'tg') {
                    if (!cfg.tgToken || !cfg.tgChatId) return Response.json({ success: false, error: '未配置 TG Bot Token / Chat ID' });
                    const ok = await sendTgN(cfg, '保号通知测试成功 ');
                    return Response.json({ success: ok, error: ok ? '' : 'TG 发送失败，请检查 Token / Chat ID' });
                }
                if (type === 'serverchan') {
                    if (!cfg.serverChanKey) return Response.json({ success: false, error: '未配置 Server酱 SendKey' });
                    const ok = await sendServerChanN(cfg, 'Emby 反代面板', '保号通知测试成功 ');
                    return Response.json({ success: ok, error: ok ? '' : 'Server酱发送失败，请检查 SendKey' });
                }
                if (type === 'dingtalk') {
                    if (!cfg.dingTalkWebhook) return Response.json({ success: false, error: '未配置钉钉 Webhook' });
                    const ok = await sendDingTalkN(cfg, 'Emby 反代面板', '保号通知测试成功 ');
                    return Response.json({ success: ok, error: ok ? '' : '钉钉发送失败，请检查 Webhook' });
                }
                return Response.json({ success: false, error: '未知类型' });
            } catch (e) { return Response.json({ success: false, error: e.message }); }
        }

        // v3.5.4:测试 TG 群机器人日报(用已存配置或临时提交值)
        if (url.pathname === '/api/tg-group-test' && request.method === 'POST') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const body = await request.json();
                let token = String(body.botToken || '').trim();
                let chatId = String(body.chatId || '').trim();
                // 掩码(********)或空值都回退已保存配置,避免测试按钮读取脱敏表单值导致用掩码发信失败
                if (!token || !chatId || token === '********' || chatId === '********') {
                    const tgg = await getTgGroupCfg(env);
                    token = (token && token !== '********') ? token : tgg.botToken || '';
                    chatId = (chatId && chatId !== '********') ? chatId : tgg.chatId || '';
                }
                if (!token || !chatId) return Response.json({ success: false, error: '未配置群 Bot Token / Chat ID' });
                const hour = Math.min(23, Math.max(0, parseInt(body.hour || 20, 10) || 20));
                const ok = await sendTgGroup({ botToken: token, chatId: chatId }, '✅ TG 群机器人日报测试成功\n每日发送时间：' + hour + ':00（北京时间）\n内容：节点播放 TOP10（备注名）/ 播放器前五 / 地区前五（国内省份·国外国家）\n新版本更新也会同步推送');
                return Response.json({ success: ok, error: ok ? '' : 'TG 发送失败，请检查 Token / Chat ID' });
            } catch (e) { return Response.json({ success: false, error: e.message }); }
        }

        // 一键发送日报:立即生成并发送当天真实日报(验证数据链路)
        if (url.pathname === '/api/tg-group-send-report' && request.method === 'POST') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const tgg = await getTgGroupCfg(env);
                if (!tgg.enabled || !tgg.botToken || !tgg.chatId) return Response.json({ success: false, error: '未启用或未配置群 Bot Token / Chat ID' });
                const text = await buildDailyReport(env);
                if (!text) return Response.json({ success: false, error: '日报内容生成失败' });
                const ok = await sendTgGroup(tgg, text);
                return Response.json({ success: ok, error: ok ? '' : 'TG 发送失败，请检查 Token / Chat ID', preview: text });
            } catch (e) { return Response.json({ success: false, error: e.message }); }
        }

        if (url.pathname === '/api/ipguard' && request.method === 'GET') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const cfg = await getIpGuard(env);
                const currentIp = (request.headers.get('CF-Connecting-IP') || '').trim();
                const country = (request.headers.get('CF-IPCountry') || '').trim().toUpperCase();
                return Response.json({ success: true, mode: cfg.mode, ips: cfg.ips, countries: cfg.countries, redirect: cfg.redirect, currentIp: currentIp, currentCountry: country, trusted: await getIpGuardTrusted(env), blocked: await getIpGuardBlocked(env) });
            } catch (e) { return Response.json({ success: false, error: String(e) }); }
        }
        if (url.pathname === '/api/ipguard' && request.method === 'POST') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const body = await request.json();
                const mode = body.mode === 'whitelist' || body.mode === 'blacklist' ? body.mode : 'off';
                const ips = Array.isArray(body.ips) ? body.ips.map(x => String(x).trim()).filter(Boolean) : [];
                const countries = Array.isArray(body.countries) ? body.countries.flatMap(x => String(x).split(/[\n,，、\s]+/).map(y => y.trim().toUpperCase()).filter(Boolean)) : [];
                const redirect = String(body.redirect || '').trim();
                const trusted = Array.isArray(body.trusted) ? body.trusted.map(x => String(x).trim()).filter(Boolean) : undefined;
                const blockedIps = Array.isArray(body.blockedIps) ? body.blockedIps.map(x => String(x).trim()).filter(Boolean) : undefined;
                const blockedRedirect = body.blockedRedirect !== undefined ? String(body.blockedRedirect || '').trim() : undefined;
                const val = JSON.stringify({ mode, ips, countries, redirect });
                await env.DB.prepare('INSERT INTO app_config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=?').bind('ipguard', val, val).run();
                memoDel('ipg_main');
                if (trusted) await saveIpGuardTrusted(env, trusted);
                if (blockedIps) await saveIpGuardBlocked(env, blockedIps, blockedRedirect !== undefined ? blockedRedirect : (await getIpGuardBlocked(env)).redirect);
                const blk = await getIpGuardBlocked(env);
                return Response.json({ success: true, mode, ips, countries, redirect, trusted: trusted || [], blocked: blk });
            } catch (e) { return Response.json({ success: false, error: String(e) }); }
        }
        // 一键封禁(仅管理员):把 IP 加入最高黑名单,可选带 302 跳转链接
        if (url.pathname === '/api/ipguard/block' && request.method === 'POST') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const body = await request.json();
                const ip = String(body.ip || '').trim();
                if (!ip) return Response.json({ success: false, error: '缺少 IP' });
                const redirect = body.redirect !== undefined ? String(body.redirect || '').trim() : undefined;
                await addIpGuardBlocked(env, ip, redirect);
                return Response.json({ success: true, blocked: await getIpGuardBlocked(env) });
            } catch (e) { return Response.json({ success: false, error: String(e) }); }
        }


        // ==========================================
        // 2.2 角色 / 账户 / 订阅者管理接口
        // ==========================================
        // 全云厂商 Worker 放置区域接口（依赖 ROLE 认证）
        if (url.pathname === '/api/placement' && request.method === 'POST') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const body = await request.json();
                const placementData = body.placement;

                if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID || !env.CF_WORKER_NAME) {
                    return new Response(JSON.stringify({ success: false, msg: '后台变量未配置全！请检查 CF_API_TOKEN, CF_ACCOUNT_ID, CF_WORKER_NAME' }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
                }

                // 边缘节点 = 关闭 Smart Placement:multipart 设置接口 mode 只认 "smart",
                // 直接传 {mode:"off"} 必报 invalid placement mode;改用"不带 placement 的全量重传"回边缘
                if (placementData && placementData.mode === 'off') {
                    try {
                        await deployPlacementEdge(env);
                        return new Response(JSON.stringify({ success: true, msg: '已切回边缘节点（关闭 Smart Placement，Worker 已重新部署）' }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
                    } catch (eOff) {
                        return new Response(JSON.stringify({ success: false, msg: 'CF报错: ' + eOff.message }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
                    }
                }

                const formData = new FormData();
                formData.append('settings', new Blob([JSON.stringify({ placement: placementData })], { type: 'application/json' }));

                const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/workers/scripts/${env.CF_WORKER_NAME}/settings`;
                const cfRes = await fetch(cfUrl, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}` },
                    body: formData
                });

                const cfData = await cfRes.json();
                if (cfData.success) {
                    return new Response(JSON.stringify({ success: true, msg: '部署区域修改成功！' }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
                } else {
                    return new Response(JSON.stringify({ success: false, msg: 'CF报错: ' + (cfData.errors[0]?.message || '未知错误') }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
                }
            } catch(e) {
                return new Response(JSON.stringify({ success: false, msg: e.message }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
            }
        }

        if (url.pathname === '/api/me' && request.method === 'GET') {
            let canAdd = false;
            if (ROLE === 'sub') canAdd = await subCanAdd(env, getCookie(request, 'admin_token'));
            return Response.json({ success: true, role: ROLE, canAdd });
        }

        // 版本信息（登录可见）：当前版本 + 更新提醒开关
        if (url.pathname === '/api/version' && request.method === 'GET') {
            let updateNotify = true;
            try {
                if (env.DB) {
                    const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'update_notify'").first();
                    if (row && row.value !== null && row.value !== undefined) updateNotify = String(row.value) !== '0';
                }
            } catch (e) {}
            return Response.json({ success: true, version: CURRENT_VERSION, updateNotify });
        }

        // 保号通知设置（登录可见，脱敏返回）
        if (url.pathname === '/api/account/notify' && request.method === 'GET') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            let cfg = {};
            try {
                if (env.DB) {
                    const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'notify_settings'").first();
                    if (row && row.value) cfg = JSON.parse(row.value);
                }
            } catch (e) {}
            // v3.4.68:返回检查间隔(小时,默认 6)
            let checkIntervalHours = 6;
            try { const ciRow = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'check_interval_hours'").first(); if (ciRow && ciRow.value) checkIntervalHours = parseFloat(ciRow.value) || 6; } catch (e) {}
            // v3.5.4:返回 TG 群机器人日报配置(脱敏)
            let tgg = {};
            try { const tgR = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'tg_group_settings'").first(); if (tgR && tgR.value) tgg = JSON.parse(tgR.value); } catch (e) {}
            return Response.json({ success: true, barkKey: cfg.barkKey ? '********' : '', barkLevel: cfg.barkLevel || 'active', barkServer: cfg.barkServer || 'https://api.day.app', barkNotify: cfg.barkNotify !== false, tgToken: cfg.tgToken ? '********' : '', tgChatId: cfg.tgChatId || '', tgNotify: cfg.tgNotify !== false, serverChanKey: cfg.serverChanKey ? '********' : '', serverChanNotify: cfg.serverChanNotify === true, dingTalkWebhook: cfg.dingTalkWebhook ? '********' : '', dingTalkNotify: cfg.dingTalkNotify === true, checkIntervalHours: checkIntervalHours, tgGroupEnabled: tgg.enabled !== false, tgGroupBotToken: tgg.botToken ? '********' : '', tgGroupChatId: tgg.chatId || '', tgGroupHour: tgg.hour || 20 });
        }

        // 测试通知（bark / tg）
        if (url.pathname === '/api/test-notify' && request.method === 'POST') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const body = await request.json();
                const type = String(body.type || 'bark');
                const cfg = await getNotifyCfg(env);
                if (type === 'bark') {
                    if (!cfg.barkKey) return Response.json({ success: false, error: '未配置 Bark Key' });
                    const ok = await sendBarkN(cfg, 'Emby 反代面板', '保号通知测试成功 ');
                    return Response.json({ success: ok, error: ok ? '' : 'Bark 发送失败，请检查 Key/服务地址' });
                }
                if (type === 'tg') {
                    if (!cfg.tgToken || !cfg.tgChatId) return Response.json({ success: false, error: '未配置 TG Bot Token / Chat ID' });
                    const ok = await sendTgN(cfg, '保号通知测试成功 ');
                    return Response.json({ success: ok, error: ok ? '' : 'TG 发送失败，请检查 Token / Chat ID' });
                }
                if (type === 'serverchan') {
                    if (!cfg.serverChanKey) return Response.json({ success: false, error: '未配置 Server酱 SendKey' });
                    const ok = await sendServerChanN(cfg, 'Emby 反代面板', '保号通知测试成功 ');
                    return Response.json({ success: ok, error: ok ? '' : 'Server酱发送失败，请检查 SendKey' });
                }
                if (type === 'dingtalk') {
                    if (!cfg.dingTalkWebhook) return Response.json({ success: false, error: '未配置钉钉 Webhook' });
                    const ok = await sendDingTalkN(cfg, 'Emby 反代面板', '保号通知测试成功 ');
                    return Response.json({ success: ok, error: ok ? '' : '钉钉发送失败，请检查 Webhook' });
                }
                return Response.json({ success: false, error: '未知类型' });
            } catch (e) { return Response.json({ success: false, error: e.message }); }
        }

        if (url.pathname === '/api/account' && request.method === 'POST') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const data = await request.json();
                if (data.logo !== undefined) {
                    if (!env.DB) return Response.json({ success: false, error: 'D1 未绑定：请在 Worker 设置里绑定名为 DB 的 D1 数据库' });
                    await ensureAppConfig(env);
                    const l = data.logo;
                    const type = (l && (l.type === 'url' || l.type === 'data')) ? l.type : '';
                    const value = (l && l.value !== undefined && l.value !== null) ? String(l.value).trim() : '';
                    if (!type || !value) {
                        await env.DB.prepare('DELETE FROM app_config WHERE key = ?').bind('logo').run();
                        memoDel('logo_cfg');
                        return Response.json({ success: true, logo: null });
                    }
                    if (type === 'url') {
                        if (!/^https?:\/\//i.test(value)) return Response.json({ success: false, error: 'URL 需以 http(s):// 开头' });
                        if (value.length > 2000) return Response.json({ success: false, error: 'URL 过长（最多 2000 字符）' });
                        // v3.5.0:Logo 值字符白名单,防止带引号/尖括号/控制字符的值逃出 HTML 属性
                        if (!isSafeLogoValue(value)) return Response.json({ success: false, error: 'URL 含有不允许的字符（空格、引号、尖括号等）' });
                    } else {
                        if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(value)) return Response.json({ success: false, error: '仅支持图片（png/jpg/webp/gif）的 base64 上传' });
                        if (value.length > 600000) return Response.json({ success: false, error: '图片过大（>450KB），请换更小的图片' });
                        if (!isSafeLogoValue(value)) return Response.json({ success: false, error: '图片数据含有不允许的字符' });
                    }
                    await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('logo', JSON.stringify({ type, value })).run();
                    memoDel('logo_cfg');
                    return Response.json({ success: true });
                }
                if (data.proxyToken !== undefined) {
                    const pt = data.proxyToken;
                    const enabled = !!pt.enabled;
                    const key = String(pt.key || '').trim();
                    if (enabled && !/^[A-Za-z0-9]{3,32}$/.test(key)) return Response.json({ success: false, error: '密钥需 3-32 位字母数字' });
                    if (enabled && isReservedSuffix(key)) return Response.json({ success: false, error: '该密钥已被系统保留占用（如 entry），请更换' });
                    if (!env.DB) return Response.json({ success: false, error: 'D1 未绑定：请在 Worker 设置里绑定名为 DB 的 D1 数据库' });
                    await ensureAppConfig(env);
                    await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('proxy_token', JSON.stringify({ enabled, key })).run();
                    memoDel('proxy_token');
                    return Response.json({ success: true });
                }
                if (data.notify !== undefined) {
                    const n = data.notify;
                    if (!env.DB) return Response.json({ success: false, error: 'D1 未绑定：请在 Worker 设置里绑定名为 DB 的 D1 数据库' });
                    await ensureAppConfig(env);
                    const oldRow = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'notify_settings'").first();
                    let old = {};
                    try { if (oldRow && oldRow.value) old = JSON.parse(oldRow.value); } catch (e) {}
                    const cfg = {
                        barkKey: (n.barkKey && n.barkKey !== '********') ? String(n.barkKey).trim() : (old.barkKey || ''),
                        barkLevel: ['critical', 'active', 'timeSensitive', 'passive'].includes(n.barkLevel) ? n.barkLevel : (old.barkLevel || 'active'),
                        barkServer: (n.barkServer && n.barkServer !== 'https://api.day.app') ? String(n.barkServer).trim().replace(/\/+$/, '') : (old.barkServer || 'https://api.day.app'),
                        barkNotify: n.barkNotify !== false,
                        tgToken: (n.tgToken && n.tgToken !== '********') ? String(n.tgToken).trim() : (old.tgToken || ''),
                        tgChatId: n.tgChatId ? String(n.tgChatId).trim() : (old.tgChatId || ''),
                        tgNotify: n.tgNotify !== false,
                        serverChanKey: (n.serverChanKey && n.serverChanKey !== '********') ? String(n.serverChanKey).trim() : (old.serverChanKey || ''),
                        serverChanNotify: n.serverChanNotify === true,
                        dingTalkWebhook: (n.dingTalkWebhook && n.dingTalkWebhook !== '********') ? String(n.dingTalkWebhook).trim() : (old.dingTalkWebhook || ''),
                        dingTalkNotify: n.dingTalkNotify === true
                    };
                    await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('notify_settings', JSON.stringify(cfg)).run();
                    // v3.4.68:检查间隔(小时)随通知设置保存(0/空 = 恢复默认 6)
                    const ch = parseFloat(n.checkIntervalHours);
                    if (ch > 0) await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('check_interval_hours', String(ch)).run();
                    else await env.DB.prepare('DELETE FROM app_config WHERE key = ?').bind('check_interval_hours').run();
                    memoDel('check_interval_hours');
                    // v3.5.4:TG 群机器人日报配置(独立于保号 bot,随通知设置一起保存)
                    const tggOldRow = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'tg_group_settings'").first();
                    let tggOld = {};
                    try { if (tggOldRow && tggOldRow.value) tggOld = JSON.parse(tggOldRow.value); } catch (e) {}
                    const tgg = {
                        enabled: n.tgGroupEnabled !== false,
                        botToken: (n.tgGroupBotToken && n.tgGroupBotToken !== '********') ? String(n.tgGroupBotToken).trim() : (tggOld.botToken || ''),
                        chatId: n.tgGroupChatId ? String(n.tgGroupChatId).trim() : (tggOld.chatId || ''),
                        hour: Math.min(23, Math.max(0, parseInt(n.tgGroupHour || 20, 10) || 20))
                    };
                    await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('tg_group_settings', JSON.stringify(tgg)).run();
                    return Response.json({ success: true });
                }
                if (data.bareProxy !== undefined) {
                    if (!env.DB) return Response.json({ success: false, error: 'D1 未绑定：请在 Worker 设置里绑定名为 DB 的 D1 数据库' });
                    await ensureAppConfig(env);
                    await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('bare_proxy_enabled', data.bareProxy ? '1' : '0').run();
                    memoDel('bare_proxy');
                    return Response.json({ success: true });
                }
                if (data.updateNotify !== undefined) {
                    if (!env.DB) return Response.json({ success: false, error: 'D1 未绑定：请在 Worker 设置里绑定名为 DB 的 D1 数据库' });
                    await ensureAppConfig(env);
                    await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('update_notify', data.updateNotify ? '1' : '0').run();
                    return Response.json({ success: true });
                }
                if (data.subadminPass !== undefined) {
                    if (!env.DB) return Response.json({ success: false, error: 'D1 未绑定：请在 Worker 设置里绑定名为 DB 的 D1 数据库' });
                    const sa = String(data.subadminPass || '').trim();
                    if (sa && sa.length < 4) return Response.json({ success: false, error: '子管理员密码至少 4 位' });
                    await ensureAppConfig(env);
                    await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('subadmin_pass', sa).run();
                    memoDel('auth_fps');
                    return Response.json({ success: true });
                }
                const pw = String(data.password || '').trim();
                if (pw.length < 4) return Response.json({ success: false, error: '密码至少 4 位' });
                await ensureAppConfig(env);
                await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('admin_pass', pw).run();
                memoDel('auth_fps');
                return Response.json({ success: true });
            } catch (e) {
                return Response.json({ success: false, error: e.message });
            }
        }

        // 子管理员密码状态(仅管理员)
        if (url.pathname === '/api/account/subadmin-status' && request.method === 'GET') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const row = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?').bind('subadmin_pass').first();
                return Response.json({ success: true, enabled: !!(row && row.value) });
            } catch (e) { return Response.json({ success: true, enabled: false }); }
        }

        // 安全设置(登录可见):裸域名直连代理开关
        if (url.pathname === '/api/security' && request.method === 'GET') {
            let bareProxy = true;
            try {
                if (env.DB) {
                    await ensureAppConfig(env);
                    const r = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'bare_proxy_enabled'").first();
                    bareProxy = !(r && r.value === '0');
                }
            } catch (e) {}
            return Response.json({ success: true, bareProxy });
        }

        // 反代 Token 状态（登录可见；未登录 401）
        if (url.pathname === '/api/proxytoken' && request.method === 'GET') {
            const pt = await getProxyToken(env);
            return Response.json({ success: true, enabled: !!(pt && pt.enabled && pt.key), key: (pt && pt.enabled && pt.key) ? pt.key : '' });
        }
        // 来访记录 IP（仅管理员）
        if (url.pathname === '/api/proxytoken/hits' && request.method === 'GET') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                await ensureProxyHits(env);
                const { results } = await env.DB.prepare('SELECT ip, path, ua, ts, times FROM proxy_hits ORDER BY id DESC LIMIT 200').all();
                return Response.json({ success: true, hits: results });
            } catch (e) { return Response.json({ success: true, hits: [] }); }
        }
        if (url.pathname === '/api/proxytoken/hits' && request.method === 'POST') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const data = await request.json();
                if (data && data.clear) {
                    await ensureProxyHits(env);
                    await env.DB.prepare('DELETE FROM proxy_hits').run();
                }
                return Response.json({ success: true });
            } catch (e) { return Response.json({ success: false, error: e.message }); }
        }

        // ==========================================
        // 2.4b 节点申请:订阅者提交 -> 管理员审核(按域名去重)
        // ==========================================
        // 提交申请(管理员/订阅者均可)
        if (url.pathname === '/api/node-request' && request.method === 'POST') {
            try {
                if (!env.DB) return Response.json({ success: false, error: 'D1 未绑定：请在 Worker 设置里绑定名为 DB 的 D1 数据库' });
                const body = await request.json();
                const name = String(body.name || '').trim();
                // 支持无数条备用线路:urls 数组;兼容旧版单条 url
                let urls = Array.isArray(body.urls) ? body.urls.map(x => String(x).trim()).filter(Boolean) : (body.url ? [String(body.url).trim()] : []);
                if (!name || !urls.length) return Response.json({ success: false, error: '请填写节点名字与至少一条线路地址' });
                const norm = [];
                for (let u of urls) {
                    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
                    try { norm.push(new URL(u).href); } catch (e) {}
                }
                if (!norm.length) return Response.json({ success: false, error: '线路地址格式不正确' });
                const domains = norm.map(u => { try { return new URL(u).host.toLowerCase(); } catch (e) { return ''; } }).filter(Boolean);
                // 申请审计:记录提交人 IP 与设备(UA),保留 7 天供管理员排查乱加
                const reqIp = request.headers.get('cf-connecting-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || request.headers.get('x-real-ip') || '';
                const reqUa = request.headers.get('user-agent') || '';
                await ensureNodeRequests(env);
                // 与现有节点对比(按域名,每个节点可能多线路)
                const { results: routes } = await env.DB.prepare('SELECT prefix, remark, target FROM routes').all();
                for (const r of (routes || [])) {
                    const targets = String(r.target || '').split(',').map(x => x.trim()).filter(Boolean);
                    for (const t of targets) {
                        try { if (domains.includes(new URL(t).host.toLowerCase())) return Response.json({ success: false, exists: true, prefix: r.prefix, remark: r.remark || r.prefix }); } catch (e) {}
                    }
                }
                // 与待审申请对比:提交线路集合与某条申请有交集(命中同一域名)则整体替换该申请包
                const { results: pends } = await env.DB.prepare("SELECT id, name, url, domain FROM node_requests WHERE status = 'pending'").all();
                for (const pp of (pends || [])) {
                    let pDoms = [];
                    try { pDoms = JSON.parse(pp.url || '[]').map(u => { try { return new URL(u).host.toLowerCase(); } catch (e) { return ''; } }).filter(Boolean); } catch (e) {}
                    if (!pDoms.length && pp.domain) pDoms = [pp.domain];
                    if (pDoms.some(d => domains.includes(d))) {
                        await env.DB.prepare('UPDATE node_requests SET name = ?, url = ?, user = ?, ip = ?, ua = ? WHERE id = ?').bind(name, JSON.stringify(norm), String(body.user || ROLE || 'sub'), reqIp, reqUa, pp.id).run();
                        return Response.json({ success: true, replaced: true, name: pp.name });
                    }
                }
                await env.DB.prepare('INSERT INTO node_requests (name, url, domain, user, ip, ua) VALUES (?, ?, ?, ?, ?, ?)').bind(name, JSON.stringify(norm), domains[0], String(body.user || ROLE || 'sub'), reqIp, reqUa).run();
                return Response.json({ success: true, replaced: false });
            } catch (e) { return Response.json({ success: false, error: e.message }); }
        }
        // 申请列表(管理员/子管理员,待审)
        if (url.pathname === '/api/node-requests' && request.method === 'GET') {
            if (ROLE !== 'admin' && ROLE !== 'subadmin') return new Response('Forbidden', { status: 403 });
            try {
                if (!env.DB) return Response.json({ success: false, error: 'D1 未绑定', requests: [] });
                await ensureNodeRequests(env);
                const { results } = await env.DB.prepare("SELECT id, name, url, user, datetime(created_at, '+8 hours') as created_at FROM node_requests WHERE status = 'pending' ORDER BY id DESC").all();
                return Response.json({ success: true, requests: results });
            } catch (e) { return Response.json({ success: false, error: e.message, requests: [] }); }
        }
        // 审批(管理员/子管理员):同意 -> 标记已批并回传数据供跳转预填;拒绝 -> 删除申请
        if (url.pathname === '/api/node-requests/review' && request.method === 'POST') {
            if (ROLE !== 'admin' && ROLE !== 'subadmin') return new Response('Forbidden', { status: 403 });
            try {
                const body = await request.json();
                const id = parseInt(body.id, 10);
                if (!id) return Response.json({ success: false, error: '参数错误' });
                if (!env.DB) return Response.json({ success: false, error: 'D1 未绑定' });
                await ensureNodeRequests(env);
                if (body.action === 'approve') {
                    const row = await env.DB.prepare('SELECT name, url FROM node_requests WHERE id = ?').bind(id).first();
                    if (!row) return Response.json({ success: false, error: '申请不存在' });
                    await env.DB.prepare("UPDATE node_requests SET status = 'approved' WHERE id = ?").bind(id).run();
                    return Response.json({ success: true, data: { name: row.name, url: row.url } });
                }
                if (body.action === 'reject') {
                    await env.DB.prepare('DELETE FROM node_requests WHERE id = ?').bind(id).run();
                    return Response.json({ success: true });
                }
                return Response.json({ success: false, error: '未知操作' });
            } catch (e) { return Response.json({ success: false, error: e.message }); }
        }
        // 申请审计(仅管理员):近 7 天申请记录,含提交人 IP 与设备,支持按名字/线路搜索
        if (url.pathname === '/api/node-requests/audit' && request.method === 'GET') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                if (!env.DB) return Response.json({ success: false, error: 'D1 未绑定', requests: [] });
                await ensureNodeRequests(env);
                const q = String(url.searchParams.get('q') || '').trim();
                const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 1), 500);
                let sql = "SELECT id, name, url, ip, ua, user, status, datetime(created_at, '+8 hours') as created_at FROM node_requests WHERE created_at >= datetime('now', '+8 hours', '-7 days')";
                const binds = [];
                if (q) { sql += " AND (name LIKE ? OR url LIKE ?)"; binds.push('%' + q + '%', '%' + q + '%'); }
                sql += ' ORDER BY id DESC LIMIT ?';
                binds.push(limit);
                const { results } = await env.DB.prepare(sql).bind(...binds).all();
                return Response.json({ success: true, requests: results });
            } catch (e) { return Response.json({ success: false, error: e.message, requests: [] }); }
        }
        // 成员添加节点记录(仅管理员):近 7 天子管理员/已授权订阅用户直接添加节点的记录,含 IP 与设备,支持按名字/线路/前缀搜索
        if (url.pathname === '/api/admin-node-logs' && request.method === 'GET') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                if (!env.DB) return Response.json({ success: false, error: 'D1 未绑定', logs: [] });
                await ensureAdminNodeLogs(env);
                const q = String(url.searchParams.get('q') || '').trim();
                const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 1), 500);
                let sql = "SELECT id, name, url, prefix, ip, ua, actor, datetime(created_at, '+8 hours') as created_at FROM admin_node_logs WHERE created_at >= datetime('now', '+8 hours', '-7 days')";
                const binds = [];
                if (q) { sql += " AND (name LIKE ? OR url LIKE ? OR prefix LIKE ?)"; binds.push('%' + q + '%', '%' + q + '%', '%' + q + '%'); }
                sql += ' ORDER BY id DESC LIMIT ?';
                binds.push(limit);
                const { results } = await env.DB.prepare(sql).bind(...binds).all();
                return Response.json({ success: true, logs: results });
            } catch (e) { return Response.json({ success: false, error: e.message, logs: [] }); }
        }
        // 公告(登录可见;仅管理员设置/清除;单条覆盖式)
        if (url.pathname === '/api/notice' && request.method === 'GET') {
            if (!ROLE) return new Response('Unauthorized', { status: 401 });
            try {
                const r = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'notice'").first();
                const val = (r && r.value) ? (() => { try { return JSON.parse(r.value); } catch (e) { return { text: r.value }; } })() : null;
                return Response.json({ success: true, text: val ? val.text || '' : '', updated_at: val ? val.updated_at || '' : '' });
            } catch (e) { return Response.json({ success: false, error: String(e) }); }
        }
        if (url.pathname === '/api/notice' && request.method === 'POST') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const body = await request.json();
                const text = String(body.text || '').trim();
                const val = JSON.stringify({ text, updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ') });
                if (text) await env.DB.prepare('INSERT INTO app_config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=?').bind('notice', val, val).run();
                else await env.DB.prepare('DELETE FROM app_config WHERE key = ?').bind('notice').run();
                return Response.json({ success: true });
            } catch (e) { return Response.json({ success: false, error: String(e) }); }
        }

        if (url.pathname === '/api/subscribers' && request.method === 'GET') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                await ensureAppConfig(env);
                const row = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?').bind('subscribers').first();
                const list = row && row.value ? JSON.parse(row.value) : [];
                const caRow = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?').bind('subscribers_can_add').first();
                const caList = caRow && caRow.value ? JSON.parse(caRow.value) : [];
                return Response.json({ success: true, subscribers: Array.isArray(list) ? list : [], canAdd: Array.isArray(caList) ? caList : [] });
            } catch (e) {
                return Response.json({ success: false, error: e.message, subscribers: [], canAdd: [] });
            }
        }

        if (url.pathname === '/api/subscribers' && request.method === 'POST') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const data = await request.json();
                const action = data.action;
                const pw = String(data.password || '').trim();
                if (!pw || pw.length < 4) return Response.json({ success: false, error: '密码至少 4 位' });
                await ensureAppConfig(env);
                const row = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?').bind('subscribers').first();
                let list = row && row.value ? JSON.parse(row.value) : [];
                if (!Array.isArray(list)) list = [];
                const caRow = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?').bind('subscribers_can_add').first();
                let caList = caRow && caRow.value ? JSON.parse(caRow.value) : [];
                if (!Array.isArray(caList)) caList = [];
                if (action === 'add') {
                    if (list.includes(pw)) return Response.json({ success: false, error: '该密码已存在' });
                    list.push(pw);
                } else if (action === 'del') {
                    list = list.filter(p => p !== pw);
                    caList = caList.filter(p => p !== pw);
                } else if (action === 'setAdd') {
                    const add = !!data.add;
                    if (!list.includes(pw)) return Response.json({ success: false, error: '订阅用户不存在' });
                    if (add) { if (!caList.includes(pw)) caList.push(pw); }
                    else { caList = caList.filter(p => p !== pw); }
                    await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('subscribers_can_add', JSON.stringify(caList)).run();
                    memoDel('subs_can_add'); memoDel('auth_fps');
                    return Response.json({ success: true, canAdd: caList });
                } else {
                    return Response.json({ success: false, error: '未知操作' });
                }
                await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('subscribers', JSON.stringify(list)).run();
                await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('subscribers_can_add', JSON.stringify(caList)).run();
                memoDel('subs_can_add'); memoDel('auth_fps');
                return Response.json({ success: true, subscribers: list, canAdd: caList });
            } catch (e) {
                return Response.json({ success: false, error: e.message });
            }
        }

        // ==========================================
        // 2.3 数据大屏统计接口 (Analytics)
        // ==========================================
        if (url.pathname === '/api/analytics' && request.method === 'GET') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            if (!env.DB) return Response.json({ success: false, error: '未绑定 D1 数据库' });
            try {
                // 并发获取 24小时、7天、30天流量 (通过全新 GraphQL API 规避限制)
                const [trafficToday, traffic7d, traffic30d] = await Promise.all([
                    getCFTraffic(env, 'today'),
                    getCFTraffic(env, 7),
                    getCFTraffic(env, 30)
                ]);

                await ensureVisitorLogs(env);
                const trend = await env.DB.prepare(`SELECT date(timestamp, '+8 hours') as date, COUNT(*) as count FROM visitor_logs WHERE timestamp >= datetime('now', '-7 days') GROUP BY date(timestamp, '+8 hours') ORDER BY date ASC`).all();
                const locations = await env.DB.prepare(`SELECT country, COUNT(*) as count FROM visitor_logs WHERE timestamp >= datetime('now', '-7 days') GROUP BY country ORDER BY count DESC`).all();
                const recents = await env.DB.prepare(`SELECT prefix, datetime(timestamp, '+8 hours') as timestamp, ip, country, ua, region, city FROM visitor_logs ORDER BY timestamp DESC LIMIT 20`).all();
                // v3.5.3:播放器 UA 排行榜（7天/30天）
                const uaRaw7 = await env.DB.prepare(`SELECT ua, COUNT(*) as c FROM visitor_logs WHERE timestamp >= datetime('now', '-7 days') GROUP BY ua ORDER BY c DESC LIMIT 20`).all();
                const playerStats7d = aggPlayerStats((uaRaw7 && uaRaw7.results) || []);
                
                return Response.json({ 
                    success: true, 
                    trend: trend.results, 
                    locations: locations.results, 
                    recents: recents.results,
                    playerStats7d: playerStats7d,
                    trafficToday, traffic7d, traffic30d 
                });
            } catch(e) {
                return Response.json({ success: false, error: e.message });
            }
        }

        // ==========================================
        //  访问者分布接口 (3D 地球/热力图):近 7 天按国家聚合 + 中国按省份聚合
        //  省份缺失时按需批量解析(ip-api zh-CN -> 省份全名归一化),结果回写 visitor_logs.region 并缓存
        // ==========================================
        let WORLD_SIMPLE = null;
        const PROVINCE_FULL = { '北京':'北京市','天津':'天津市','上海':'上海市','重庆':'重庆市','河北':'河北省','山西':'山西省','辽宁':'辽宁省','吉林':'吉林省','黑龙江':'黑龙江省','江苏':'江苏省','浙江':'浙江省','安徽':'安徽省','福建':'福建省','江西':'江西省','山东':'山东省','河南':'河南省','湖北':'湖北省','湖南':'湖南省','广东':'广东省','海南':'海南省','四川':'四川省','贵州':'贵州省','云南':'云南省','陕西':'陕西省','甘肃':'甘肃省','青海':'青海省','台湾':'台湾省','内蒙古':'内蒙古自治区','广西':'广西壮族自治区','西藏':'西藏自治区','宁夏':'宁夏回族自治区','新疆':'新疆维吾尔自治区','香港':'香港特别行政区','澳门':'澳门特别行政区' };
        async function resolveVisitorGeoBatch(ips) {
            const out = {};
            if (!Array.isArray(ips) || !ips.length) return out;
            const nowTs = Date.now();
            let cache = {};
            try {
                const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'ip_geo_cache'").first();
                if (row && row.value) cache = JSON.parse(row.value) || {};
            } catch (e) {}
            const pending = [];
            const seen = new Set();
            for (const raw of ips) {
                const ip = String(raw || '').trim();
                if (!ip || seen.has(ip)) continue;
                seen.add(ip);
                const hit = cache[ip];
                if (hit && hit.p && (nowTs - (hit.ts || 0)) < 604800000) { out[ip] = { provinceZh: hit.p, cityZh: hit.c || '', ts: hit.ts }; continue; }
                pending.push(ip);
            }
            if (pending.length) {
                const batch = pending.slice(0, 35);
                try {
                    const ac = new AbortController();
                    const tm = setTimeout(() => ac.abort(), 3500);
                    const resp = await fetch('http://ip-api.com/batch?fields=status,query,countryCode,regionName,city,lat,lon&lang=zh-CN', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(batch.map(q => ({ query: q }))), signal: ac.signal });
                    clearTimeout(tm);
                    if (resp.ok) {
                        const arr = await resp.json();
                        if (Array.isArray(arr)) {
                            for (const r of arr) {
                                if (r && r.status === 'success' && r.query && String(r.countryCode || '').toUpperCase() === 'CN' && r.regionName) {
                                    const prov = PROVINCE_FULL[r.regionName] || (r.regionName.endsWith('省') || r.regionName.endsWith('自治区') || r.regionName.endsWith('市') || r.regionName.endsWith('特别行政区') ? r.regionName : r.regionName + '省');
                                    const city = String(r.city || '').replace(/市$/, '');
                                    out[r.query] = { provinceZh: prov, cityZh: city, ts: nowTs };
                                    cache[r.query] = { p: prov, c: city, ts: nowTs };
                                } else if (r && r.status === 'success' && r.query && r.countryCode) {
                                    // 非 CN:记缓存但无省份,避免反复查
                                    cache[r.query] = { p: '', c: '', ts: nowTs };
                                }
                            }
                        }
                    }
                } catch (e) {}
                try {
                    const keys = Object.keys(cache);
                    if (keys.length > 400) { const keep = keys.slice(keys.length - 400); const trimmed = {}; for (const k of keep) trimmed[k] = cache[k]; cache = trimmed; }
                    await env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind('ip_geo_cache', JSON.stringify(cache)).run();
                } catch (e) {}
            }
            return out;
        }
        if (url.pathname === '/api/visitor-geo' && request.method === 'GET') {
            if (ROLE !== 'admin' && ROLE !== 'subadmin') return new Response('Forbidden', { status: 403 });
            if (!env.DB) return Response.json({ success: false, error: 'D1 未绑定', countries: [], provinces: [] });
            try {
                await ensureVisitorLogs(env);
                const byCountry = await env.DB.prepare(`SELECT country, COUNT(*) as count FROM visitor_logs WHERE timestamp >= datetime('now', '+8 hours', '-7 days') GROUP BY country ORDER BY count DESC`).all();
                const byProvRaw = await env.DB.prepare(`SELECT region, COUNT(*) as count FROM visitor_logs WHERE timestamp >= datetime('now', '+8 hours', '-7 days') AND country = 'CN' AND region != '' GROUP BY region ORDER BY count DESC`).all();
                const missing = await env.DB.prepare(`SELECT DISTINCT ip FROM visitor_logs WHERE timestamp >= datetime('now', '+8 hours', '-7 days') AND country = 'CN' AND region = '' AND ip != '' LIMIT 35`).all();
                // 省份解析改后台异步(ctx.waitUntil),接口立即返回已有聚合,避免阻塞大屏加载
                if (missing.results.length && ctx && ctx.waitUntil) {
                    const ips = missing.results.map(r => r.ip);
                    ctx.waitUntil((async () => {
                        try {
                            const geo = await resolveVisitorGeoBatch(ips);
                            for (const ip of ips) {
                                const g = geo[ip];
                                if (g && g.provinceZh) {
                                    await env.DB.prepare(`UPDATE visitor_logs SET region = ?, city = ? WHERE ip = ? AND country = 'CN' AND region = ''`).bind(g.provinceZh, g.cityZh || '', ip).run();
                                }
                            }
                        } catch (e) {}
                    })());
                }
                return Response.json({ success: true, countries: byCountry.results, provinces: byProvRaw.results, resolving: missing.results.length > 0 });
            } catch(e) {
                return Response.json({ success: false, error: e.message, countries: [], provinces: [] });
            }
        }

        // ==========================================
        //  中国省份 GeoJSON 代理接口 (v3.4.56):Worker 后端拉取 DataV,规避移动网络直连被改写/CORS 问题,带 D1 缓存
        // ==========================================
        if (url.pathname === '/api/geo-china' && request.method === 'GET') {
            if (ROLE !== 'admin' && ROLE !== 'subadmin') return new Response('Forbidden', { status: 403 });
            try {
                const nowTs = Date.now();
                const cachedRow = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'geo_china_map'").first();
                if (cachedRow && cachedRow.value) {
                    const c = JSON.parse(cachedRow.value);
                    if (c && c.ts && (nowTs - c.ts) < 604800000 && c.data) {
                        return new Response(JSON.stringify(c.data), { headers: { 'Content-Type': 'application/json;charset=UTF-8' } });
                    }
                }
                const ac = new AbortController();
                const tm = setTimeout(() => ac.abort(), 3500);
                const resp = await fetch('https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json', { signal: ac.signal });
                clearTimeout(tm);
                if (!resp.ok) return Response.json({ success: false, error: '地图数据源 HTTP ' + resp.status }, { status: 502 });
                const data = await resp.json();
                await env.DB.prepare('INSERT INTO app_config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=?').bind('geo_china_map', JSON.stringify({ data: data, ts: nowTs }), JSON.stringify({ data: data, ts: nowTs })).run();
                return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json;charset=UTF-8' } });
            } catch(e) {
                return Response.json({ success: false, error: String(e && e.message || e) }, { status: 502 });
            }
        }

        // ==========================================
        //  世界地图简化 GeoJSON 代理接口 (v3.4.58):后端拉取 echarts4 world.json 并抽稀,内存缓存,前端 canvas 自绘大陆轮廓
        // ==========================================
        if (url.pathname === '/api/geo-world' && request.method === 'GET') {
            if (ROLE !== 'admin' && ROLE !== 'subadmin') return new Response('Forbidden', { status: 403 });
            try {
                if (!WORLD_SIMPLE) {
                    const ac = new AbortController();
                    const tm = setTimeout(() => ac.abort(), 9000);
                    const resp = await fetch('https://cdn.jsdelivr.net/npm/echarts@4.9.0/map/json/world.json', { signal: ac.signal });
                    clearTimeout(tm);
                    if (!resp.ok) return Response.json({ success: false, error: '世界地图数据源 HTTP ' + resp.status }, { status: 502 });
                    const gj = await resp.json();
                    const simplifyRing = (ring) => {
                        if (!Array.isArray(ring) || ring.length <= 60) return ring;
                        const step = Math.ceil(ring.length / 60);
                        const out = [];
                        for (let i = 0; i < ring.length; i += step) out.push(ring[i]);
                        if (out.length > 1 && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push(out[0]);
                        return out;
                    };
                    const features = (gj.features || []).filter(f => f && f.properties && String(f.properties.name || '') !== 'Antarctica').map(f => {
                        const g = f.geometry;
                        if (!g) return f;
                        if (g.type === 'Polygon') g.coordinates = g.coordinates.map(simplifyRing);
                        else if (g.type === 'MultiPolygon') g.coordinates = g.coordinates.map(p => p.map(simplifyRing));
                        return f;
                    });
                    WORLD_SIMPLE = { type: 'FeatureCollection', features };
                }
                return new Response(JSON.stringify(WORLD_SIMPLE), { headers: { 'Content-Type': 'application/json;charset=UTF-8' } });
            } catch(e) {
                return Response.json({ success: false, error: String(e && e.message || e) }, { status: 502 });
            }
        }

        // ==========================================
        //  CF Worker 每日请求数统计接口 (GraphQL httpRequests，额度按 UTC 00:00 重置)
        // ==========================================
        if (url.pathname === '/api/cfusage' && request.method === 'GET') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            if (!env.CF_API_TOKEN || !env.CF_ZONE_ID) return Response.json({ success: false, error: '缺少 CF_API_TOKEN 或 CF_ZONE_ID 变量，无法统计 CF 请求数' });
            try {
                const [todayStats, week, month] = await Promise.all([
                    getCFTodayStats(env),
                    getCFRequests(env, 7),
                    getCFRequests(env, 30)
                ]);
                const quota = 100000;
                const todayCount = todayStats.ok ? todayStats.requests : 0;
                const weekCount = week.ok ? week.count : 0;
                const monthCount = month.ok ? month.count : 0;
                return Response.json({ 
                    success: true, 
                    today: todayCount, 
                    week: weekCount, 
                    month: monthCount, 
                    quota: quota,
                    usedPercent: todayStats.ok ? Math.round(todayCount / quota * 1000) / 10 : 0,
                    remain: Math.max(0, quota - todayCount),
                    todayError: todayStats.ok ? null : todayStats.error,
                    weekError: week.ok ? null : week.error,
                    monthError: month.ok ? null : month.error,
                    bandwidth: todayStats.ok ? todayStats.bytes : 0,
                    cacheHitRatio: todayStats.ok && todayStats.bytes > 0 ? Math.round(todayStats.cachedBytes / todayStats.bytes * 1000) / 10 : 0,
                    statusCodes: todayStats.ok ? todayStats.statusCodes : { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
                    countries: todayStats.ok ? todayStats.countries : [],
                    hours: todayStats.ok ? todayStats.hours : [],
                    blocked: todayStats.ok ? todayStats.blocked : 0
                });
            } catch(e) {
                return Response.json({ success: false, error: e.message });
            }
        }

        // ==========================================
        //  后端接口：执行代码覆盖更新 (纯JSON接口无损继承：变量、数据库、兼容性、放置地区)
        // ==========================================
        if (url.pathname === '/api/deploy' && request.method === 'POST') {
if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
                        const cfToken = env.CF_API_TOKEN;
            const accountId = env.CF_ACCOUNT_ID;
            const workerName = env.CF_WORKER_NAME;
            if (!cfToken || !accountId || !workerName) {
                return Response.json({ success: false, error: '缺少 CF_API_TOKEN, CF_ACCOUNT_ID 或 CF_WORKER_NAME 环境变量' });
            }
            try {
                const body = await request.json();
                if (!body.newCode) return Response.json({ success: false, error: '代码内容为空。' });

                // 1.  终极修复：调用纯 JSON 的 services 接口获取真实配置，绝对不再崩溃！
                const serviceRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/services/${workerName}`, {
                    headers: { 'Authorization': `Bearer ${cfToken}` }
                });
                const serviceData = await serviceRes.json();
                
                let compDate = "2024-01-01"; // 依然保留兜底，但这次绝不会用到
                let compFlags = undefined;
                let placement = undefined;

                if (serviceData.success && serviceData.result) {
                    // 精准从 JSON 中提取你原本的配置
                    let scriptInfo = null;
                    if (serviceData.result.default_environment && serviceData.result.default_environment.script) {
                        scriptInfo = serviceData.result.default_environment.script;
                    } else if (serviceData.result.script) {
                        scriptInfo = serviceData.result.script;
                    }
                    
                    if (scriptInfo) {
                        if (scriptInfo.compatibility_date) compDate = scriptInfo.compatibility_date;
                        if (scriptInfo.compatibility_flags) compFlags = scriptInfo.compatibility_flags;
                        if (scriptInfo.placement) placement = scriptInfo.placement;
                    }
                }

                const preservedBindings = [];
                // 2. 备份普通的字符串变量:secret 仍以 secret_text 回写,不降级成明文变量
                const secretNames = new Set();
                const SECRET_NAME_RE = /(TOKEN|SECRET|PASS|KEY)/i;
                for (const key in env) {
                    if (typeof env[key] !== 'string') continue;
                    const isSecret = secretNames.has(key) || SECRET_NAME_RE.test(key);
                    preservedBindings.push({ name: key, type: isSecret ? 'secret_text' : 'plain_text', text: env[key] });
                }

                // 3. 拉取 D1、KV 等高级绑定并无损合并(先记录平台侧已存在的 secret_text 名单,回写时保持 secret 属性)
                const bindingsRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/bindings`, {
                    headers: { 'Authorization': `Bearer ${cfToken}` }
                });
                const bindingsData = await bindingsRes.json();
                if (bindingsData.success && Array.isArray(bindingsData.result)) {
                    for (const b of bindingsData.result) {
                        if (b.type === 'secret_text') secretNames.add(b.name);
                        else if (b.type !== 'plain_text' && b.type !== 'inherited') {
                            preservedBindings.push(b);
                        }
                    }
                }

                // 4. 组装最终的部署请求
                const formData = new FormData();
                const metadata = { 
                    main_module: 'worker.js',
                    bindings: preservedBindings,
                    compatibility_date: compDate 
                };
                if (compFlags) metadata.compatibility_flags = compFlags;
                if (placement) metadata.placement = placement; // ${I.target} 完美带上你原始的放置地区！

                formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }), 'metadata.json');
                formData.append('worker.js', new Blob([body.newCode], { type: 'application/javascript+module' }), 'worker.js');

                const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`;
                const res = await fetch(cfUrl, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${cfToken}` },
                    body: formData
                });
                const data = await res.json();
                if (data.success) {
                    return Response.json({ success: true, msg: '代码更新成功，并已完美保留原有放置地区和兼容配置！' });
                } else {
                    throw new Error(JSON.stringify(data.errors));
                }
            } catch (e) {
                return Response.json({ success: false, error: e.message });
            }
        }
        // ==========================================
        // 2.35 播放热力图接口 (v3.4.16)
        // ==========================================
        if (url.pathname === '/api/heatmap') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            return Response.json(await getHeatmap(env, 7));
        }
        // ==========================================
        // 2.4 系统级与提取工具 API 
        // ==========================================
        if (url.pathname === '/api/purge-cache' && request.method === 'POST') {
if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
                        const cfToken = env.CF_API_TOKEN; const zoneId = env.CF_ZONE_ID;
            if (!cfToken || !zoneId) return Response.json({ success: false, error: '缺少 CF_API_TOKEN 或 CF_ZONE_ID 变量' });
            try {
                const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, { method: 'POST', headers: { 'Authorization': `Bearer ${cfToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ purge_everything: true }) });
                const data = await res.json();
                if (!data.success) throw new Error(JSON.stringify(data.errors));
                return Response.json({ success: true });
            } catch (e) { return Response.json({ success: false, error: e.message }); }
        }

        if (url.pathname === '/api/ping-node') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            const target = url.searchParams.get('url');
            if (!target) return Response.json({ ms: -1 });
            const start = Date.now();
            try {
                const controller = new AbortController(); const timeoutId = setTimeout(() => controller.abort(), 2000); 
                await fetch(target + '/', { method: 'HEAD', signal: controller.signal });
                clearTimeout(timeoutId); return Response.json({ ms: Date.now() - start });
            } catch (e) { return Response.json({ ms: -1 }); }
        }

        if (url.pathname === '/api/get-dns') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            const cfToken = env.CF_API_TOKEN; const zoneId = env.CF_ZONE_ID; const domain = env.CF_DOMAIN;
            if (!cfToken || !zoneId || !domain) return Response.json({ success: false, error: '缺少 DNS 环境变量' });
            try {
                const getRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=${domain}`, { headers: { 'Authorization': `Bearer ${cfToken}` } });
                const getData = await getRes.json();
                return Response.json({ success: true, result: getData.result });
            } catch (error) { return Response.json({ success: false, error: error.message }); }
        }

        if (url.pathname === '/api/update-dns' && request.method === 'POST') {
if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
                        const cfToken = env.CF_API_TOKEN; const zoneId = env.CF_ZONE_ID; const domain = env.CF_DOMAIN;
            if (!cfToken || !zoneId || !domain) return Response.json({ success: false, error: '缺少 DNS 环境变量' });
            let ips;
            try { const body = await request.json(); ips = body && body.ips; } catch (e) { return Response.json({ success: false, error: '请求体不是合法 JSON' }); }
            // v3.5.0:先校验全部输入,通过后才会动现有记录(避免先删后发现参数有问题导致解析被清空)
            if (!Array.isArray(ips) || ips.length === 0 || ips.length > 50) return Response.json({ success: false, error: 'ips 必须是非空数组(最多 50 条)' });
            const newRecords = [];
            for (const raw of ips) {
                const cleanItem = String(raw == null ? '' : raw).replace(/[\[\]]/g, '').trim();
                const isV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(cleanItem);
                const isV6 = cleanItem.includes(':') && /^[0-9a-fA-F:.]+$/.test(cleanItem);
                const isHost = /^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/.test(cleanItem);
                if (!isV4 && !isV6 && !isHost) return Response.json({ success: false, error: '无效的 IP/域名: ' + cleanItem });
                newRecords.push({ type: isV6 ? 'AAAA' : (isV4 ? 'A' : 'CNAME'), name: domain, content: cleanItem, ttl: 60, proxied: false });
            }
            const dnsBase = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`;
            const authH = { 'Authorization': `Bearer ${cfToken}` };
            const jsonH = { 'Authorization': `Bearer ${cfToken}`, 'Content-Type': 'application/json' };
            try {
                const getRes = await fetch(`${dnsBase}?name=${encodeURIComponent(domain)}`, { headers: authH });
                const getData = await getRes.json();
                if (!getData.success) throw new Error('获取现有 DNS 记录失败');

                const oldRecords = getData.result.filter(r => r.type === 'A' || r.type === 'AAAA' || r.type === 'CNAME');
                const deleted = []; const created = [];
                try {
                    for (const record of oldRecords) {
                        const dr = await fetch(`${dnsBase}/${record.id}`, { method: 'DELETE', headers: authH });
                        const dd = await dr.json();
                        if (!dd.success) throw new Error('删除旧记录失败: ' + JSON.stringify(dd.errors));
                        deleted.push(record);
                    }
                    for (const rec of newRecords) {
                        const postRes = await fetch(dnsBase, { method: 'POST', headers: jsonH, body: JSON.stringify(rec) });
                        const postData = await postRes.json();
                        if (!postData.success) throw new Error('记录提交失败: ' + JSON.stringify(postData.errors));
                        created.push(postData.result && postData.result.id);
                    }
                } catch (err) {
                    // v3.5.0:回滚——删除已创建的新记录,恢复已删除的旧记录
                    for (const id of created) { if (id) { try { await fetch(`${dnsBase}/${id}`, { method: 'DELETE', headers: authH }); } catch (e) {} } }
                    for (const old of deleted) {
                        try { await fetch(dnsBase, { method: 'POST', headers: jsonH, body: JSON.stringify({ type: old.type, name: old.name, content: old.content, ttl: old.ttl, proxied: !!old.proxied }) }); } catch (e) {}
                    }
                    throw new Error(err.message + '(已尝试回滚,恢复原有解析记录)');
                }
                return Response.json({ success: true, message: ' 成功！' });
            } catch (error) { return Response.json({ success: false, error: error.message }); }
        }

        if (url.pathname === '/api/get-custom-api-ips') {
            // v3.5.0:仅管理员可调(原为任意登录用户可调)
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const apiUrl = url.searchParams.get('url');
                if (!apiUrl) throw new Error("缺少 URL");
                // v3.5.0:SSRF 防护——仅允许 http(s),禁止内网/本机地址,8 秒超时
                let apiParsed; try { apiParsed = new URL(apiUrl); } catch (e) { throw new Error('URL 无效'); }
                if (apiParsed.protocol !== 'http:' && apiParsed.protocol !== 'https:') throw new Error('仅支持 http(s) 地址');
                const apiHost = apiParsed.hostname.toLowerCase();
                if (apiHost === 'localhost' || apiHost === '[::1]' || apiHost.endsWith('.local') || apiHost.endsWith('.internal') || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(apiHost)) throw new Error('不允许访问内网地址');
                const apiCtl = new AbortController(); const apiTimer = setTimeout(() => apiCtl.abort(), 8000);
                let response;
                try { response = await fetch(apiParsed.href, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: apiCtl.signal }); } finally { clearTimeout(apiTimer); }
                const text = await response.text(); let validIPs = new Set();
                try {
                    const jsonObj = JSON.parse(text);
                    if (jsonObj && jsonObj.data && Array.isArray(jsonObj.data)) {
                        jsonObj.data.forEach(item => { if (item.ip) { let ip = item.ip; if (ip.includes(':') && !ip.startsWith('[')) ip = `[${ip}]`; validIPs.add(ip); } });
                    }
                } catch (e) {}

                if (validIPs.size === 0) {
                    const ipv4Regex = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;
                    const matchedIPv4 = text.match(ipv4Regex) || [];
                    matchedIPv4.forEach(ip => { if (!ip.startsWith('10.') && !ip.startsWith('192.168.') && !ip.startsWith('127.')) validIPs.add(ip); });

                    const ipv6Regex = /(?:[A-F0-9]{1,4}:){7}[A-F0-9]{1,4}|(?:[A-F0-9]{1,4}:)*:[A-F0-9]{1,4}(?::[A-F0-9]{1,4})*/gi;
                    const matchedIPv6 = text.match(ipv6Regex) || [];
                    matchedIPv6.forEach(ip => { if (ip.length > 7 && ip.includes(':') && !ip.startsWith('::1')) validIPs.add(ip.startsWith('[') ? ip : `[${ip}]`); });
                }
                const uniqueIPArray = Array.from(validIPs);
                for (let i = uniqueIPArray.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [uniqueIPArray[i], uniqueIPArray[j]] = [uniqueIPArray[j], uniqueIPArray[i]]; }
                return Response.json({ success: true, ips: uniqueIPArray.slice(0, 15), totalCount: uniqueIPArray.length });
            } catch (error) { return Response.json({ success: false, error: error.message }, { status: 500 }); }
        }

        const PRESET_SOURCES = {
            'ehb-all': { name: '云枢全域融合(双栈)', url: 'https://ip.ehb.cc.cd/all?ips=100' },
            'ehb-cm': { name: '云枢移动起飞(IPv4)', url: 'https://ip.ehb.cc.cd/cm?ips=100' },
            'ehb-ct': { name: '云枢电信美西(IPv4)', url: 'https://ip.ehb.cc.cd/ct?ips=100' },
            'ehb-cu': { name: '云枢联通极速(IPv4)', url: 'https://ip.ehb.cc.cd/cu?ips=100' },
            'ehb-104': { name: '104 大段全域池', url: 'https://ip.ehb.cc.cd/104?ips=100' },
            'ehb-10417': { name: '104.17 移动起飞段', url: 'https://ip.ehb.cc.cd/104.17?ips=100' },
            'ehb-10419': { name: '104.19 移动抗QoS段', url: 'https://ip.ehb.cc.cd/104.19?ips=100' },
            'ehb-10416': { name: '104.16 经典老牌段', url: 'https://ip.ehb.cc.cd/104.16?ips=100' },
            'ehb-162': { name: '162 大段全域池', url: 'https://ip.ehb.cc.cd/162?ips=100' },
            'ehb-162159s': { name: '162.159 SaaS/DoH段', url: 'https://ip.ehb.cc.cd/162.159-saas?ips=100' },
            'ehb-162159ct': { name: '162.159 电信美西最稳段', url: 'https://ip.ehb.cc.cd/162.159-ct?ips=100' },
            'ehb-172': { name: '172 大段全域池', url: 'https://ip.ehb.cc.cd/172?ips=100' },
            'ehb-17264': { name: '172.64 联通/电信主力段', url: 'https://ip.ehb.cc.cd/172.64?ips=100' },
            'ehb-17267': { name: '172.67 动态反代段', url: 'https://ip.ehb.cc.cd/172.67?ips=100' },
            'ehb-198': { name: '198.41 联通天花板大段', url: 'https://ip.ehb.cc.cd/198?ips=100' },
            'ehb-108': { name: '108.162 三网兜底大段', url: 'https://ip.ehb.cc.cd/108?ips=100' },
            'ehb-v6': { name: '云枢 IPv6 全域星轨', url: 'https://ip.ehb.cc.cd/v6?ips=100' },
            'ehb-v6cm': { name: '云枢移动 5G 直连', url: 'https://ip.ehb.cc.cd/v6-cm?ips=100' },
            'ehb-v6ct': { name: '云枢电信 纯净美西', url: 'https://ip.ehb.cc.cd/v6-ct?ips=100' },
            'ehb-v6cu': { name: '云枢联通 欧洲/东京', url: 'https://ip.ehb.cc.cd/v6-cu?ips=100' },
            'ehb-2400': { name: '2400:cb00 亚太全域', url: 'https://ip.ehb.cc.cd/2400?ips=100' },
            'ehb-24002048': { name: '2400.2048 香港近场段', url: 'https://ip.ehb.cc.cd/2400.2048?ips=100' },
            'ehb-2400400': { name: '2400.400 亚太低跳数段', url: 'https://ip.ehb.cc.cd/2400.400?ips=100' },
            'ehb-24002049': { name: '2400.2049 亚太抗抖动段', url: 'https://ip.ehb.cc.cd/2400.2049?ips=100' },
            'ehb-2606': { name: '2606:4700 全球主干', url: 'https://ip.ehb.cc.cd/2606?ips=100' },
            'ehb-26063030': { name: '2606.3030 核心骨干段', url: 'https://ip.ehb.cc.cd/2606.3030?ips=100' },
            'ehb-26064700': { name: '2606.4700 伴生特权段', url: 'https://ip.ehb.cc.cd/2606.4700?ips=100' },
            'ehb-2a06': { name: '2a06:98c0 欧洲特快大段', url: 'https://ip.ehb.cc.cd/2a06?ips=100' },
            'robberer': { name: '@robberer 专属', url: 'https://gh.xxooo.cf/https://raw.githubusercontent.com/hc990275/yx/refs/heads/main/cfyxip.txt' },
            'cm-ct': { name: 'CM佬电信优选', url: 'https://cf.090227.xyz/ct?ips=100' },
            'cm-cmcc': { name: 'CM佬移动优选', url: 'https://cf.090227.xyz/cmcc?ips=100' },
            'cm-cu': { name: 'CM佬联通优选', url: 'https://cf.090227.xyz/cu?ips=100' },
            'v2too': { name: 'v2too 源', url: 'https://ip.v2too.top/api/nodes' }
        };
        function normalizePresetIp(ip) {
            ip = String(ip).trim().replace(/^\[|\]$/g, '');
            if (ip.includes(':') && !ip.startsWith('[')) ip = `[${ip}]`;
            return ip;
        }
        async function extractIPsFromSource(url) {
            const set = new Set();
            try {
                const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                if (!resp.ok) return set;
                const text = await resp.text();
                try {
                    const j = JSON.parse(text);
                    if (j && Array.isArray(j.data)) {
                        j.data.forEach(item => { if (item && item.ip) set.add(normalizePresetIp(item.ip)); });
                        if (set.size > 0) return set;
                    }
                } catch (e) {}
                const ipv4Regex = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;
                (text.match(ipv4Regex) || []).forEach(ip => { if (!ip.startsWith('10.') && !ip.startsWith('192.168.') && !ip.startsWith('127.')) set.add(ip); });
                const ipv6Regex = /(?:[A-F0-9]{1,4}:){7}[A-F0-9]{1,4}|(?:[A-F0-9]{1,4}:)*:[A-F0-9]{1,4}(?::[A-F0-9]{1,4})*/gi;
                (text.match(ipv6Regex) || []).forEach(ip => { if (ip.length > 7 && ip.includes(':') && !ip.startsWith('::1')) set.add(ip.startsWith('[') ? ip : `[${ip}]`); });
            } catch (e) {}
            return set;
        }

        if (url.pathname === '/api/get-remote-ips') {
            if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
            try {
                const reqType = (url.searchParams.get('type') || 'all').toLowerCase();
                const validIPs = new Set();
                let sourceName = '综合混合源(四源并发)';

                if (reqType === 'all') {
                    const [s1, s2, s3, s4] = await Promise.all([
                        extractIPsFromSource('https://api.uouin.com/cloudflare.html'),
                        extractIPsFromSource('https://raw.githubusercontent.com/ZhiXuanWang/cf-speed-dns/refs/heads/main/ipTop10.html'),
                        extractIPsFromSource('https://ip.164746.xyz/'),
                        extractIPsFromSource('https://www.wetest.vip/page/cloudflare/address_v4.html')
                    ]);
                    s1.forEach(i => validIPs.add(i)); s2.forEach(i => validIPs.add(i)); s3.forEach(i => validIPs.add(i)); s4.forEach(i => validIPs.add(i));
                } else if (['电信', '联通', '移动', '多线', 'ipv6'].includes(reqType)) {
                    sourceName = reqType + '专属(uouin)';
                    try {
                        const res1 = await fetch('https://api.uouin.com/cloudflare.html', { headers: { 'User-Agent': 'Mozilla/5.0' } });
                        if (res1.ok) {
                            const text1 = await res1.text(); const cleanText = text1.replace(/<[^>]+>/g, ' ');
                            const regex = /(电信|联通|移动|多线|ipv6)\s+((?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-fA-F0-9]{1,4}:)+[a-fA-F0-9]{1,4})/gi;
                            let match; while ((match = regex.exec(cleanText)) !== null) {
                                if (match[1].toLowerCase() === reqType) { let ip = match[2]; if (ip.includes(':') && !ip.startsWith('[')) ip = `[${ip}]`; validIPs.add(ip); }
                            }
                        }
                    } catch (e) {}
                } else if (reqType === '优选') {
                    sourceName = '顶尖优选库(cf-speed-dns)';
                    const s = await extractIPsFromSource('https://raw.githubusercontent.com/ZhiXuanWang/cf-speed-dns/refs/heads/main/ipTop10.html');
                    s.forEach(i => validIPs.add(i));
                } else if (PRESET_SOURCES[reqType]) {
                    sourceName = PRESET_SOURCES[reqType].name;
                    const s = await extractIPsFromSource(PRESET_SOURCES[reqType].url);
                    s.forEach(i => validIPs.add(i));
                }
                const uniqueIPArray = Array.from(validIPs);
                for (let i = uniqueIPArray.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [uniqueIPArray[i], uniqueIPArray[j]] = [uniqueIPArray[j], uniqueIPArray[i]]; }
                return Response.json({ success: true, name: sourceName, ips: uniqueIPArray.slice(0, 10), totalCount: uniqueIPArray.length });
            } catch (error) { return Response.json({ success: false, error: error.message }, { status: 500 }); }
        }

        // ==========================================
        // 2.5 数据库路由管理 API 
        // ==========================================
        if (url.pathname === '/api/routes/reorder' && request.method === 'POST') {
if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
                        if (!env.DB) return Response.json({ success: false, error: "未绑定 DB" });
            try {
                const items = await request.json(); 
                const stmts = items.map(item => env.DB.prepare('UPDATE routes SET sort_order = ? WHERE prefix = ?').bind(item.sort_order, item.prefix));
                await env.DB.batch(stmts);
                return Response.json({ success: true });
            } catch (e) { return Response.json({ success: false, error: e.message }); }
        }

        if (url.pathname === '/api/routes/import' && request.method === 'POST') {
if (ROLE !== 'admin') return new Response('Forbidden', { status: 403 });
                        if (!env.DB) return Response.json({ success: false, error: "未绑定 DB" });
            try {
                // v3.5.0:路由表 schema 初始化仅首次执行
                await ensureRoutesSchema(env);
                const routes = await request.json();
                for (const r of routes) {
                    if (r.prefix && r.target && !r.owner) {
                        await env.DB.prepare('INSERT OR REPLACE INTO routes (prefix, target, mode, remark, last_play, icon, cache_img, sort_order, custom_ip, watch_limit, node_user, node_pass, redirect_direct, redirect_rules, emos_id, emos_name, emos_aggregate, strm_opt, force_direct) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                            .bind(r.prefix, r.target, r.mode || 'off', r.remark || '', r.last_play || '', r.icon || '', r.cache_img || 'on', r.sort_order || 0, r.custom_ip || '', r.watch_limit || '0', r.node_user || '', r.node_pass || '', r.redirect_direct === 'on' ? 'on' : 'off', r.redirect_rules || '', r.emos_id || '', r.emos_name || '', r.emos_aggregate === 'on' ? 'on' : 'off', r.strm_opt === 'on' ? 'on' : 'off', r.force_direct === 'on' ? 'on' : 'off').run();
                    }
                }
                return Response.json({ success: true });
            } catch (e) { return Response.json({ success: false, error: e.message }); }
        }

        // 提取源站域名(去协议/端口/路径/末尾斜杠,兼容 IP 与 IPv6 括号写法),用于重复节点检测
        function extractDomain(target) {
            if (!target) return '';
            let t = String(target).trim();
            t = t.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
            t = t.split('/')[0];
            if (t.startsWith('[') && t.includes(']')) t = t.slice(0, t.indexOf(']') + 1);
            t = t.replace(/:\d+$/, '');
            return t.toLowerCase();
        }

        if (url.pathname.startsWith('/api/routes')) {
            if (!env.DB) return Response.json({ error: "由于未绑定 D1 数据库，反代功能不可用。" }, { status: 500 });

            // —— 提速:路由表 schema 初始化(建表/加列)仅首次执行,后续请求直接查表 ——
            await ensureRoutesSchema(env);
// 节点路由权限:GET 登录即可;POST 仅管理员/子管理员/已开通添加权限的订阅用户/真用户(均可新增,子管理员/订阅者仅新增,真用户可编辑自己的);DELETE 仅管理员/真用户(仅自己的)
if (request.method === 'DELETE' && ROLE !== 'admin' && ROLE !== 'user') return new Response('Forbidden', { status: 403 });
if (request.method === 'POST' && ROLE !== 'admin' && ROLE !== 'subadmin' && ROLE !== 'user') {
    if (ROLE !== 'sub' || !(await subCanAdd(env, getCookie(request, 'admin_token')))) return new Response('Forbidden', { status: 403 });
}
            
            // 数据防爆清理策略：自动清理过去 7 天的精细日志(限频 10 分钟一次,避免每次请求都触发 D1 写入;排行榜仅统计近 7 天)
            if (Date.now() - lastLogsCleanAt > 600000) {
                try { await env.DB.exec(`DELETE FROM visitor_logs WHERE timestamp < datetime('now', '-7 days')`); } catch(e) {}
                // v3.4.67:播放热力图保留 30 天(day 为 UTC+8 日期串,字符串比较小于 30 天前即删)
                try {
                    const cutDay = new Date(Date.now() + 8 * 3600000 - 30 * 86400000).toISOString().split('T')[0];
                    await env.DB.prepare(`DELETE FROM play_hits WHERE day < ?`).bind(cutDay).run();
                } catch(e) {}
                // v3.4.68:数据防爆补全——其余只增不删的表随限频一并清理
                try { await env.DB.prepare(`DELETE FROM proxy_hits WHERE ts < ?`).bind(Date.now() - 30 * 86400000).run(); } catch(e) {}   // 代理令牌命中保留 30 天
                try {
                    const cutDay90 = new Date(Date.now() + 8 * 3600000 - 90 * 86400000).toISOString().split('T')[0];
                    await env.DB.prepare(`DELETE FROM request_stats WHERE date < ?`).bind(cutDay90).run();   // 节点×日计数保留 90 天
                } catch(e) {}
                try { await env.DB.exec(`DELETE FROM admin_node_logs WHERE created_at < datetime('now', '-90 days')`); } catch(e) {}   // 子管理员操作日志保留 90 天
                try { await env.DB.exec(`DELETE FROM node_requests WHERE status != 'pending' AND created_at < datetime('now', '-90 days')`); } catch(e) {}   // 已处理申请保留 90 天,pending 不清
                lastLogsCleanAt = Date.now();
            }

            //  【方案A修复版】：独立并发查流，完美绕过 CF 免费版复杂度限制！
            if (request.method === 'GET') {
                // 流量统计与节点列表分离:列表只读 D1(毫秒级)+ 内存缓存;逐节点向 CF 查流量放到 /api/routes/bandwidth,由页面分批补齐
                // (之前列表必须等所有节点的 CF GraphQL 查完才返回:110 个节点 ≈ 近 1 分钟,且免费版单请求子请求上限 50 会直接超限)
                const isBwEndpoint = url.pathname === '/api/routes/bandwidth';
                const todayStr = new Date(Date.now() + 8 * 3600000).toISOString().split('T')[0];
                let whereSql = " WHERE IFNULL(r.owner, '') = '' ";
                let bindArgs = [todayStr];
                if (ROLE === 'user' && AUTH_USER) { whereSql = " WHERE r.owner = ? "; bindArgs = [String(AUTH_USER.id), todayStr]; }
                let { results: routes } = await env.DB.prepare(`
                    SELECT r.*, 
                    IFNULL(s.count, 0) as todayReqs,
                    (SELECT SUM(count) FROM request_stats WHERE prefix = r.prefix) as totalReqs
                    FROM routes r 
                    LEFT JOIN request_stats s ON r.prefix = s.prefix AND s.date = ? ${whereSql}
                    ORDER BY r.sort_order ASC, r.prefix ASC
                `).bind(...bindArgs).all();

                // —— v3.4.48:搜索参数 q(服务端按源站链接/域名/备注/后缀匹配;订阅用户看不到 target 也能用链接搜出节点,返回仍剥离 target 不泄露)—— 
                const searchQ = (url.searchParams.get('q') || '').trim().toLowerCase();
                if (searchQ) {
                    const qDomain = extractDomain(searchQ);
                    routes = routes.filter(r => {
                        const t = String(r.target || '').toLowerCase();
                        const tDomain = extractDomain(r.target);
                        if (t && t.includes(searchQ)) return true;
                        if (qDomain && tDomain && tDomain.includes(qDomain)) return true;
                        if (String(r.remark || '').toLowerCase().includes(searchQ)) return true;
                        if (String(r.prefix || '').toLowerCase().includes(searchQ)) return true;
                        return false;
                    });
                }

                // 带宽统计只对管理员查询:非管理员(子管理员/订阅用户)只查节点,直接跳过 CF GraphQL,节点列表秒出
                let bwRemaining = 0;
                if (ROLE === 'admin' && env.CF_API_TOKEN && env.CF_ZONE_ID && routes && routes.length > 0) {
                    const end = new Date();
                    const beijingTime = new Date(end.getTime() + 8 * 3600000);
                    beijingTime.setUTCHours(0, 0, 0, 0);
                    const start = new Date(beijingTime.getTime() - 8 * 3600000);
                    const nowTs = Date.now();

                    // —— 提速:带宽统计结果内存缓存 2 分钟,避免每次打开面板都并发打 CF GraphQL ——
                    // 管理员可多等:并发 8 + 单次 20 秒超时 + 失败自动重试一次,尽量让所有节点流量都查出来(订阅用户/子管理员不查流量,节点列表仍秒出)
                    const pending = routes.filter(r => {
                        const hit = bandwidthCache.get(r.prefix);
                        if (hit && hit.expires > nowTs) { r.todayBandwidth = hit.value; return false; }
                        return true;
                    });
                    // 普通列表请求不查 CF:未缓存的先标「统计中…」;/api/routes/bandwidth 每次只查一小批(≤20 个,含重试也在 50 子请求内)
                    const BW_BATCH = 20;
                    const batch = isBwEndpoint ? pending.slice(0, BW_BATCH) : [];
                    if (!isBwEndpoint) pending.forEach(r => { r.todayBandwidth = '统计中…'; });
                    bwRemaining = isBwEndpoint ? Math.max(0, pending.length - batch.length) : pending.length;
                    let cursor = 0;
                    // 单节点今日流量查询:失败(超时/429/异常)自动重试一次,两次都失败返回 null
                    async function fetchNodeBytes(prefix, geq, leq) {
                        const q = { query: `query {
                              viewer {
                                zones(filter: {zoneTag: "${env.CF_ZONE_ID}"}) {
                                  httpRequestsAdaptiveGroups(
                                    limit: 1,
                                    filter: {
                                      clientRequestPath_like: "/${prefix}%",
                                      datetime_geq: "${geq}",
                                      datetime_leq: "${leq}"
                                    }
                                  ) {
                                    sum { edgeResponseBytes }
                                  }
                                }
                              }
                            }` };
                        for (let attempt = 0; attempt < 2; attempt++) {
                            try {
                                const cfRes = await fetch('https://api.cloudflare.com/client/v4/graphql', {
                                    method: 'POST',
                                    headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
                                    body: JSON.stringify(q),
                                    signal: AbortSignal.timeout(20000)
                                });
                                const cfData = await cfRes.json();
                                if (cfData && cfData.data) return cfData.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups?.[0]?.sum?.edgeResponseBytes || 0;
                                if (attempt === 0) await new Promise(res => setTimeout(res, 300));
                            } catch (e) {
                                if (attempt === 0) await new Promise(res => setTimeout(res, 300));
                            }
                        }
                        return null;
                    }
                    async function bwWorker() {
                        while (cursor < batch.length) {
                            const r = batch[cursor++];
                            const bytes = await fetchNodeBytes(r.prefix, start.toISOString(), end.toISOString());
                            if (bytes === null) { r.todayBandwidth = "获取异常"; bandwidthCache.set(r.prefix, { expires: nowTs + 30000, value: "获取异常" }); continue; }   // 失败也短暂缓存 30 秒,避免客户端循环重复查同一批
                            let formatted = "0 B";
                            if (bytes >= 1099511627776) formatted = (bytes / 1099511627776).toFixed(2) + " TB";
                            else if (bytes >= 1073741824) formatted = (bytes / 1073741824).toFixed(2) + " GB";
                            else if (bytes >= 1048576) formatted = (bytes / 1048576).toFixed(2) + " MB";
                            else if (bytes >= 1024) formatted = (bytes / 1024).toFixed(2) + " KB";
                            else if (bytes > 0) formatted = bytes + " B";
                            r.todayBandwidth = formatted;
                            bandwidthCache.set(r.prefix, { expires: nowTs + BANDWIDTH_CACHE_TTL, value: formatted });
                        }
                    }
                    await Promise.all(Array.from({ length: Math.min(8, batch.length) }, bwWorker));
                }
                
                if (isBwEndpoint) {
                    const bw = {};
                    (routes || []).forEach(r => { if (r.todayBandwidth && r.todayBandwidth !== '统计中…') bw[r.prefix] = r.todayBandwidth; });
                    return Response.json({ bw: bw, remaining: bwRemaining });
                }
                // 订阅者不可见源站链接（target 字段剥离，防止直接调 API 查看源站）
                if (ROLE === 'sub' && Array.isArray(routes)) {
                    routes = routes.map(r => { const c = { ...r }; delete c.target; return c; });
                }
                return Response.json(routes || []);
            }
            
            if (request.method === 'POST') {
                const data = await request.json();
                // 真用户:只能增删改自己的节点(以 /专属后缀/节点名 形式),不允许 oldPrefix 编辑他人节点
                if (ROLE === 'user' && AUTH_USER) {
                    try {
                        const u = AUTH_USER; const uid = String(u.id);
                        let nodeName = String(data.prefix || '').trim().replace(/^\/+/, '');
                        if (nodeName.startsWith(u.suffix + '/')) nodeName = nodeName.slice(u.suffix.length + 1);
                        if (!USER_NODE_RE.test(nodeName)) return Response.json({ success: false, error: '节点名需为 1-32 位字母/数字/下划线/短横线' });
                        const fullPrefix = u.suffix + '/' + nodeName;
                        const oldPrefix = String(data.oldPrefix || '').trim().replace(/^\/+/, '');
                        let oldRow = null;
                        if (oldPrefix) {
                            oldRow = await env.DB.prepare('SELECT * FROM routes WHERE prefix = ?').bind(oldPrefix).first();
                            if (!oldRow || String(oldRow.owner || '') !== uid) return Response.json({ success: false, error: '节点不存在' });
                        } else {
                            const cnt = await env.DB.prepare('SELECT COUNT(*) AS c FROM routes WHERE owner = ?').bind(uid).first();
                            if (cnt && cnt.c >= u.max_nodes) return Response.json({ success: false, error: '节点数量已达上限(' + u.max_nodes + ' 个),如需更多请联系管理员' });
                        }
                        const conflict = await env.DB.prepare('SELECT prefix FROM routes WHERE prefix = ?').bind(fullPrefix).first();
                        if (conflict && fullPrefix !== oldPrefix) return Response.json({ success: false, error: '节点名「' + nodeName + '」已存在,请换一个' });
                        const tDomains = String(data.target || '').split(',').map(t => extractDomain(t)).filter(Boolean);
                        if (!oldPrefix && tDomains.length > 0) {
                            const mine = (await env.DB.prepare('SELECT prefix, remark, target FROM routes WHERE owner = ?').bind(uid).all()).results || [];
                            for (const d of tDomains) {
                                const hit = mine.find(r => extractDomain(r.target) === d);
                                if (hit) return Response.json({ success: false, error: '你已有相同源站的节点「' + (hit.remark || hit.prefix) + '」,请勿重复添加' });
                            }
                        }
                        const parsedRules = parseRedirectRules(data.redirect_rules);
                        const rulesJson = parsedRules.length ? JSON.stringify(parsedRules) : '';
                        const oldSort = oldRow ? (oldRow.sort_order || 0) : 0;
                        const modeOk = ['off', 'realip_only', 'dual', 'strict', 'emos'].indexOf(data.mode) >= 0 ? data.mode : 'off';
                        if (oldRow && oldPrefix !== fullPrefix) {
                            await env.DB.prepare('UPDATE routes SET prefix = ? WHERE prefix = ? AND owner = ?').bind(fullPrefix, oldPrefix, uid).run();
                        }
                        await env.DB.prepare('INSERT OR REPLACE INTO routes (prefix, target, mode, remark, icon, cache_img, sort_order, custom_ip, watch_limit, node_user, node_pass, redirect_direct, redirect_rules, emos_id, emos_name, emos_aggregate, strm_opt, force_direct, owner) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                            .bind(fullPrefix, data.target, modeOk, data.remark || '', data.icon || '', data.cache_img === 'off' ? 'off' : 'on', oldSort, data.fakeIp || '', data.watchLimit || '0', data.nodeUser || '', data.nodePass || '', data.redirect_direct === 'on' ? 'on' : 'off', rulesJson, data.emosId || '', data.emosName || '', data.emosAggregate === 'on' ? 'on' : 'off', data.strmOpt === 'on' ? 'on' : 'off', data.forceDirect === 'on' ? 'on' : 'off', uid).run();
                        memoDelPrefix('route:');
                        return Response.json({ success: true });
                    } catch (e) { return Response.json({ success: false, error: '保存失败：' + e.message }); }
                }
                // 仅管理员可编辑(带 oldPrefix 视为编辑);子管理员与已授权订阅用户只能新增
                if (ROLE !== 'admin' && data.oldPrefix) return new Response('Forbidden', { status: 403 });
                // —— 真用户系统:节点名不能占用用户专属后缀(否则 /后缀/xxx 路由会被用户节点抢走)——
                if (ROLE !== 'user') {
                    try { const usHit = (await getUsersCached(env)).find(u => u.suffix === String(data.prefix || '').trim()); if (usHit) return Response.json({ success: false, error: '该名称已被用户专属后缀「' + usHit.suffix + '」占用,请更换' }); } catch (e) {}
                }
                // —— v3.4.46:后缀占用检查(新增/改名时若目标后缀已被其他节点占用,直接拒绝,防止 INSERT OR REPLACE 静默覆盖旧节点)——
                const prefixConflict = await env.DB.prepare('SELECT prefix FROM routes WHERE prefix = ?').bind(data.prefix).first();
                if (prefixConflict && prefixConflict.prefix !== data.oldPrefix) {
                    return Response.json({ success: false, error: '该后缀已被占用（/' + prefixConflict.prefix + '），请更换后缀' });
                }
                // —— v3.4.46:源站域名重复检查(仅新增执行,编辑/批量改模式跳过以免历史重复节点误拦;去协议/端口/路径后比较域名,订阅用户换后缀/换名字重复添加同源站会被拦)——
                if (!data.oldPrefix && String(data.target || '').trim()) {
                    const tDomains = String(data.target || '').split(',').map(t => extractDomain(t)).filter(Boolean);
                    if (tDomains.length > 0) {
                        const allRouteRows = (await env.DB.prepare('SELECT prefix, target, remark FROM routes').all()).results || [];
                        for (const td of tDomains) {
                            const hit = allRouteRows.find(r => extractDomain(r.target) === td);
                            if (hit) return Response.json({ success: false, error: '已存在相同源站链接的节点「' + (hit.remark || hit.prefix) + '」(/' + hit.prefix + ')，请勿重复添加' });
                        }
                    }
                }
                let currentSortOrder = 0;
                if (data.oldPrefix && data.oldPrefix !== data.prefix) {
                    const oldRow = await env.DB.prepare('SELECT sort_order FROM routes WHERE prefix = ?').bind(data.oldPrefix).first();
                    if(oldRow) currentSortOrder = oldRow.sort_order;
                    await env.DB.prepare('DELETE FROM routes WHERE prefix = ?').bind(data.oldPrefix).run();
                } else {
                    const oldRow = await env.DB.prepare('SELECT sort_order FROM routes WHERE prefix = ?').bind(data.prefix).first();
                    if(oldRow) currentSortOrder = oldRow.sort_order;
                }
                
                const parsedRules = parseRedirectRules(data.redirect_rules);
                const rulesJson = parsedRules.length ? JSON.stringify(parsedRules) : '';
                await env.DB.prepare('INSERT OR REPLACE INTO routes (prefix, target, mode, remark, icon, cache_img, sort_order, custom_ip, watch_limit, node_user, node_pass, redirect_direct, redirect_rules, emos_id, emos_name, emos_aggregate, strm_opt, force_direct) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                    .bind(data.prefix, data.target, data.mode || 'off', data.remark || '', data.icon || '', data.cache_img || 'on', currentSortOrder, data.fakeIp || '', data.watchLimit || '0', data.nodeUser || '', data.nodePass || '', data.redirect_direct === 'on' ? 'on' : 'off', rulesJson, data.emosId || '', data.emosName || '', data.emosAggregate === 'on' ? 'on' : 'off', data.strmOpt === 'on' ? 'on' : 'off', data.forceDirect === 'on' ? 'on' : 'off').run();
                // 成员添加节点审计:子管理员/已授权订阅用户直接添加节点时记录 IP 与设备,供管理员排查乱加(保留 7 天,可一键封禁)
                if (ROLE === 'subadmin' || (ROLE === 'sub' && await subCanAdd(env, getCookie(request, 'admin_token')))) {
                    try {
                        const logIp = request.headers.get('cf-connecting-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || request.headers.get('x-real-ip') || '';
                        const logUa = request.headers.get('user-agent') || '';
                        await ensureAdminNodeLogs(env);
                        await env.DB.prepare('INSERT INTO admin_node_logs (name, url, prefix, ip, ua, actor) VALUES (?, ?, ?, ?, ?, ?)').bind(data.remark || data.prefix, data.target || '', data.prefix || '', logIp, logUa, ROLE).run();
                    } catch (e) {}
                }
                return Response.json({ success: true });
            }
            
            if (request.method === 'DELETE') {
                const prefix = url.searchParams.get('prefix');
                if (ROLE === 'user' && AUTH_USER) {
                    const r = await env.DB.prepare('DELETE FROM routes WHERE prefix = ? AND owner = ?').bind(prefix, String(AUTH_USER.id)).run();
                    memoDelPrefix('route:');
                    return Response.json({ success: !!r && !!(r.meta && r.meta.changes > 0) });
                }
                await env.DB.prepare('DELETE FROM routes WHERE prefix = ?').bind(prefix).run(); memoDelPrefix('route:'); return Response.json({ success: true });
            }
            return new Response("Method not allowed", { status: 405 });
        }

        // ==========================================
        // 2.6 核心反代与调度引擎（修播放）
        // ==========================================
        let targetUrls = []; let currentMode = 'off'; let enableCache = true; let remainingPath = '';
        let redirectDirect = false; let redirectRules = []; let strmOpt = false; let forceDirect = false;
        let decodedPath; try { decodedPath = decodeURIComponent(url.pathname); } catch (e) { decodedPath = url.pathname; } let matchedPrefix = null; 
        let proxyOrigin = new URL(request.url).origin;

        // 反代 Token 门禁：开启后代理路径必须带 /密钥/ 前缀
        if (!url.pathname.startsWith('/api/') && url.pathname !== '/') {
            const pt = await getProxyToken(env);
            if (pt && pt.enabled && pt.key) {
                const prefixPath = '/' + pt.key + '/';
                let stripped = null;
                if (decodedPath === '/' + pt.key) stripped = '/';
                else if (decodedPath.indexOf(prefixPath) === 0) stripped = decodedPath.slice(prefixPath.length - 1);
                if (stripped === null) {
                    await recordProxyHit(env, request, decodedPath);
                    return Response.redirect(new URL('/catch', proxyOrigin), 302);
                }
                decodedPath = stripped;
            }
        }

        // 判断哪些请求可以按静态资源处理。
        // 这里把 Emby/Jellyfin 常见图片目录也纳入判断，是因为 UHD 海报/Backdrop
        // 不一定总带标准图片后缀；如果只按 .jpg/.webp 等后缀识别，部分图片请求会被当成普通接口，
        // 后续重定向、缓存和源站防盗链处理策略就可能不匹配，导致高清图加载失败。
        function isStaticPath(pathname) {
            return /\.(jpg|jpeg|gif|png|svg|ico|webp|js|css|woff2?|ttf|otf|map|webmanifest|srt|ass|vtt|sub)$/i.test(pathname)
                || /(\/Images\/|\/Icons\/|\/Branding\/|\/emby\/covers\/|\/img\/)/i.test(pathname);
        }

        // 判断当前请求是否携带登录态或访问令牌。
        // 带鉴权信息的图片/API 不能盲目交给 Cloudflare 长缓存，否则不同用户、不同 token
        // 可能命中同一份缓存，轻则拿到过期图片，重则造成串号风险。UHD 图片经常带 api_key
        // 或 X-Emby-Token，这里专门识别出来，让这类请求继续按源站实时响应处理。
        function hasAuthLikeState(headers, targetUrl) {
            const authQueryKeys = ['api_key', 'x-emby-token', 'x-mediabrowser-token', 'access_token', 'token'];
            const hasAuthQuery = Array.from(targetUrl.searchParams.keys()).some(key => authQueryKeys.includes(key.toLowerCase()));
            return headers.has("Authorization")
                || headers.has("X-Emby-Token")
                || headers.has("X-MediaBrowser-Token")
                || headers.has("X-Emby-Authorization")
                || headers.has("Cookie")
                || hasAuthQuery;
        }

        // ==========================================
        // 边缘缓存(v3.4.43 起仅静态资源):只缓存海报/图片/js/css/字体等安全资源,
        // 视频流一律不进 CF 边缘缓存(曾拖慢首播),直接反代取流。
        // ==========================================

        // 判定为「绝不能缓存」的路径:转码会话分片/播放列表/直播/下载/用户与会话类 API。
        // 这些要么是会话内临时内容(缓存键不稳定),要么含用户身份,要么实时变化,缓存只会出错。
        function isNoCachePath(targetUrl) {
            const p = targetUrl.pathname.toLowerCase();
            return /(\/hls\d*\/|\.m3u8$|\.mpd$|\/live\/|\/download$|\.strm$|\/users\/|\/sessions\/|\/playbackinfo|\/activeencodings|\/sync\/|\/shows\/|\/mediainfo|\/livestream)/.test(p);
        }

        // 兜底总入口:能判定安全才返回 CF 缓存配置,其余一律返回 null(原样回源)。
        // 只缓存 200/206(200-299);301/302/303/307/308 重定向与 401/403/404/5xx 全部 TTL=0 不缓存,
        // 避免把带第一个用户 token 的 302 或错误响应共享给后续用户。
        function edgeCacheCfOption(request, targetUrl, isStaticOrImage, authLikeState) {
            if (!enableCache) return null;                     // 节点缓存开关(cache_img)关闭 → 全部不缓存
            if (!isStaticOrImage) return null;                 // 仅海报/静态资源;视频流一律直接反代(v3.4.43)
            if (request.method !== 'GET') return null;         // 仅 GET,其余(含 POST 播放接口)一律回源
            if (isNoCachePath(targetUrl)) return null;         // 转码/列表/直播/下载/API 兜底
            try {
                // 静态资源:维持旧版保守逻辑,带鉴权态(含 token 的图片/API)不缓存,防串号
                if (!authLikeState) {
                    return { cacheEverything: true,
                             cacheTtlByStatus: { "200-299": EDGE_CACHE_STATIC_TTL,
                                                "301-308": 0, "401-403": 0, "404": 0, "500-599": 0 } };
                }
            } catch (e) {}
            return null; // 兜底:任何无法判定的情况一律不缓存,原样回源
        }

        function stripPanelCookie(headers) {
            const cookie = headers.get("Cookie");
            if (!cookie) return;
            const keptCookies = cookie.split(";").map(item => item.trim()).filter(item => item && !item.toLowerCase().startsWith("admin_token="));
            if (keptCookies.length > 0) headers.set("Cookie", keptCookies.join("; "));
            else headers.delete("Cookie");
        }

        function rewriteSetCookieForProxy(headers) {
            const getSetCookie = headers.getSetCookie ? headers.getSetCookie.bind(headers) : null;
            const rawSetCookie = headers.get("Set-Cookie");
            const cookies = getSetCookie ? getSetCookie() : (rawSetCookie ? rawSetCookie.split(/,(?=\s*[^;,]+=)/g) : []);
            if (cookies.length === 0) return;
            headers.delete("Set-Cookie");
            for (const cookie of cookies) headers.append("Set-Cookie", cookie.replace(/;\s*Domain=[^;]*/ig, ""));
        }

        // 收集所有源站 origin，并同时加入 http/https 的互换版本。
        // 实际返回的 JSON 里可能混用 http 与 https，例如线路配置是 https，
        // 但 Emby 返回的图片地址仍是 http。两个 origin 都纳入重写范围，
        // 才能避免 UHD 图片直连源站而绕过当前 Worker 代理。
        function getTargetOrigins(targets) {
            const origins = [];
            for (const target of targets) {
                try {
                    const parsed = new URL(target);
                    const origin = parsed.origin;
                    const alternateOrigin = (parsed.protocol === 'https:' ? 'http:' : 'https:') + '//' + parsed.host;
                    if (!origins.includes(origin)) origins.push(origin);
                    if (!origins.includes(alternateOrigin)) origins.push(alternateOrigin);
                } catch (e) {}
            }
            return origins;
        }

        // 把源站返回的图片/媒体 URL 改写成当前 Worker 代理 URL。
        // 修复 UHD 图片加载失败的核心原因在这里：部分接口返回的是绝对源站地址，
        // 浏览器会直接去访问源站，导致跨域、鉴权、源站不可达或被防盗链拦截。
        // 改写后所有图片请求都会重新经过 Worker，由 Worker 带着正确 header 转发到源站。
        function rewriteSourceUrlString(value, targetOrigins, proxyOrigin, safePrefix) {
            // 快速预检(结果与原逻辑完全一致):源站域名与相对图片路径都必含 '/',
            // 不含 '/' 的字段(标题/日期/ID 等绝大多数)直接返回;含 '/' 的再看是否真有源站域名或 /img/、/Images/
            if (value.indexOf('/') === -1) return value;
            let hit = false;
            for (let i = 0; i < targetOrigins.length; i++) { if (value.indexOf(targetOrigins[i]) !== -1) { hit = true; break; } }
            if (!hit && !/\/(?:img|images)\//i.test(value)) return value;
            let rewritten = value;
            const proxyPrefix = proxyOrigin + safePrefix + '/';
            for (const origin of targetOrigins) {
                let result = '';
                let cursor = 0;
                let index = rewritten.indexOf(origin);
                while (index !== -1) {
                    // 避免重复代理：如果地址已经是 Worker 前缀 + 源站 URL，
                    // 再追加一次会变成 /proxy/https://worker/proxy/http://origin 这类坏地址。
                    const alreadyProxied = rewritten.substring(Math.max(0, index - proxyPrefix.length), index) === proxyPrefix;
                    result += rewritten.substring(cursor, index);
                    result += alreadyProxied ? origin : proxyPrefix + origin;
                    cursor = index + origin.length;
                    index = rewritten.indexOf(origin, cursor);
                }
                if (cursor > 0) {
                    result += rewritten.substring(cursor);
                    rewritten = result;
                }
            }
            // 部分 UHD 图片接口返回相对路径，例如 /Items/{id}/Images/Primary。
            // 这类地址没有 origin，前面的绝对 URL 替换匹配不到，所以需要单独补上
            // Worker origin 和当前线路前缀，保证浏览器不会请求到面板根路径或错误节点。
            const relativeImagePattern = /(^|["'\s(])((?:\/img\/|\/emby\/Items\/[^"'\s)]+\/Images\/|\/Items\/[^"'\s)]+\/Images\/)[^"'\s)]*)/ig;
            rewritten = rewritten.replace(relativeImagePattern, (match, prefix, path) => {
                if (safePrefix && path.startsWith(safePrefix + '/')) return match;
                return prefix + proxyOrigin + safePrefix + path;
            });
            return rewritten;
        }

        // 递归处理 JSON 里的所有字符串字段。
        // UHD 图片地址不固定出现在某一个字段，可能藏在 ImageTags、BackdropImageTags、
        // Artwork、ProviderIds 或插件返回的嵌套对象里；只改顶层字段会漏掉一部分高清图。
        // 大 JSON 快路径:整段文本里没有任何相对图片路径时,只需把源站域名加上代理前缀——
        // 直接在原文上替换,省掉 JSON.parse + 递归遍历 + JSON.stringify(上万部片库的列表响应这三步最耗 CPU)。
        // 与逐字段改写的结果一致(含「已是代理地址不重复加前缀」的判断)。
        function rewriteOriginsInText(text, targetOrigins, proxyOrigin, safePrefix) {
            const proxyPrefix = proxyOrigin + safePrefix + '/';
            let rewritten = text;
            for (const origin of targetOrigins) {
                let index = rewritten.indexOf(origin);
                if (index === -1) continue;
                const parts = [];
                let cursor = 0;
                while (index !== -1) {
                    const alreadyProxied = rewritten.substring(Math.max(0, index - proxyPrefix.length), index) === proxyPrefix;
                    parts.push(rewritten.substring(cursor, index), alreadyProxied ? origin : proxyPrefix + origin);
                    cursor = index + origin.length;
                    index = rewritten.indexOf(origin, cursor);
                }
                parts.push(rewritten.substring(cursor));
                rewritten = parts.join('');
            }
            return rewritten;
        }
        function rewriteSourceUrlsInJson(value, targetOrigins, proxyOrigin, safePrefix) {
            if (typeof value === 'string') return rewriteSourceUrlString(value, targetOrigins, proxyOrigin, safePrefix);
            if (Array.isArray(value)) {
                let changed = false;
                const next = value.map(item => {
                    const rewritten = rewriteSourceUrlsInJson(item, targetOrigins, proxyOrigin, safePrefix);
                    if (rewritten !== item) changed = true;
                    return rewritten;
                });
                return changed ? next : value;
            }
            if (value && typeof value === 'object') {
                let changed = false;
                const next = {};
                for (const key of Object.keys(value)) {
                    const rewritten = rewriteSourceUrlsInJson(value[key], targetOrigins, proxyOrigin, safePrefix);
                    if (rewritten !== value[key]) changed = true;
                    next[key] = rewritten;
                }
                return changed ? next : value;
            }
            return value;
        }

        // 响应体被重写后必须移除这些和原始 body 强绑定的头。
        // 如果继续保留旧的 Content-Length/Content-Encoding/ETag，浏览器或中间缓存可能按旧长度、
        // 旧压缩格式校验新内容，表现为 JSON 截断、解压失败或缓存了未改写的图片 URL。
        function dropBodyIntegrityHeaders(headers) {
            headers.delete("Content-Length");
            headers.delete("Content-Encoding");
            headers.delete("ETag");
        }

        // 只有发现源站 URL 或典型图片相对路径时才解析并重写 JSON。
        // 这样可以避免每个普通 JSON 响应都做深度遍历，降低 Worker 开销；
        // 同时也确保包含 UHD 图片地址的响应不会被漏过。
        function hasJsonRewriteCandidate(text, targetOrigins) {
            return targetOrigins.some(origin => text.includes(origin))
                || /(^|["'\s(])(?:\/img\/|\/emby\/Items\/[^"'\s)]+\/Images\/|\/Items\/[^"'\s)]+\/Images\/)/i.test(text);
        }

        // 解析 302/307 域名规则文本（每行：域名,直连 或 域名,代理），返回 [{d, a}]
        function parseRedirectRules(text) {
            const rules = [];
            if (!text) return rules;
            // 兼容新前端提交的 JSON 数组格式 [{"d":"a.com","a":"direct"}]
            if (typeof text === 'string' && text.trim().charAt(0) === '[') {
                try {
                    const arr = JSON.parse(text);
                    if (Array.isArray(arr)) return arr.filter(x => x && x.d).map(x => ({ d: String(x.d).toLowerCase(), a: x.a === 'direct' ? 'direct' : 'proxy' }));
                } catch (e) {}
            }
            for (const line of String(text).split(/\r?\n/)) {
                const t = line.trim();
                if (!t) continue;
                const parts = t.split(',').map(s => s.trim());
                if (parts.length < 2 || !parts[0]) continue;
                let domain = parts[0].replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim();
                domain = domain.replace(/^www\./i, '');
                if (!domain || /\s|\//.test(domain)) continue;
                const action = /^(direct|直连|不走反代)$/i.test(parts[1]) ? 'direct' : (/^(proxy|代理|走反代)$/i.test(parts[1]) ? 'proxy' : null);
                if (!action) continue;
                rules.push({ d: domain.toLowerCase(), a: action });
            }
            return rules;
        }

        function rewriteRedirectLocation(location, targetUrl, targetOrigins, proxyOrigin, safePrefix) {
            if (!location) return location;
            if (location.startsWith('//')) {
                try {
                    const protocol = targetUrl ? targetUrl.protocol : new URL(targetOrigins[0]).protocol;
                    location = protocol + location;
                } catch (e) {}
            }
            if (location.startsWith('/')) {
                if (safePrefix && location.startsWith(safePrefix + '/')) return proxyOrigin + location;
                if (!safePrefix && targetUrl) return `${proxyOrigin}/${encodeURIComponent(new URL(location, targetUrl.origin).href)}`;
                return proxyOrigin + safePrefix + location;
            }
            try {
                const parsed = new URL(location);
                if (targetOrigins.includes(parsed.origin)) {
                    if (!safePrefix) return `${proxyOrigin}/${encodeURIComponent(location)}`;
                    return proxyOrigin + safePrefix + parsed.pathname + parsed.search + parsed.hash;
                }
            } catch (e) {}
            if (/^https?:\/\//i.test(location)) {
                // 跨源 Location:面板/前缀/encodeURIComponent(完整URL),与 Lite 参考实现一致。
                // 编码可避免 URL 内裸 ? & # 在响应头/二次请求时被解析错乱。
                // 「外部跳转直连」开关在 directExternal302 层已优先放行直连。
                return `${proxyOrigin}${safePrefix}/${encodeURIComponent(location)}`;
            }
            // 非 http(s) 或无法解析的 Location:降级为保留原值,不下发代理改写
            // (3.4.38 曾直接删除,部分服务器裸 Location 被丢弃导致播放断流,回退为历史行为)
            return location;
        }

        // 判断当前请求路径是否像 Emby / Jellyfin 体系的 API 或静态资源路径。
        // 这一步是给 UHD / HUD 这类“服务真实挂在 /emby 子路径下，但线路里只填了裸域名”的场景兜底用的。
        // 例如客户端请求 /uhd/Items/{id}/PlaybackInfo，当前脚本会先转发到源站的 /Items/{id}/PlaybackInfo。
        // 如果 HUD 实际服务入口是 /emby/Items/{id}/PlaybackInfo，那么源站通常会直接回 404。
        //
        // 普通 Emby 有两种常见部署方式：
        // 1. 根路径部署，API 就在 /Items /Videos /Sessions 下
        // 2. 子路径部署，API 在 /emby/Items /emby/Videos /emby/Sessions 下
        //
        // 之前脚本完全依赖面板里手动把 target 写成带 /emby 的完整地址；
        // 只要这一步没填对，普通首页可能还能打开，但播放相关接口会在拿 PlaybackInfo 时 404。
        // 这里加的是“只在像 Emby API 的路径上才启用”的保守识别，避免把其他完全无关的网站路径误补成 /emby。
        function isLikelyMediaServerPath(pathname) {
            return /^\/(?:Items|Videos|Audio|Sessions|Users|System|Library|LiveTv|Shows|Movies|Artists|Albums|Playlists|Channels|Packages|Devices|Socket|socket|web|emby|Images|Branding|Environment|DisplayPreferences|Trailers|Collections|Genres|Persons|Studios|Years)(?:\/|$)/i.test(pathname);
        }

        // 为单个 target 生成候选上游 URL。
        // 第一候选始终保持原行为，完全按“target + remainingPath”拼接。
        // 第二/第三候选只在以下条件满足时追加：
        // - 线路 target 本身没有子路径（说明面板里大概率填的是裸域名）
        // - 当前请求像 Emby API/资源路径
        //
        // 这里同时兼容两类常见偏差：
        // 1. 实际服务挂在 /emby 下，但客户端请求的是 /Items /Videos ...
        //    -> 自动补成 /emby/Items /emby/Videos
        // 2. 实际服务挂在根路径，但客户端自己固定补了 /emby/Items /emby/Videos
        //    -> 自动再试一次去掉 /emby 前缀后的 /Items /Videos
        //
        // 这样普通 Emby 和 HUD/UHD Emby 都可以在同一节点内完成“加 /emby”或“去 /emby”的双向回退，
        // 避免某些客户端因为固定拼接 /emby 而只在部分服务器上失效。
        function buildUpstreamCandidates(targetBase, remainingPath, search) {
            const candidates = [];
            const pushUnique = (value) => {
                if (value && !candidates.includes(value)) candidates.push(value);
            };

            const primary = targetBase + remainingPath + search;
            pushUnique(primary);

            try {
                const parsed = new URL(targetBase);
                const basePath = (parsed.pathname || '/').replace(/\/+$/, '') || '/';
                const requestPath = remainingPath || '/';

                // 只有当 target 本身没有配置任何子路径时，才尝试 /emby 回退。
                // 如果用户已经明确把线路写成了 https://host/emby，再补一次会变成 /emby/emby/...，
                // 这反而会把原本正确的请求打坏，所以这里必须先判断 basePath 是根路径。
                const hasNoBasePath = (basePath === '/');
                const requestAlreadyHasEmbyPrefix = /^\/emby(?:\/|$)/i.test(requestPath);

                if (hasNoBasePath && !requestAlreadyHasEmbyPrefix && isLikelyMediaServerPath(requestPath)) {
                    pushUnique(`${parsed.origin}/emby${requestPath}${search}`);
                }

                // 反向回退：
                // 某些客户端会固定把媒体/接口地址补成 /emby/...，但普通 Emby 真实入口其实在根路径。
                // 例如 PlaybackInfo 被客户端请求成 /emby/videos/...，源站根路径部署时会 404，
                // 这时自动再试一次去掉 /emby 前缀后的 /videos/...。
                if (hasNoBasePath && requestAlreadyHasEmbyPrefix && isLikelyMediaServerPath(requestPath)) {
                    const strippedRequestPath = requestPath.replace(/^\/emby(?=\/|$)/i, '') || '/';
                    pushUnique(`${parsed.origin}${strippedRequestPath}${search}`);
                }

                // 兼容“绝对 URL 透传”场景。
                // 你这次抓到的请求已经不是 /uhd/Items/...，而是：
                // /uhd/https://v1.uhdnow.com/Items/{id}/PlaybackInfo?... 
                //
                // 这说明客户端拿到的 PlaybackInfo 返回里已经是一个绝对地址，
                // Worker 也确实按“绝对 URL 反代”逻辑在工作；但问题是这个绝对地址本身少了 /emby，
                // 所以当前逻辑会老老实实去请求：
                // https://v1.uhdnow.com/Items/{id}/PlaybackInfo
                // 然后被源站 nginx 回 404。
                //
                // 这里额外补一个候选：
                // 如果 targetBase 自己已经是完整绝对 URL，且它的 pathname 看起来像 Emby API，
                // 但 pathname 又不是以 /emby 开头，那么自动再试一次：
                // https://host/emby + pathname
                //
                // 这样不管请求来自“线路前缀模式”还是“绝对 URL 透传模式”，
                // 只要真实上游挂在 /emby 子路径下，都能在同一节点内完成回退。
                const targetAlreadyHasEmbyPrefix = /^\/emby(?:\/|$)/i.test(parsed.pathname || '/');
                if (!targetAlreadyHasEmbyPrefix && isLikelyMediaServerPath(parsed.pathname || '/')) {
                    const passthroughSearch = parsed.search || search;
                    pushUnique(`${parsed.origin}/emby${parsed.pathname}${passthroughSearch}${parsed.hash || ''}`);
                }

                // 对“绝对 URL 透传”同样做一次反向 /emby 去除回退。
                // 这样如果客户端缓存/拼接出来的是 https://host/emby/videos/...，
                // 而真实普通 Emby 在根路径 /videos/...，当前节点内也能自动修复。
                //
                // 注意这里仍然是“补一个低优先级候选”，不会抢在原始 /emby 路径前面。
                // 所以 UHD/HUD 如果真实就是 /emby 子路径部署，主候选仍然会先命中；
                // 只有主候选失败后，才会尝试去掉 /emby，避免把原本正常的 UHD 路径扰乱。
                if (targetAlreadyHasEmbyPrefix && isLikelyMediaServerPath(parsed.pathname || '/')) {
                    const passthroughSearch = parsed.search || search;
                    const strippedPathname = (parsed.pathname || '/').replace(/^\/emby(?=\/|$)/i, '') || '/';
                    pushUnique(`${parsed.origin}${strippedPathname}${passthroughSearch}${parsed.hash || ''}`);
                }
            } catch (e) {}

            return candidates;
        }

        // 把 PlaybackInfo 里的媒体地址统一规范成“Worker 前缀下的根路径相对地址”。
        //
        // 这里不再按某个客户端做特判，而是尽量保留 Emby 原生字段的共同语义：
        // - 很多客户端期望拿到的是 path，而不是完整绝对 URL
        // - 但如果 path 里不带当前线路前缀，客户端一旦直接请求 /videos 或 /emby/videos，
        //   就会绕过 /{prefix}/... 这条代理路由，导致播放失败
        //
        // 因此统一输出为：
        // /{prefix} + 源站原始 path
        //
        // 例如：
        // - 源站是 /videos/...       -> /{prefix}/videos/...
        // - 源站是 /emby/videos/... -> /{prefix}/emby/videos/...
        //
        // 这里特意保留“源站原始 path”而不是强行统一成某一种固定格式，
        // 是因为你这次抓到的普通 Emby 和 UHD/HUD PlaybackInfo 都表明：
        // - API 请求常常走 /emby/Items/... /emby/Sessions/...
        // - 真正媒体直链 DirectStreamUrl 常常却是 /videos/...
        //
        // 也就是说，/emby 更像是 API 基路径，而 /videos 才是媒体流路径；
        // 如果在这里想当然地把媒体地址补成 /emby/videos/...，反而会把原本正确的普通 Emby 直链改坏。
        //
        // 这样可以同时兼容三类常见用法：
        // 1. 直接把字段当请求地址使用：会命中当前线路
        // 2. 浏览器按 root-relative 解析：仍然会命中当前线路
        // 3. 客户端拿到 path 后再自行拼 serverUrl：如果拼出了重复 prefix，
        //    后面的 normalizeRemainingPathForPlayback 会在入口做一次轻量修正
        function toWorkerPlaybackPath(pathname, search = '', hash = '', safePrefix = '') {
            const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
            return `${safePrefix}${normalizedPath}${search || ''}${hash || ''}`;
        }

        // v4.0.7:恢复为「根路径相对地址」(与 Pro 版 / 2.x 一致)。
        // 4.0.3 曾改成输出完整绝对地址,结果部分第三方播放器(只认同源相对路径、或会自行再拼一次
        // serverUrl 的)直接播不出来/一直 loading;相对路径由播放器按自己的服务器地址解析,
        // 多域名、http/https 混用都能正常工作。跨域媒体地址仍走 /{前缀}/{完整URL} 的透传代理形式。
        function rewritePlaybackMediaUrl(rawValue, targetUrl, proxyOrigin, safePrefix, targetOrigins) {
            return rewritePlaybackMediaUrlRel(rawValue, targetUrl, proxyOrigin, safePrefix, targetOrigins);
        }
        function rewritePlaybackMediaUrlRel(rawValue, targetUrl, proxyOrigin, safePrefix, targetOrigins) {
            if (typeof rawValue !== 'string') return rawValue;
            const trimmedValue = rawValue.trim();
            if (!trimmedValue) return rawValue;

            // 如果字段已经被改成当前 Worker 前缀下的路径，直接复用，避免重复叠加 prefix。
            if (safePrefix && trimmedValue.startsWith(safePrefix + '/')) return rawValue;

            // 某些客户端会缓存上一次的 PlaybackInfo，拿到的是完整 Worker 绝对地址。
            // 这里把它还原成 root-relative，继续保持“字段值是 path”的通用语义。
            if (safePrefix && trimmedValue.startsWith(proxyOrigin + safePrefix + '/')) {
                return trimmedValue.substring(proxyOrigin.length);
            }

            // 对绝对地址分两类处理：
            // 1. 同源绝对地址：保留源站原始 path，只在前面补 /{prefix}
            // 2. 跨源绝对地址：保留成 Worker 的“绝对 URL 透传代理”形式
            //
            // HUD / FWD 一类自研服务有时会在 PlaybackInfo 中返回完整绝对媒体地址，
            // 甚至媒体 host 与 API host 不同。这里如果只保留 pathname，会把真正的媒体源 host 丢掉，
            // 最终表现为 PlaybackInfo 成功、实际拉流失败。
            //
            // 因此跨源绝对地址必须继续走：
            // /{prefix}/https://real-media-host/...
            //
            // 这样 Worker 仍然能带着现有 header/回退逻辑去请求真实媒体地址，
            // 同时也不会把 HUD 明确依赖的 /emby 子路径语义抹掉。
            if (/^https?:\/\//i.test(trimmedValue)) {
                try {
                    const parsed = new URL(trimmedValue);
                    if (Array.isArray(targetOrigins) && !targetOrigins.includes(parsed.origin)) {
                        // 跨源媒体地址:面板/前缀/http://推流域名 拼接形式,由 CF Worker 反代取流
                        // (用户连接面板域名,流量经 CF)。3.4.40 曾裸直连推流域名,绕过
                        // 「外部跳转直连」开关语义——恢复代理形式。
                        return `${proxyOrigin}${safePrefix}/${trimmedValue}`;
                    }
                    return toWorkerPlaybackPath(parsed.pathname, parsed.search, parsed.hash, safePrefix);
                } catch (e) {
                    return rawValue;
                }
            }

            if (trimmedValue.startsWith('//')) {
                try {
                    const parsed = new URL(targetUrl.protocol + trimmedValue);
                    if (Array.isArray(targetOrigins) && !targetOrigins.includes(parsed.origin)) {
                        return `${proxyOrigin}${safePrefix}/${parsed.href}`; // 跨源:代理拼接形式
                    }
                    return toWorkerPlaybackPath(parsed.pathname, parsed.search, parsed.hash, safePrefix);
                } catch (e) {
                    return rawValue;
                }
            }

            if (trimmedValue.startsWith('/')) return toWorkerPlaybackPath(trimmedValue, '', '', safePrefix);

            try {
                const resolved = new URL(trimmedValue, targetUrl.origin + '/');
                return toWorkerPlaybackPath(resolved.pathname, resolved.search, resolved.hash, safePrefix);
            } catch (e) {
                return rawValue;
            }
        }

        // v4.0.3:判断一个播放地址是不是「源站内部/本机回环地址」。
        // 典型场景:Emby 与 Alist 同机部署,MediaSource.Path 是 http://127.0.0.1:5244/d/xxx.mkv,
        // 该地址只在 Emby 服务器内部有效。若把它包成 Worker 绝对透传地址,Cloudflare 边缘 fetch
        // 127.0.0.1 打到的是 CF 自己而非源站,必然 403。这种地址不能当直连地址下发,应让播放器
        // 走 Emby 标准 /emby/videos/{id}/stream 接口,由 Emby 服务端内部回环取流。
        function isPrivateMediaUrl(value) {
            if (typeof value !== 'string') return false;
            const m = /^https?:\/\/(\[[^\]]+\]|[^/?#:]+)/i.exec(value.trim());
            if (!m) return false;
            const raw = m[1].toLowerCase();
            if (raw.charAt(0) === '[') return raw === '[::1]';
            const host = raw.split(':')[0];
            if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true;
            return /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(host);
        }

        // 一些客户端会在拿到 PlaybackInfo 后自己再拼一次 serverUrl。
        // 如果我们返回的是 /{prefix}/videos/... 或 /{prefix}/emby/videos/...，
        // 某些客户端再自己拼一次 serverUrl 后，有时会拼出：
        // - /{prefix}/{prefix}/videos/...
        // - /{prefix}/emby/{prefix}/videos/...
        //
        // 这些其实都还是同一条线路，只是多叠了一层 prefix。
        // 这里在真正选路前做一次 O(1) 字符串归一化，把常见重复前缀修回标准路径，
        // 这样既不依赖某个特定客户端，也避免为此引入额外存储或更重的会话跟踪。
        function normalizeRemainingPathForPlayback(remainingPath, matchedPrefix, tokenPrefix) {
            if (!remainingPath || !matchedPrefix) return remainingPath;

            const prefixPath = `/${matchedPrefix}`;
            const embyDuplicatedPrefix = `/emby${prefixPath}`;

            // 开 token 时客户端二次拼接会拼出重复前缀，常见两类：
            //   /{token}/{节点}/emby/{token}/{节点}/videos/...   （客户端固定补 /emby）
            //   /{token}/{节点}/videos/{token}/{节点}/videos/... （视频路径本身以 /videos 开头）
            // 门禁剥掉首个 token 后 remainingPath = /emby/{token}/{节点}/... 或 /videos/{token}/{节点}/...，
            // 这里做通用剥离：只要前 3 段是 /{段1}/{token}/{节点} 就剥掉 token+节点；
            // 若 seg1 就是节点（纯节点重复形态 /{节点}/{token}/{节点}/...），剥光后直接保留剩余视频路径；
            // 否则保留 /{段1}，若剩余部分首段与段1 相同（如 /videos/{token}/{节点}/videos/...）再去重合并，
            // 兼容 emby / videos / stream 等任意视频 API 前缀，避免带着 /{token}/{节点} 打到源站返回 404。
            if (tokenPrefix) {
                const tokenDup = remainingPath.match(/^\/([^/]+)\/([^/]+)\/([^/]+)(?=\/|$)/);
                if (tokenDup && tokenDup[2] === tokenPrefix && (tokenDup[3] === matchedPrefix || tokenDup[1] === matchedPrefix)) {
                    const seg1 = tokenDup[1];
                    const rest = remainingPath.substring(tokenDup[0].length) || '/';
                    if (seg1 === matchedPrefix) return rest;
                    if (rest === '/' + seg1 || rest.startsWith('/' + seg1 + '/')) return rest;
                    return '/' + seg1 + rest;
                }
            }

            if (remainingPath === prefixPath || remainingPath.startsWith(prefixPath + '/')) {
                const stripped = remainingPath.substring(prefixPath.length);
                return stripped || '/';
            }

            if (remainingPath === embyDuplicatedPrefix || remainingPath.startsWith(embyDuplicatedPrefix + '/')) {
                const stripped = remainingPath.substring(embyDuplicatedPrefix.length);
                // 这里兼容两种客户端二次拼接结果：
                // 1. /emby/{prefix}/videos/...      -> 还原成 /emby/videos/...
                // 2. /emby/{prefix}/emby/videos/... -> 还原成 /emby/videos/...
                //
                // 第二种常见于“API 习惯性固定补 /emby 的客户端”：
                // PlaybackInfo 已经返回 /{prefix}/emby/videos/...，
                // 客户端又按自己的固定规则补了一层 /emby，最终会多出 /emby/{prefix}/emby/...。
                // 如果这里无脑再拼一次 /emby，会变成 /emby/emby/videos/...，反而把原本可修复的请求打坏。
                if (!stripped || stripped === '/') return '/emby/';
                if (/^\/emby(?:\/|$)/i.test(stripped)) return stripped;
                return `/emby${stripped}`;
            }

            return remainingPath;
        }

        let route = null;
        if (decodedPath.startsWith('/http://') || decodedPath.startsWith('/https://')) {
            // 裸域名直连代理开关:默认允许(与历史一致);关闭后仅允许已配置的节点前缀与 Token 前缀
            // v3.5.0:开关状态内存缓存 30 秒,不再每次裸请求查 D1
            if (!(await isBareProxyEnabled(env))) return new Response('Forbidden', { status: 403 });
            targetUrls = [decodedPath.substring(1)]; remainingPath = '';
        } else {
            const pathParts = decodedPath.split('/'); let prefix = pathParts[1]; let prefixSegs = 1; let userOwnerId = '';
            if (!prefix) return new Response(`Not Found`, { status: 404 });

            try {
                if (!env.DB) return new Response(`404: Node not found (DB not bound)`, { status: 404 });
                // v3.5.0:路由表 schema 初始化(建表/加列)仅首次执行,后续请求直接查表/走缓存
                await ensureRoutesSchema(env);
                // 真用户系统:第一段是某个用户的专属后缀 → 节点前缀为「后缀/节点名」(两段),并校验用户未被停用
                try {
                    const _us = (await getUsersCached(env)).find(u => u.suffix === prefix);
                    if (_us) {
                        if (!_us.enabled) return new Response('Forbidden', { status: 403 });
                        if (!pathParts[2]) return new Response(`Not Found`, { status: 404 });
                        prefix = prefix + '/' + pathParts[2]; prefixSegs = 2; userOwnerId = String(_us.id);
                    }
                } catch (e) {}
                // v3.5.0:节点配置内存缓存 10 秒(写操作后由 memoDelPrefix('route:') 失效),不再每次反代请求查 D1
                route = await memoStale('route:' + prefix, 10000, async () => {
                    const stmt = env.DB.prepare(`SELECT target, mode, cache_img, custom_ip, redirect_direct, redirect_rules, emos_id, emos_name, emos_aggregate, strm_opt, force_direct, owner FROM routes WHERE prefix = ?`);
                    return await stmt.bind(prefix).first();
                });
                if (!route || (prefixSegs === 2 && String(route.owner || '') !== userOwnerId)) { memoDel('route:' + prefix); return new Response(`404: Node not found`, { status: 404 }); }

                currentMode = route.mode || 'off'; enableCache = (route.cache_img !== 'off');
                redirectDirect = route.redirect_direct === 'on';
                strmOpt = route.strm_opt === 'on';
                forceDirect = route.force_direct === 'on' || env.FORCE_DIRECT_PLAY === '1';
                try { redirectRules = route.redirect_rules ? JSON.parse(route.redirect_rules) : []; if (!Array.isArray(redirectRules)) redirectRules = []; } catch (e) { redirectRules = []; }
                matchedPrefix = prefix; remainingPath = '/' + pathParts.slice(1 + prefixSegs).join('/');
                let tokenPrefixForNormalize = '';
                try { const ptN = await getProxyToken(env); if (ptN && ptN.enabled && ptN.key) tokenPrefixForNormalize = ptN.key; } catch(e) {}
                remainingPath = normalizeRemainingPathForPlayback(remainingPath, matchedPrefix, tokenPrefixForNormalize);
                targetUrls = route.target.split(',').map(s => s.trim()).filter(Boolean);
                
                if (remainingPath.startsWith('/http://') || remainingPath.startsWith('/https://')) { targetUrls = [remainingPath.substring(1)]; remainingPath = ''; }
            } catch (e) { return new Response("DB Error: " + e.message, { status: 500 }); }
        }

        if (targetUrls.length === 0) return new Response("404: Target empty", { status: 404 });

        // ==========================================
        // 2.75 EMOS 聚合伪装(3.4.30)
        // 原理:聚合播放器(SenPlayer 等)用 AnyProviderIdEquals=tmdb.X 跨服查询"你有没有这部剧"。
        //      EMOS 的 Items 接口对 AnyProviderIdEquals 解析是坏的(标准 provider 名一律返回空),
        //      但 EMOS 的 Series/Movie 条目本身带 ProviderIds{Tmdb}(实测已验证,且 Todb=TheOtherDB 编号)。
        //      这里拦截该查询 → 抓取 EMOS 全量目录(模块级内存缓存 + D1 持久缓存)→ 按 Tmdb 编号匹配 →
        //      命中则返回带 ProviderIds{Tmdb} 的条目(原样),播放器即把本节点列为播放源;
        //      未命中放行原样透传(EMOS 原始同样返回空,行为不变)。播放层完全透传零改动。
        // ==========================================
        async function emosAggregateHandle(request, env, ctx, url, decodedPath, route, matchedPrefix, targetUrls) {
            try {
                if (request.method !== 'GET') return null;
                if (url.pathname.indexOf('/Items') < 0) return null;
                const apiq = url.searchParams.get('AnyProviderIdEquals');
                if (!apiq) return null;
                // 只处理 tmdb 编号(实测 imdb/tvdb 在 EMOS 无对应数据;SenPlayer 查询三者同发,tmdb 命中即成立)
                const tmdbMatch = apiq.match(/(?:^|,)tmdb\.(\d+)/i);
                if (!tmdbMatch) return null;
                const providerId = tmdbMatch[1];
                const uidMatch = decodedPath.match(/\/Users\/([^/]+)\/Items/i);
                if (!uidMatch) return null;
                const userId = uidMatch[1];

                const cacheKey = 'emos_cat_v2_' + (matchedPrefix || ''); // 目录与用户无关,跨用户共享;v2 避开旧版脏缓存
                // 幂等建表(仅执行一次,避免每次请求的 DDL 开销)
                if (!emosCatTableReady) {
                    try { await env.DB.prepare('CREATE TABLE IF NOT EXISTS emos_catalog (cache_key TEXT PRIMARY KEY, data TEXT NOT NULL, t INTEGER NOT NULL)').run(); emosCatTableReady = true; } catch (e) {}
                }
                let catalog = emosCatalogCache.get(cacheKey);
                if (!catalog || Date.now() - catalog.t > 600000) { // 内存缓存 10 分钟
                    // 构造 EMOS 全量目录抓取地址(兼容 target 自带 /emby 子路径)
                    let embyRoot = targetUrls[0];
                    try {
                        const p = new URL(targetUrls[0]);
                        const b = (p.pathname || '/').replace(/\/+$/, '');
                        embyRoot = (b && b !== '/') ? (p.origin + b) : p.origin;
                    } catch (e) {}
                    const h = new Headers();
                    const token = request.headers.get('X-Emby-Token') || request.headers.get('X-MediaBrowser-Token');
                    if (token) h.set('X-Emby-Token', token);
                    else { const a = request.headers.get('Authorization'); if (a) h.set('Authorization', a); }
                    // EMOS 源站要求:带 EMOS-PROXY-ID/NAME + 浏览器 UA/语言头(与正常播放转发一致,防源站拒接)
                    if (route && route.emos_id) h.set('EMOS-PROXY-ID', route.emos_id);
                    if (route && route.emos_name) h.set('EMOS-PROXY-NAME', route.emos_name);
                    h.set('User-Agent', 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36');
                    h.set('Accept-Language', 'zh-CN,zh;q=0.9');
                    h.set('Accept', 'application/json');
                    // 优先用 D1 持久缓存(1 小时),命中则免抓取
                    let cachedItems = null;
                    try {
                        const row = await env.DB.prepare('SELECT data, t FROM emos_catalog WHERE cache_key = ?').bind(cacheKey).first();
                        if (row && Date.now() - row.t < 3600000) { try { cachedItems = JSON.parse(row.data); } catch (e) {} }
                    } catch (e) {}
                    if (cachedItems && Array.isArray(cachedItems) && cachedItems.length) {
                        catalog = { t: Date.now(), items: cachedItems };
                    } else {
                        // 串行分页抓全量目录:EMOS 的 TotalRecordCount 是累计值(600→900→…,不可信),
                        // 因此不按总数截断,一直抓到「空页」为止(guard 上限防死循环)
                        const items = [];
                        let startIndex = 0; let pages = 0; let lastCatStatus = 0;
                        for (let guard = 0; guard < 30; guard++) {
                            const suffix = '/Users/' + userId + '/Items?Recursive=true&IncludeItemTypes=Series,Movie&Fields=ProviderIds,Id,Path,Name,ProductionYear,Type&Limit=300&StartIndex=' + startIndex;
                            const catUrl = /\/emby$/i.test(embyRoot) ? (embyRoot + suffix) : (embyRoot + '/emby' + suffix);
                            let resp = null;
                            try { resp = await fetch(catUrl, { headers: h }); } catch (e) { resp = null; }
                            if (!resp || !resp.ok) { lastCatStatus = resp ? resp.status : 0; items.length = 0; break; }
                            const data = await resp.json();
                            const page = Array.isArray(data.Items) ? data.Items : [];
                            if (!page.length) break; // 空页 = 抓完
                            items.push(...page);
                            pages++;
                            startIndex += page.length;
                        }
                        if (!items.length) return null; // 目录抓取失败/空 → 放行(EMOS 原始行为一致)
                        catalog = { t: Date.now(), items, pages };
                        // 写 D1 持久缓存(跨请求复用,首次后秒回)
                        try {
                            await env.DB.prepare('INSERT OR REPLACE INTO emos_catalog (cache_key, data, t) VALUES (?, ?, ?)').bind(cacheKey, JSON.stringify(items), Date.now()).run();
                        } catch (e) {}
                    }
                    emosCatalogCache.set(cacheKey, catalog);
                    // 防止长期运行缓存膨胀:顺带清理过期项
                    try {
                        if (emosCatalogCache.size > 30) {
                            const now = Date.now();
                            for (const [k, v] of emosCatalogCache) { if (now - v.t > 60000) emosCatalogCache.delete(k); }
                        }
                    } catch (e) {}
                }
                const hits = catalog.items.filter(it => it && it.ProviderIds && String(it.ProviderIds.Tmdb) === String(providerId));
                if (!hits.length) return null; // 未命中 → 放行(与 EMOS 原始行为一致)

                const body = JSON.stringify({ Items: hits, TotalRecordCount: hits.length });
                const rh = new Headers({ 'Content-Type': 'application/json; charset=UTF-8', 'Access-Control-Allow-Origin': '*' });
                return new Response(body, { status: 200, headers: rh });
            } catch (e) {
                console.log('emosAggregate error:', e.message);
                return null;
            }
        }
        // EMOS 模式 + 节点开启聚合 + 命中聚合查询 → 直接返回构造响应
        if (currentMode === 'emos' && route && route.emos_aggregate === 'on') {
            const agg = await emosAggregateHandle(request, env, ctx, url, decodedPath, route, matchedPrefix, targetUrls);
            if (agg) return agg;
        }

        // ==========================================
        // 2.7 真实观看判定（v3.4.66：同伪装版思路——不数 PlaybackInfo，改判播放会话心跳链）
        //   PlaybackInfo（详情页/预加载/点开就会触发）不再计入观看，消除虚高；
        //   仅「播放开始」与「非暂停的播放进度心跳」才算真实在播 → 更新最近观看时间；
        //   同一播放会话只计一次有效播放次数（会话级去重，防心跳风暴刷次数）。
        // ==========================================
        const isPlayStart = url.pathname.endsWith('/Sessions/Playing');
        const isPlayProgress = url.pathname.indexOf('/Sessions/Playing/Progress') !== -1;

        if ((isPlayStart || isPlayProgress) && matchedPrefix && env.DB && ctx && ctx.waitUntil) {
            ctx.waitUntil((async () => {
                try {
                    let paused = false, sessionId = '';
                    try {
                        const txt = await request.clone().text();
                        const j = JSON.parse(txt);
                        paused = !!j.IsPaused;
                        sessionId = String(j.PlaySessionId || '');
                    } catch (e) {}
                    // 暂停心跳不算观看（用户正暂停）；继续播放心跳才算
                    if (paused) return;
                    const todayStr = new Date(Date.now() + 8 * 3600000).toISOString().split('T')[0];
                    const nowTime = new Date(Date.now() + 8 * 3600000).toISOString().replace('T', ' ').split('.')[0];

                    const stmts = [ env.DB.prepare(`UPDATE routes SET last_play = ? WHERE prefix = ?`).bind(nowTime, matchedPrefix) ];

                    if (sessionId) {
                        const key = 'watch_sessions';
                        const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = ?").bind(key).first();
                        let seen = [];
                        try { if (row && row.value) seen = JSON.parse(row.value); } catch (e) {}
                        if (!seen.includes(sessionId)) {
                            seen.unshift(sessionId);
                            if (seen.length > 500) seen.length = 500;
                            stmts.push(env.DB.prepare(`INSERT INTO request_stats (prefix, date, count) VALUES (?, ?, 1) ON CONFLICT(prefix, date) DO UPDATE SET count = count + 1`).bind(matchedPrefix, todayStr));
                            const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "Unknown";
                            const clientCountry = request.headers.get("cf-ipcountry") || "Unknown";
                            const clientUa = request.headers.get("User-Agent") || "Unknown";
                            stmts.push(env.DB.prepare(`INSERT INTO visitor_logs (prefix, ip, country, ua) VALUES (?, ?, ?, ?)`).bind(matchedPrefix, clientIp, clientCountry, clientUa));
                            stmts.push(env.DB.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind(key, JSON.stringify(seen)));
                        }
                    }
                    await env.DB.batch(stmts);
                } catch (e) {}
            })());
        }

        // v3.4.66 热力图计数：真实播放请求(stream 拉流 / POST PlaybackInfo)命中即异步累加
        // (与 2.7 心跳链判定配套：热力图只统计真实播放相关请求，不再随详情页/预加载虚高)
        try {
            const playPath = /\/emby\/Videos\/[^/]+\/stream(?:\?|$)/i.test(remainingPath)
                || (/\/emby\/Items\/[^/]+\/PlaybackInfo(?:\?|$)/i.test(remainingPath) && request.method === 'POST');
            if (playPath && matchedPrefix) ctx.waitUntil(recordPlayHit(env, matchedPrefix));
        } catch (e) { console.error('playhit:', e.message); }

        // ==========================================
        // 2.8 无伪装模式下的源站反代 (含强力防 403 引擎)
        // ==========================================
        const isStrictMode = currentMode === 'strict';

        let bodyBuffer = null;
        const canHaveRequestBody = request.method !== 'GET' && request.method !== 'HEAD';
        const needsReplayableBody = canHaveRequestBody && (
            targetUrls.length > 1
            || targetUrls.some(target => buildUpstreamCandidates(target, remainingPath, url.search).length > 1)
        );

        if (needsReplayableBody) {
            // 这里只在“请求体会被重复使用”时才预读成 ArrayBuffer。
            //
            // 触发条件有两类：
            // 1. 多节点 failover：同一个 POST 可能发往多个 target
            // 2. 同节点候选回退：例如 /Items/... 失败后，再试 /emby/Items/...
            //
            // 这两种情况都会二次消费 request.body；不先缓存就会出现：
            // "This ReadableStream is disturbed (has already been read from)"
            //
            // 但如果本次请求只会发起一次上游 fetch，就继续保留原本的流式透传，
            // 尽量减少我这次修复对现有面板和普通反代行为的影响范围。
            bodyBuffer = await request.clone().arrayBuffer();
        }

        let finalResponse = null; let lastError = null; let targetOrigins = getTargetOrigins(targetUrls); let finalTargetUrl = null;

        for (let i = 0; i < targetUrls.length; i++) {
            const candidateUrls = buildUpstreamCandidates(targetUrls[i], remainingPath, url.search);

            for (let j = 0; j < candidateUrls.length; j++) {
                const targetUrlStr = candidateUrls[j];
                const targetUrl = new URL(targetUrlStr);
                const newHeaders = new Headers(request.headers); newHeaders.set("Host", targetUrl.host);
                stripPanelCookie(newHeaders);

                const realIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || (request.headers.get("x-forwarded-for") || "").split(',')[0].trim();
                newHeaders.delete("cf-connecting-ip"); newHeaders.delete("cf-ipcountry"); newHeaders.delete("cf-ray");
                newHeaders.delete("cf-visitor"); newHeaders.delete("x-forwarded-for"); newHeaders.delete("x-real-ip");

                newHeaders.set("X-Forwarded-Proto", url.protocol.replace(':', ''));
                newHeaders.set("X-Forwarded-Host", url.host);

                // EMOS 专用模式：按 emos.dpdns.org/proxy 要求——
                // 必填 EMOS-PROXY-ID / EMOS-PROXY-NAME 两枚头，强制透传真实 IP(X-Forwarded-For)，忽略 custom_ip 伪装
                const fakeIp = (route && route.custom_ip) || '';
                if (currentMode === 'emos') {
                    if (realIp) { newHeaders.set("X-Forwarded-For", realIp); newHeaders.set("X-Real-IP", realIp); }
                    // 未单独配置时自动使用内置默认身份(面板可改)
                    setHeaderSafe(newHeaders, "EMOS-PROXY-ID", (route && route.emos_id) || DEFAULT_EMOS_ID);
                    setHeaderSafe(newHeaders, "EMOS-PROXY-NAME", (route && route.emos_name) || DEFAULT_EMOS_NAME);
                } else if (fakeIp) {
                    newHeaders.delete("cf-connecting-ip"); newHeaders.delete("cf-ipcountry"); newHeaders.delete("cf-ray");
                    newHeaders.delete("cf-visitor"); newHeaders.delete("x-forwarded-for"); newHeaders.delete("x-real-ip");
                    newHeaders.delete("x-client-ip"); newHeaders.delete("true-client-ip"); newHeaders.delete("forwarded");
                    newHeaders.delete("via"); newHeaders.delete("x-originating-ip"); newHeaders.delete("x-forwarded-server");
                    newHeaders.delete("client-ip");
                    newHeaders.set("X-Forwarded-For", fakeIp);
                    newHeaders.set("X-Real-IP", fakeIp);
                    newHeaders.set("X-Client-IP", fakeIp);
                } else if (currentMode === 'realip_only' && realIp) { newHeaders.set("X-Real-IP", realIp); } 
                else if ((currentMode === 'dual' || isStrictMode) && realIp) { newHeaders.set("X-Real-IP", realIp); newHeaders.set("X-Forwarded-For", realIp); }

                if (isStrictMode) {
                    newHeaders.set("Origin", targetUrl.origin); newHeaders.set("Referer", targetUrl.origin + "/");
                } else {
                    const origin = newHeaders.get("Origin");
                    if (origin && origin === url.origin) newHeaders.set("Origin", targetUrl.origin);
                    const referer = newHeaders.get("Referer");
                    if (referer && referer.startsWith(url.origin)) newHeaders.set("Referer", referer.replace(url.origin, targetUrl.origin));
                }

                const isStaticOrImage = isStaticPath(targetUrl.pathname);
                const authLikeState = hasAuthLikeState(newHeaders, targetUrl);
                const hasRedirectRules = redirectRules.length > 0;

                let fetchInit = { method: request.method, headers: newHeaders, redirect: (isStaticOrImage && !redirectDirect && !hasRedirectRules) ? 'follow' : 'manual' };

                // 边缘缓存:Static 直连视频(内容共享,键剥身份参数)与无鉴权静态资源进 CF 缓存;
                // 带鉴权态的图片/API、转码/播放列表/直播/下载及任何无法判定的请求一律原样回源(兜底防误伤)。
                const edgeCf = edgeCacheCfOption(request, targetUrl, isStaticOrImage, authLikeState);
                if (edgeCf) fetchInit.cf = edgeCf;

                if (canHaveRequestBody) {
                    if (bodyBuffer !== null) {
                        // 只有在需要重试/切线时才使用可复用的二进制 body。
                        fetchInit.body = bodyBuffer;
                    } else {
                        // 单次请求仍然按旧逻辑直接透传原始流，避免扩大兼容性风险。
                        fetchInit.body = request.body;
                        fetchInit.duplex = 'half';
                    }
                }

                try {
                    const modifiedRequest = new Request(targetUrl, fetchInit); const response = await fetch(modifiedRequest);

                    // 这里特意允许“同一 target 的下一候选”继续尝试。
                    // 也就是说：如果裸路径 /Items/... 回了 404，而 /emby/Items/... 是可用的，
                    // 就不要立刻把这条线路判死，而是优先在当前线路内部完成一次 /emby 回退重试。
                    if ((response.status === 404 || response.status === 502 || response.status === 503 || response.status === 504) && j < candidateUrls.length - 1) {
                        lastError = new Error(`Node ${i+1} candidate ${j+1} returned HTTP ${response.status}`);
                        continue;
                    }

                    if (response.status === 502 || response.status === 503 || response.status === 504) {
                        lastError = new Error(`Node ${i+1} returned HTTP ${response.status}`);
                        continue;
                    }

                    finalResponse = response; finalTargetUrl = targetUrl; break;
                } catch (err) {
                    lastError = err; continue;
                }
            }

            if (finalResponse) break;
        }

        if (!finalResponse) return new Response("Worker Proxy Failover Exhausted. All nodes failed. Last Error: " + (lastError?.message || 'Unknown Error'), { status: 502 });

        const responseHeaders = new Headers(finalResponse.headers);
        rewriteSetCookieForProxy(responseHeaders);
        const ptObj = await getProxyToken(env);
        const safePrefix = matchedPrefix ? `/${proxyTokenPrefix(ptObj)}${matchedPrefix}` : '';

        // ==========================================
        //  修复版 302 拦截：恢复 URL 编码
        //  支持节点级「外部跳转直连」与域名级 302/307 规则（直连=不走反代 / 代理=走反代）
        // ==========================================
        if ([301, 302, 303, 307, 308].includes(finalResponse.status)) {
            const location = responseHeaders.get('Location');
            // —— EMOS 专用取流:仅 EMOS 模式恢复「媒体 30x 由 Worker 直接跟随源站取流返回 200/206」。
            //    3.4.37 曾全节点生效导致媒体流量全部压进 Worker 中转,播放 40M→3M(3.4.40 已全移除);
            //    但 EMOS 源站 308 双跳、部分播放器不跟随 308 会一直 0KB,聚合能搜到却播不出来。
            //    故仅 EMOS 模式跟随(其余模式走下方 redirect_direct 直连判断或 Location 下发,保持满速)。 ——
            if (currentMode === 'emos' && location) {
                try {
                    const dest = new URL(location, finalTargetUrl);
                    const isMediaFile = /\.(mkv|mp4|ts|m4v|webm|flv|mov|avi|m3u8|mpd|aac|mp3|flac|m4a|ogg|opus)([?#]|$)/i.test(dest.pathname + dest.search)
                        || /(\/files\/|\/Videos\/|\/videos\/|\/media\/)/i.test(dest.pathname);
                    if (isMediaFile) {
                        const vh = new Headers();
                        const rg = request.headers.get('Range');
                        if (rg) vh.set('Range', rg);
                        const ua = request.headers.get('User-Agent');
                        if (ua) vh.set('User-Agent', ua);
                        const vres = await fetch(dest.href, { method: 'GET', headers: vh, redirect: 'follow' });
                        const out = new Headers(vres.headers);
                        out.set('Access-Control-Allow-Origin', '*');
                        out.delete('set-cookie'); out.delete('cf-ray'); out.delete('report-to'); out.delete('nel'); out.delete('expect-ct');
                        return new Response(vres.body, { status: vres.status, headers: out });
                    }
                } catch (e) {}
            }
            // 不再由 Worker 跟随媒体 30x 取流:3.7 引入后媒体流量全部压进 CF Worker
            // 中转,播放速度从直连 40M/s 掉到 3M/s;36 无跟随,302 直连/下发满速。
            // 30x 一律交给下方 redirect_direct 直连判断或 Location 下发。
            let directExternal302 = false;
            if (location && finalTargetUrl) {
                try {
                    const destination = new URL(location, finalTargetUrl);
                    const isExternal = (destination.protocol === 'http:' || destination.protocol === 'https:')
                        && !targetOrigins.includes(destination.origin);
                    if (isExternal) {
                        let direct = redirectDirect;
                        if (redirectRules.length) {
                            const rule = redirectRules.find(x => destination.host === x.d || destination.host.endsWith('.' + x.d));
                            if (rule) direct = rule.a === 'direct';
                        }
                        if (direct) {
                            responseHeaders.set('Location', destination.href);
                            directExternal302 = true;
                        }
                    }
                } catch (e) {}
            }
            const rewrittenLocation = directExternal302 ? responseHeaders.get('Location')
                : rewriteRedirectLocation(location, finalTargetUrl, targetOrigins, proxyOrigin, safePrefix);
            if (rewrittenLocation === null) responseHeaders.delete('Location');
            else if (rewrittenLocation !== location) {
                responseHeaders.set('Location', rewrittenLocation);
            }
        }
        
        responseHeaders.set('Access-Control-Allow-Origin', '*');

        // ==========================================
        // 2.10 响应体重写 (接管 PlaybackInfo 与 M3U8)
        // ==========================================

        if (finalResponse.status === 200 && responseHeaders.get("content-type")?.includes("json") && url.pathname.toLowerCase().includes("playbackinfo")) {
            try {
                // v3.5.0:起播缓存已整体删除——原缓存的命中检查在拿到上游响应之后才执行,
                // "免回源"从未实现,只白白增加一次 Map 读写;且缓存值是改写后的完整响应(带当前用户
                // PlaySessionId/api_key 等),缓存键却剥掉了这些身份参数,不同用户命中同键会拿到
                // 上一用户的会话数据。删除后:每次都实时改写,不串数据,速度不变。
                let clonedRes = finalResponse.clone(); 
                let data = await clonedRes.json(); 
                let modified = false;
                if (data && data.MediaSources) {
                    data.MediaSources.forEach(source => {
                        // Emby / Jellyfin / HUD 的 PlaybackInfo 字段并不完全一致。
                        // 原脚本只改写 DirectStreamUrl 和 TranscodingUrl 的绝对地址，
                        // 这对标准 Emby 基本够用，但 HUD 常见的是：
                        // - DirectStreamUrl 返回 /emby/videos/...
                        // - TranscodingUrl 返回 /emby/videos/... 或相对路径
                        // - 字幕 DeliveryUrl 也可能是相对路径
                        //
                        // 所以这里把播放期会实际发起请求的几个关键 URL 字段统一走同一个改写函数，
                        // 保证所有媒体相关请求都还能带着当前线路前缀回到 Worker。
                        ['DirectStreamUrl', 'TranscodingUrl', 'Url'].forEach(key => {
                            const rewritten = rewritePlaybackMediaUrl(source[key], finalTargetUrl, proxyOrigin, safePrefix, targetOrigins);
                            if (rewritten !== source[key]) {
                                source[key] = rewritten;
                                modified = true;
                            }
                        });

                        // 字幕流的 DeliveryUrl 也会在播放时被客户端直接请求。
                        // 如果 HUD 给的是 /emby/videos/... 这种相对地址，而这里不改，
                        // 主视频即使勉强能播，外挂字幕依然会因为丢失前缀而加载失败。
                        if (Array.isArray(source.MediaStreams)) {
                            source.MediaStreams.forEach(stream => {
                                const rewritten = rewritePlaybackMediaUrl(stream?.DeliveryUrl, finalTargetUrl, proxyOrigin, safePrefix, targetOrigins);
                                if (rewritten !== stream?.DeliveryUrl) {
                                    stream.DeliveryUrl = rewritten;
                                    modified = true;
                                }
                            });
                        }

                        // —— 强制直连播放(3.4.44 起无条件执行,与伪装版一致;不再受 direct_play 节点开关控制):
                        // 禁转码但保留/开启直连能力:SupportsTranscoding=false 让播放器不走转码;
                        // SupportsDirectStream/SupportsDirectPlay 必须为 true,否则播放器判定
                        // “既不能转码又不能直连”会直接报无法播放(3.4.38 全置 false 导致的回归)。
                        // 3.4.43 曾受 direct_play 门控,开关关闭时返回源站原始内容导致部分剧 0KB,已修复。
                        // ——
                        // v4.0.3:只对「远程/strm 源」强制直连(源站本就是外链,转码无意义)。
                        // 本地文件源保持 Emby 原样:此前一律强制 禁转码 + Protocol=Http + 清空 TranscodingUrl,
                        // 会让需要转码兜底的播放器(解码不了 HEVC/DTS/高码率等)直接「无法播放」,或来回重试导致启播慢。
                        // 需要恢复旧的全量强制行为时,在 Worker 环境变量里设 FORCE_DIRECT_PLAY=1。
                        // v4.0.6:强制直连改为「节点设置」里的开关(force_direct),默认关;
                        // 仍兼容环境变量 FORCE_DIRECT_PLAY=1 作为全局兜底。
                        // v4.0.5:恢复 2.x 行为——默认不再强制直连。4.0.3 对远程/strm 源自动
                        // 关掉转码并清空 TranscodingUrl,导致需要转码兜底的播放器(HEVC/DTS/高码率、
                        // 或 strm 远端链路不稳)一直 loading 直到失败;改为仅显式 FORCE_DIRECT_PLAY=1 时强制。
                        if (forceDirect) {
                            if (source.SupportsTranscoding !== false) { source.SupportsTranscoding = false; modified = true; }
                            if (source.SupportsDirectStream !== true) { source.SupportsDirectStream = true; modified = true; }
                            if (source.SupportsDirectPlay !== true) { source.SupportsDirectPlay = true; modified = true; }
                            ['TranscodingUrl', 'TranscodingSubProtocol', 'TranscodingContainer', 'TranscodingType'].forEach(k => {
                                if (source[k] !== undefined && source[k] !== null && source[k] !== '') { source[k] = ''; modified = true; }
                            });
                            if (source.IsRemote !== false) { source.IsRemote = false; modified = true; }
                            if (source.Protocol !== 'Http' && source.Protocol !== 'http') { source.Protocol = 'Http'; modified = true; }
                            // Path 兜底:若没有 DirectStreamUrl 但 Path 是「外网」源站地址,改写为代理路径并作为直连地址。
                            // v4.0.3:Path 若是 127.0.0.1 / localhost / 内网网段(Emby+Alist 同机回环等),绝不能
                            // 下发给 Worker 透传(CF 边缘 fetch 内网回环必 403)。此时跳过兜底,DirectStreamUrl 保持为空,
                            // 播放器会按 MediaSource.Id 自行拼 Emby 标准 /emby/videos/{id}/stream 接口,
                            // 由 Emby 服务端内部回环取流,对外仍走正常推流域名(与远古高兼容版行为一致)。
                            if (!strmOpt && !source.DirectStreamUrl && source.Path && !isPrivateMediaUrl(source.Path)) {
                                const rwPath = rewritePlaybackMediaUrl(source.Path, finalTargetUrl, proxyOrigin, safePrefix, targetOrigins);
                                if (rwPath !== source.Path) { source.DirectStreamUrl = rwPath; modified = true; }
                            }
                        }
                    });
                }
                if (modified) { 
                    dropBodyIntegrityHeaders(responseHeaders);
                    const piOutText = JSON.stringify(data);
                    return new Response(piOutText, { status: finalResponse.status, statusText: finalResponse.statusText, headers: responseHeaders }); 
                }
            } catch (e) {
                console.log("PlaybackInfo JSON 重写失败:", e.message);
            }
        }

        // 通用 JSON URL 重写。
        // PlaybackInfo 只覆盖播放地址；UHD 图片失败通常发生在其他 JSON 接口里，
        // 例如详情页、图片列表或插件接口返回了源站绝对地址/相对图片路径。
        // 这里先用 hasJsonRewriteCandidate 做轻量筛选，再递归改写，避免漏掉嵌套的高清图字段。
        // Sessions 轮询 / System 信息类接口不含需要改写的图片地址,直接透传(不读 body、不 clone)
        if (finalResponse.status === 200 && responseHeaders.get("content-type")?.includes("json")
            && !/\/(?:sessions|system\/(?:info|ping|endpoint)|socket)(?:\/|$)/i.test(url.pathname)) {
            try {
                let clonedRes = finalResponse.clone();
                let text = await clonedRes.text();
                if (hasJsonRewriteCandidate(text, targetOrigins)) {
                    // 快路径:没有相对图片路径(先用便宜的子串正则排除),直接文本替换源站域名
                    if (!/\/(?:img|images)\//i.test(text) || !/(^|["'\s(])(?:\/img\/|\/emby\/Items\/[^"'\s)]+\/Images\/|\/Items\/[^"'\s)]+\/Images\/)/i.test(text)) {
                        const outText = rewriteOriginsInText(text, targetOrigins, proxyOrigin, safePrefix);
                        if (outText !== text) {
                            dropBodyIntegrityHeaders(responseHeaders);
                            return new Response(outText, { status: finalResponse.status, statusText: finalResponse.statusText, headers: responseHeaders });
                        }
                    } else {
                        let data = JSON.parse(text);
                        let rewritten = rewriteSourceUrlsInJson(data, targetOrigins, proxyOrigin, safePrefix);
                        if (rewritten !== data) {
                            dropBodyIntegrityHeaders(responseHeaders);
                            return new Response(JSON.stringify(rewritten), { status: finalResponse.status, statusText: finalResponse.statusText, headers: responseHeaders });
                        }
                    }
                }
            } catch(e) {
                console.log("JSON 源站 URL 重写失败:", e.message);
            }
        }

        if (finalResponse.status === 200 && url.pathname.toLowerCase().endsWith('.m3u8')) {
            try {
                let clonedRes = finalResponse.clone(); 
                let text = await clonedRes.text();
                if (text.includes('http://') || text.includes('https://') || /^\s*\//m.test(text)) {
                    // 绝对 URL 分片：代理到 /密钥/节点/源站URL
                    let modifiedText = text.replace(/(https?:\/\/[^\s]+)/g, proxyOrigin + safePrefix + '/$1');
                    // 协议相对分片（//host/path）：补 https 协议再代理
                    modifiedText = modifiedText.replace(/^(?!\s*#)(\s*)\/\/([^\s]+)$/gm, (m, sp, p) => sp + proxyOrigin + safePrefix + '/https://' + p);
                    // 根相对分片（/path）：浏览器会解析到不带节点前缀的根路径导致 404，补上源站根 + 代理前缀
                    const firstOrigin = (targetUrls[0] || '').replace(/\/+$/, '');
                    if (firstOrigin) {
                        modifiedText = modifiedText.replace(/^(?!\s*#)(\s*)\/([^\s]+)$/gm, (m, sp, p) => sp + proxyOrigin + safePrefix + '/' + firstOrigin + '/' + p);
                    }
                    dropBodyIntegrityHeaders(responseHeaders);
                    return new Response(modifiedText, { status: finalResponse.status, statusText: finalResponse.statusText, headers: responseHeaders });
                }
            } catch(e) {
                console.log("M3U8 重写失败:", e.message);
            }
        }

        // 给最终静态资源响应补缓存头。
        // 这里仍然用当前访问路径判断是否为图片/静态文件，是为了让已经通过 Worker
        // 正确代理过来的 UHD 图片可以被浏览器/CDN 正常复用；但真正的 Cloudflare
        // cacheEverything 已在请求发起前排除了带鉴权态的资源，避免缓存污染。
        const isStaticRes = isStaticPath(url.pathname);
        const contentType = responseHeaders.get("content-type") || "";
        const canCacheStaticRes = isStaticRes
            && enableCache
            && finalResponse.status === 200
            && (
                contentType.startsWith("image/")
                || contentType.includes("javascript")
                || contentType.includes("css")
                || contentType.includes("font")
                || contentType.includes("manifest")
            );
        if (canCacheStaticRes && !responseHeaders.has("Cache-Control")) {
            responseHeaders.set('Cache-Control', 'public, max-age=86400'); 
        }

        return new Response(finalResponse.body, { status: finalResponse.status, statusText: finalResponse.statusText, headers: responseHeaders });
    } catch (e) {
        console.error('[proxy]', e);
        return Response.json({ success: false, error: String((e && e.message) || e) }, { status: 500 });
    }
}
};

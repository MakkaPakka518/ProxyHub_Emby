// Node 22+: node --experimental-vm-modules --test test/emby-doctor.test.mjs
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('./worker-emby-doctor.js', import.meta.url), 'utf8');

async function loadDoctor(fetchMock) {
  const context = vm.createContext({
    console, URL, URLSearchParams, Request, Response, Headers, Blob, FormData,
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, crypto: webcrypto,
    atob, btoa, AbortSignal, AbortController, ReadableStream, TransformStream,
    setTimeout, clearTimeout, fetch: fetchMock
  });
  const module = new vm.SourceTextModule(source + '\nexport { runEmbyDoctor, doctorNormalizeBase, doctorPublicCandidates, doctorAuthHeaders, doctorAuthHeaderValue, ensureRoutesSchema, HTML_UI };', { context });
  await module.link(specifier => {
    assert.equal(specifier, 'cloudflare:sockets');
    return new vm.SyntheticModule(['connect'], function () {
      this.setExport('connect', () => { throw new Error('Socket access is disabled in Doctor tests'); });
    }, { context });
  });
  await module.evaluate({ timeout: 10000 });
  return module.namespace;
}

class MemoryD1 {
  constructor() { this.sqlite = new DatabaseSync(':memory:'); }
  async exec(sql) { this.sqlite.exec(sql); return { success: true }; }
  prepare(sql) {
    const db = this.sqlite;
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async all() { return { results: db.prepare(sql).all(...args), success: true }; },
      async run() {
        const result = db.prepare(sql).run(...args);
        return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      }
    };
  }
  async batch(statements) { return Promise.all(statements.map(statement => statement.run())); }
}

test('Doctor logs in with an ordinary account and tests PlaybackInfo and Range using the Pro client disguise', async () => {
  const calls = [];
  const token = 'temporary-access-token';
  const password = 'ordinary-user-password';
  const api = await loadDoctor(async (input, init = {}) => {
    const url = new URL(input);
    const headers = new Headers(init.headers || {});
    calls.push({ url: url.href, method: init.method || 'GET', token: headers.get('X-Emby-Token'), auth: headers.get('X-Emby-Authorization'), ua: headers.get('User-Agent'), origin: headers.get('Origin'), referer: headers.get('Referer'), range: headers.get('Range'), body: init.body || '' });
    if (url.hostname === 'primary.example') return new Response('Forbidden', { status: 403 });
    if (url.pathname === '/System/Info/Public') return Response.json({ ProductName: 'Emby Server', Version: '4.8.11', Id: 'server-1' });
    if (url.pathname === '/Users/AuthenticateByName') return Response.json({ AccessToken: token });
    if (url.pathname === '/Users/Me') return Response.json({ Id: 'user-1' });
    if (url.pathname === '/Users/user-1/Items') return Response.json({ Items: [{ Id: 'item-1' }] });
    if (url.pathname === '/Items/item-1/PlaybackInfo') return Response.json({ MediaSources: [{ SupportsDirectPlay: true, SupportsDirectStream: true, SupportsTranscoding: true, DirectStreamUrl: '/Videos/item-1/stream?api_key=server-leaked-token' }] });
    if (url.pathname === '/Videos/item-1/stream') return new Response('ab', { status: 206, headers: { 'Content-Range': 'bytes 0-1/100' } });
    if (url.pathname === '/Sessions/Logout') return new Response(null, { status: 204 });
    return new Response('Not Found', { status: 404 });
  });

  const report = await api.runEmbyDoctor({ target: 'https://primary.example,https://backup.example' }, { username: 'ordinary-user', password });
  assert.equal(report.lines.length, 2);
  assert.equal(report.lines[0].ok, false);
  assert.equal(report.lines[1].ok, true);
  assert.equal(report.selectedLine, 2);
  assert.equal(report.account.auth, true);
  assert.equal(report.account.library, true);
  assert.equal(report.account.playback, true);
  assert.equal(Object.hasOwn(report, 'sessionToken'), false);
  assert.equal(report.account.logout.ok, true);
  assert.deepEqual({ ...report.account.range }, { status: 206, ms: report.account.range.ms, ok: true, redirected: false });
  assert.ok(report.recommendations.some(message => message.includes('主线路异常')));
  assert.ok(calls.every(call => !call.url.includes(token) && !call.url.includes(password)), 'credentials must never be placed in a URL');
  assert.ok(calls.every(call => !call.url.includes('server-leaked-token')), 'server-provided media tokens must be stripped from probe URLs');
  const login = calls.find(call => new URL(call.url).pathname === '/Users/AuthenticateByName');
  assert.deepEqual(JSON.parse(login.body), { Username: 'ordinary-user', Pw: password, Password: password });
  assert.equal(login.token, null);
  assert.match(login.auth, /Client="SenPlayer"/);
  assert.equal(login.ua, 'SenPlayer/6.2.2 (iPhone; iOS 17.5; Scale/3.00)');
  assert.equal(login.origin, 'https://backup.example');
  assert.equal(login.referer, 'https://backup.example/');
  assert.ok(calls.filter(call => /Users\/Me|Items|Videos/.test(new URL(call.url).pathname)).every(call => call.token === token && call.auth.includes('Token="' + token + '"')));
  assert.equal(calls.find(call => call.range).range, 'bytes=0-1');
  assert.equal(calls.some(call => new URL(call.url).pathname === '/Sessions/Logout' && call.token === token), true);
});

test('Doctor detects an /emby API base without credentials', async () => {
  const calls = [];
  const api = await loadDoctor(async input => {
    const url = new URL(input);
    calls.push(url.pathname);
    if (url.pathname === '/emby/System/Info/Public') return Response.json({ ProductName: 'Emby', Version: '4.8', Id: 'subpath-server' });
    return new Response('Not Found', { status: 404 });
  });
  const report = await api.runEmbyDoctor({ target: 'https://subpath.example' }, {});
  assert.equal(report.lines[0].ok, true);
  assert.equal(report.publicPath, '/emby/System/Info/Public');
  assert.equal(report.account.tested, false);
  assert.deepEqual(calls, ['/System/Info/Public', '/emby/System/Info/Public']);
  assert.ok(report.recommendations.some(message => message.includes('/emby')));
});

test('Doctor never sends account credentials to an HTTP source', async () => {
  const calls = [];
  const api = await loadDoctor(async (input, init = {}) => {
    const url = new URL(input);
    calls.push({ path: url.pathname, body: init.body || '' });
    if (url.pathname === '/System/Info/Public') return Response.json({ ProductName: 'Emby', Version: '4.8', Id: 'http-server' });
    throw new Error('credentials reached an HTTP source');
  });
  const report = await api.runEmbyDoctor({ target: 'http://plain.example' }, { username: 'ordinary-user', password: 'password-secret' });
  assert.equal(report.account.insecureHttp, true);
  assert.equal(calls.some(call => call.path === '/Users/AuthenticateByName' || call.body.includes('password-secret')), false);
  assert.ok(report.recommendations.some(message => message.includes('HTTP')));
});

test('Doctor rejects credential-bearing or non-HTTP route targets', async () => {
  const api = await loadDoctor(async () => { throw new Error('network must not be reached'); });
  for (const target of ['ftp://example.com', 'https://user:pass@example.com', 'javascript:alert(1)']) {
    assert.throws(() => api.doctorNormalizeBase(target));
  }
});

test('Doctor never forwards account credentials or a token across an origin-changing redirect', async () => {
  const calls = [];
  const token = 'redirect-secret';
  const api = await loadDoctor(async (input, init = {}) => {
    const url = new URL(input);
    calls.push({ host: url.hostname, path: url.pathname, token: new Headers(init.headers || {}).get('X-Emby-Token'), body: init.body || '' });
    if (url.pathname === '/steal') throw new Error('credential leak');
    if (url.pathname === '/System/Info/Public') return Response.json({ ProductName: 'Emby', Version: '4.8', Id: 'safe-server' });
    if (url.pathname === '/Users/AuthenticateByName') return Response.json({ AccessToken: token, User: { Id: 'user-1' } });
    if (url.pathname === '/Users/Me') return new Response('', { status: 302, headers: { Location: 'http://safe.example/steal' } });
    return new Response('Not Found', { status: 404 });
  });
  const report = await api.runEmbyDoctor({ target: 'https://safe.example' }, { username: 'ordinary-user', password: 'password-secret' });
  assert.equal(report.account.auth, false);
  assert.equal(calls.some(call => call.path === '/steal'), false);
  assert.ok(calls.filter(call => call.token).every(call => call.host === 'safe.example'));
});

test('Doctor public probes do not follow cross-origin redirects', async () => {
  const calls = [];
  const api = await loadDoctor(async input => {
    const url = new URL(input);
    calls.push(url.href);
    if (url.hostname === 'redirect.example') return new Response('', { status: 302, headers: { Location: 'https://evil.example/internal' } });
    throw new Error('public redirect escaped the configured origin');
  });
  const report = await api.runEmbyDoctor({ target: 'https://redirect.example' }, {});
  assert.equal(report.lines[0].ok, false);
  assert.equal(calls.some(url => new URL(url).hostname === 'evil.example'), false);
});

test('Doctor skips external media URLs and chooses a playable media source without leaking the token', async () => {
  const calls = [];
  const token = 'media-secret';
  const api = await loadDoctor(async (input, init = {}) => {
    const url = new URL(input);
    calls.push({ host: url.hostname, path: url.pathname, token: new Headers(init.headers || {}).get('X-Emby-Token') });
    if (url.hostname === 'media.evil.example') throw new Error('credential leak');
    if (url.pathname === '/System/Info/Public') return Response.json({ ProductName: 'Emby', Version: '4.8', Id: 'safe-server' });
    if (url.pathname === '/Users/AuthenticateByName') return Response.json({ AccessToken: token, User: { Id: 'user-1' } });
    if (url.pathname === '/Users/Me') return Response.json({ Id: 'user-1' });
    if (url.pathname === '/Users/user-1/Items') return Response.json({ Items: [{ Id: 'item-1' }] });
    if (url.pathname === '/Items/item-1/PlaybackInfo') return Response.json({ MediaSources: [
      { SupportsDirectPlay: false },
      { SupportsDirectPlay: true, SupportsDirectStream: true, DirectStreamUrl: 'https://media.evil.example/video.mkv?api_key=server-leaked-token' }
    ] });
    if (url.pathname === '/Sessions/Logout') return new Response(null, { status: 204 });
    return new Response('Not Found', { status: 404 });
  });
  const report = await api.runEmbyDoctor({ target: 'https://safe.example' }, { username: 'ordinary-user', password: 'password-secret' });
  assert.equal(report.account.playback, true);
  assert.equal(report.account.range.skipped, 'external');
  assert.equal(calls.some(call => call.host === 'media.evil.example'), false);
  assert.ok(report.recommendations.some(message => message.includes('保护临时 Token')));
});

test('Doctor rejects generic or oversized JSON as an Emby public endpoint', async () => {
  for (const oversized of [false, true]) {
    const api = await loadDoctor(async () => oversized
      ? new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Length': '2000000' } })
      : Response.json({ ok: true }));
    const report = await api.runEmbyDoctor({ target: 'https://not-emby.example' }, {});
    assert.equal(report.lines[0].ok, false);
  }
});

test('Doctor API requires a panel session and generated browser scripts compile', async () => {
  const api = await loadDoctor(async () => { throw new Error('network must not be reached'); });
  const response = await api.default.fetch(new Request('https://panel.test/api/doctor', {
    method: 'POST', headers: { Origin: 'https://panel.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: 'demo' })
  }), { ADMIN_TOKEN: 'offline-admin' }, {});
  assert.equal(response.status, 401);
  assert.match(api.HTML_UI, /Emby Doctor/);
  assert.match(api.HTML_UI, /\/api\/doctor/);
  assert.match(api.HTML_UI, /普通用户账号/);
  assert.match(api.HTML_UI, /临时会话清理/);
  assert.match(source, /X-Emby-Doctor-Test/);
  assert.match(source, /X-Emby-Doctor-Line/);
  assert.match(source, /await getAuthRole\(request\)\) === 'admin'/);
  assert.match(source, /newHeaders\.delete\('X-Emby-Doctor-Test'\)/);
  const scripts = [...api.HTML_UI.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
  assert.ok(scripts.some(code => code.includes('async function runDoctor')));
  for (const [index, code] of scripts.entries()) {
    try { new vm.Script(code, { filename: 'doctor-html-script-' + index + '.js' }); }
    catch (error) { throw new Error('HTML script ' + index + ' failed to compile\n' + error.stack + '\n' + code.split('\n').slice(0, 20).map((line, lineIndex) => (lineIndex + 1) + ': ' + line).join('\n')); }
  }
});

test('Doctor API accepts an authenticated same-origin admin request and refuses owned routes and cross-origin writes', async t => {
  const networkCalls = [];
  const api = await loadDoctor(async (input, init = {}) => {
    const url = new URL(input);
    const headers = new Headers(init.headers || {});
    networkCalls.push({ path: url.pathname, token: headers.get('X-Emby-Token'), auth: headers.get('X-Emby-Authorization'), ua: headers.get('User-Agent'), body: init.body || '' });
    if (url.pathname === '/System/Info/Public') return Response.json({ ProductName: 'Emby', Version: '4.8', Id: 'server-1' });
    if (url.pathname === '/Users/AuthenticateByName') return Response.json({ AccessToken: 'api-temporary-token', User: { Id: 'user-1' } });
    if (url.pathname === '/Users/Me') return Response.json({ Id: 'user-1' });
    if (url.pathname === '/Users/user-1/Items') return Response.json({ Items: [] });
    if (url.pathname === '/Sessions/Logout') return new Response(null, { status: 204 });
    return new Response('Not Found', { status: 404 });
  });
  const DB = new MemoryD1();
  t.after(() => DB.sqlite.close());
  const env = { DB, ADMIN_TOKEN: 'offline-admin' };
  await api.ensureRoutesSchema(env);
  await DB.prepare("INSERT INTO routes(prefix,target,remark,owner) VALUES(?,?,?,?)").bind('demo', 'https://emby.example', '测试节点', '').run();
  await DB.prepare("INSERT INTO routes(prefix,target,remark,owner) VALUES(?,?,?,?)").bind('owned', 'https://emby.example', '用户节点', '7').run();

  const login = await api.default.fetch(new Request('https://panel.test/api/login', {
    method: 'POST', headers: { Origin: 'https://panel.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ pass: env.ADMIN_TOKEN })
  }), env, undefined);
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const request = (prefix, origin = 'https://panel.test', extra = {}) => api.default.fetch(new Request('https://panel.test/api/doctor', {
    method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix, ...extra })
  }), env, undefined);

  const valid = await request('demo');
  assert.equal(valid.status, 200, await valid.clone().text());
  const report = await valid.json();
  assert.equal(report.success, true);
  assert.equal(report.proxyBase, '/demo');
  assert.equal(report.node.remark, '测试节点');
  const authenticated = await request('demo', 'https://panel.test', { username: 'ordinary-user', password: 'password-secret' });
  assert.equal(authenticated.status, 200, await authenticated.clone().text());
  const authenticatedReport = await authenticated.json();
  assert.equal(authenticatedReport.account.auth, true);
  assert.equal(Object.hasOwn(authenticatedReport, 'sessionToken'), false);
  assert.equal(authenticatedReport.account.logout.ok, true);
  assert.equal(JSON.stringify(authenticatedReport).includes('password-secret'), false);
  const authCall = networkCalls.find(call => call.path === '/Users/AuthenticateByName');
  assert.equal(authCall.ua, 'SenPlayer/6.2.2 (iPhone; iOS 17.5; Scale/3.00)');
  assert.match(authCall.auth, /Client="SenPlayer"/);
  assert.equal(networkCalls.some(call => call.path === '/Sessions/Logout' && call.token === 'api-temporary-token'), true);
  const passwordWithoutUser = await request('demo', 'https://panel.test', { password: 'password-secret' });
  assert.equal(passwordWithoutUser.status, 400);
  assert.equal((await request('owned')).status, 404);
  assert.equal((await request('demo', 'https://evil.example')).status, 403);
});

test('Doctor proxy disguise is admin-only, pins the selected source, and leaves normal traffic unchanged', async t => {
  const upstream = [];
  const api = await loadDoctor(async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    upstream.push({ host: url.hostname, ua: request.headers.get('User-Agent'), auth: request.headers.get('X-Emby-Authorization'), marker: request.headers.get('X-Emby-Doctor-Test'), line: request.headers.get('X-Emby-Doctor-Line') });
    return Response.json({ ProductName: 'Emby', Version: '4.8', Id: url.hostname });
  });
  const DB = new MemoryD1();
  t.after(() => DB.sqlite.close());
  const env = { DB, ADMIN_TOKEN: 'offline-admin' };
  await api.ensureRoutesSchema(env);
  await DB.prepare("INSERT INTO routes(prefix,target,remark,owner) VALUES(?,?,?,?)")
    .bind('multi', 'https://primary.example,https://backup.example', '多线路', '').run();
  const login = await api.default.fetch(new Request('https://panel.test/api/login', {
    method: 'POST', headers: { Origin: 'https://panel.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ pass: env.ADMIN_TOKEN })
  }), env, undefined);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const proxy = headers => api.default.fetch(new Request('https://panel.test/multi/System/Info/Public', { headers }), env, { waitUntil() {} });

  let response = await proxy({ Cookie: cookie, 'User-Agent': 'OriginalClient/1.0', 'X-Emby-Doctor-Test': '1', 'X-Emby-Doctor-Line': '2' });
  assert.equal(response.status, 200);
  let sourceUpstream = upstream.filter(call => call.host === 'primary.example' || call.host === 'backup.example');
  assert.equal(sourceUpstream.length, 1);
  assert.equal(sourceUpstream[0].host, 'backup.example');
  assert.equal(sourceUpstream[0].ua, 'SenPlayer/6.2.2 (iPhone; iOS 17.5; Scale/3.00)');
  assert.match(sourceUpstream[0].auth, /Client="SenPlayer"/);
  assert.equal(sourceUpstream[0].marker, null);
  assert.equal(sourceUpstream[0].line, null);

  upstream.length = 0;
  response = await proxy({ Cookie: cookie, 'User-Agent': 'OriginalClient/1.0' });
  assert.equal(response.status, 200);
  sourceUpstream = upstream.filter(call => call.host === 'primary.example' || call.host === 'backup.example');
  assert.equal(sourceUpstream[0].host, 'primary.example');
  assert.equal(sourceUpstream[0].ua, 'OriginalClient/1.0');
  assert.equal(sourceUpstream[0].auth, null);

  upstream.length = 0;
  response = await proxy({ 'User-Agent': 'AnonymousClient/1.0', 'X-Emby-Doctor-Test': '1', 'X-Emby-Doctor-Line': '2' });
  assert.equal(response.status, 200);
  sourceUpstream = upstream.filter(call => call.host === 'primary.example' || call.host === 'backup.example');
  assert.equal(sourceUpstream[0].host, 'primary.example');
  assert.equal(sourceUpstream[0].ua, 'AnonymousClient/1.0');
  assert.equal(sourceUpstream[0].auth, null);
  assert.equal(sourceUpstream[0].marker, null);
});

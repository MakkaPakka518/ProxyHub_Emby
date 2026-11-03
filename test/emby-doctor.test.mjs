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
  const module = new vm.SourceTextModule(source + '\nexport { runEmbyDoctor, doctorNormalizeBase, doctorPublicCandidates, ensureRoutesSchema, HTML_UI };', { context });
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

test('Doctor tests failover, ordinary account, PlaybackInfo and two-byte Range without putting the token in URLs', async () => {
  const calls = [];
  const token = 'ordinary-user-secret';
  const api = await loadDoctor(async (input, init = {}) => {
    const url = new URL(input);
    const headers = new Headers(init.headers || {});
    calls.push({ url: url.href, method: init.method || 'GET', token: headers.get('X-Emby-Token'), range: headers.get('Range') });
    if (url.hostname === 'primary.example') return new Response('Forbidden', { status: 403 });
    if (url.pathname === '/System/Info/Public') return Response.json({ ProductName: 'Emby Server', Version: '4.8.11', Id: 'server-1' });
    if (url.pathname === '/Users/Me') return Response.json({ Id: 'user-1' });
    if (url.pathname === '/Users/user-1/Items') return Response.json({ Items: [{ Id: 'item-1' }] });
    if (url.pathname === '/Items/item-1/PlaybackInfo') return Response.json({ MediaSources: [{ SupportsDirectPlay: true, SupportsDirectStream: true, SupportsTranscoding: true, DirectStreamUrl: '/Videos/item-1/stream' }] });
    if (url.pathname === '/Videos/item-1/stream') return new Response('ab', { status: 206, headers: { 'Content-Range': 'bytes 0-1/100' } });
    return new Response('Not Found', { status: 404 });
  });

  const report = await api.runEmbyDoctor({ target: 'https://primary.example,https://backup.example' }, token);
  assert.equal(report.lines.length, 2);
  assert.equal(report.lines[0].ok, false);
  assert.equal(report.lines[1].ok, true);
  assert.equal(report.selectedLine, 2);
  assert.equal(report.account.auth, true);
  assert.equal(report.account.library, true);
  assert.equal(report.account.playback, true);
  assert.deepEqual({ ...report.account.range }, { status: 206, ms: report.account.range.ms, ok: true, redirected: false });
  assert.ok(report.recommendations.some(message => message.includes('主线路异常')));
  assert.ok(calls.every(call => !call.url.includes(token)), 'the submitted token must never be placed in a URL');
  assert.ok(calls.filter(call => /Users|Items|Videos/.test(new URL(call.url).pathname)).every(call => call.token === token));
  assert.equal(calls.find(call => call.range).range, 'bytes=0-1');
});

test('Doctor detects an /emby API base without credentials', async () => {
  const calls = [];
  const api = await loadDoctor(async input => {
    const url = new URL(input);
    calls.push(url.pathname);
    if (url.pathname === '/emby/System/Info/Public') return Response.json({ ProductName: 'Emby', Version: '4.8', Id: 'subpath-server' });
    return new Response('Not Found', { status: 404 });
  });
  const report = await api.runEmbyDoctor({ target: 'https://subpath.example' }, '');
  assert.equal(report.lines[0].ok, true);
  assert.equal(report.publicPath, '/emby/System/Info/Public');
  assert.equal(report.account.tested, false);
  assert.deepEqual(calls, ['/System/Info/Public', '/emby/System/Info/Public']);
  assert.ok(report.recommendations.some(message => message.includes('/emby')));
});

test('Doctor rejects credential-bearing or non-HTTP route targets', async () => {
  const api = await loadDoctor(async () => { throw new Error('network must not be reached'); });
  for (const target of ['ftp://example.com', 'https://user:pass@example.com', 'javascript:alert(1)']) {
    assert.throws(() => api.doctorNormalizeBase(target));
  }
});

test('Doctor never forwards a user token across an origin-changing redirect', async () => {
  const calls = [];
  const token = 'redirect-secret';
  const api = await loadDoctor(async (input, init = {}) => {
    const url = new URL(input);
    calls.push({ host: url.hostname, path: url.pathname, token: new Headers(init.headers || {}).get('X-Emby-Token') });
    if (url.pathname === '/steal') throw new Error('credential leak');
    if (url.pathname === '/System/Info/Public') return Response.json({ ProductName: 'Emby', Version: '4.8', Id: 'safe-server' });
    if (url.pathname === '/Users/Me') return new Response('', { status: 302, headers: { Location: 'http://safe.example/steal' } });
    return new Response('Not Found', { status: 404 });
  });
  const report = await api.runEmbyDoctor({ target: 'https://safe.example' }, token);
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
  const report = await api.runEmbyDoctor({ target: 'https://redirect.example' }, '');
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
    if (url.pathname === '/Users/Me') return Response.json({ Id: 'user-1' });
    if (url.pathname === '/Users/user-1/Items') return Response.json({ Items: [{ Id: 'item-1' }] });
    if (url.pathname === '/Items/item-1/PlaybackInfo') return Response.json({ MediaSources: [
      { SupportsDirectPlay: false },
      { SupportsDirectPlay: true, SupportsDirectStream: true, DirectStreamUrl: 'https://media.evil.example/video.mkv' }
    ] });
    return new Response('Not Found', { status: 404 });
  });
  const report = await api.runEmbyDoctor({ target: 'https://safe.example' }, token);
  assert.equal(report.account.playback, true);
  assert.equal(report.account.range.skipped, 'external');
  assert.equal(calls.some(call => call.host === 'media.evil.example'), false);
  assert.ok(report.recommendations.some(message => message.includes('保护用户 Token')));
});

test('Doctor rejects generic or oversized JSON as an Emby public endpoint', async () => {
  for (const oversized of [false, true]) {
    const api = await loadDoctor(async () => oversized
      ? new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Length': '2000000' } })
      : Response.json({ ok: true }));
    const report = await api.runEmbyDoctor({ target: 'https://not-emby.example' }, '');
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
  const scripts = [...api.HTML_UI.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
  assert.ok(scripts.some(code => code.includes('async function runDoctor')));
  for (const [index, code] of scripts.entries()) {
    try { new vm.Script(code, { filename: 'doctor-html-script-' + index + '.js' }); }
    catch (error) { throw new Error('HTML script ' + index + ' failed to compile\n' + error.stack + '\n' + code.split('\n').slice(0, 20).map((line, lineIndex) => (lineIndex + 1) + ': ' + line).join('\n')); }
  }
});

test('Doctor API accepts an authenticated same-origin admin request and refuses owned routes and cross-origin writes', async t => {
  const api = await loadDoctor(async input => {
    const url = new URL(input);
    if (url.pathname === '/System/Info/Public') return Response.json({ ProductName: 'Emby', Version: '4.8', Id: 'server-1' });
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
  const request = (prefix, origin = 'https://panel.test') => api.default.fetch(new Request('https://panel.test/api/doctor', {
    method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix })
  }), env, undefined);

  const valid = await request('demo');
  assert.equal(valid.status, 200, await valid.clone().text());
  const report = await valid.json();
  assert.equal(report.success, true);
  assert.equal(report.proxyBase, '/demo');
  assert.equal(report.node.remark, '测试节点');
  assert.equal((await request('owned')).status, 404);
  assert.equal((await request('demo', 'https://evil.example')).status, 403);
});

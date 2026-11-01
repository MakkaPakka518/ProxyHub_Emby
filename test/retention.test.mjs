// Node 22+: node --experimental-vm-modules --test test/retention.test.mjs
// Real Worker + in-memory SQLite. Network and Cloudflare sockets are mocked.
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../明文/worker.js', import.meta.url), 'utf8');
const DAY = 86400000;
const NOW = Date.parse('2026-11-01T12:00:00+08:00');
const ago = days => new Date(NOW - days * DAY).toISOString();

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
        const r = db.prepare(sql).run(...args);
        return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
      }
    };
  }
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (e) { this.sqlite.exec('ROLLBACK'); throw e; }
  }
}

async function fixture(t, setup) {
  const DB = new MemoryD1();
  t.after(() => DB.sqlite.close());
  if (setup) setup(DB.sqlite);
  const sent = [];
  const context = vm.createContext({
    console, URL, URLSearchParams, Request, Response, Headers, Blob, FormData,
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, crypto: webcrypto,
    atob, btoa, AbortSignal, ReadableStream, TransformStream, setTimeout, clearTimeout,
    fetch: async (url, init) => {
      assert.equal(new URL(url).origin, 'https://api.day.app', 'unexpected external request');
      sent.push({ url: String(url), body: JSON.parse(init.body) });
      return Response.json({ code: 200 });
    }
  });
  const module = new vm.SourceTextModule(source + '\nexport { getWatchState, normalizeNodeBotUrl, normalizeBarkSound, BARK_SOUNDS, ensureRoutesSchema, saveRouteConfig, getNotifyCfg, sendBarkN, HTML_UI };', { context });
  await module.link(specifier => {
    assert.equal(specifier, 'cloudflare:sockets');
    return new vm.SyntheticModule(['connect'], function () {
      this.setExport('connect', () => { throw new Error('Test refuses Telegram/network connections'); });
    }, { context });
  });
  await module.evaluate({ timeout: 10000 });
  const api = module.namespace;
  await api.ensureRoutesSchema({ DB });
  await DB.exec('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)');
  const env = { DB, ADMIN_TOKEN: 'offline-retention-admin' };
  let cookie = '';
  async function request(path, method = 'GET', body, authCookie = cookie) {
    const headers = { 'cf-connecting-ip': '192.0.2.10' };
    if (authCookie) headers.cookie = authCookie;
    if (method !== 'GET') { headers.Origin = 'https://panel.test'; headers['Content-Type'] = 'application/json'; }
    return api.default.fetch(new Request('https://panel.test' + path, {
      method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) })
    }), env, undefined);
  }
  const login = await request('/api/login', 'POST', { pass: env.ADMIN_TOKEN });
  assert.equal(login.status, 200);
  assert.equal((await login.clone().json()).success, true);
  cookie = login.headers.get('set-cookie').split(';')[0];
  async function json(path, method = 'GET', body, authCookie) {
    const response = await request(path, method, body, authCookie);
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  }
  const row = prefix => DB.sqlite.prepare('SELECT * FROM routes WHERE prefix = ?').get(prefix);
  const create = (extra = {}) => json('/api/routes', 'POST', {
    prefix: 'demo', target: 'https://emby.example', remark: '测试节点', mode: 'off', watchLimit: '7', ...extra
  });
  return { api, DB, env, sent, request, json, row, create };
}

test('watch state handles thresholds, fractional limits and exact expiry', async t => {
  const { api } = await fixture(t);
  const state = (days, limit = 7) => api.getWatchState({ watch_limit: limit, last_play: ago(days) }, NOW);
  assert.equal(state(0).status, 'safe');
  assert.equal(state(3.5).percent, 50);
  assert.equal(state(3.99).status, 'safe');
  assert.equal(state(4).status, 'warning');
  assert.equal(state(4).remainingDays, 3);
  assert.equal(state(7).status, 'overdue');
  assert.equal(state(7).remainingDays, 0);
  assert.equal(state(9).percent, 100);
  assert.equal(state(9).remainingDays, -2);
  assert.equal(state(0.1, 0.5).status, 'safe');
  assert.equal(state(0.5, 0.5).status, 'overdue');
  assert.equal(state(0, 2).status, 'safe');
});

test('watch state parses Beijing legacy and timezone-aware dates without inventing history', async t => {
  const { api } = await fixture(t);
  const legacy = api.getWatchState({ watch_limit: 7, last_play: '2026-10-28 12:00:00' }, NOW);
  assert.equal(legacy.elapsedDays, 4);
  assert.equal(legacy.dueAt, NOW + 3 * DAY);
  for (const last_play of ['', 'invalid-date', ago(-1)]) {
    const state = api.getWatchState({ watch_limit: 7, last_play }, NOW);
    assert.equal(state.status, 'unknown');
    assert.equal(state.remainingDays, null);
    assert.equal(state.percent, 0);
  }
  for (const watch_limit of [0, '', -1, 'bad', 'Infinity']) {
    assert.equal(api.getWatchState({ watch_limit, last_play: ago(30) }, NOW).status, 'disabled');
  }
});

test('Telegram usernames and deep links normalize to safe universal links', async t => {
  const { api } = await fixture(t);
  assert.equal(api.normalizeNodeBotUrl('@ExampleBot'), 'https://t.me/ExampleBot');
  assert.equal(api.normalizeNodeBotUrl('t.me/ExampleBot?start=checkin_1'), 'https://t.me/ExampleBot?start=checkin_1');
  assert.equal(api.normalizeNodeBotUrl('http://telegram.me/ExampleBot/'), 'https://t.me/ExampleBot');
  assert.equal(api.normalizeNodeBotUrl('tg://resolve?domain=ExampleBot&start=a-b'), 'https://t.me/ExampleBot?start=a-b');
  assert.equal(api.normalizeNodeBotUrl(''), '');
  for (const value of ['javascript:alert(1)', 'https://t.me.evil.test/ExampleBot', 'https://evil.test/ExampleBot', 'https://user@t.me/ExampleBot', 'https://t.me/ExampleBot/other', 'https://t.me/ExampleBot" onclick="x', '@bad']) {
    assert.throws(() => api.normalizeNodeBotUrl(value), undefined, value);
  }
});

test('Bark settings persist, mask the key and preview the unsaved sound only', async t => {
  const f = await fixture(t);
  assert.equal((await f.json('/api/account', 'POST', { notify: { barkKey: 'offline-key', barkSound: 'bell' } })).success, true);
  const config = await f.json('/api/account/notify');
  assert.equal(config.barkSound, 'bell');
  assert.equal(config.barkKey, '********');
  const preview = await f.json('/api/test-notify', 'POST', { type: 'bark', barkSound: 'alarm' });
  assert.equal(preview.success, true);
  assert.equal(f.sent.at(-1).body.sound, 'alarm');
  assert.equal((await f.json('/api/account/notify')).barkSound, 'bell');
  await f.json('/api/account', 'POST', { notify: { barkKey: '********', barkLevel: 'active' } });
  assert.equal((await f.json('/api/account/notify')).barkSound, 'bell', 'old clients must retain the saved sound');
  await f.json('/api/account', 'POST', { notify: { barkSound: '' } });
  await f.json('/api/test-notify', 'POST', { type: 'bark' });
  assert.equal(Object.hasOwn(f.sent.at(-1).body, 'sound'), false);
  assert.equal((await f.json('/api/account', 'POST', { notify: { barkSound: 'not-a-sound' } })).success, false);
  assert.equal((await f.json('/api/account/notify')).barkSound, '');
});

test('schema upgrade preserves legacy playback and adds the optional Bot link', async t => {
  const f = await fixture(t, db => {
    db.exec("CREATE TABLE routes (prefix TEXT PRIMARY KEY, target TEXT NOT NULL, last_play TEXT DEFAULT ''); INSERT INTO routes VALUES ('legacy','https://legacy.example','2026-10-20 12:00:00')");
  });
  assert.equal(f.row('legacy').last_play, '2026-10-20 12:00:00');
  assert.equal(f.row('legacy').tg_bot_url, '');
  await f.api.ensureRoutesSchema(f.env);
  assert.equal(f.row('legacy').last_play, '2026-10-20 12:00:00');
});

test('editing and renaming a node preserves playback, order and account settings', async t => {
  const f = await fixture(t);
  assert.equal((await f.create({ tgBotUrl: '@ExampleBot', nodeUser: 'offline-user', nodePass: 'offline-password' })).success, true);
  f.DB.sqlite.prepare('UPDATE routes SET last_play = ?, sort_order = 9 WHERE prefix = ?').run('2026-10-20 12:00:00', 'demo');
  assert.equal((await f.json('/api/routes', 'POST', { oldPrefix: 'demo', prefix: 'demo', tgBotUrl: 'https://t.me/AnotherBot?start=sign' })).success, true);
  assert.equal(f.row('demo').last_play, '2026-10-20 12:00:00');
  assert.equal(f.row('demo').node_user, 'offline-user');
  assert.equal(f.row('demo').node_pass, 'offline-password');
  assert.equal(f.row('demo').watch_limit, '7');
  assert.equal((await f.json('/api/routes', 'POST', { oldPrefix: 'demo', prefix: 'renamed', mode: 'dual' })).success, true);
  assert.equal(f.row('demo'), undefined);
  assert.equal(f.row('renamed').last_play, '2026-10-20 12:00:00');
  assert.equal(f.row('renamed').sort_order, 9);
  assert.equal(f.row('renamed').tg_bot_url, 'https://t.me/AnotherBot?start=sign');
});

test('batch mode payloads preserve watch limit, Bot link and fresh concurrent playback', async t => {
  const f = await fixture(t);
  await f.create({ watchLimit: '14', tgBotUrl: '@ExampleBot', fakeIp: '192.0.2.20', emosId: 'offline-emos' });
  const old = { ...f.row('demo') };
  const payload = { ...old, oldPrefix: 'demo', mode: 'strict' };
  f.DB.sqlite.prepare('UPDATE routes SET last_play = ? WHERE prefix = ?').run('2026-11-01 12:00:00', 'demo');
  assert.equal((await f.json('/api/routes', 'POST', payload)).success, true);
  const saved = f.row('demo');
  assert.equal(saved.last_play, '2026-11-01 12:00:00');
  assert.equal(saved.watch_limit, '14');
  assert.equal(saved.tg_bot_url, 'https://t.me/ExampleBot');
  assert.equal(saved.custom_ip, '192.0.2.20');
  assert.equal(saved.emos_id, 'offline-emos');
  assert.equal(saved.mode, 'strict');
});

test('invalid edits do not rename or discard a node; blank Bot link clears it', async t => {
  const f = await fixture(t);
  await f.create({ tgBotUrl: '@ExampleBot' });
  const before = { ...f.row('demo') };
  assert.equal((await f.json('/api/routes', 'POST', { oldPrefix: 'demo', prefix: 'bad', tgBotUrl: 'javascript:alert(1)' })).success, false);
  assert.deepEqual({ ...f.row('demo') }, before);
  assert.equal(f.row('bad'), undefined);
  assert.equal((await f.json('/api/routes', 'POST', { oldPrefix: 'demo', prefix: 'demo', watchLimit: -1 })).success, false);
  assert.equal((await f.json('/api/routes', 'POST', { oldPrefix: 'demo', prefix: 'demo', tgBotUrl: '' })).success, true);
  assert.equal(f.row('demo').tg_bot_url, '');
});

test('export/import round-trips Bot links and legacy backups default to empty', async t => {
  const f = await fixture(t);
  await f.create({ tgBotUrl: '@ExampleBot' });
  const backup = await f.json('/api/routes');
  assert.equal(backup[0].tg_bot_url, 'https://t.me/ExampleBot');
  await f.json('/api/routes?prefix=demo', 'DELETE');
  assert.equal((await f.json('/api/routes/import', 'POST', backup)).success, true);
  assert.equal(f.row('demo').tg_bot_url, 'https://t.me/ExampleBot');
  const legacy = { prefix: 'legacy', target: 'https://legacy.example', last_play: '2026-10-20 12:00:00', watch_limit: '7' };
  assert.equal((await f.json('/api/routes/import', 'POST', [legacy])).success, true);
  assert.equal(f.row('legacy').tg_bot_url, '');
  assert.equal(f.row('legacy').last_play, legacy.last_play);
});

test('notification and node edits still require authentication', async t => {
  const f = await fixture(t);
  for (const [path, method, body] of [
    ['/api/account/notify', 'GET'], ['/api/test-notify', 'POST', { type: 'bark', barkSound: 'alarm' }],
    ['/api/account', 'POST', { notify: { barkSound: 'bell' } }], ['/api/routes', 'POST', { prefix: 'demo', tgBotUrl: '@ExampleBot' }]
  ]) {
    assert.equal((await f.request(path, method, body, '')).status, 401, path);
  }
  assert.equal(f.sent.length, 0);
});

test('user-owned nodes retain playback and remain isolated from other users', async t => {
  const f = await fixture(t);
  await f.create({ tgBotUrl: '@PublicBot' });
  assert.equal((await f.json('/api/users', 'POST', { action: 'create', name: 'Alice', suffix: 'alice', password: 'offline-alice-password' })).success, true);
  const login = await f.request('/api/login', 'POST', { pass: 'offline-alice-password' }, '');
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const create = await f.json('/api/routes', 'POST', { prefix: 'mine', target: 'https://alice.example', watchLimit: '7', tgBotUrl: '@PrivateBot' }, cookie);
  assert.equal(create.success, true);
  f.DB.sqlite.prepare('UPDATE routes SET last_play = ?, sort_order = 8 WHERE prefix = ?').run('2026-10-20 12:00:00', 'alice/mine');
  const owner = f.row('alice/mine').owner;
  assert.ok(owner);
  const visible = await f.json('/api/routes', 'GET', undefined, cookie);
  assert.deepEqual(visible.map(r => r.prefix), ['alice/mine']);
  assert.equal(visible[0].tg_bot_url, 'https://t.me/PrivateBot');
  const otherEdit = await f.json('/api/routes', 'POST', { oldPrefix: 'demo', prefix: 'stolen', tgBotUrl: '@PrivateBot' }, cookie);
  assert.equal(otherEdit.success, false);
  assert.equal(f.row('demo').tg_bot_url, 'https://t.me/PublicBot');
  assert.equal((await f.json('/api/routes', 'POST', { oldPrefix: 'alice/mine', prefix: 'renamed', tgBotUrl: '@AnotherBot' }, cookie)).success, true);
  const renamed = f.row('alice/renamed');
  assert.equal(renamed.owner, owner);
  assert.equal(renamed.last_play, '2026-10-20 12:00:00');
  assert.equal(renamed.sort_order, 8);
  assert.equal(renamed.watch_limit, '7');
  assert.equal((await f.request('/api/account/notify', 'GET', undefined, cookie)).status, 403);
  assert.deepEqual((await f.json('/api/routes')).map(r => r.prefix), ['demo']);
});

test('read-only subscribers can open configured Bot links but cannot change them', async t => {
  const f = await fixture(t);
  await f.create({ tgBotUrl: '@ExampleBot' });
  f.DB.sqlite.prepare('INSERT INTO app_config (key, value) VALUES (?, ?)').run('subscribers', JSON.stringify(['offline-subscriber']));
  const login = await f.request('/api/login', 'POST', { pass: 'offline-subscriber' }, '');
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const visible = await f.json('/api/routes', 'GET', undefined, cookie);
  assert.equal(visible[0].tg_bot_url, 'https://t.me/ExampleBot');
  assert.equal(Object.hasOwn(visible[0], 'target'), false);
  assert.equal((await f.request('/api/routes', 'POST', { oldPrefix: 'demo', prefix: 'demo', tgBotUrl: '@AnotherBot' }, cookie)).status, 403);
  assert.equal((await f.request('/api/test-notify', 'POST', { type: 'bark', barkSound: 'alarm' }, cookie)).status, 403);
  assert.equal(f.row('demo').tg_bot_url, 'https://t.me/ExampleBot');
});

test('rendered HTML scripts compile and retention UI uses escaped, ordered node data', async t => {
  const { api } = await fixture(t);
  const html = api.HTML_UI;
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  for (const [index, code] of scripts.entries()) new vm.Script(code, { filename: 'panel-script-' + index + '.js' });
  assert.ok(html.indexOf('id="watchAlerts"') < html.indexOf('class="card mode-cards-card"'));
  assert.equal((html.match(/<select id="barkSound"[\s\S]*?<\/select>/)[0].match(/<option /g) || []).length, 33);
  const script = scripts.find(code => code.includes('function renderWatchProgress'));
  const newUI = script.slice(0, script.indexOf('// ===== 折叠交互'));
  const escapeFunction = script.match(/function escHtml\(s\) \{[\s\S]*?\n        \}/)[0];
  const elements = Object.fromEntries(['watchAlerts', 'watchAlertList', 'watchAlertsCount', 'watchAlertsSummary'].map(id => [id, { hidden: false, innerHTML: '', textContent: '', addEventListener() {} }]));
  const routes = [
    { prefix: 'safe', watch_limit: 7, last_play: ago(1) },
    { prefix: 'soon', watch_limit: 7, last_play: ago(5), tg_bot_url: '@ExampleBot' },
    { prefix: 'overdue', watch_limit: 7, last_play: ago(9) },
    { prefix: 'never', remark: '<img src=x onerror=alert(1)>', watch_limit: 7, last_play: '' },
    { prefix: 'disabled', watch_limit: 0, last_play: ago(50) }
  ];
  const browser = vm.createContext({
    window: { globalRoutesData: routes, addEventListener() {} },
    document: { getElementById: id => elements[id], addEventListener() {} },
    URL, URLSearchParams, setInterval() {}, Date: class extends Date { static now() { return NOW; } }
  });
  vm.runInContext(newUI + '\n' + escapeFunction, browser);
  vm.runInContext('updateWatchAlerts()', browser);
  assert.equal(elements.watchAlerts.hidden, false);
  const list = elements.watchAlertList.innerHTML;
  assert.deepEqual([...list.matchAll(/data-watch-focus="([^"]+)"/g)].map(m => m[1]), ['overdue', 'soon', 'never']);
  assert.ok(list.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!list.includes('<img src=x'));
  assert.ok(list.includes('href="https://t.me/ExampleBot"'));
  assert.ok(list.includes('rel="noopener noreferrer"'));
  const progress = vm.runInContext('renderWatchProgress({ prefix: "half", watch_limit: 7, last_play: "' + ago(3.5) + '" })', browser);
  assert.ok(progress.includes('aria-valuenow="50"'));
  assert.ok(progress.includes('width:50%'));
  browser.window.globalRoutesData = [{ prefix: 'soon', watch_limit: 7, last_play: ago(0) }];
  vm.runInContext('updateWatchAlerts()', browser);
  assert.equal(elements.watchAlerts.hidden, true, 'real playback should clear the reminder');
});

test('a pending settings reload cannot overwrite a newly selected Bark sound', async t => {
  const { api } = await fixture(t);
  const script = [...api.HTML_UI.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(m => m[1]).find(code => code.includes('let barkSoundDirty = false;'));
  const loader = script.slice(script.indexOf('let barkSoundDirty = false;'), script.indexOf('async function saveNotifySettings()'));
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const sound = { value: 'bell' };
  const browser = vm.createContext({
    document: { getElementById: id => id === 'barkSound' ? sound : null },
    fetch: async () => ({ json: async () => pending })
  });
  vm.runInContext(loader, browser);
  const loading = browser.loadNotifyState();
  sound.value = 'alarm';
  vm.runInContext('barkSoundDirty = true', browser);
  release({ success: true, barkSound: 'bell' });
  await loading;
  assert.equal(sound.value, 'alarm');
  vm.runInContext('barkSoundDirty = false', browser);
  await browser.loadNotifyState();
  assert.equal(sound.value, 'bell');
});

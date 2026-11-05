// UI_TEST_TOOLS points to an existing installation of playwright-core and @sparticuz/chromium.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const require = createRequire(resolve(process.env.UI_TEST_TOOLS || '.', 'package.json'));
const { chromium: playwright } = require('playwright-core');
const { default: chromium } = await import(require.resolve('@sparticuz/chromium'));
const output = resolve(process.env.UI_TEST_OUTPUT || '/tmp/opencode/proxyhub-ui-tools/preview');
mkdirSync(output, { recursive: true });
async function load(file) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const context = vm.createContext({ console, URL, URLSearchParams, Request, Response, Headers,
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, crypto: webcrypto, atob, btoa });
  const module = new vm.SourceTextModule(source + '\nexport { HTML_UI, LOGIN_UI };', { context });
  await module.link(() => new vm.SyntheticModule(['connect'], function () {
    this.setExport('connect', () => { throw new Error('No sockets in UI verification'); });
  }, { context }));
  await module.evaluate({ timeout: 15000 });
  return { source, ...module.namespace };
}
const original = await load('../../worker.js');
const candidate = await load('worker.js');
// The published proxy, auth, storage and scheduled handlers must remain byte-identical.
const beforeTemplates = source => source.slice(0, source.indexOf(',LOGIN_UI='));
const afterTemplates = source => source.slice(source.indexOf(';async function getCFTraffic('));
assert.equal(beforeTemplates(candidate.source), beforeTemplates(original.source));
assert.equal(afterTemplates(candidate.source), afterTemplates(original.source));
for (const name of ['HTML_UI', 'LOGIN_UI']) {
  const scripts = html => [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  assert.deepEqual(scripts(candidate[name]).slice(0, -1), scripts(original[name]), name + ' original scripts');
  const ids = html => [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]).sort();
  assert.deepEqual(ids(candidate[name]).filter(id => id !== 'proxyhub-ui'), ids(original[name]), name + ' DOM hooks');
}
writeFileSync(join(output, 'panel.html'), candidate.HTML_UI);
writeFileSync(join(output, 'login.html'), candidate.LOGIN_UI);

const browser = await playwright.launch({ executablePath: await chromium.executablePath(),
  args: chromium.args.filter(arg => !['--disable-web-security', '--allow-running-insecure-content'].includes(arg)), headless: true });
const ago = days => new Date(Date.now() - days * 86400000).toISOString();
const routes = [
  { prefix: 'main', remark: '日常观影', mode: 'off', watch_limit: '14', last_play: ago(2) },
  { prefix: 'backup', remark: '备用媒体库', mode: 'dual', watch_limit: '7', last_play: ago(5), tg_bot_url: 'https://t.me/ExampleBot' },
  { prefix: 'archive', remark: '经典电影收藏', mode: 'strict', watch_limit: '7', last_play: ago(9) },
  { prefix: 'family', remark: '家庭影音', mode: 'off', watch_limit: '14', last_play: '' },
  { prefix: 'music', remark: '音乐与演唱会', mode: 'realip_only', watch_limit: '0', last_play: ago(4) },
  { prefix: 'emos', remark: 'EMOS 聚合线路', mode: 'emos', watch_limit: '14', last_play: ago(1) },
].map((item, i) => ({ target: 'https://media' + i + '.example', cache_img: 'on', todayReqs: 2, totalReqs: 18,
  todayBandwidth: '240 MB', icon: '', sort_order: i, owner: '', ...item }));
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    const req = route.request(), url = new URL(req.url());
    const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    if (url.origin === 'https://panel.test') {
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: candidate.HTML_UI });
      if (url.pathname === '/login') return route.fulfill({ contentType: 'text/html', body: candidate.LOGIN_UI });
      if (url.pathname === '/api/routes') return json(req.method() === 'GET' ? routes : { success: true });
      if (url.pathname === '/api/me') return json({ success: true, role: 'admin' });
      if (url.pathname === '/api/version') return json({ success: true, version: '4.1.2', updateNotify: false });
      if (url.pathname === '/api/ipguard') return json({ success: true, mode: 'off', ips: [], countries: [] });
      if (url.pathname === '/api/proxy-token') return json({ success: true, enabled: false, key: '' });
      if (url.pathname === '/api/ping-node') return json({ ms: 42 });
      if (url.pathname === '/api/trace') return json({ success: true, entryCountry: 'JP', entryCity: 'Tokyo', entryColo: 'NRT', egressColo: 'NRT' });
      if (url.pathname === '/__client_rtt__') return route.fulfill({ status: 204 });
      if (url.pathname === '/api/node-requests') return json({ success: true, requests: [] });
      return json({ success: true, items: [], list: [], users: [], ips: [], logs: [], stats: {} });
    }
    if (req.resourceType() === 'script') return route.fulfill({ contentType: 'application/javascript', body:
      url.href.includes('chart') ? 'window.Chart=class {static defaults={}; constructor(){this.data={};this.options={}}destroy(){}update(){}};' : 'window.Sortable={create(){return {destroy(){}}}};' });
    if (req.resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body:
      '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" rx="10" fill="#166d5e"/><path d="M17 34V14h10a6 6 0 0 1 0 12h-10" fill="none" stroke="white" stroke-width="3"/></svg>' });
    if (url.pathname.endsWith('changelog.json')) return json({ versions: [{ version: '4.1.2', items: [] }] });
    return json([]);
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const bounds = async () => page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  for (const width of [320, 390, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('https://panel.test', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelectorAll('.emby-card').length === 6);
    if (!await page.locator('#list-grid').isVisible()) await page.locator('#nodesHint').click();
    for (const dark of [false, true]) {
      await page.evaluate(dark => { document.body.classList.toggle('dark', dark); document.documentElement.classList.toggle('dark', dark); window.scrollTo(0, 0); }, dark);
      const layout = await bounds();
      assert.ok(layout.scroll <= width, JSON.stringify(layout));
      assert.equal(await page.locator('.hero-card h1').evaluate(el => getComputedStyle(el).backgroundImage), 'none');
      assert.equal(await page.locator('.topbar').evaluate(el => el.getBoundingClientRect().top), 0);
      const lowContrast = await page.evaluate(() => {
        const rgb = value => value.match(/[\d.]+/g).map(Number).slice(0, 3);
        const luminance = color => color.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
          .reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
        return [...document.querySelectorAll('.hero-sub,.card-sub,.card-remark,.watch-alert-actions strong,.watch-meter-head strong,.btn-submit')]
          .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden').flatMap(el => {
            let parent = el;
            while (parent.parentElement && getComputedStyle(parent).backgroundColor === 'rgba(0, 0, 0, 0)') parent = parent.parentElement;
            const fg = luminance(rgb(getComputedStyle(el).color)), bg = luminance(rgb(getComputedStyle(parent).backgroundColor));
            const ratio = (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
            return ratio < 4.5 ? [{ text: el.textContent.trim().slice(0, 30), ratio: +ratio.toFixed(2) }] : [];
          });
      });
      assert.deepEqual(lowContrast, [], 'Core text contrast in ' + (dark ? 'dark' : 'light'));
      if ([390, 1280].includes(width)) await page.screenshot({ path: join(output, `nodes-${width}-${dark ? 'dark' : 'light'}.png`) });
    }
    // Tab navigation on mode filters uses the same existing click handlers.
    const mode = page.locator('.mode-card[data-mode="off"]');
    await mode.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.mode-card-menu').isVisible(), true);
    await page.locator('.mode-card-menu .mm-close').click();
    for (const view of ['speed', 'settings']) {
      await page.locator(`.ds-dock-item[onclick*="'${view}'"]`).click();
      assert.equal(await page.locator('#view-' + view).isVisible(), true);
      const layout = await bounds();
      assert.ok(layout.scroll <= width, view + ' ' + JSON.stringify(layout));
      if ([390, 1280].includes(width)) await page.screenshot({ path: join(output, `${view}-${width}.png`) });
    }
    await page.locator('.ds-dock-item').first().click();
    await page.evaluate(() => openNodeModal());
    const modalBounds = await page.locator('#nodeModal .modal-box').boundingBox();
    assert.ok(modalBounds.x >= 0 && modalBounds.x + modalBounds.width <= width, 'Modal width');
    if (width <= 768) assert.ok((await page.locator('#iconSelectBtn').boundingBox()).width >= width - 110, 'Mobile editor groups must stack');
    await page.locator('#submitBtn').scrollIntoViewIfNeeded();
    const hit = await page.locator('#submitBtn').evaluate(el => {
      const r = el.getBoundingClientRect(), top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { hit: el.contains(top), top: top?.outerHTML.slice(0, 180), parent: el.closest('.modal-mask').parentElement.className,
        z: getComputedStyle(el.closest('.modal-mask')).zIndex };
    });
    assert.ok(hit.hit, 'Save action obscured: ' + JSON.stringify(hit));
    if ([390, 1280].includes(width)) {
      await page.locator('#nodeModal').evaluate(el => el.scrollTop = 0);
      await page.screenshot({ path: join(output, `editor-${width}.png`) });
    }
    await page.locator('#nodeModal .close-x').click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('https://panel.test/login', { waitUntil: 'networkidle' });
  await page.screenshot({ path: join(output, 'login-390.png') });
  assert.equal(await page.getByLabel('访问密钥').count(), 1);
  assert.ok((await bounds()).scroll <= 390);
  assert.deepEqual(errors, []);
  console.log('UI verified: original backend/scripts/IDs intact; 5 widths, 2 themes, navigation, reachable save action, login.');
} finally { await browser.close(); }

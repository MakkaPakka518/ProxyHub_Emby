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
const original = await load('../../明文/worker.js');
const candidate = await load('worker.js');
// The readable proxy, auth, storage and scheduled handlers must remain byte-identical.
const beforeTemplates = source => source.slice(0, source.indexOf('const LOGIN_UI = `'));
const afterTemplates = source => source.slice(source.indexOf('// ==========================================\n// 2. 后端 Worker'));
assert.equal(beforeTemplates(candidate.source), beforeTemplates(original.source));
assert.equal(afterTemplates(candidate.source), afterTemplates(original.source));
assert.ok(candidate.source.split('\n').length > 10000, 'The deliverable must remain readable, multiline JavaScript');
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
let currentRoutes = routes;
let role = 'admin';
let savedNode;
let failSave = false;
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    const req = route.request(), url = new URL(req.url());
    const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    if (url.origin === 'https://panel.test') {
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: candidate.HTML_UI });
      if (url.pathname === '/login') return route.fulfill({ contentType: 'text/html', body: candidate.LOGIN_UI });
      if (url.pathname === '/api/routes') {
        if (req.method() === 'POST') {
          savedNode = req.postDataJSON();
          if (failSave) return json({ success: false, error: '测试保存失败，请重试' });
          currentRoutes = currentRoutes.map(row => row.prefix === savedNode.oldPrefix ? { ...row, remark: savedNode.remark, tg_bot_url: savedNode.tgBotUrl } : row);
          return json({ success: true });
        }
        const query = (url.searchParams.get('q') || '').toLowerCase();
        const filtered = currentRoutes.filter(row => !query || (row.remark + ' ' + row.prefix).toLowerCase().includes(query));
        return json(role === 'sub' ? filtered.map(({ target, ...row }) => row) : filtered);
      }
      if (url.pathname === '/api/me') return json({ success: true, role,
        ...(role === 'user' ? { user: { id: 42, suffix: 'member', name: 'Member', nodeCount: 1, maxNodes: 5 } } : {}) });
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
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto('https://panel.test', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelectorAll('.emby-card').length === 6);
    await page.waitForFunction(() => document.querySelector('[data-ui-metric="total"]')?.textContent === '6');
    assert.equal(await page.locator('[data-ui-metric="plays"]').textContent(), '12');
    assert.equal(await page.locator('[data-ui-metric="attention"]').textContent(), '3');
    assert.equal(await page.locator('.ui-focus').getAttribute('data-prefix'), 'main');
    assert.equal(await page.locator('#rttValue').isVisible(), true, 'RTT remains reachable at every width');
    if (width <= 760) assert.equal(await page.locator('#searchNode').evaluate(el => getComputedStyle(el).fontSize), '16px');
    if (width === 390) {
      const action = await page.locator('[data-focus-action="copy"]').boundingBox();
      const nav = await page.locator('.ds-dock').boundingBox();
      assert.ok(action.y >= 0 && action.y + action.height < nav.y, 'Selected node action must clear the mobile navigation');
    }
    if (!await page.locator('#list-grid').isVisible()) await page.locator('#nodesHint').click();
    for (const dark of [false, true]) {
      await page.evaluate(dark => { document.body.classList.toggle('dark', dark); document.documentElement.classList.toggle('dark', dark); window.scrollTo(0, 0); }, dark);
      const layout = await bounds();
      assert.ok(layout.scroll <= width, JSON.stringify(layout));
      assert.equal(await page.locator('.hero-card h1').evaluate(el => getComputedStyle(el).backgroundImage), 'none');
      assert.ok(await page.locator('.topbar').evaluate(el => el.getBoundingClientRect().top >= 0));
      const lowContrast = await page.evaluate(() => {
        const rgb = value => value.match(/[\d.]+/g).map(Number).slice(0, 3);
        const luminance = color => color.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
          .reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
        return [...document.querySelectorAll('.hero-sub,.card-sub,.card-remark,.watch-alert-actions strong,.watch-meter-head strong,.btn-submit,.ui-focus-age,.ui-focus-mode,.ui-cycle-label,.ui-focus-actions button,.ui-node-usage dt')]
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
    await page.locator('#mmFilter').click();
    assert.equal(await mode.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.mode-card.mc-all').getAttribute('aria-pressed'), 'false');
    await page.locator('.mode-card.mc-all').click();
    assert.equal(await page.locator('.mode-card.mc-all').getAttribute('aria-pressed'), 'true');
    for (const view of ['speed', 'settings']) {
      await page.locator(`.ds-dock-item[onclick*="'${view}'"]`).click();
      assert.equal(await page.locator('#view-' + view).isVisible(), true);
      await page.waitForFunction(() => window.scrollY === 0);
      await page.waitForFunction(() => !document.getElementById('toast').classList.contains('show'));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const layout = await bounds();
      assert.ok(layout.scroll <= width, view + ' ' + JSON.stringify(layout));
      if ([390, 1280].includes(width)) await page.screenshot({ path: join(output, `${view}-${width}.png`) });
    }
    await page.locator('.ds-dock-item').first().click();
    await page.evaluate(() => openNodeModal());
    const modalBounds = await page.locator('#nodeModal .modal-box').boundingBox();
    assert.ok(modalBounds.x >= 0 && modalBounds.x + modalBounds.width <= width, 'Modal width');
    if (width <= 760) assert.ok((await page.locator('#iconSelectBtn').boundingBox()).width >= width - 110, 'Mobile editor groups must stack');
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
  await page.locator('[data-prefix="backup"] .ui-select-node').click();
  await page.waitForFunction(() => document.querySelector('.ui-focus').dataset.prefix === 'backup');
  assert.equal(await page.locator('.ui-focus h2').textContent(), '备用媒体库');
  assert.equal(await page.locator('[data-prefix="backup"] .ui-select-node').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.ui-focus-main').evaluate(el => el.getAnimations().length), 0, 'Reduced motion skips selection animation');
  await page.evaluate(() => { navigator.clipboard.writeText = async value => { window.uiCopied = value; }; });
  await page.locator('[data-focus-action="copy"]').click();
  assert.equal(await page.evaluate(() => window.uiCopied), 'https://panel.test/backup');
  await page.locator('[data-focus-action="edit"]').click();
  assert.equal(await page.locator('#remark').inputValue(), '备用媒体库');
  await page.waitForFunction(() => document.activeElement.id === 'remark');
  assert.equal(await page.getByRole('dialog', { name: '节点配置', exact: true }).isVisible(), true);
  assert.equal(await page.locator('.topbar').evaluate(el => el.inert), true);
  failSave = true;
  await page.locator('#submitBtn').click();
  await page.waitForFunction(() => document.getElementById('toast').textContent.includes('测试保存失败'));
  assert.equal(await page.locator('#nodeModal').isVisible(), true);
  assert.equal(await page.getByRole('dialog', { name: '节点配置' }).getByRole('status').count(), 1);
  assert.equal(await page.locator('#toast').evaluate(el => el.closest('[inert]') === null), true, 'Save errors stay in the active accessibility tree');
  failSave = false;
  await page.locator('#submitBtn').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#nodeModal .close-x').evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.activeElement.dataset.focusAction === 'edit');
  assert.equal(await page.locator('.topbar').evaluate(el => el.inert), false);
  await page.locator('[data-focus-action="import"]').click();
  assert.equal(await page.locator('#importModal').isVisible(), true);
  assert.equal(await page.locator('#impPrefix').inputValue(), 'backup');
  assert.equal(await page.getByRole('dialog', { name: '导入播放器', exact: true }).evaluate(el => el.contains(document.activeElement)), true);
  await page.locator('button[onclick="closeImpModal()"]').click();
  await page.locator('[data-focus-action="detail"]').click();
  assert.equal(await page.locator('[data-prefix="backup"] .node-detail').isVisible(), true);
  await page.locator('[data-focus-action="detail"]').click();
  assert.equal(await page.locator('[data-prefix="backup"] .node-detail').isVisible(), true, 'Details action is idempotent');
  await page.evaluate(() => toggleNodesCollapse());
  await page.locator('[data-focus-action="detail"]').click();
  assert.equal(await page.locator('[data-prefix="backup"] .node-detail').isVisible(), true, 'Details reveal a collapsed gallery');
  await page.locator('[data-prefix="archive"] .ui-select-node').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.ui-focus').dataset.watch === 'overdue');
  assert.equal(await page.locator('.ui-cycle-label').textContent(), '已超天数');
  await page.locator('#searchNode').fill('no-such-media-node');
  await page.waitForFunction(() => document.querySelector('.ui-focus').hidden);
  assert.equal(await page.locator('.ui-search-empty').isVisible(), true);
  await page.locator('#searchNode').fill('main');
  await page.waitForFunction(() => document.querySelector('.ui-focus').dataset.prefix === 'main' && !document.querySelector('.ui-focus').hidden);
  await page.locator('.mode-card.mc-all').click();
  await page.locator('.mode-card[data-mode="off"]').click();
  await page.locator('#mmFilter').click();
  await page.locator('[data-prefix="main"] button[title="展开详情"]').click();
  await page.locator('[data-prefix="main"]').getByRole('button', { name: '编辑配置', exact: true }).click();
  await page.locator('#remark').fill('Updated route');
  await page.locator('#nodeTgBotUrl').fill('@AnotherBot');
  await page.locator('#submitBtn').click();
  await page.waitForFunction(() => document.getElementById('nodeModal').style.display === 'none');
  assert.equal(savedNode.remark, 'Updated route');
  assert.equal(savedNode.tgBotUrl, 'https://t.me/AnotherBot');
  await page.waitForFunction(() => document.querySelector('.mode-card.mc-all').getAttribute('aria-pressed') === 'true');
  assert.equal(await page.locator('.emby-card:visible').count(), 6, 'Save/reload resets filter and selected chip together');
  await page.waitForFunction(() => document.querySelector('.ui-focus h2').textContent === 'Updated route');
  await page.locator('.ui-menu-toggle').click();
  assert.equal(await page.getByRole('button', { name: '工具', exact: true }).count(), 1);
  assert.equal(await page.locator('.topbar-actions').isVisible(), true);
  const wasDark = await page.locator('body').evaluate(el => el.classList.contains('dark'));
  await page.locator('#themeToggle').click();
  assert.notEqual(await page.locator('body').evaluate(el => el.classList.contains('dark')), wasDark);
  assert.equal(await page.locator('.topbar-actions').isVisible(), false);
  await page.locator('.ui-menu-toggle').click();
  await page.waitForFunction(() => document.querySelector('#themeToggle .ui-tool-label')?.textContent.includes('切换'));
  assert.match(await page.locator('#themeToggle .ui-tool-label').textContent(), /切换(深|浅)色模式/);
  await page.locator('#themeToggle').click();
  await page.waitForFunction(() => !!document.querySelector('#themeToggle .ui-tool-label'));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-reduced-transparency', value: 'reduce' }] });
  assert.equal(await page.locator('.topbar').evaluate(el => getComputedStyle(el).backdropFilter), 'none');
  assert.equal(await page.locator('.ds-dock').evaluate(el => getComputedStyle(el).backdropFilter), 'none');
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  currentRoutes = [{ ...routes[0], watch_limit: '7', last_play: ago(6.9) }];
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('.ui-cycle-number').textContent === '0.1');
  currentRoutes = [{ ...currentRoutes[0], last_play: ago(9.01) }];
  await page.evaluate(() => load());
  await page.waitForFunction(() => document.querySelector('.ui-focus').dataset.watch === 'overdue');
  assert.equal(await page.locator('.ui-cycle-number').textContent(), '2');
  currentRoutes = [{ ...currentRoutes[0], last_play: 'invalid-record' }];
  await page.evaluate(() => load());
  await page.waitForFunction(() => document.querySelector('.ui-cycle-description strong').textContent === '观看时间待确认');
  role = 'user'; currentRoutes = [{ ...routes[0], prefix: 'member/main', owner: '42' }];
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.ROLE === 'user' && document.querySelector('.ui-focus').dataset.prefix === 'member/main');
  assert.equal(await page.locator('[data-focus-action="edit"]').isVisible(), true);
  assert.equal(await page.locator('[data-focus-action="import"]').isVisible(), true);
  await page.locator('[data-focus-action="edit"]').click();
  assert.equal(await page.locator('#oldPrefix').inputValue(), 'member/main');
  await page.keyboard.press('Escape');
  role = 'sub'; currentRoutes = routes;
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.ROLE === 'sub');
  assert.equal(await page.locator('.ui-batch').isVisible(), false);
  assert.equal(await page.locator('#nodesToolbar').isVisible(), false);
  assert.equal(await page.locator('[data-focus-action="edit"]').isVisible(), false);
  assert.equal(await page.locator('[data-focus-action="import"]').isVisible(), false);
  assert.equal(await page.locator('[data-focus-action="copy"]').isVisible(), true);
  role = 'admin'; currentRoutes = [];
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('[data-ui-metric="total"]')?.textContent === '0');
  assert.equal(await page.locator('.ui-inbox').isVisible(), false);
  assert.equal(await page.locator('.ui-focus').isVisible(), false);
  assert.match(await page.locator('#list-grid').textContent(), /暂无/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('https://panel.test/login', { waitUntil: 'networkidle' });
  await page.screenshot({ path: join(output, 'login-390.png') });
  assert.equal(await page.getByLabel('访问密钥').count(), 1);
  assert.ok((await bounds()).scroll <= 390);
  assert.deepEqual(errors, []);
  if (process.env.UI_PUBLISH_PREVIEWS === '1') {
    for (const [source, target] of [['nodes-1280-light.png', 'preview-desktop.png'], ['nodes-390-light.png', 'preview-mobile.png'], ['nodes-1280-dark.png', 'preview-dark.png']]) {
      writeFileSync(new URL(target, import.meta.url), readFileSync(join(output, source)));
    }
  }
  console.log('UI verified: original backend/scripts/IDs intact; 5 widths, 2 themes, navigation, reachable save action, login.');
} finally { await browser.close(); }

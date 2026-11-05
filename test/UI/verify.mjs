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
  assert.ok(candidate[name].indexOf('id="proxyhub-ui"') < candidate[name].indexOf('<body'), name + ' theme CSS loads before body');
  const ids = html => [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]).sort();
  assert.deepEqual(ids(candidate[name]).filter(id => id !== 'proxyhub-ui' && !id.startsWith('ui-deer-')), ids(original[name]), name + ' DOM hooks');
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
    assert.equal(await page.locator('.ui-metrics [data-ui-metric="attention"]').textContent(), '3');
    assert.equal(await page.locator('.ui-focus').count(), 0, 'Use the UI 2 workspace, not the node stage');
    assert.equal(await page.locator('.ui-rail').count(), 1);
    assert.equal(await page.locator('.ui-mode-segment').count(), 5);
    assert.match(await page.locator('.ui-overview-title').textContent(), /圣诞放映季/);
    assert.equal(await page.locator('.ui-overview .ui-holiday-art svg').getAttribute('aria-hidden'), 'true');
    assert.equal(await page.locator('.ui-holiday-effects').isVisible(), false, 'Reduced motion suppresses decorative movement');
    assert.equal(await page.locator('#rttValue').isVisible(), true, 'RTT remains reachable at every width');
    if (width <= 900) assert.equal(await page.locator('#searchNode').evaluate(el => getComputedStyle(el).fontSize), '16px');
    if (width === 390) {
      assert.ok((await page.locator('.emby-card').first().boundingBox()).y < 780, 'First route remains near the initial mobile viewport');
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
        return [...document.querySelectorAll('.hero-sub,.card-sub,.card-remark,.watch-alert-actions strong,.watch-meter-head strong,.btn-submit,.ui-overview-title span,.ui-metrics dt,.ui-metrics dd')]
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
      if (width <= 900) {
        await page.locator('.ui-menu-toggle').click();
        const alignment = await page.evaluate(() => {
          const themeButton = document.getElementById('themeToggle');
          const peerButton = document.getElementById('nodeReqBtn');
          const theme = themeButton.querySelector('.ui-tool-label').getBoundingClientRect();
          const peer = peerButton.querySelector('.ui-tool-label').getBoundingClientRect();
          const menu = document.querySelector('.topbar-actions').getBoundingClientRect();
          const button = themeButton.getBoundingClientRect();
          const styles = [themeButton, peerButton].map(el => {
            const style = getComputedStyle(el), rect = el.getBoundingClientRect();
            return { x: rect.x, width: rect.width, padding: style.padding, gap: style.gap, margin: style.margin };
          });
          return { labelOffset: theme.x - peer.x, contained: button.x >= menu.x && button.right <= menu.right, styles };
        });
        if (width === 390) await page.screenshot({ path: join(output, `tools-${dark ? 'dark' : 'light'}.png`) });
        assert.ok(Math.abs(alignment.labelOffset) <= 1 && alignment.contained, 'Tool labels align: ' + JSON.stringify(alignment));
        await page.locator('.ui-menu-toggle').click();
      }
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
    if (width <= 900) assert.ok((await page.locator('#iconSelectBtn').boundingBox()).width >= width - 110, 'Mobile editor groups must stack');
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
  await page.locator('[data-prefix="backup"] button[title="展开详情"]').click();
  await page.evaluate(() => { navigator.clipboard.writeText = async value => { window.uiCopied = value; }; });
  await page.locator('[data-prefix="backup"] .node-summary button[title="复制直达链接"]').click();
  assert.equal(await page.evaluate(() => window.uiCopied), 'https://panel.test/backup');
  const editBackup = page.locator('[data-prefix="backup"]').getByRole('button', { name: '编辑配置', exact: true });
  await editBackup.click();
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
  await page.waitForFunction(() => document.activeElement.textContent === '编辑配置');
  assert.equal(await editBackup.evaluate(el => el === document.activeElement), true);
  assert.equal(await page.locator('.topbar').evaluate(el => el.inert), false);
  await page.locator('[data-prefix="backup"] .card-footer button[onclick^="openImportModal("]').click();
  assert.equal(await page.locator('#importModal').isVisible(), true);
  assert.equal(await page.locator('#impPrefix').inputValue(), 'backup');
  assert.equal(await page.getByRole('dialog', { name: '导入播放器', exact: true }).evaluate(el => el.contains(document.activeElement)), true);
  await page.locator('button[onclick="closeImpModal()"]').click();
  await page.locator('#searchNode').fill('no-such-media-node');
  await page.waitForFunction(() => [...document.querySelectorAll('.emby-card')].every(el => el.style.display === 'none'));
  await page.locator('#searchNode').fill('main');
  await page.waitForFunction(() => document.querySelector('[data-prefix="main"]').style.display !== 'none');
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
  await page.waitForFunction(() => document.querySelector('[data-prefix="main"] .ui-node-title').textContent.includes('Updated route'));
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
  await page.waitForFunction(() => document.querySelector('.watch-meter-head strong')?.textContent === '剩余 0.1 天');
  currentRoutes = [{ ...currentRoutes[0], last_play: ago(9.01) }];
  await page.evaluate(() => load());
  await page.waitForFunction(() => document.querySelector('.watch-meter-head strong')?.textContent === '已超 2 天');
  currentRoutes = [{ ...currentRoutes[0], last_play: 'invalid-record' }];
  await page.evaluate(() => load());
  await page.waitForFunction(() => document.querySelector('.watch-meter-head strong')?.textContent === '观看时间待确认');
  role = 'user'; currentRoutes = [{ ...routes[0], prefix: 'member/main', owner: '42' }];
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.ROLE === 'user' && document.querySelector('[data-prefix="member/main"]'));
  await page.locator('[data-prefix="member/main"] button[title="展开详情"]').click();
  await page.locator('[data-prefix="member/main"]').getByRole('button', { name: '编辑配置', exact: true }).click();
  assert.equal(await page.locator('#oldPrefix').inputValue(), 'member/main');
  await page.keyboard.press('Escape');
  role = 'sub'; currentRoutes = routes;
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.ROLE === 'sub');
  assert.equal(await page.locator('.ui-batch').isVisible(), false);
  assert.equal(await page.locator('#nodesToolbar').isVisible(), false);
  await page.locator('[data-prefix="main"] button[title="展开详情"]').click();
  assert.equal(await page.locator('[data-prefix="main"] .card-footer').isVisible(), false);
  assert.equal(await page.locator('[data-prefix="main"] .node-summary button[title="复制直达链接"]').isVisible(), true);
  role = 'admin'; currentRoutes = [];
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('[data-ui-metric="total"]')?.textContent === '0');
  assert.equal(await page.locator('.ui-inbox').isVisible(), false);
  assert.equal(await page.locator('.ui-mode-segment').count(), 0);
  assert.match(await page.locator('#list-grid').textContent(), /暂无/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('https://panel.test/login', { waitUntil: 'networkidle' });
  await page.screenshot({ path: join(output, 'login-390.png') });
  assert.equal(await page.getByLabel('访问密钥').count(), 1);
  assert.ok((await bounds()).scroll <= 390);

  // Exercise the real CSS animations separately from the reduced-motion UI suite.
  role = 'admin'; currentRoutes = routes;
  const motionPage = await context.newPage();
  motionPage.on('pageerror', error => errors.push(error.message));
  await motionPage.emulateMedia({ reducedMotion: 'no-preference' });
  await motionPage.bringToFront();
  await motionPage.goto('https://panel.test', { waitUntil: 'networkidle' });
  await motionPage.waitForFunction(() => document.querySelectorAll('.emby-card').length === 6);
  assert.equal(await motionPage.locator('.ui-holiday-effects').isVisible(), true);
  assert.equal(await motionPage.locator('.ui-holiday-effects').getAttribute('aria-hidden'), 'true');
  assert.equal(await motionPage.locator('.ui-holiday-effects').evaluate(el => el.inert), true);
  assert.equal(await motionPage.locator('.ui-snowflake').count(), 28);
  const startTransforms = await motionPage.evaluate(() => ['.ui-snowflake', '.ui-reindeer', '.ui-deer-leg'].map(selector => getComputedStyle(document.querySelector(selector)).transform));
  await motionPage.waitForFunction(previous => ['.ui-snowflake', '.ui-reindeer', '.ui-deer-leg'].every((selector, i) => getComputedStyle(document.querySelector(selector)).transform !== previous[i]), startTransforms);
  assert.equal(await motionPage.locator('.ui-holiday-effects').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
  await motionPage.locator('#searchNode').fill('backup');
  await motionPage.waitForFunction(() => document.querySelector('[data-prefix="main"]').style.display === 'none');
  await motionPage.locator('.mode-card.mc-all').click();

  for (const width of [1280, 390]) {
    await motionPage.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const dark of [false, true]) {
      await motionPage.evaluate(dark => {
        document.body.classList.toggle('dark', dark); document.documentElement.classList.toggle('dark', dark);
        window.scrollTo({ top: 0, behavior: 'instant' });
        for (const animation of document.querySelector('.ui-holiday-effects').getAnimations({ subtree: true })) {
          animation.pause();
          const timing = animation.effect.getTiming();
          animation.currentTime = animation.effect.target.classList.contains('ui-reindeer') ? Number(timing.duration) * .4 + timing.delay : 4000;
        }
      }, dark);
      await motionPage.evaluate(() => Promise.all(document.getAnimations().filter(animation => 'transitionProperty' in animation).map(animation => animation.finished.catch(() => {}))));
      await motionPage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await motionPage.waitForFunction(() => !document.getElementById('toast').classList.contains('show'));
      assert.equal(await motionPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (width === 390) {
        assert.equal(await motionPage.locator('.ui-snowflake:visible').count(), 16);
        const deer = await motionPage.locator('.ui-deer-trail').boundingBox();
        const nav = await motionPage.locator('.ds-dock').boundingBox();
        assert.ok(deer.y + deer.height <= nav.y + 1, 'Reindeer route stays above mobile navigation');
      }
      await motionPage.screenshot({ path: join(output, `motion-${width}-${dark ? 'dark' : 'light'}.png`) });
    }
  }
  await motionPage.locator('.ui-menu-toggle').click();
  await motionPage.getByRole('button', { name: '暂停圣诞动效', exact: true }).click();
  assert.equal(await motionPage.locator('.ui-holiday-effects').isVisible(), false);
  await motionPage.reload({ waitUntil: 'networkidle' });
  assert.equal(await motionPage.locator('.ui-motion-toggle').getAttribute('aria-pressed'), 'false', 'Pause preference survives reload');
  await motionPage.locator('.ui-menu-toggle').click();
  await motionPage.getByRole('button', { name: '开启圣诞动效', exact: true }).click();
  assert.equal(await motionPage.locator('.ui-holiday-effects').isVisible(), true);
  await motionPage.emulateMedia({ reducedMotion: 'reduce' });
  await motionPage.waitForFunction(() => document.querySelector('.ui-motion-toggle').disabled);
  assert.equal(await motionPage.locator('.ui-holiday-effects').isVisible(), false);
  await motionPage.emulateMedia({ reducedMotion: 'no-preference' });
  await motionPage.waitForFunction(() => !document.querySelector('.ui-holiday-effects').hidden);
  await motionPage.goto('https://panel.test/login', { waitUntil: 'networkidle' });
  assert.equal(await motionPage.locator('.ui-login-motion').isVisible(), true);
  await motionPage.locator('.ui-login-motion').click();
  assert.equal(await motionPage.locator('.ui-holiday-effects').isVisible(), false);
  await motionPage.close();
  assert.deepEqual(errors, []);
  if (process.env.UI_PUBLISH_PREVIEWS === '1') {
    for (const [source, target] of [['motion-1280-light.png', 'preview-desktop.png'], ['motion-390-light.png', 'preview-mobile.png'], ['motion-1280-dark.png', 'preview-dark.png']]) {
      writeFileSync(new URL(target, import.meta.url), readFileSync(join(output, source)));
    }
  }
  console.log('UI verified: plaintext baseline intact; responsive UI, real snow/reindeer animation, click-through, saved toggle, reduced motion and login.');
} finally { await browser.close(); }

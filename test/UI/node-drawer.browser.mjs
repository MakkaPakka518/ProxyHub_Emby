// UI_TEST_TOOLS=/path/to/playwright-install node --experimental-vm-modules test/UI/node-drawer.browser.mjs
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const require = createRequire(resolve(process.env.UI_TEST_TOOLS || '.', 'package.json'));
const { chromium } = require('playwright');
const source = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
const sandbox = vm.createContext({ console, URL, URLSearchParams, Request, Response, Headers, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, crypto: webcrypto, atob, btoa });
const worker = new vm.SourceTextModule(source + '\nexport { HTML_UI };', { context: sandbox });
await worker.link(() => new vm.SyntheticModule(['connect'], function () {
  this.setExport('connect', () => { throw new Error('No sockets in UI checks'); });
}, { context: sandbox }));
await worker.evaluate();
for (const script of worker.namespace.HTML_UI.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
const output = resolve(process.env.UI_TEST_OUTPUT || '/tmp/opencode/proxyhub-node-drawer');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
const errors = [], posts = [];
let failSave = false;
let routes = [{ prefix: 'existing', remark: '现有媒体节点', target: 'https://origin.example,https://backup.example', mode: 'off', cache_img: 'on', watch_limit: '7', last_play: new Date().toISOString(), todayReqs: 0, totalReqs: 0, todayBandwidth: '0 B', node_user: 'viewer', node_pass: 'example-password' }];
try {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const routeHandler = async route => {
    const req = route.request(), url = new URL(req.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.origin === 'https://panel.test') {
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: worker.namespace.HTML_UI });
      if (url.pathname === '/api/routes') {
        if (req.method() === 'POST') {
          const data = req.postDataJSON(); posts.push(data);
          if (failSave) return json({ error: '测试保存失败' }, 503);
          const old = routes.find(row => row.prefix === data.oldPrefix);
          routes = routes.filter(row => row.prefix !== data.oldPrefix && row.prefix !== data.prefix).concat({ todayReqs: 0, totalReqs: 0, todayBandwidth: '0 B', ...old, ...data, watch_limit: data.watchLimit, node_user: data.nodeUser, node_pass: data.nodePass, tg_bot_url: data.tgBotUrl });
          return json({ success: true });
        }
        return json(routes);
      }
      if (url.pathname === '/api/me') return json({ success: true, role: 'admin' });
      if (url.pathname === '/api/version') return json({ success: true, version: '4.1.3', updateNotify: false });
      if (url.pathname === '/api/ping-node') return json({ ms: 42 });
      if (url.pathname === '/api/ipguard') return json({ success: true, mode: 'off', ips: [], countries: [] });
      if (url.pathname === '/__client_rtt__') return route.fulfill({ status: 204 });
      return json({ success: true, list: [], items: [], requests: [], users: [], logs: [], stats: {} });
    }
    if (req.resourceType() === 'script') return route.fulfill({ contentType: 'application/javascript', body: 'window.Sortable={create(){return {destroy(){}}}};window.Chart=class{static defaults={};destroy(){}update(){}};' });
    if (req.resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"/>' });
    return json([]);
  };
  await context.route('**/*', routeHandler);
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto('https://panel.test');
  await page.waitForFunction(() => document.querySelectorAll('.emby-card').length === 1);
  const drawer = page.locator('#nodeModal');
  const add = page.locator('button[onclick="openNodeModal()"]').first();
  for (const [width, height] of [[1440, 1000], [1024, 768], [768, 1024], [640, 844], [390, 844], [320, 700]]) {
    await page.setViewportSize({ width, height });
    for (const dark of [false, true]) {
      await page.evaluate(dark => { document.body.classList.toggle('dark', dark); document.documentElement.classList.toggle('dark', dark); }, dark);
      await add.click();
      assert.equal(await drawer.evaluate(el => el.matches(':modal')), true);
      assert.equal(await page.getByRole('dialog', { name: '添加节点', exact: true }).count(), 1);
      assert.equal(await page.locator('#remark').evaluate(el => el === document.activeElement), true);
      const bounds = await drawer.boundingBox();
      assert.ok(Math.abs(bounds.x + bounds.width - width) < 1 && Math.abs(bounds.y) < 1);
      assert.ok(Math.abs(bounds.height - height) < 1);
      assert.ok(width <= 640 ? bounds.width === width : bounds.width === 720);
      const header = await page.locator('.node-drawer-head').boundingBox();
      const footer = await page.locator('.node-drawer-footer').boundingBox();
      const content = page.locator('.node-drawer-scroll');
      const field = await page.locator('#remark').boundingBox();
      const title = await page.locator('#nodeModalTitle').boundingBox();
      assert.ok(Math.abs(field.x - title.x) < 1, 'Heading and fields share an inset');
      const submit = await page.locator('#submitBtn').boundingBox();
      const rightField = await page.locator('#prefix').boundingBox();
      assert.ok(Math.abs(submit.x + submit.width - rightField.x - rightField.width) < 1, 'Footer and fields share a right edge: ' + JSON.stringify({ bounds, field, rightField, submit }));
      await content.evaluate(el => { el.scrollTop = el.scrollHeight; });
      assert.deepEqual(await page.locator('.node-drawer-head').boundingBox(), header, 'Header stays fixed while the form scrolls');
      assert.deepEqual(await page.locator('.node-drawer-footer').boundingBox(), footer, 'Footer stays fixed while the form scrolls');
      assert.equal(await page.locator('#submitBtn').evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), true);
      assert.equal(await content.evaluate(el => el.scrollWidth > el.clientWidth), false);
      await content.evaluate(el => { el.scrollTop = 0; });
      if ([1440, 390].includes(width)) await page.screenshot({ path: join(output, `drawer-${width}-${dark ? 'dark' : 'light'}.png`) });
      await page.locator('#submitBtn').focus(); await page.keyboard.press('Tab');
      assert.equal(await drawer.locator('.close-x').evaluate(el => el === document.activeElement), true, await page.evaluate(() => document.activeElement.outerHTML.slice(0, 250)));
      await page.keyboard.press('Escape');
      assert.equal(await drawer.evaluate(el => el.open), false);
      assert.equal(await add.evaluate(el => el === document.activeElement), true);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 }); await add.click();
  await page.mouse.click(50, 150); assert.equal(await drawer.evaluate(el => el.open), false, 'Backdrop dismisses the desktop drawer');
  await add.click(); await page.locator('#iconSelectBtn').click();
  await page.keyboard.press('Escape');
  assert.equal(await drawer.evaluate(el => el.open), true, 'Escape closes the icon picker first');
  assert.equal(await page.locator('#iconPickerPanel').isVisible(), false);
  await drawer.getByRole('button', { name: '取消', exact: true }).click();

  if (!await page.locator('#list-grid').isVisible()) await page.locator('#nodesHint').click();
  await page.locator('[data-prefix="existing"] button[title="展开详情"]').click();
  const edit = page.locator('[data-prefix="existing"] button[onclick^="editNode("]').first();
  await edit.click();
  assert.equal(await page.getByRole('dialog', { name: '编辑节点', exact: true }).count(), 1);
  assert.equal(await page.getByLabel('节点备注', { exact: true }).inputValue(), '现有媒体节点');
  assert.equal(await page.getByLabel('备用线路 1', { exact: true }).inputValue(), 'https://backup.example');
  await page.getByLabel('反代模式', { exact: true }).selectOption('emos');
  assert.equal(await page.locator('#emosFields').isVisible(), true);
  await page.locator('#nodeTgBotUrl').fill('https://example.org/invalid-bot');
  await page.locator('#submitBtn').click();
  assert.equal(await drawer.evaluate(el => el.open), true);
  assert.equal(await page.locator('#nodeTgBotUrl').evaluate(el => !el.validity.valid && document.activeElement === el), true, 'Native validation focuses the invalid field inside the drawer');
  assert.equal(posts.length, 0);
  await page.locator('#nodeTgBotUrl').fill('@ExampleBot');
  await page.getByLabel('节点备注', { exact: true }).fill('编辑后保留的节点');
  failSave = true; await page.locator('#submitBtn').click();
  await page.waitForFunction(() => document.querySelector('.ng-card')?.dataset.ngState === 'error');
  assert.equal(await drawer.evaluate(el => el.open), false);
  await page.getByRole('button', { name: '返回编辑', exact: true }).click();
  assert.equal(await drawer.evaluate(el => el.open), true);
  assert.equal(await page.locator('#remark').inputValue(), '编辑后保留的节点');
  assert.equal(await page.locator('#nodePass').inputValue(), 'example-password');
  failSave = false; await page.locator('#submitBtn').click();
  await page.waitForFunction(() => document.querySelector('.ng-card')?.dataset.ngState === 'success');
  assert.equal(posts.at(-1).oldPrefix, 'existing');
  assert.equal(posts.at(-1).mode, 'emos');
  assert.equal(posts.at(-1).tgBotUrl, 'https://t.me/ExampleBot');
  assert.equal(await page.locator('#toast').evaluate(el => el.parentElement === document.body), true);
  await add.click();
  await page.locator('#remark').fill('新媒体节点'); await page.locator('#prefix').fill('existing');
  await page.getByLabel('主线路地址', { exact: true }).fill('https://new-origin.example');
  await page.getByLabel('备用线路 1', { exact: true }).fill('https://new-backup.example');
  await page.locator('#submitBtn').click();
  assert.equal(await drawer.evaluate(el => el.open), true);
  assert.match(await drawer.getByRole('status').textContent(), /后缀已存在/);
  assert.equal(await drawer.getByRole('status').isVisible(), true, 'Validation feedback stays inside the top-layer drawer');
  await page.locator('#prefix').fill('new-node');
  await page.locator('#submitBtn').click();
  await page.waitForFunction(() => document.querySelector('[data-prefix="new-node"]')?.dataset.ngState === 'success');
  assert.equal(posts.at(-1).oldPrefix, '');
  assert.equal(posts.at(-1).target, 'https://new-origin.example,https://new-backup.example');

  await page.setViewportSize({ width: 390, height: 500 }); await add.click();
  assert.ok((await page.locator('.node-drawer-footer').boundingBox()).y < 500, 'Save stays in a keyboard-sized viewport');
  await drawer.locator('.close-x').click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => openNodeModal());
    await page.waitForFunction(() => document.getElementById('nodeModal').getAnimations().length > 0);
    const animation = await drawer.evaluate(el => el.getAnimations()[0].effect.getKeyframes().map(frame => frame.transform));
    assert.ok(animation.some(value => value.includes(width <= 640 ? 'translateY' : 'translateX')), 'Entry motion follows the surface direction');
    await page.evaluate(() => { closeNodeModal(); openNodeModal(); });
    assert.equal(await drawer.evaluate(el => el.open), true, 'Interrupted close can reopen');
    await drawer.locator('.close-x').click();
  }
  assert.deepEqual(errors, []);
  await context.close();
  const touchContext = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 }, reducedMotion: 'reduce' });
  await touchContext.route('**/*', routeHandler);
  const touch = await touchContext.newPage();
  await touch.goto('https://panel.test');
  await touch.locator('button[onclick="openNodeModal()"]').first().tap();
  assert.equal((await touch.locator('#nodeModal').boundingBox()).width, 844, 'Touch phones remain full width in landscape');
  await touch.setViewportSize({ width: 390, height: 844 });
  await touch.evaluate(() => {
    Object.defineProperty(visualViewport, 'height', { configurable: true, value: 500 });
    Object.defineProperty(visualViewport, 'offsetTop', { configurable: true, value: 20 });
    visualViewport.dispatchEvent(new Event('resize'));
  });
  const keyboardBounds = await touch.locator('#nodeModal').boundingBox();
  assert.equal(keyboardBounds.height, 500);
  assert.equal(keyboardBounds.y, 20);
  const keyboardFooter = await touch.locator('.node-drawer-footer').boundingBox();
  assert.equal(keyboardFooter.y + keyboardFooter.height, 520, 'Footer follows the visual viewport above a simulated keyboard');
  await touch.evaluate(() => { delete visualViewport.height; delete visualViewport.offsetTop; visualViewport.dispatchEvent(new Event('resize')); });
  await touch.locator('#nodeModal .close-x').tap();
  assert.equal(await touch.locator('#nodeModal').evaluate(el => el.open), false);
  await touchContext.close();
  console.log('PASS: responsive node Drawer, fixed header/footer, alignment, keyboard/focus, validation, add/edit saves and failure recovery');
} finally { await browser.close(); }

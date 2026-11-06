import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export async function verifyRefinements(page, output) {
  const settleTheme = () => page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await Promise.all(document.getAnimations().filter(animation => animation instanceof CSSTransition).map(animation => animation.finished.catch(() => {})));
  });
  const auditSource = process.env.UI_CLIP_AUDIT ? readFileSync(process.env.UI_CLIP_AUDIT, 'utf8') : null;
  const audits = [];
  async function audit(label, root) {
    if (!auditSource) return;
    const report = await page.evaluate('(' + auditSource + ')(' + JSON.stringify({ root, hover: false }) + ')');
    audits.push({ label, ...report });
    assert.equal(report.cut, 0, label + ': ' + JSON.stringify(report.issues));
  }
  const evidence = [];
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.evaluate(() => { if (!isFoldOpen(document.getElementById('list-grid'))) toggleNodesCollapse(); });
    const weights = [];
    for (const dark of [false, true]) {
      await page.evaluate(dark => { document.body.classList.toggle('dark', dark); document.documentElement.classList.toggle('dark', dark); scrollTo(0, 0); }, dark);
      await settleTheme();
      const style = await page.evaluate(() => {
        const rgb = value => value.match(/[\d.]+/g).map(Number).slice(0, 3);
        const luminance = values => values.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
        const colors = ['body', '#deploy-card', '.mode-card'].map(selector => rgb(getComputedStyle(document.querySelector(selector)).backgroundColor));
        const levels = colors.map(color => (Math.max(...color) + Math.min(...color)) / 510);
        const foreground = rgb(getComputedStyle(document.body).color), a = luminance(foreground), b = luminance(colors[0]);
        return {
          colors, levels, textContrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05),
          weights: ['body', '.hero-card h1', '.node-name', '.btn-submit', '.mc-count'].map(selector => +getComputedStyle(document.querySelector(selector)).fontWeight),
          numeric: getComputedStyle(document.querySelector('.bw-val')).fontVariantNumeric,
          pretty: getComputedStyle(document.querySelector('.mc-desc')).textWrapStyle,
          overflow: document.documentElement.scrollWidth > innerWidth,
          overflowNodes: [...document.body.querySelectorAll('*')].filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().right > innerWidth + 1).slice(0, 6).map(el => ({ node: el.tagName + '#' + el.id + '.' + el.className, right: el.getBoundingClientRect().right })),
          border: getComputedStyle(document.querySelector('.mode-card')).borderTopWidth,
          topbarBottom: document.querySelector('.topbar').getBoundingClientRect().bottom,
          contentTop: document.querySelector('#deploy-card').getBoundingClientRect().top,
        };
      });
      evidence.push({ width, dark, ...style }); weights.push(style.weights);
      await page.screenshot({ path: join(output, `refined-nodes-${width}-${dark ? 'dark' : 'light'}.png`), fullPage: true });
      assert.equal(style.overflow, false, JSON.stringify(style.overflowNodes));
      assert.ok(style.contentTop >= style.topbarBottom, 'Mobile navigation must not cover the first section: ' + JSON.stringify(style));
      assert.ok(style.colors.every(color => Math.min(...color) > 0), 'Surfaces avoid pure black');
      for (let i = 1; i < style.levels.length; i++) assert.ok(Math.abs(style.levels[i] - style.levels[i - 1]) >= .01 && Math.abs(style.levels[i] - style.levels[i - 1]) <= .031, 'Adjacent surfaces differ by 1–3%: ' + JSON.stringify(style.levels));
      assert.ok(style.textContrast >= 4.5); assert.equal(style.border, '0px');
      assert.match(style.numeric, /tabular-nums/); assert.equal(style.pretty, 'pretty');
      await audit('node list ' + width + ' ' + dark, '#view-nodes');
      await page.locator('button[onclick="openNodeModal()"]').first().click();
      const field = page.locator('#remark');
      const idle = await field.evaluate(el => getComputedStyle(el).boxShadow);
      await field.click();
      await page.waitForFunction(before => getComputedStyle(document.getElementById('remark')).boxShadow !== before, idle);
      const focus = await field.evaluate(el => ({ shadow: getComputedStyle(el).boxShadow, outline: getComputedStyle(el).outlineStyle }));
      assert.notEqual(focus.shadow, idle); assert.match(focus.shadow, /inset/); assert.equal(focus.outline, 'none');
      assert.match(focus.shadow, /0px 0px 2px 3px/, 'Pointer focus uses a soft outer shadow, not a solid bright ring');
      await page.screenshot({ path: join(output, `refined-focus-${width}-${dark ? 'dark' : 'light'}.png`) });
      await audit('drawer focus ' + width + ' ' + dark, 'body');
      await page.locator('#nodeModal .close-x').click();
    }
    weights[0].forEach((weight, i) => assert.equal(weights[1][i], weight - 100, 'Every sampled role drops one weight in dark mode: ' + JSON.stringify(weights)));
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const toggle = page.locator('[data-prefix="existing"] button[onclick="toggleNodeDetail(this)"]');
  await toggle.click();
  const fold = page.locator('[data-prefix="existing"] > .ui-fold');
  assert.equal(await fold.evaluate(el => el.inert), false);
  const frames = await fold.evaluate(el => el.getAnimations().filter(animation => animation.transitionProperty === 'grid-template-rows').length);
  assert.equal(frames, 1, 'Node disclosure uses the Grid row transition');
  await page.waitForTimeout(300);
  const expanded = await fold.boundingBox(); assert.ok(expanded.height > 100);
  await audit('expanded node', '#view-nodes');
  await toggle.click();
  assert.equal(await fold.evaluate(el => el.inert), true);
  await page.waitForTimeout(300);
  assert.equal((await fold.boundingBox()).height, 0);
  await toggle.click(); await toggle.click(); await toggle.click();
  assert.equal(await fold.getAttribute('data-open'), 'true', 'Rapid reversals keep the latest disclosure state');
  await page.waitForTimeout(300);

  const copy = page.locator('[data-prefix="existing"] .node-summary button[title="复制直达链接"]');
  await page.evaluate(() => { navigator.clipboard.writeText = value => new Promise(resolve => { window.finishCopy = () => { window.copiedValue = value; resolve(); }; }); });
  await copy.click(); assert.equal(await copy.locator('.copy-confirm').count(), 0, 'No success before clipboard completion');
  await page.evaluate(() => finishCopy());
  await copy.locator('.copy-confirm').waitFor();
  assert.equal(await page.evaluate(() => window.copiedValue), 'https://panel.test/existing');
  const spring = await copy.locator('.copy-confirm').evaluate(el => el.getAnimations()[0]?.effect.getKeyframes().map(frame => frame.transform));
  assert.ok(spring?.some(transform => Number(transform.match(/scale\(([^)]+)\)/)?.[1]) > 1), 'Success check has an underdamped overshoot');
  await page.evaluate(() => { navigator.clipboard.writeText = async () => {}; });
  await copy.click(); assert.equal(await copy.locator('.copy-confirm').count(), 1, 'Repeated copy reuses one confirmation');
  await audit('copy button hover', '#view-nodes');
  await copy.locator('.copy-confirm').waitFor({ state: 'detached', timeout: 3500 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await copy.click(); assert.equal(await copy.locator('.copy-confirm').evaluate(el => el.getAnimations().length), 0);
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('denied'); }; });
  await copy.click(); assert.equal(await copy.locator('.copy-confirm').count(), 0, 'A failed copy clears any previous success');
  assert.match(await page.locator('#toast').textContent(), /复制失败/);
  await page.locator('.ds-dock-item[onclick*="speed"]').click();
  const section = page.locator('#view-speed .collapse-sec').first();
  await section.locator('.collapse-head').click();
  assert.equal(await section.locator('.ui-fold').getAttribute('data-open'), 'true');
  await section.locator('.collapse-head').click();
  assert.equal(await section.locator('.ui-fold').evaluate(el => el.inert), true);
  await page.locator('.ds-dock-item[onclick*="settings"]').click();
  await page.screenshot({ path: join(output, 'refined-settings.png'), fullPage: true });
  await page.evaluate(() => openAccountModal());
  const accountSection = page.locator('#accountModal [onclick^="tgSetSec("]').first();
  await accountSection.click();
  assert.equal(await accountSection.getAttribute('aria-expanded'), 'true');
  await accountSection.click();
  assert.equal(await accountSection.getAttribute('aria-expanded'), 'false');
  await page.evaluate(() => closeAccountModal());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.ph-tools summary').click();
  await page.locator('#themeToggle').click();
  await page.locator('.ph-tools summary').click();
  assert.match(await page.locator('#themeToggle .ph-tool-label').textContent(), /切换(浅色|深色)模式/);
  await page.keyboard.press('Escape');
  await page.goto('https://panel.test/login');
  for (const dark of [false, true]) {
    await page.evaluate(dark => { document.documentElement.classList.toggle('dark', dark); document.body.classList.toggle('dark', dark); }, dark);
    await settleTheme();
    const login = await page.locator('.login-box h2').evaluate(el => ({ background: getComputedStyle(el).backgroundImage, fill: getComputedStyle(el).webkitTextFillColor, color: getComputedStyle(document.body).color }));
    assert.equal(login.background, 'none'); assert.equal(login.fill, login.color);
    await audit('login ' + dark, 'body');
    await page.screenshot({ path: join(output, `refined-login-${dark ? 'dark' : 'light'}.png`) });
  }
  writeFileSync(join(output, 'refinement-evidence.json'), JSON.stringify({ evidence, audits }, null, 2));
  await page.goto('https://panel.test');
  await page.waitForFunction(() => document.querySelectorAll('.emby-card').length === 1);
}

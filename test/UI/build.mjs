// node --experimental-vm-modules test/UI/build.mjs
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const source = read('../../明文/worker.js');
const context = vm.createContext({ console, URL, URLSearchParams, Request, Response, Headers,
  TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, crypto: webcrypto, atob, btoa });
const module = new vm.SourceTextModule(source + '\nexport { HTML_UI, LOGIN_UI };', { context });
await module.link(specifier => {
  assert.equal(specifier, 'cloudflare:sockets');
  return new vm.SyntheticModule(['connect'], function () {
    this.setExport('connect', () => { throw new Error('UI build must not open sockets'); });
  }, { context });
});
await module.evaluate({ timeout: 15000 });

const css = read('panel.css');
const script = read('panel.js');
function refine(html, login = false) {
  html = html.replace(/,?\s*(?:maximum-scale=1\.0|user-scalable=no)/g, '');
  html = html.replace('<body>', '<body class="ui-studio' + (login ? ' ui-login' : '') + '">');
  // Keep the legacy dark selectors functional without outranking the new palette.
  html = html.replace(/<style([^>]*)>([\s\S]*?)<\/style>/g,
    (_, attrs, styles) => '<style' + attrs + '>' + styles.replaceAll('body.dark', ':where(body.dark)') + '</style>');
  html = html.replace(/<div class="dm-layer"[^>]*>[\s\S]*?<\/div>/, '');
  html = html.replace(/<span class="mc-idx"[^>]*>[^<]*<\/span>/g, '');
  html = html.replace(/NEBULA · v([\d.]+)/, 'v$1 / Christmas');
  html = html.replace('<div class="topbar-title">反代控制台<small>CF Worker</small></div>',
    '<div class="topbar-title">ProxyHub<small>Emby 反代控制台</small></div>');
  html = html.replace('placeholder="搜索备注/后缀/线路地址查找..."',
    'aria-label="搜索节点" placeholder="搜索节点、后缀或线路"');
  html = html.replace('<div class="card">\n                <div class="card-header"',
    '<div class="card library-card">\n                <div class="card-header"');
  html = html.replace('<nav class="ds-dock">', '<nav class="ds-dock" aria-label="主导航">');
  html = html.replace('五种反代模式', '反代模式');
  if (login) {
    html = html.replace('<h2>安全中心</h2>', '<h2>登录 ProxyHub</h2>')
      .replace('placeholder="请输入密钥 TOKEN"', 'aria-label="访问密钥" placeholder="输入访问密钥"')
      .replace('>验 证 登 录</button>', '>登录面板</button>');
  }
  // Load the override before body parsing so the legacy theme never paints first.
  const style = '<style id="proxyhub-ui">' + css + '</style>';
  const scriptTag = '<script>' + script + '</script>';
  assert.ok(html.includes('class="ui-studio') && html.includes('<body'), 'Expected body element');
  html = html.replace('<body', style + '<body');
  return html.includes('</body>') ? html.replace('</body>', scriptTag + '</body>') : html + scriptTag + '</body></html>';
}

const loginStart = source.indexOf('const LOGIN_UI = `');
const panelStart = source.indexOf('const HTML_UI = `', loginStart);
const panelEnd = source.indexOf('// ==========================================\n// 2. 后端 Worker', panelStart);
assert.ok(loginStart > 0 && panelStart > loginStart && panelEnd > panelStart, 'UI template anchors changed');
const panel = refine(module.namespace.HTML_UI);
const login = refine(module.namespace.LOGIN_UI, true);
const template = html => '`' + html.replace(/^[ \t]+$/gm, '').replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${') + '`';
const output = source.slice(0, loginStart) + 'const LOGIN_UI = ' + template(login)
  + ';\n\nconst HTML_UI = ' + template(panel) + ';\n\n' + source.slice(panelEnd);
writeFileSync(new URL('worker.js', import.meta.url), output);
console.log('Built readable test/UI/worker.js from 明文/worker.js; replaced login and panel templates only.');

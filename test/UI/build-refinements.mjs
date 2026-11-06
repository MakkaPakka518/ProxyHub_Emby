import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const target = new URL('./worker.js', import.meta.url);
const css = readFileSync(new URL('./refinements.css', import.meta.url), 'utf8');
let source = readFileSync(target, 'utf8');
// The quiet surface theme uses the mode icons without the former WebGL scene.
source = source.replace(/<!-- SHADER_FLOOD_START -->[\s\S]*?\/\* The Worker embeds this adapter and the complete framework-neutral engine\. \*\//,
  '<!-- MODE_ICONS_START -->\n<script>\n/* Lucide icon geometry (ISC), retained from the LeiBox / ShaderFlood adapter. */')
  .replace('<!-- SHADER_FLOOD_END -->', '<!-- MODE_ICONS_END -->');
const marker = /\/\/ REFINEMENT_CSS_START[\s\S]*?\/\/ REFINEMENT_CSS_END\n/;
const literal = '`' + css.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${') + '`';
const block = '// REFINEMENT_CSS_START\nconst REFINEMENT_CSS = ' + literal + ';\n// REFINEMENT_CSS_END\n';
assert.ok(source.includes('${REFINEMENT_CSS}'), 'Worker must reference the embedded refinement styles');
if (marker.test(source)) source = source.replace(marker, () => block);
else {
  assert.ok(source.includes('const CSS_COMMON = `'), 'Missing shared CSS anchor');
  source = source.replace('const CSS_COMMON = `', () => block + '\nconst CSS_COMMON = `');
}
writeFileSync(target, source);
console.log('Embedded refinements.css in test/UI/worker.js');

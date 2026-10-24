// Builds dist/ritmo.html: one self-contained file that also works when opened from disk.
import { build } from '/tmp/claude-0/build/node_modules/esbuild/lib/main.js';
import fs from 'fs';
const r = await build({ entryPoints: ['js/main.js'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020', define: { 'import.meta.url': 'location.href' } });
const js = r.outputFiles[0].text;
const worklet = fs.readFileSync('onset-worklet.js', 'utf8');
const icon = 'data:image/png;base64,' + fs.readFileSync('icons/icon-192.png').toString('base64');
let html = fs.readFileSync('index.html', 'utf8')
  .replace(/<link rel="manifest"[^>]*>\n/, '')
  .replace(/href="icons\/icon-192.png"/g, () => `href="${icon}"`)
  .replace('<script type="module" src="js/main.js"></script>', () =>
    `<script>window.__WORKLET_SRC=${JSON.stringify(worklet)};</script>\n<script>${js.replace(/<\/script/g, '<\\/script')}</script>`);
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/ritmo.html', html);
console.log('dist/ritmo.html', (html.length / 1024).toFixed(0) + ' KB');

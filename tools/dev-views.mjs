// QA helper: renders fixed viewpoints for art review. node tools/dev-views.mjs <outdir> [quality]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const out = process.argv[2] ?? 'playtest-output';
const quality = process.argv[3] ?? 'medium';
const only = process.argv[4];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = join('dist', decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  try { const b = await readFile(path); res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(4181, r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.addInitScript((q) => localStorage.setItem('skymt.settings.v1', JSON.stringify({ quality: q })), quality);
await page.goto('http://localhost:4181/?test');
await page.waitForFunction(() => window.__skymt);
const views = [
  ['a-start', 1, 0, []], ['b-climb', 36.5, 1.2, []], ['c-hall', 53, 0, []], ['d-chasm', 69, 1, []],
  ['e-alcove', 86, 1, []], ['f-shaft', 102, 1, ['memory.seen']], ['g-L4', 112, 12, ['memory.seen', 'root.R1']],
  ['h-gate', 114, 16, ['memory.seen', 'root.R1', 'root.R2']], ['i-well', 120, 30, ['memory.seen', 'gate.open', 'well.lid']],
];
for (const [name, x, y, flags] of views) {
  if (only && !name.startsWith(only)) continue;
  await page.evaluate(([x, y, f]) => window.__skymt.view(x, y, f), [x, y, flags]);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
}
await browser.close();
server.close();

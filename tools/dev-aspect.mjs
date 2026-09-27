// QA helper: title + one gameplay frame at several aspect ratios. node tools/dev-aspect.mjs <outdir>
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const out = process.argv[2] ?? 'playtest-output';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = join('dist', decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  try { const b = await readFile(path); res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(4182, r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [w, h] of [[1024, 768], [2560, 1080], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.addInitScript(() => localStorage.setItem('skymt.settings.v1', JSON.stringify({ quality: 'low' })));
  await page.goto('http://localhost:4182/?test');
  await page.waitForFunction(() => window.__skymt);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${out}/aspect-${w}x${h}-title.png` });
  await page.evaluate(() => window.__skymt.view(69, 1, []));
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${out}/aspect-${w}x${h}-play.png` });
  await page.close();
}
await browser.close();
server.close();

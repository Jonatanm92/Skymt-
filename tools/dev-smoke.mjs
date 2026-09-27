import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = join('/home/user/Skymt-/dist', decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  try { const b = await readFile(path); res.writeHead(200, {'content-type': types[extname(path)] ?? 'application/octet-stream'}); res.end(b);} catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(4180, r));
const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', m => console.log('console', m.type(), m.text()));
page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto('http://localhost:4180/?test');
await page.waitForTimeout(3000);
const fps = await page.evaluate(() => new Promise(r => { let n=0; const s=performance.now(); const f=()=>{n++; if(performance.now()-s<2000) requestAnimationFrame(f); else r(n/2);}; requestAnimationFrame(f); }));
console.log('fps', fps);
const out = process.argv[2] || '/tmp/claude-0/-home-user-Skymt-/2f38c898-897c-5561-83d0-d0bd181c4323/scratchpad';
await page.screenshot({ path: out + '/title.png' });
await page.keyboard.press('Enter');
await page.waitForTimeout(9000);
await page.screenshot({ path: out + '/opening.png' });
await page.keyboard.down('d'); await page.waitForTimeout(3500); 
await page.screenshot({ path: out + '/walk.png' });
await page.waitForTimeout(3000); await page.keyboard.up('d');
await page.screenshot({ path: out + '/walk2.png' });
console.log(JSON.stringify(await page.evaluate(() => window.__skymt.status())));
await browser.close(); server.close();

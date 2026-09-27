// Adversarial checks with real keyboard input: interrupting the memory,
// replaying it, singing at the sealed gate too early. node tools/dev-chaos.mjs
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = join('dist', decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  try { const b = await readFile(path); res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(4184, r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const problems = [];
page.on('pageerror', (e) => problems.push(e.message));
page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
await page.addInitScript(() => localStorage.setItem('skymt.settings.v1', JSON.stringify({ quality: 'low' })));
await page.goto('http://localhost:4184/?test');
await page.waitForFunction(() => window.__skymt);
const st = () => page.evaluate(() => window.__skymt.status());
const until = (fn, ms = 60000) => page.waitForFunction(fn, null, { timeout: ms, polling: 200 }).then(() => true, () => false);
let ok = true;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} ${extra}`); ok &&= cond; };

// 1. Interrupt the memory, return to rest, then replay it.
await page.evaluate(() => { window.__skymt.game.save.checkpoint = 'alcove'; window.__skymt.game.flags.data.woke = true; window.__skymt.view(87.4, 1, ['woke']); });
await page.keyboard.down('f'); await page.waitForTimeout(500); await page.keyboard.up('f');
check('memory starts on hum', await until(() => window.__skymt.status().seq === 'memory', 20000));
await page.waitForTimeout(3000);
await page.keyboard.press('Escape');
check('pause during memory', await until(() => window.__skymt.status().mode === 'paused', 10000));
await page.keyboard.press('ArrowDown'); await page.waitForTimeout(400);
await page.keyboard.press('ArrowDown'); await page.waitForTimeout(400);
await page.keyboard.press('Enter');
check('rest cancels memory', await until(() => { const s = window.__skymt.status(); return s.mode === 'playing' && s.seq === null && s.state === 'normal'; }, 20000));
const s1 = await st();
check('memory not marked seen', !s1.flags.includes('memory.seen'), `x=${s1.x.toFixed(1)}`);
check('apparition hidden', await page.evaluate(() => !window.__skymt.game.memory.apparition.points.visible));
await page.keyboard.down('d'); await page.waitForTimeout(1500); await page.keyboard.up('d');
await page.keyboard.down('f'); await page.waitForTimeout(500); await page.keyboard.up('f');
check('memory replays and completes', await until(() => window.__skymt.status().flags.includes('memory.seen'), 120000));
const cs = await page.evaluate(() => ({ can: window.__skymt.game.player.canSing, seq: window.__skymt.game.sequence, st: window.__skymt.game.player.state }));
check('can sing after memory', cs.can, JSON.stringify(cs));

// 2. Sing at the gate before any vein is lit: it refuses and stays shut.
await until(() => window.__skymt.status().seq === null, 20000);
await page.evaluate(() => window.__skymt.view(113.6, 16, ['root.R1', 'root.R2']));
await page.waitForTimeout(500);
await page.keyboard.down('f');
const sang = await until(() => window.__skymt.game.player.state === 'singing', 20000);
await page.keyboard.up('f');
check('sings at the gate', sang);
await until(() => /waiting|väntar/i.test(document.querySelector('.sub')?.textContent ?? ''), 20000);
const s2 = await st();
check('gate stays shut without light', !s2.flags.includes('gate.open'));
const sub = await page.evaluate(() => document.querySelector('.sub')?.textContent ?? '');
check('gate explains itself', /waiting|väntar/i.test(sub), `"${sub}"`);
check('no page errors', problems.length === 0, problems.join(' | '));
await browser.close();
server.close();
process.exit(ok ? 0 : 1);

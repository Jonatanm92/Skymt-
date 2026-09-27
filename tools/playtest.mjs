// Automated playthrough of the vertical slice in headless Chromium.
// Usage: npm run build && node tools/playtest.mjs [--shots] [--quality=low]
// Serves dist/, plays the golden path through real controller input,
// captures screenshots at story marks, then checks save/continue.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const args = new Set(process.argv.slice(2));
const quality = [...args].find((a) => a.startsWith('--quality='))?.split('=')[1] ?? 'low';
const shots = args.has('--shots');
const OUT = 'playtest-output';
await mkdir(OUT, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = join('dist', decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(4179, r));

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));

await page.addInitScript((q) => {
  if (!localStorage.getItem('skymt.settings.v1')) localStorage.setItem('skymt.settings.v1', JSON.stringify({ quality: q }));
}, quality);
await page.goto('http://localhost:4179/?test');
await page.waitForFunction(() => window.__skymt, null, { timeout: 20000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/00-title.png` });

// Start through the real menu (Enter on "Begin").
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
await page.evaluate((f) => window.__skymt.run(30, f), shots);

const t0 = Date.now();
let lastMarks = 0;
let status;
while (true) {
  status = await page.evaluate(() => window.__skymt.status());
  if (status.marks.length > lastMarks) {
    for (const m of status.marks.slice(lastMarks)) {
      console.log(`  ✓ ${m.padEnd(12)} x=${status.x.toFixed(1)} y=${status.y.toFixed(1)} t=${status.simTime.toFixed(0)}s`);
      lastMarks++;
    }
    if (shots && status.frozen) {
      await page.waitForTimeout(1200);
      const m = status.marks[status.marks.length - 1];
      await page.screenshot({ path: `${OUT}/${String(status.marks.length).padStart(2, '0')}-${m}.png` });
      await page.evaluate(() => window.__skymt.unfreeze());
    }
  }
  if (status.done || status.failed || Date.now() - t0 > 25 * 60 * 1000) break;
  await page.waitForTimeout(400);
}

let ok = status.done && !status.failed;
console.log(ok ? 'ROUTE: completed' : `ROUTE: FAILED — ${status.failed ?? 'timeout'} (step ${status.step})`);
console.log('flags:', status.flags.join(', '));
const card = await page.waitForSelector('.endcard.show', { timeout: 120000 }).then(() => true, () => false);
await page.waitForTimeout(5000);
await page.screenshot({ path: `${OUT}/99-endcard.png` });
console.log(`END CARD: ${card ? 'ok' : 'FAILED'}`);
ok = ok && card;

// Save / continue check: reload, continue, expect to be at the saved checkpoint.
await page.evaluate(() => window.__skymt.stop());
await page.reload();
await page.waitForFunction(() => window.__skymt, null, { timeout: 20000 });
await page.waitForTimeout(1000);
const before = await page.evaluate(() => window.__skymt.status());
await page.keyboard.press('Enter'); // Continue
await page.waitForTimeout(2500);
const after = await page.evaluate(() => window.__skymt.status());
const contOk = after.mode === 'playing' && after.checkpoint === before.checkpoint && Math.abs(after.y - 30) < 0.5;
console.log(`CONTINUE: ${contOk ? 'ok' : 'FAILED'} (checkpoint=${after.checkpoint}, x=${after.x.toFixed(1)}, y=${after.y.toFixed(1)}, mode=${after.mode})`);
ok = ok && contOk;

// Pause menu opens and resumes.
await page.keyboard.press('Escape');
await page.waitForTimeout(1500);
const paused = await page.evaluate(() => window.__skymt.status().mode);
await page.keyboard.press('Escape');
await page.waitForTimeout(1500);
const resumed = await page.evaluate(() => window.__skymt.status().mode);
console.log(`PAUSE: ${paused === 'paused' && resumed === 'playing' ? 'ok' : 'FAILED'} (${paused} -> ${resumed})`);
ok = ok && paused === 'paused' && resumed === 'playing';

// Falling into the chasm returns Skymt to the last resting place.
await page.evaluate(() => {
  window.__skymt.setCheckpoint('chasm');
  window.__skymt.view(75, 3, []);
});
await page.waitForFunction(() => { const s = window.__skymt.status(); return s.state === 'normal' && s.y > 0.5 && s.x < 70; }, null, { timeout: 60000 }).catch(() => {});
const fell = await page.evaluate(() => window.__skymt.status());
const fallOk = Math.abs(fell.x - 67.4) < 0.3 && Math.abs(fell.y - 1) < 0.05;
console.log(`FALL/RESPAWN: ${fallOk ? 'ok' : 'FAILED'} (x=${fell.x.toFixed(2)} y=${fell.y.toFixed(2)})`);
ok = ok && fallOk;

// Idle at the chasm edge without humming: the hum hint should surface.
await page.evaluate(() => {
  const g = window.__skymt.game;
  delete g.flags.data['learned.hum'];
  window.__skymt.view(68.5, 1, []);
});
await page.waitForFunction(() => window.__skymt.hints().length > 0, null, { timeout: 60000 }).catch(() => {});
const hints = await page.evaluate(() => window.__skymt.hints());
console.log(`HINT: ${hints.length ? 'ok' : 'FAILED'} (${hints.join(' | ')})`);
await page.screenshot({ path: `${OUT}/98-hint.png` });
ok = ok && hints.length > 0;

const real = problems.filter((p) => !/GPU stall|swiftshader|WebGL|GL Driver|Automatic fallback/i.test(p));
console.log(`console problems: ${real.length}`);
real.slice(0, 20).forEach((p) => console.log('  ' + p));
ok = ok && real.length === 0 && status.errors.length === 0;

await browser.close();
server.close();
process.exit(ok ? 0 : 1);

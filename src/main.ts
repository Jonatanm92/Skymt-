import { Game } from './game';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const game = new Game(canvas, ui);

const params = new URLSearchParams(location.search);
if (params.has('test')) {
  // Dev/QA hook only; never referenced by gameplay code.
  void import('./dev/autopilot').then((m) => m.installTestHooks(game));
}

let autostart = false;
try {
  autostart = sessionStorage.getItem('skymt.autostart') === '1';
  sessionStorage.removeItem('skymt.autostart');
} catch {
  /* ignore */
}
if (autostart) game.start(true);

const loop = (now: number) => {
  game.frame(now);
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);

// QA autopilot: plays the golden path through real controller input (no
// teleports), proving the slice is completable with the actual physics.
// Loaded only with ?test in the URL.
import type { Autopilot, Game } from '../game';
import type { ControlInput } from '../player/controller';

export type Step =
  | { go: number; tol?: number }
  | { jump: { at: number; to: number } }
  | { hum: number }
  | { sing: true }
  | { wait: number }
  | { until: string; timeout?: number }
  | { interact: true }
  | { mark: string };

const COND: Record<string, (g: Game) => boolean> = {
  lying: (g) => g.player.state === 'lying',
  normal: (g) => g.player.state === 'normal' && !g.sequence,
  memorySeen: (g) => g.flags.has('memory.seen') && !g.sequence,
  r1: (g) => g.flags.has('root.R1'),
  r2: (g) => g.flags.has('root.R2'),
  gateOpen: (g) => g.flags.has('gate.open'),
  endingSong: (g) => g.sequence === 'ending-song',
  ended: (g) => g.mode === 'ending',
  grounded: (g) => g.player.grounded && g.player.state === 'normal',
};

export function goldenPath(): Step[] {
  const stairs: Step[] = [];
  for (let i = 0; i < 9; i++) stairs.push(i % 2 === 0 ? { jump: { at: 112.45, to: 114.6 } } : { jump: { at: 114.15, to: 112.0 } });
  return [
    { mark: 'opening' },
    { until: 'lying', timeout: 20 },
    { wait: 1 },
    { go: 1.5 },
    { until: 'normal' },
    { mark: 'bottnen' },
    { interact: true }, // nothing in range: must be harmless
    { go: 2.6 },
    { interact: true },
    { wait: 1.5 },
    { go: 44 },
    { mark: 'hall' },
    { go: 51.5 },
    { interact: true },
    { go: 69.2 },
    { hum: 0.9 },
    { mark: 'chasm-lit' },
    { go: 70.4, tol: 0.2 },
    { jump: { at: 71.45, to: 73.1 } },
    { jump: { at: 73.75, to: 75.9 } },
    { jump: { at: 76.55, to: 78.7 } },
    { jump: { at: 79.35, to: 82 } },
    { mark: 'alcove' },
    { go: 87.4 },
    { hum: 0.4 },
    { wait: 7.5 },
    { mark: 'memory-vision' },
    { wait: 9 },
    { mark: 'memory-dissolve' },
    { until: 'memorySeen', timeout: 60 },
    { mark: 'memory-done' },
    { go: 101 },
    { sing: true }, // without light: the root only stirs
    { wait: 3.5 },
    { hum: 0.9 },
    { sing: true },
    { until: 'r1', timeout: 5 },
    { wait: 1.2 },
    { mark: 'root-growing' },
    { wait: 1.8 },
    { mark: 'root1' },
    { go: 114.0 },
    { hum: 0.9 },
    { go: 108.5, tol: 0.2 },
    { jump: { at: 108.3, to: 105.3 } },
    { jump: { at: 104.7, to: 102.1 } },
    { jump: { at: 101.45, to: 99.7 } },
    { jump: { at: 99.2, to: 97.2 } },
    { until: 'grounded' },
    { mark: 'L3' },
    { go: 96.9 },
    { hum: 0.9 },
    { jump: { at: 98.3, to: 100.3 } },
    { jump: { at: 100.95, to: 103.7 } },
    { jump: { at: 104.35, to: 107.1 } },
    { jump: { at: 107.75, to: 110.2 } },
    { mark: 'L4' },
    { go: 115 },
    { sing: true }, // S4 dark: stir only
    { wait: 3.2 },
    { hum: 0.9 },
    { go: 112.6 },
    { sing: true },
    { until: 'r2', timeout: 5 },
    { wait: 3 },
    { go: 109.9, tol: 0.2 },
    { jump: { at: 110.1, to: 112.9 } },
    { until: 'grounded' },
    { mark: 'L5' },
    { go: 113.6 },
    { interact: true },
    { wait: 1 },
    { sing: true },
    { until: 'gateOpen', timeout: 5 },
    { wait: 3.5 },
    { mark: 'gate-opening' },
    { wait: 6.5 },
    { mark: 'gate-open' },
    { go: 113.3, tol: 0.2 },
    { jump: { at: 113.0, to: 112.0 } },
    ...stairs,
    { jump: { at: 114.8, to: 117.2 } },
    { until: 'grounded' },
    { mark: 'well' },
    { go: 127 },
    { until: 'endingSong', timeout: 20 },
    { mark: 'ending' },
    { wait: 1 },
    { sing: true },
    { wait: 8.5 },
    { mark: 'answer' },
    { wait: 9 },
    { mark: 'last-line' },
    { until: 'ended', timeout: 60 },
    { mark: 'end' },
  ];
}

export class RouteRunner implements Autopilot {
  i = 0;
  t = 0;
  total = 0;
  phase = 0;
  done = false;
  failed: string | null = null;
  marks: string[] = [];
  onMark?: (m: string) => void;
  private jumped = false;
  private airborne = false;

  constructor(private steps: Step[]) {}

  private next() {
    this.i++;
    this.t = 0;
    this.phase = 0;
    this.jumped = false;
    this.airborne = false;
    if (this.i >= this.steps.length) this.done = true;
  }

  control(g: Game, dt: number): ControlInput | null {
    const c: ControlInput = { moveX: 0, jumpPressed: false, jumpHeld: false, humHeld: false };
    if (this.done || this.failed) return c;
    this.t += dt;
    this.total += dt;
    const s = this.steps[this.i];
    const p = g.player;
    if (this.t > 40 && !('until' in s)) {
      this.failed = `step ${this.i} ${JSON.stringify(s)} timed out at x=${p.x.toFixed(2)} y=${p.y.toFixed(2)}`;
      return c;
    }
    if ('mark' in s) {
      this.marks.push(s.mark);
      this.onMark?.(s.mark);
      this.next();
    } else if ('wait' in s) {
      if (this.t >= s.wait) this.next();
    } else if ('until' in s) {
      if (COND[s.until](g)) this.next();
      else if (this.t > (s.timeout ?? 30)) this.failed = `until ${s.until} timed out (x=${p.x.toFixed(2)}, y=${p.y.toFixed(2)}, state=${p.state}, seq=${g.sequence})`;
    } else if ('interact' in s) {
      g.tryInteract();
      this.next();
    } else if ('go' in s) {
      const dx = s.go - p.x;
      if (Math.abs(dx) < (s.tol ?? 0.3) && p.grounded) {
        this.next();
      } else {
        const dir = Math.sign(dx);
        c.moveX = Math.abs(dx) < 0.6 ? dir * 0.5 : dir;
        if (p.grounded && p.wallContact === dir && this.t > 0.05) {
          c.jumpPressed = true;
          this.jumped = true;
        }
        c.jumpHeld = c.jumpPressed || !p.grounded;
      }
    } else if ('jump' in s) {
      const { at, to } = s.jump;
      const dir = Math.sign(to - at);
      if (!this.jumped) {
        c.moveX = dir;
        const crossed = dir > 0 ? p.x >= at : p.x <= at;
        if (crossed && p.grounded) {
          c.jumpPressed = true;
          c.jumpHeld = true;
          this.jumped = true;
        }
      } else {
        if (!p.grounded) this.airborne = true;
        c.jumpHeld = true;
        const dx = to - p.x;
        c.moveX = Math.max(-1, Math.min(1, dx * 2.2));
        if (Math.abs(c.moveX) < 0.35 && Math.abs(dx) > 0.05) c.moveX = Math.sign(dx) * 0.35;
        if (this.airborne && p.grounded && p.state === 'normal') this.next();
      }
    } else if ('hum' in s) {
      c.humHeld = this.t < s.hum;
      if (this.t > s.hum + 0.2) this.next();
    } else if ('sing' in s) {
      c.humHeld = this.t < 1.6;
      if (this.t > 1.8 && p.state !== 'singing') this.next();
    }
    return c;
  }
}

export function installTestHooks(game: Game) {
  const w = window as unknown as Record<string, unknown>;
  let runner: RouteRunner | null = null;
  w.__skymt = {
    game,
    start(fresh = true) {
      game.start(fresh);
    },
    run(stepsPerFrame = 6, freezeOnMark = false) {
      runner = new RouteRunner(goldenPath());
      if (freezeOnMark) runner.onMark = () => (game.frozen = true);
      game.autopilot = runner;
      game.stepsPerFrame = stepsPerFrame;
    },
    status() {
      const p = game.player;
      return {
        step: runner?.i ?? -1,
        steps: runner ? goldenPath().length : 0,
        marks: runner?.marks ?? [],
        done: runner?.done ?? false,
        failed: runner?.failed ?? null,
        x: p.x, y: p.y, state: p.state, mode: game.mode, seq: game.sequence,
        checkpoint: game.save.checkpoint,
        flags: Object.keys(game.flags.data).sort(),
        simTime: game.simTime,
        frozen: game.frozen,
        errors: game.errors,
      };
    },
    /** Jump the camera/player to a spot for visual review (QA only). */
    view(x: number, y: number, flags: string[] = [], cam?: { x: number; y: number; distance: number; lookUp?: number }) {
      flags.forEach((f) => (game.flags.data[f] = true));
      game.cancelSequence();
      game.mode = 'playing';
      game.ui.closeAll();
      game.player.place(x, y, 'normal');
      game.player.canSing = game.flags.has('memory.seen');
      game.model.awake = 1;
      game.renderer.fade = 0;
      game.zone = game.findZone();
      game.rig.override = cam ? { ...cam, weight: 1 } : null;
      game.rig.snap(game.player, game.zone);
      game.snapAtmosphere();
      if (cam) game.frozen = true; // keep sequences (e.g. the ending) from starting
    },
    setCheckpoint(id: string) {
      game.save.checkpoint = id;
    },
    hints() {
      return [...document.querySelectorAll('.hint.show')].map((e) => e.textContent);
    },
    unfreeze() {
      game.frozen = false;
    },
    stop() {
      game.autopilot = null;
      game.stepsPerFrame = 0;
    },
  };
}

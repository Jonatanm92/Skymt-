// Action-based input: keyboard + standard-mapping gamepads + a virtual layer
// (used by the dev autopilot). Gameplay reads edges with consume*(), which
// latch presses until a fixed physics step picks them up.
export type Action =
  | 'left' | 'right' | 'up' | 'down'
  | 'jump' | 'interact' | 'hum' | 'pause'
  | 'confirm' | 'back';

export type Device = 'keyboard' | 'gamepad';

const KEYMAP: Record<string, Action[]> = {
  KeyA: ['left'], ArrowLeft: ['left'],
  KeyD: ['right'], ArrowRight: ['right'],
  KeyW: ['up', 'jump'], ArrowUp: ['up', 'jump'],
  KeyS: ['down'], ArrowDown: ['down'],
  Space: ['jump', 'confirm'],
  KeyE: ['interact'], Enter: ['confirm', 'interact'],
  KeyF: ['hum'], KeyQ: ['hum'], ShiftLeft: ['hum'], ShiftRight: ['hum'],
  Escape: ['pause', 'back'], KeyP: ['pause'], Backspace: ['back'],
};

// Standard gamepad mapping indices.
const PADMAP: Record<number, Action[]> = {
  0: ['jump', 'confirm'],
  1: ['back', 'hum'],
  2: ['interact'],
  3: ['interact'],
  5: ['hum'],
  7: ['hum'],
  9: ['pause'],
  12: ['up'], 13: ['down'], 14: ['left'], 15: ['right'],
};

const ACTIONS: Action[] = ['left', 'right', 'up', 'down', 'jump', 'interact', 'hum', 'pause', 'confirm', 'back'];

export class Input {
  private keyHeld = new Set<Action>();
  private padHeld = new Set<Action>();
  private virtualHeld = new Set<Action>();
  private prev = new Set<Action>();
  private now = new Set<Action>();
  private latched = new Set<Action>();
  private latchedRelease = new Set<Action>();
  private frameEdges = new Set<Action>();
  /** Presses seen since the last poll, so taps shorter than a frame still count. */
  private tapped = new Set<Action>();
  padAxisX = 0;
  lastDevice: Device = 'keyboard';
  onDeviceChange?: (d: Device) => void;
  onAnyInput?: () => void;

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      const acts = KEYMAP[e.code];
      if (acts) {
        e.preventDefault();
        acts.forEach((a) => {
          this.keyHeld.add(a);
          if (!e.repeat) this.tapped.add(a);
        });
      }
      this.setDevice('keyboard');
      this.onAnyInput?.();
    });
    target.addEventListener('keyup', (e) => {
      const acts = KEYMAP[e.code];
      if (acts) acts.forEach((a) => this.keyHeld.delete(a));
    });
    target.addEventListener('blur', () => this.keyHeld.clear());
    target.addEventListener('mousedown', () => this.onAnyInput?.());
  }

  private setDevice(d: Device) {
    if (d !== this.lastDevice) {
      this.lastDevice = d;
      this.onDeviceChange?.(d);
    }
  }

  setVirtual(action: Action, held: boolean) {
    if (held) this.virtualHeld.add(action);
    else this.virtualHeld.delete(action);
  }

  clearVirtual() {
    this.virtualHeld.clear();
  }

  /** Call once per rendered frame before game logic. */
  poll() {
    this.padHeld.clear();
    this.padAxisX = 0;
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      pad.buttons.forEach((b, i) => {
        if (b.pressed || b.value > 0.5) {
          PADMAP[i]?.forEach((a) => this.padHeld.add(a));
          this.setDevice('gamepad');
          this.onAnyInput?.();
        }
      });
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      if (Math.abs(ax) > 0.25) {
        this.padAxisX = Math.sign(ax) * Math.min(1, (Math.abs(ax) - 0.25) / 0.6);
        this.padHeld.add(ax < 0 ? 'left' : 'right');
        this.setDevice('gamepad');
      }
      if (ay < -0.6) this.padHeld.add('up');
      if (ay > 0.6) this.padHeld.add('down');
    }
    this.prev = this.now;
    this.now = new Set([...this.keyHeld, ...this.padHeld, ...this.virtualHeld]);
    this.frameEdges.clear();
    for (const a of ACTIONS) {
      if (this.now.has(a) && !this.prev.has(a)) {
        this.latched.add(a);
        this.frameEdges.add(a);
      }
      if (!this.now.has(a) && this.prev.has(a)) this.latchedRelease.add(a);
    }
    for (const a of this.tapped) {
      if (!this.frameEdges.has(a) && !this.prev.has(a)) {
        this.latched.add(a);
        this.frameEdges.add(a);
      }
    }
    this.tapped.clear();
  }

  held(a: Action): boolean {
    return this.now.has(a);
  }

  /** Frame-accurate press edge (UI). */
  pressed(a: Action): boolean {
    return this.frameEdges.has(a);
  }

  /** Latched press edge for fixed-step gameplay: true once, then cleared. */
  consume(a: Action): boolean {
    if (this.latched.has(a)) {
      this.latched.delete(a);
      return true;
    }
    return false;
  }

  consumeRelease(a: Action): boolean {
    if (this.latchedRelease.has(a)) {
      this.latchedRelease.delete(a);
      return true;
    }
    return false;
  }

  /** Drop pending edges (after menus close, so a confirm doesn't become a jump). */
  flush() {
    this.latched.clear();
    this.latchedRelease.clear();
  }

  moveX(): number {
    if (Math.abs(this.padAxisX) > 0) return this.padAxisX;
    return (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
  }
}

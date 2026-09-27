// Skymt's movement and verbs, independent of rendering so it can be unit-tested.
import type { Emitter, GameEvents } from '../core/events';
import { PhysicsWorld, type Body, type Solid, type Ledge } from '../world/physics';

export const TUNING = {
  width: 0.46,
  height: 0.88,
  maxSpeed: 4.1,
  groundAccel: 26,
  groundDecel: 34,
  turnAccel: 48,
  airAccel: 15,
  airDecel: 6,
  jumpVelocity: 7.3,
  gravityUp: 16.5,
  gravityDown: 27,
  jumpCut: 0.45,
  maxFall: 17,
  coyoteTime: 0.11,
  jumpBuffer: 0.13,
  mantleTime: 0.42,
  mantleMaxRise: 1.3,
  humFullCharge: 0.85,
  singHold: 1.35,
  humMinRadius: 3.2,
  humMaxRadius: 7,
  songDuration: 2.9,
  songRadius: 9,
  wakeTime: 2.2,
};

export type PlayerState = 'lying' | 'waking' | 'normal' | 'mantle' | 'singing' | 'locked';

export interface ControlInput {
  moveX: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
  humHeld: boolean;
}

export class PlayerController {
  body: Body;
  state: PlayerState = 'normal';
  facing: 1 | -1 = 1;
  grounded = false;
  groundSurface = 'stone';
  wallContact: -1 | 0 | 1 = 0;
  canSing = false;
  /** 0..1 hum charge, >1 while pushing into song. */
  humCharge = 0;
  humTime = 0;
  humming = false;
  stateTime = 0;
  airTime = 0;
  lastLandImpact = 0;
  stepPhase = 0;
  mantleFrom = { x: 0, y: 0 };
  mantleTo = { x: 0, y: 0 };
  moveLock = 0;
  private coyote = 0;
  private buffer = 0;
  private jumping = false;
  private humLatch = false;

  constructor(private world: PhysicsWorld, private events: Emitter<GameEvents>, x = 0, y = 0) {
    this.body = { x, y, w: TUNING.width, h: TUNING.height, vx: 0, vy: 0 };
  }

  get x() {
    return this.body.x;
  }
  get y() {
    return this.body.y;
  }

  place(x: number, y: number, state: PlayerState = 'normal') {
    this.body.x = x;
    this.body.y = y;
    this.body.vx = 0;
    this.body.vy = 0;
    this.setState(state);
    this.stopHumming();
    this.humCharge = 0;
    this.humTime = 0;
    this.humLatch = false;
    this.grounded = this.world.groundUnder(this.body) !== null;
  }

  setState(s: PlayerState) {
    this.state = s;
    this.stateTime = 0;
    if (s === 'locked' || s === 'lying') this.stopHumming();
  }

  /** Silently end a hum without releasing a pulse (respawn, cutscenes). */
  stopHumming() {
    if (this.humming) this.events.emit('hum:stop', undefined);
    this.humming = false;
    this.humCharge = 0;
  }

  /** Face `dir` and keep moving that way (used by scripted moments). */
  step(dt: number, input: ControlInput) {
    const T = TUNING;
    this.stateTime += dt;
    this.moveLock = Math.max(0, this.moveLock - dt);
    const b = this.body;

    if (this.state === 'lying') {
      if (Math.abs(input.moveX) > 0.2 || input.jumpPressed || input.humHeld) {
        this.setState('waking');
        this.events.emit('wake', undefined);
      }
      return;
    }
    if (this.state === 'waking') {
      if (this.stateTime >= T.wakeTime) this.setState('normal');
      return;
    }
    if (this.state === 'mantle') {
      const k = Math.min(1, this.stateTime / T.mantleTime);
      // Up first, then over: reads as a pull rather than a slide.
      const up = Math.min(1, k / 0.65);
      const over = Math.max(0, (k - 0.35) / 0.65);
      b.y = this.mantleFrom.y + (this.mantleTo.y - this.mantleFrom.y) * easeOut(up);
      b.x = this.mantleFrom.x + (this.mantleTo.x - this.mantleFrom.x) * easeInOut(over);
      if (k >= 1) {
        b.vx = this.facing * 1.2;
        b.vy = 0;
        this.grounded = true;
        this.setState('normal');
      }
      return;
    }

    const locked = this.state === 'locked' || this.state === 'singing';
    const moveX = locked || this.moveLock > 0 ? 0 : input.moveX;

    // --- Hum / song
    if (this.state === 'singing') {
      if (this.stateTime >= T.songDuration) this.setState('normal');
    } else if (this.state !== 'locked') {
      this.updateHum(dt, input.humHeld);
    }

    // --- Horizontal
    const target = moveX * T.maxSpeed * (this.humming ? 0.45 : 1);
    let accel: number;
    if (this.grounded) {
      if (Math.abs(target) < 0.01) accel = T.groundDecel;
      else if (Math.sign(target) !== Math.sign(b.vx) && Math.abs(b.vx) > 0.2) accel = T.turnAccel;
      else accel = T.groundAccel;
    } else {
      accel = Math.abs(target) < 0.01 ? T.airDecel : T.airAccel;
    }
    b.vx = approach(b.vx, target, accel * dt);
    if (Math.abs(moveX) > 0.1) this.facing = moveX > 0 ? 1 : -1;

    // --- Jump
    this.coyote = this.grounded ? T.coyoteTime : Math.max(0, this.coyote - dt);
    this.buffer = input.jumpPressed && !locked ? T.jumpBuffer : Math.max(0, this.buffer - dt);
    if (this.buffer > 0 && this.coyote > 0) {
      b.vy = T.jumpVelocity;
      this.jumping = true;
      this.buffer = 0;
      this.coyote = 0;
      this.grounded = false;
      this.events.emit('jump', { x: b.x });
    }
    if (this.jumping && !input.jumpHeld && b.vy > 0) {
      b.vy *= T.jumpCut;
      this.jumping = false;
    }
    if (b.vy <= 0) this.jumping = false;

    // --- Gravity
    const g = b.vy > 0 && (input.jumpHeld || !this.jumping) ? T.gravityUp : T.gravityDown;
    b.vy = Math.max(-T.maxFall, b.vy - g * dt);

    // --- Integrate
    const wasGrounded = this.grounded;
    const fallSpeed = -b.vy;
    this.world.depenetrate(b);
    const c = this.world.move(b, dt, wasGrounded);
    this.wallContact = c.wall;
    this.grounded = c.ground !== null;
    if (c.ground) this.groundSurface = (c.ground as Solid).surface;

    if (this.grounded) {
      if (!wasGrounded && this.airTime > 0.08) {
        this.lastLandImpact = fallSpeed;
        this.events.emit('land', { x: b.x, impact: fallSpeed, surface: this.groundSurface });
        if (fallSpeed > 11) this.moveLock = 0.12;
      }
      this.airTime = 0;
      // Footsteps from distance travelled.
      const speed = Math.abs(b.vx);
      if (speed > 0.4) {
        this.stepPhase += (speed * dt) / 0.62;
        if (this.stepPhase >= 1) {
          this.stepPhase -= 1;
          this.events.emit('footstep', { x: b.x, surface: this.groundSurface });
        }
      } else this.stepPhase = 0.6;
    } else {
      this.airTime += dt;
      // --- Ledge catch: moving into a wall (or pushing toward it) while airborne.
      const pushing = Math.abs(moveX) > 0.3 ? (Math.sign(moveX) as 1 | -1) : 0;
      if (pushing !== 0 && b.vy < 3.5) {
        const ledge = this.world.findLedge(b, pushing, 0.02, T.mantleMaxRise);
        if (ledge && this.nearLedge(ledge, pushing)) this.startMantle(ledge, pushing);
      }
    }
  }

  private nearLedge(l: Ledge, dir: 1 | -1) {
    const b = this.body;
    const edge = dir > 0 ? l.solid.x : l.solid.x + l.solid.w;
    const front = b.x + (dir * b.w) / 2;
    // Either touching the wall face or already under a thin overhanging lip.
    return Math.abs(front - edge) < 0.12 || (b.x > l.solid.x && b.x < l.solid.x + l.solid.w);
  }

  private startMantle(l: Ledge, dir: 1 | -1) {
    this.facing = dir;
    this.mantleFrom = { x: this.body.x, y: this.body.y };
    this.mantleTo = { x: l.standX, y: l.top + 1e-4 };
    this.body.vx = 0;
    this.body.vy = 0;
    this.stopHumming();
    this.setState('mantle');
    this.events.emit('mantle', { x: this.body.x });
  }

  private updateHum(dt: number, held: boolean) {
    const T = TUNING;
    if (held && !this.humLatch && !this.humming) {
      this.humming = true;
      this.humTime = 0;
      this.events.emit('hum:start', undefined);
    }
    if (!held) this.humLatch = false;
    if (!this.humming) {
      this.humCharge = Math.max(0, this.humCharge - dt * 4);
      return;
    }
    if (held) {
      this.humTime += dt;
      this.humCharge = Math.min(1, this.humTime / T.humFullCharge);
      if (this.canSing && this.humTime > T.humFullCharge) {
        this.humCharge = 1 + Math.min(1, (this.humTime - T.humFullCharge) / (T.singHold - T.humFullCharge));
        if (this.humTime >= T.singHold) {
          this.humming = false;
          this.humLatch = true;
          this.humCharge = 0;
          this.events.emit('hum:stop', undefined);
          this.setState('singing');
          this.body.vx *= 0.3;
          this.events.emit('song:start', undefined);
          this.events.emit('pulse', { x: this.body.x, y: this.body.y + 0.5, radius: T.songRadius, kind: 'song' });
        }
      }
      return;
    }
    // Released: a cold pulse sized by charge.
    const k = Math.min(1, this.humTime / T.humFullCharge);
    const radius = T.humMinRadius + (T.humMaxRadius - T.humMinRadius) * k;
    this.humming = false;
    this.humCharge = 0;
    this.events.emit('hum:stop', undefined);
    this.events.emit('pulse', { x: this.body.x, y: this.body.y + 0.5, radius, kind: 'hum' });
  }
}

export function approach(v: number, target: number, delta: number) {
  return v < target ? Math.min(target, v + delta) : Math.max(target, v - delta);
}
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

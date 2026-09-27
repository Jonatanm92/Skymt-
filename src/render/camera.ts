import * as THREE from 'three';
import type { ZoneDef } from '../content/types';
import type { PlayerController } from '../player/controller';

export interface CameraOverride {
  x: number;
  y: number;
  distance: number;
  lookUp?: number;
  weight: number;
}

function smooth(cur: number, target: number, rate: number, dt: number) {
  return cur + (target - cur) * (1 - Math.exp(-rate * dt));
}

/**
 * Side-on follow camera. Frames ahead of Skymt, holds height steady through
 * jumps, and blends toward per-zone framing and scripted overrides.
 */
export class CameraRig {
  x = 0;
  y = 1;
  dist = 11;
  lookUp = 0;
  private anchorY = 0;
  private lookAhead = 0;
  private shake = 0;
  private t = 0;
  override: CameraOverride | null = null;
  private overrideW = 0;
  reducedMotion = false;

  constructor(public cam: THREE.PerspectiveCamera) {}

  snap(p: PlayerController, zone: ZoneDef | null) {
    this.anchorY = p.y;
    this.lookAhead = 0;
    this.overrideW = this.override ? this.override.weight : 0;
    const tgt = this.target(p, zone);
    this.x = tgt.x;
    this.y = tgt.y;
    this.dist = tgt.d;
    this.lookUp = tgt.up;
    this.apply(0);
  }

  addShake(a: number) {
    if (!this.reducedMotion) this.shake = Math.max(this.shake, a);
  }

  private target(p: PlayerController, zone: ZoneDef | null) {
    const c = zone?.camera ?? { distance: 12, offsetY: 1.2 };
    let x = p.x + this.lookAhead;
    if (c.focusX !== undefined) x = x + (c.focusX - x) * (c.focusWeight ?? 0);
    let y = this.anchorY + c.offsetY;
    let d = c.distance;
    let up = c.lookUp ?? 0;
    if (this.override) {
      const w = this.overrideW;
      x += (this.override.x - x) * w;
      y += (this.override.y - y) * w;
      d += (this.override.distance - d) * w;
      up += ((this.override.lookUp ?? 0) - up) * w;
    }
    return { x, y, d, up };
  }

  update(dt: number, p: PlayerController, zone: ZoneDef | null) {
    this.t += dt;
    // Vertical anchor: follow the ground; only chase airborne height when it matters.
    if (p.grounded || p.state === 'mantle') this.anchorY = smooth(this.anchorY, p.y, 5, dt);
    else if (p.y < this.anchorY - 0.5) this.anchorY = smooth(this.anchorY, p.y + 0.5, 8, dt);
    else if (p.y > this.anchorY + 2.2) this.anchorY = smooth(this.anchorY, p.y - 2.2, 6, dt);
    const ahead = p.state === 'normal' ? p.facing * Math.min(1, Math.abs(p.body.vx) / 3) * 1.4 : this.lookAhead;
    this.lookAhead = smooth(this.lookAhead, ahead, 1.4, dt);
    this.overrideW = smooth(this.overrideW, this.override ? this.override.weight : 0, 1.2, dt);
    if (!this.override && this.overrideW < 0.001) this.overrideW = 0;
    const tgt = this.target(p, zone);
    this.x = smooth(this.x, tgt.x, 3.2, dt);
    this.y = smooth(this.y, tgt.y, 2.6, dt);
    this.dist = smooth(this.dist, tgt.d, 1.1, dt);
    this.lookUp = smooth(this.lookUp, tgt.up, 0.8, dt);
    this.shake = Math.max(0, this.shake - dt * 0.6);
    this.apply(dt);
  }

  private apply(_dt: number) {
    const sway = this.reducedMotion ? 0 : 1;
    const sx = Math.sin(this.t * 0.31) * 0.06 * sway + (Math.random() - 0.5) * this.shake * 0.3;
    const sy = Math.sin(this.t * 0.23 + 1) * 0.05 * sway + (Math.random() - 0.5) * this.shake * 0.3;
    const elev = this.dist * 0.1;
    this.cam.position.set(this.x + sx, this.y + elev + sy, this.dist);
    this.cam.lookAt(this.x + sx * 0.5, this.y + sy * 0.5 + this.lookUp * this.dist, 0);
  }
}

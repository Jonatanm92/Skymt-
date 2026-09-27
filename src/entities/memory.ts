import * as THREE from 'three';
import type { GameEvents } from '../core/events';
import type { InspectDef } from '../content/types';
import { glowTexture, rng } from '../render/textures';
import { rockMaterial } from '../render/rocks';
import type { Entity, WorldCtx } from './context';

const WARM = 0xffc98a;

type Prim =
  | { k: 'cap'; a: THREE.Vector3; b: THREE.Vector3; r: number; n: number }
  | { k: 'sph'; c: THREE.Vector3; r: number; n: number }
  | { k: 'box'; c: THREE.Vector3; s: THREE.Vector3; n: number };

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Two seated figures at human scale, one resting against the other, hands meeting. */
function figures(): Prim[] {
  const P: Prim[] = [];
  const seat = 2.7;
  // Bench
  P.push({ k: 'box', c: v(0, seat - 0.2, 0), s: v(8.6, 0.35, 2.4), n: 700 });
  P.push({ k: 'box', c: v(-3.8, (seat - 0.4) / 2, 0.8), s: v(0.3, seat - 0.4, 0.3), n: 90 });
  P.push({ k: 'box', c: v(3.8, (seat - 0.4) / 2, 0.8), s: v(0.3, seat - 0.4, 0.3), n: 90 });
  P.push({ k: 'box', c: v(0, seat + 2.2, -1.1), s: v(8.6, 0.25, 0.2), n: 260 });
  const person = (x: number, lean: number, headTilt: number, n: number) => {
    const hip = v(x, seat + 0.3, -0.2);
    const neck = v(x + lean, seat + 4.0, -0.35);
    P.push({ k: 'cap', a: hip, b: neck, r: 0.95, n: 900 * n });
    P.push({ k: 'sph', c: v(x + lean * 1.5 + headTilt, seat + 4.9, -0.3), r: 0.72, n: 420 * n });
    for (const s of [-1, 1]) {
      const knee = v(x + s * 0.55, seat + 0.35, 2.3);
      P.push({ k: 'cap', a: v(x + s * 0.55, seat + 0.35, 0), b: knee, r: 0.42, n: 230 });
      P.push({ k: 'cap', a: knee, b: v(x + s * 0.6, 0.2, 2.5), r: 0.33, n: 200 });
      const shoulder = v(x + lean + s * 1.05, seat + 3.6, -0.3);
      const elbow = v(x + s * 1.2, seat + 1.8, 0.2);
      P.push({ k: 'cap', a: shoulder, b: elbow, r: 0.26, n: 150 });
    }
  };
  person(-1.55, 0.45, 0.35, 1); // leaning in
  person(1.55, 0, 0, 1);
  // Forearms meeting between them: the hands are held.
  P.push({ k: 'cap', a: v(-0.35, seat + 1.8, 0.2), b: v(0, seat + 1.2, 1.1), r: 0.22, n: 110 });
  P.push({ k: 'cap', a: v(0.35, seat + 1.8, 0.2), b: v(0.05, seat + 1.2, 1.1), r: 0.22, n: 110 });
  P.push({ k: 'sph', c: v(0.02, seat + 1.15, 1.2), r: 0.3, n: 90 });
  return P;
}

function sample(prims: Prim[], R: () => number): number[] {
  const out: number[] = [];
  const dir = () => {
    const u = R() * 2 - 1, th = R() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    return v(s * Math.cos(th), u, s * Math.sin(th));
  };
  for (const p of prims) {
    for (let i = 0; i < p.n; i++) {
      let q: THREE.Vector3;
      if (p.k === 'sph') q = p.c.clone().addScaledVector(dir(), p.r * (0.9 + R() * 0.12));
      else if (p.k === 'cap') q = p.a.clone().lerp(p.b, R()).addScaledVector(dir(), p.r * (0.85 + R() * 0.15));
      else q = v(p.c.x + (R() - 0.5) * p.s.x, p.c.y + (R() - 0.5) * p.s.y, p.c.z + (R() - 0.5) * p.s.z);
      out.push(q.x, q.y, q.z);
    }
  }
  return out;
}

/** A memory made of warm dust: forms, holds, then streams into Skymt's ember. */
export class Apparition {
  points: THREE.Points;
  private base: Float32Array;
  private seeds: Float32Array;
  private mat: THREE.PointsMaterial;
  private t = 0;
  private phase: 'hidden' | 'forming' | 'holding' | 'dissolving' = 'hidden';
  private phaseT = 0;
  private target = new THREE.Vector3();
  private formTime = 3;
  private dissolveTime = 3;

  constructor(scene: THREE.Scene, origin: THREE.Vector3) {
    const R = rng(4242);
    const arr = sample(figures(), R);
    this.base = new Float32Array(arr);
    this.seeds = new Float32Array(arr.length / 3).map(() => R());
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3));
    this.mat = new THREE.PointsMaterial({
      map: glowTexture(), color: WARM, size: 0.2, sizeAttenuation: true, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.position.copy(origin);
    this.points.visible = false;
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  form(seconds = 3) {
    this.phase = 'forming';
    this.phaseT = 0;
    this.formTime = seconds;
    this.points.visible = true;
  }

  dissolveInto(worldTarget: THREE.Vector3, seconds = 3) {
    this.phase = 'dissolving';
    this.phaseT = 0;
    this.dissolveTime = seconds;
    this.target.copy(worldTarget).sub(this.points.position);
  }

  hide() {
    this.phase = 'hidden';
    this.points.visible = false;
    this.mat.opacity = 0;
  }

  update(dt: number) {
    if (this.phase === 'hidden') return;
    this.t += dt;
    this.phaseT += dt;
    const pos = this.points.geometry.attributes.position as THREE.BufferAttribute;
    const n = this.seeds.length;
    for (let i = 0; i < n; i++) {
      const s = this.seeds[i];
      const bx = this.base[i * 3], by = this.base[i * 3 + 1], bz = this.base[i * 3 + 2];
      const drift = 0.05 + (this.phase === 'forming' ? 0.3 * (1 - this.phaseT / this.formTime) : 0);
      let x = bx + Math.sin(this.t * (0.8 + s) + s * 40) * drift;
      let y = by + Math.sin(this.t * (0.6 + s * 0.5) + s * 17) * drift;
      let z = bz;
      if (this.phase === 'forming') {
        // Rise out of the floor dust, staggered by height.
        const k = THREE.MathUtils.clamp((this.phaseT / this.formTime) * 1.6 - (by / 8) * 0.6 - s * 0.3, 0, 1);
        y = by * k + Math.sin(s * 90) * 0.1;
        x = bx + (1 - k) * Math.sin(s * 70) * 1.5;
      } else if (this.phase === 'dissolving') {
        const k = THREE.MathUtils.clamp((this.phaseT / this.dissolveTime) * 1.5 - s * 0.5, 0, 1);
        const e = k * k * (3 - 2 * k);
        const swirl = (1 - e) * e * 3;
        x = x + (this.target.x - x) * e + Math.cos(s * 50 + this.t * 3) * swirl;
        y = y + (this.target.y - y) * e + Math.sin(s * 50 + this.t * 3) * swirl;
        z = z + (this.target.z - z) * e;
      }
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    let op = 0.8;
    if (this.phase === 'forming') op = Math.min(0.8, this.phaseT / this.formTime);
    if (this.phase === 'forming' && this.phaseT >= this.formTime) this.phase = 'holding';
    if (this.phase === 'holding') op = 0.75 + Math.sin(this.t * 2.2) * 0.08;
    if (this.phase === 'dissolving') {
      op = 0.8 * (1 - THREE.MathUtils.smoothstep(this.phaseT, this.dissolveTime * 0.7, this.dissolveTime));
      if (this.phaseT >= this.dissolveTime) {
        this.phase = 'hidden';
        this.points.visible = false;
      }
    }
    this.mat.opacity = op;
  }
}

/** The warm trace in the alcove. The first hum near it wakes the memory. */
export class MemoryTrace implements Entity {
  private stone: THREE.Mesh;
  private motes: THREE.Sprite[] = [];
  private light: THREE.PointLight;
  apparition: Apparition;
  onWake?: () => void;
  onEcho?: () => void;
  private echoCooldown = 0;
  /** Session-only guard; reset on respawn so an interrupted memory can replay. */
  running = false;

  constructor(private pos: { x: number; y: number; radius: number }, private ctx: WorldCtx) {
    const geo = new THREE.SphereGeometry(1, 20, 10);
    geo.scale(1.3, 0.32, 0.8);
    this.stone = new THREE.Mesh(geo, rockMaterial());
    this.stone.position.set(pos.x, pos.y + 0.1, -0.9);
    ctx.scene.add(this.stone);
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: WARM, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }));
      s.scale.setScalar(0.18 + (i % 3) * 0.06);
      ctx.scene.add(s);
      this.motes.push(s);
    }
    this.light = new THREE.PointLight(WARM, 1.2, 5, 1.8);
    this.light.position.set(pos.x, pos.y + 0.8, 0);
    ctx.scene.add(this.light);
    this.apparition = new Apparition(ctx.scene, new THREE.Vector3(pos.x, pos.y, -2.6));
  }

  get seen() {
    return this.ctx.flags.has('memory.seen');
  }

  onPulse(p: GameEvents['pulse']) {
    const d = Math.hypot(p.x - this.pos.x, p.y - this.pos.y);
    if (d > p.radius + this.pos.radius * 0.3) return;
    if (!this.seen && !this.running) {
      this.running = true;
      this.onWake?.();
    } else if (this.seen && this.echoCooldown <= 0) {
      this.echoCooldown = 8;
      this.onEcho?.();
    }
  }

  update(dt: number, time: number) {
    this.echoCooldown = Math.max(0, this.echoCooldown - dt);
    const spent = this.seen ? 0.35 : 1;
    this.motes.forEach((m, i) => {
      const a = time * (0.3 + i * 0.05) + i * 0.9;
      m.position.set(this.pos.x + Math.cos(a) * (0.9 + i * 0.12), this.pos.y + 0.4 + Math.sin(time * 0.7 + i) * 0.3 + i * 0.08, -0.6 + Math.sin(a) * 0.5);
      (m.material as THREE.SpriteMaterial).opacity = spent * (0.35 + 0.3 * Math.sin(time * 1.3 + i * 2));
    });
    this.light.intensity = spent * (1.0 + Math.sin(time * 1.3) * 0.25);
    this.apparition.update(dt);
  }
}

/** Something Skymt can stop and look at. Shows a faint mote when in reach. */
export class Inspectable implements Entity {
  private mote: THREE.Sprite;
  inRange = false;
  private fade = 0;

  constructor(public def: InspectDef, private ctx: WorldCtx) {
    this.mote = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xe8f4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    this.mote.scale.setScalar(0.35);
    ctx.scene.add(this.mote);
  }

  get seen() {
    return this.ctx.flags.has(`inspect.${this.def.id}`);
  }

  update(dt: number, time: number) {
    const p = this.ctx.player;
    this.inRange = Math.abs(p.x - this.def.x) < this.def.radius && Math.abs(p.y - this.def.y) < 1.6 && p.grounded;
    this.fade += ((this.inRange ? 1 : 0) - this.fade) * Math.min(1, dt * 5);
    this.mote.position.set(this.def.x, this.def.y + 1.7 + Math.sin(time * 2) * 0.08, 0.4);
    (this.mote.material as THREE.SpriteMaterial).opacity = this.fade * (this.seen ? 0.35 : 0.8) * (0.8 + Math.sin(time * 3) * 0.2);
  }
}

import * as THREE from 'three';
import type { RootDef } from '../content/types';
import type { GameEvents } from '../core/events';
import type { Solid } from '../world/physics';
import { rng } from '../render/textures';
import type { Entity, WorldCtx } from './context';
import type { EchoStone } from './stone';

const GROW_TIME = 2.6;

/**
 * Pale roots that answer only to the song — and only when light is near.
 * Once grown they stay grown (saved as flag `root.<id>`).
 */
export class MelodyRoot implements Entity {
  private group = new THREE.Group();
  private curled: THREE.Mesh[] = [];
  private stems: THREE.Group[] = [];
  private solids: Solid[] = [];
  private mat: THREE.MeshStandardMaterial;
  growth = 0;
  private growing = false;
  private stir = 0;
  private flag: string;

  constructor(public def: RootDef, private ctx: WorldCtx, private stones: EchoStone[]) {
    this.flag = `root.${def.id}`;
    const R = rng(def.id.charCodeAt(1) * 31);
    this.mat = new THREE.MeshStandardMaterial({
      color: 0xc9bfae, roughness: 0.7, emissive: new THREE.Color(0xffc98a), emissiveIntensity: 0.05,
    });
    // Dormant curls lying at the base, tips reaching toward the light source.
    const lightX = this.lightStones()[0]?.def.x ?? def.x - 3;
    const dir = Math.sign(lightX - def.x) || -1;
    for (let i = 0; i < 9; i++) {
      const pts: THREE.Vector3[] = [];
      const ox = (R() - 0.5) * 1.6 - dir * 0.4;
      const oz = (R() - 0.5) * 1.4;
      const len = 0.9 + R() * 1.4;
      for (let k = 0; k < 7; k++) {
        const t = k / 6;
        // Lies along the ground, lifting only its tip toward the light.
        pts.push(new THREE.Vector3(ox + dir * t * len, 0.06 + Math.sin(t * 9 + i) * 0.04 + Math.pow(t, 3) * (0.2 + R() * 0.25), oz + Math.sin(t * 4 + i * 2) * 0.25));
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.075 - i * 0.005, 6, false), this.mat);
      this.curled.push(tube);
      this.group.add(tube);
    }
    this.group.position.set(def.x, def.y, -0.2);
    ctx.scene.add(this.group);

    // Grown form: each step is a braid of stems topped with a flattened cap.
    for (const [si, r] of def.steps.entries()) {
      this.solids.push(ctx.physics.add({ id: `${def.id}_${si}`, ...r, active: false, surface: 'root' }));
      const g = new THREE.Group();
      const half = r.w / 2;
      // Braided stems rising from the ground, leaning and crossing.
      const stems = Math.max(4, Math.round(r.w * 4.5));
      for (let k = 0; k < stems; k++) {
        const x0 = -half + (k + 0.5) * (r.w / stems) + (R() - 0.5) * 0.25;
        const x1 = -half * 0.85 + R() * r.w * 0.85;
        const z0 = (R() - 0.5) * 1.3;
        const pts = [0, 0.25, 0.5, 0.75, 1].map((t) =>
          new THREE.Vector3(
            x0 + (x1 - x0) * t + Math.sin(t * 5 + k) * 0.12,
            t * (r.h - 0.08),
            z0 * (1 - t * 0.5) + Math.sin(t * 4 + k * 1.7) * 0.2,
          ),
        );
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.06 + R() * 0.07, 6, false), this.mat));
      }
      // A woven top: roots running across, forming the surface Skymt walks on.
      for (let k = 0; k < 6; k++) {
        const z = -0.65 + k * 0.26 + (R() - 0.5) * 0.08;
        const pts = [0, 0.25, 0.5, 0.75, 1].map((t) =>
          new THREE.Vector3(-half - 0.15 + t * (r.w + 0.3), r.h - 0.1 + Math.sin(t * 7 + k * 2) * 0.05, z + Math.sin(t * 3 + k) * 0.08),
        );
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.085, 6, false), this.mat));
      }
      // Loose tendrils curling off the edges.
      for (const side of [-1, 1]) {
        const pts = [0, 0.33, 0.66, 1].map((t) =>
          new THREE.Vector3(side * (half + t * 0.35), r.h - 0.1 - t * 0.5 + Math.sin(t * 3) * 0.15, (R() - 0.5) * 0.8),
        );
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.035, 5, false), this.mat));
      }
      g.position.set(r.x + r.w / 2, r.y, -0.1);
      g.scale.y = 0.001;
      g.visible = false;
      ctx.scene.add(g);
      this.stems.push(g);
    }
    if (ctx.flags.has(this.flag)) this.setGrown();
  }

  private lightStones() {
    return this.stones.filter((s) => this.def.needsLightFrom?.includes(s.def.id));
  }

  get lit() {
    const ls = this.lightStones();
    return ls.length === 0 || ls.some((s) => s.lit);
  }

  private setGrown() {
    this.growth = 1;
    this.stems.forEach((g) => {
      g.visible = true;
      g.scale.y = 1;
    });
    this.solids.forEach((s) => (s.active = true));
    this.curled.forEach((c) => (c.visible = false));
  }

  onPulse(p: GameEvents['pulse']) {
    if (this.growth > 0 || this.growing) return;
    const d = Math.hypot(p.x - this.def.x, p.y - this.def.y);
    if (d > p.radius) return;
    if (p.kind === 'hum') {
      this.stir = Math.max(this.stir, 0.4);
      return;
    }
    if (!this.lit) {
      this.stir = 1.4;
      this.ctx.events.emit('root:stir', { id: this.def.id, x: this.def.x, y: this.def.y });
      return;
    }
    this.growing = true;
    this.stems.forEach((g) => (g.visible = true));
    this.ctx.flags.set(this.flag);
    this.ctx.events.emit('root:grow', { id: this.def.id, x: this.def.x, y: this.def.y });
  }

  update(dt: number, time: number) {
    this.stir = Math.max(0, this.stir - dt * 0.8);
    this.curled.forEach((c, i) => {
      c.rotation.z = Math.sin(time * 9 + i) * 0.06 * this.stir;
      c.scale.y = 1 + this.stir * 0.4 * Math.max(0, Math.sin(time * 3 + i));
    });
    this.mat.emissiveIntensity = 0.05 + this.stir * 0.5 + (this.growing ? 0.6 * (1 - this.growth) : 0);
    if (this.growing) {
      // Slight delay: the song reaches the root, then it answers.
      this.growth = Math.min(1, this.growth + dt / GROW_TIME);
      const k = Math.max(0, (this.growth - 0.12) / 0.88);
      this.stems.forEach((g, i) => {
        const local = THREE.MathUtils.clamp(k * 1.3 - i * 0.15, 0, 1);
        g.scale.y = Math.max(0.001, easeOutBack(local));
      });
      this.curled.forEach((c) => c.scale.setScalar(Math.max(0.001, 1 - k)));
      if (this.growth > 0.55) this.solids.forEach((s) => (s.active = true));
      if (this.growth >= 1) {
        this.growing = false;
        this.curled.forEach((c) => (c.visible = false));
      }
    }
  }
}

function easeOutBack(t: number) {
  const c1 = 1.4, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

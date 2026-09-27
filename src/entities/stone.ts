import * as THREE from 'three';
import type { BridgeDef, StoneDef } from '../content/types';
import type { GameEvents } from '../core/events';
import type { Solid } from '../world/physics';
import { glowTexture, glyphTexture, veinTexture } from '../render/textures';
import { rockMaterial } from '../render/rocks';
import type { Entity, WorldCtx } from './context';

const COLD = 0xa8e6ff;
const WARN_TIME = 2.6;

/** Slabs of pale mineral that hold together only while their stone sings. */
export class LightBridge implements Entity {
  solids: Solid[] = [];
  private slabs: THREE.Mesh[] = [];
  private ghosts: THREE.Sprite[] = [];
  solidity = 0;
  private target = 0;
  private warn = false;
  private flicker = 0;

  constructor(public def: BridgeDef, ctx: WorldCtx) {
    def.slabs.forEach((r, i) => {
      this.solids.push(ctx.physics.add({ id: `${def.id}_${i}`, ...r, oneWay: true, active: false, surface: 'light' }));
      const geo = new THREE.BoxGeometry(r.w, r.h, 1.3);
      // Slightly irregular: shave the ends so they read as shards, not boards.
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let v = 0; v < pos.count; v++) {
        if (pos.getY(v) < 0) pos.setX(v, pos.getX(v) * 0.82);
      }
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({
        color: 0xcfe9f2, emissive: new THREE.Color(COLD), emissiveIntensity: 0.6,
        roughness: 0.4, transparent: true, opacity: 0, depthWrite: false,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(r.x + r.w / 2, r.y + r.h / 2, 0);
      ctx.scene.add(m);
      this.slabs.push(m);
      const ghost = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTexture(), color: COLD, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      ghost.scale.set(r.w * 1.6, 0.7, 1);
      ghost.position.copy(m.position);
      ctx.scene.add(ghost);
      this.ghosts.push(ghost);
    });
  }

  get center() {
    const r = this.def.slabs[Math.floor(this.def.slabs.length / 2)];
    return new THREE.Vector3(r.x + r.w / 2, r.y + r.h / 2, 0);
  }

  set(on: boolean, warn = false) {
    this.target = on ? 1 : 0;
    this.warn = warn;
  }

  update(dt: number, time: number) {
    const rate = this.target > this.solidity ? 3.2 : 2.2;
    this.solidity += Math.sign(this.target - this.solidity) * Math.min(Math.abs(this.target - this.solidity), dt * rate);
    this.flicker = this.warn ? 0.5 + 0.5 * Math.sign(Math.sin(time * 18)) : 1;
    const solid = this.target > 0 && this.solidity > 0.35;
    this.solids.forEach((s) => (s.active = solid));
    this.slabs.forEach((m, i) => {
      const mat = m.material as THREE.MeshStandardMaterial;
      const shimmer = 0.9 + Math.sin(time * 2 + i) * 0.1;
      // Dormant slabs are a faint suspended haze: readable, but clearly not solid.
      mat.opacity = 0.05 + 0.03 * Math.sin(time * 1.7 + i * 1.3) + this.solidity * (this.warn ? 0.4 + 0.4 * this.flicker : 0.85) * shimmer;
      mat.emissiveIntensity = 0.35 + this.solidity * 0.8 * this.flicker;
      m.position.y = this.def.slabs[i].y + this.def.slabs[i].h / 2 + (1 - this.solidity) * -0.08 + Math.sin(time * 1.3 + i * 2) * 0.012;
      const g = this.ghosts[i].material as THREE.SpriteMaterial;
      g.opacity = 0.12 + 0.06 * Math.sin(time * 1.1 + i) + this.solidity * 0.35;
      this.ghosts[i].position.y = m.position.y;
    });
  }
}

/** Standing stones that wake at Skymt's hum and hold light for a while. */
export class EchoStone implements Entity {
  group = new THREE.Group();
  private glyph: THREE.Mesh;
  private halo: THREE.Sprite;
  private light: THREE.PointLight;
  private threads: { mesh: THREE.Mesh; tex: THREE.Texture }[] = [];
  awake = 0; // seconds remaining
  glow = 0;
  private warned = false;

  constructor(public def: StoneDef, private ctx: WorldCtx, public bridges: LightBridge[], private onChannel?: (i: number) => void) {
    const geo = new THREE.CapsuleGeometry(0.32, 0.55, 6, 12);
    geo.scale(1, 1, 0.55);
    const body = new THREE.Mesh(geo, rockMaterial());
    body.position.y = 0.6;
    body.rotation.z = (def.x % 3) * 0.03 - 0.04;
    this.group.add(body);
    this.glyph = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.6),
      new THREE.MeshBasicMaterial({ map: glyphTexture(), color: COLD, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.2 }),
    );
    this.glyph.position.set(0, 0.62, 0.2);
    this.group.add(this.glyph);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: COLD, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    this.halo.scale.setScalar(3);
    this.halo.position.set(0, 0.7, 0.3);
    this.group.add(this.halo);
    this.light = new THREE.PointLight(COLD, 0, 9, 1.5);
    this.light.position.set(0, 1.0, 0.9);
    this.group.add(this.light);
    this.group.position.set(def.x, def.y, -0.35);
    ctx.scene.add(this.group);

    // Visible threads of light from stone to what it powers.
    for (const b of bridges) {
      const a = new THREE.Vector3(def.x, def.y + 0.9, -0.3);
      const c = b.center;
      c.z = -0.3;
      const mid = a.clone().lerp(c, 0.5).add(new THREE.Vector3(0, 1.2, -0.4));
      const curve = new THREE.QuadraticBezierCurve3(a, mid, c);
      const tex = veinTexture();
      tex.repeat.set(4, 1);
      const mesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 48, 0.018, 5, false),
        new THREE.MeshBasicMaterial({ map: tex, color: COLD, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      ctx.scene.add(mesh);
      this.threads.push({ mesh, tex });
    }
  }

  get lit() {
    return this.awake > 0;
  }

  onPulse(p: GameEvents['pulse']) {
    // Stones answer the cold hum only; the song is for living things.
    if (p.kind !== 'hum') return;
    const d = Math.hypot(p.x - this.def.x, p.y - (this.def.y + 0.6));
    if (d > p.radius + 0.4) return;
    const wasLit = this.lit;
    this.awake = this.def.duration;
    this.warned = false;
    this.bridges.forEach((b) => b.set(true));
    this.ctx.events.emit('stone:wake', { id: this.def.id, x: this.def.x, y: this.def.y, tone: this.def.tone, renewed: wasLit });
    if (this.def.channel !== undefined) this.onChannel?.(this.def.channel);
  }

  update(dt: number, time: number) {
    const was = this.awake;
    this.awake = Math.max(0, this.awake - dt);
    if (this.awake > 0 && this.awake <= WARN_TIME && !this.warned) {
      this.warned = true;
      this.bridges.forEach((b) => b.set(true, true));
      this.ctx.events.emit('stone:warn', { id: this.def.id, x: this.def.x, y: this.def.y });
    }
    if (was > 0 && this.awake === 0) {
      this.bridges.forEach((b) => b.set(false));
      this.ctx.events.emit('stone:fade', { id: this.def.id, x: this.def.x, y: this.def.y });
    }
    // Dormant stones breathe faintly, and quicken when Skymt is near.
    const p = this.ctx.player;
    const near = Math.max(0, 1 - Math.hypot(p.x - this.def.x, p.y - this.def.y) / 7);
    const dormant = 0.12 + near * 0.18 * (0.6 + 0.4 * Math.sin(time * (2 + near * 3)));
    const warnFlicker = this.warned && this.awake > 0 ? 0.65 + 0.35 * Math.sin(time * 14) : 1;
    const target = this.awake > 0 ? warnFlicker : 0;
    this.glow += (target - this.glow) * Math.min(1, dt * (target > this.glow ? 10 : 2.5));
    (this.glyph.material as THREE.MeshBasicMaterial).opacity = dormant + this.glow * 0.9;
    (this.halo.material as THREE.SpriteMaterial).opacity = this.glow * 0.5 + near * 0.04;
    this.light.intensity = this.glow * 7;
    for (const th of this.threads) {
      th.tex.offset.x -= dt * 0.8;
      (th.mesh.material as THREE.MeshBasicMaterial).opacity = this.glow * 0.8;
    }
  }
}

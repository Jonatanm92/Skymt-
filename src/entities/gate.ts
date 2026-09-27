import * as THREE from 'three';
import type { GateDef, StoneDef } from '../content/types';
import type { GameEvents } from '../core/events';
import type { Solid } from '../world/physics';
import { glowTexture, shaftTexture, veinTexture } from '../render/textures';
import { makeRockMaterial, rockMaterial } from '../render/rocks';
import type { Entity, WorldCtx } from './context';

const COLD = 0xa8e6ff;
const WARM = 0xffc98a;

/**
 * The sleeping seal at the top of the shaft. Each channel stone that has ever
 * been woken sends light up its vein (permanent). With every vein lit, the
 * song opens the seal and stairs slide out of the chimney walls.
 */
export class Gate implements Entity {
  private halves: THREE.Mesh[] = [];
  private plug: Solid;
  private stairSolids: Solid[] = [];
  private stairMeshes: THREE.Mesh[] = [];
  private veins: { mesh: THREE.Mesh; fill: number; target: number; count: number; tex: THREE.Texture }[] = [];
  private sockets: THREE.Sprite[] = [];
  private shaft: THREE.Mesh;
  private shaftLight: THREE.SpotLight;
  private openT = -1;
  private refuse = 0;
  onShake?: (amount: number) => void;

  constructor(private def: GateDef, private ctx: WorldCtx, stones: StoneDef[]) {
    const r = def.width / 2;
    this.plug = ctx.physics.add({ id: 'gate_plug', ...def.plug, surface: 'stone' });

    // Two halves of a thick carved disc, seen nearly edge-on.
    const mat = makeRockMaterial(0x8a8580);
    for (const side of [-1, 1]) {
      const geo = new THREE.CylinderGeometry(r, r * 0.94, def.plug.h, 32, 1, false, side < 0 ? Math.PI : 0, Math.PI);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(def.x, def.plug.y + def.plug.h / 2, -0.6);
      ctx.scene.add(m);
      this.halves.push(m);
    }
    // Carved rings on the underside, visible from below.
    const ringMat = new THREE.MeshBasicMaterial({ color: COLD, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false });
    this.halves.forEach((half, hi) => {
      for (let i = 0; i < 3; i++) {
        const start = hi === 0 ? Math.PI / 2 : -Math.PI / 2;
        const ring = new THREE.Mesh(new THREE.RingGeometry(r * (0.35 + i * 0.22), r * (0.37 + i * 0.22), 24, 1, start, Math.PI), ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(0, -def.plug.h / 2 - 0.01, 0);
        half.add(ring);
      }
    });

    // Veins from each channel stone to the gate, running over the back wall.
    const channelStones = stones.filter((s) => s.channel !== undefined).sort((a, b) => a.channel! - b.channel!);
    channelStones.forEach((s, i) => {
      const socketX = def.x + (i - 1) * 1.2;
      const topY = def.plug.y - 0.2;
      const runY = topY - 1.6 - i * 0.5;
      const z = -2.75;
      const pts = [
        new THREE.Vector3(s.x, s.y + 1.1, -0.7),
        new THREE.Vector3(s.x, s.y + 1.4, z),
        new THREE.Vector3(s.x + (i - 1) * 0.3, (s.y + runY) / 2, z),
        new THREE.Vector3(s.x, runY - 0.6, z),
        new THREE.Vector3(s.x + Math.sign(socketX - s.x) * 0.6, runY, z),
        new THREE.Vector3(socketX - Math.sign(socketX - s.x) * 0.6, runY, z),
        new THREE.Vector3(socketX, runY + 0.6, z),
        new THREE.Vector3(socketX, topY, -1.2),
      ];
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, 160, 0.05, 5, false);
      const tex = veinTexture();
      tex.repeat.set(12, 1);
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ map: tex, color: COLD, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      const count = geo.index!.count;
      geo.setDrawRange(0, 0);
      ctx.scene.add(mesh);
      // Dormant groove: a faint cold trace so the path reads before it lights.
      const groove = new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({ color: COLD, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false }));
      ctx.scene.add(groove);
      const done = ctx.flags.has(`gate.ch${i}`);
      this.veins.push({ mesh, fill: done ? 1 : 0, target: done ? 1 : 0, count, tex });
      const sock = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: COLD, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.1 }));
      sock.position.set(socketX, def.plug.y - 0.05, -0.2);
      sock.scale.setScalar(0.9);
      ctx.scene.add(sock);
      this.sockets.push(sock);
    });

    // Stairs hidden inside the chimney walls until the seal opens.
    const stoneMat = rockMaterial();
    def.stairs.forEach((s, i) => {
      this.stairSolids.push(ctx.physics.add({ id: `gate_stair_${i}`, ...s, active: false, oneWay: true }));
      const m = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h + 0.1, 1.6), stoneMat);
      m.position.set(s.x + s.w / 2, s.y + s.h / 2 - 0.05, -0.2);
      m.userData.homeX = m.position.x;
      m.userData.hideX = s.x < def.x ? s.x - s.w / 2 - 0.1 : s.x + s.w * 1.5 + 0.1;
      m.position.x = m.userData.hideX;
      ctx.scene.add(m);
      this.stairMeshes.push(m);
    });

    // Warm light that falls through once the seal is open.
    this.shaft = new THREE.Mesh(
      new THREE.PlaneGeometry(5.5, 26),
      new THREE.MeshBasicMaterial({ map: shaftTexture(), color: WARM, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.shaft.position.set(def.x, def.plug.y + 13 - 16, -1.2);
    this.shaft.rotation.z = 0.04;
    ctx.scene.add(this.shaft);
    this.shaftLight = new THREE.SpotLight(WARM, 0, 40, 0.5, 0.8, 1.2);
    this.shaftLight.position.set(def.x, def.plug.y + 12, 2);
    this.shaftLight.target.position.set(def.x, def.plug.y - 8, 0);
    ctx.scene.add(this.shaftLight, this.shaftLight.target);

    if (ctx.flags.has('gate.open')) this.setOpen();
  }

  get isOpen() {
    return this.openT >= 0;
  }

  get channelsFull() {
    return this.veins.every((v) => v.target >= 1);
  }

  fillChannel(i: number) {
    const v = this.veins[i];
    if (!v || v.target >= 1) return;
    v.target = 1;
    this.ctx.flags.set(`gate.ch${i}`);
    this.ctx.events.emit('gate:channel', { id: 'gate', index: i });
  }

  private setOpen() {
    this.openT = 99;
    this.plug.active = false;
    this.halves.forEach((h, i) => (h.position.x = this.def.x + (i === 0 ? -1 : 1) * this.def.width));
    this.stairMeshes.forEach((m) => (m.position.x = m.userData.homeX));
    this.stairSolids.forEach((s) => (s.active = true));
  }

  onPulse(p: GameEvents['pulse']) {
    if (p.kind !== 'song' || this.isOpen) return;
    const d = Math.hypot(p.x - this.def.x, p.y - this.def.y);
    if (d > p.radius) return;
    if (!this.channelsFull) {
      this.refuse = 1.6;
      this.ctx.events.emit('gate:refuse', undefined);
      return;
    }
    this.openT = 0;
    this.ctx.flags.set('gate.open');
    this.ctx.events.emit('gate:open', undefined);
  }

  update(dt: number, time: number) {
    this.refuse = Math.max(0, this.refuse - dt);
    this.veins.forEach((v, i) => {
      v.fill += Math.sign(v.target - v.fill) * Math.min(Math.abs(v.target - v.fill), dt * 0.45);
      v.mesh.geometry.setDrawRange(0, Math.floor((v.count * v.fill) / 3) * 3);
      v.tex.offset.x -= dt * 0.6;
      const open = this.isOpen ? 1 : 0;
      (v.mesh.material as THREE.MeshBasicMaterial).color.setHex(open ? WARM : COLD);
      const s = this.sockets[i].material as THREE.SpriteMaterial;
      const missing = v.target < 1 && this.refuse > 0 ? 0.5 + 0.5 * Math.sin(time * 16) : 0;
      s.opacity = 0.08 + (v.fill >= 1 ? 0.7 : 0) + missing * 0.6;
      s.color.setHex(open ? WARM : COLD);
    });
    // Refusal shiver
    const shiver = this.refuse > 0 ? Math.sin(time * 40) * 0.02 * this.refuse : 0;

    if (this.openT >= 0 && this.openT < 99) {
      this.openT += dt;
      const k = THREE.MathUtils.smoothstep(this.openT, 1.2, 5.2);
      this.halves.forEach((h, i) => (h.position.x = this.def.x + (i === 0 ? -1 : 1) * this.def.width * k + Math.sin(time * 30) * 0.03 * (1 - k)));
      this.onShake?.(this.openT < 5.2 ? 0.25 : 0);
      if (this.openT > 4.4) this.plug.active = false;
      this.stairMeshes.forEach((m, i) => {
        const t0 = 5.4 + i * 0.35;
        const kk = THREE.MathUtils.smoothstep(this.openT, t0, t0 + 0.6);
        m.position.x = m.userData.hideX + (m.userData.homeX - m.userData.hideX) * kk;
        if (kk > 0.9) this.stairSolids[i].active = true;
      });
      if (this.openT > 5.4 + this.stairMeshes.length * 0.35 + 1) this.openT = 99;
    } else if (!this.isOpen) {
      this.halves.forEach((h, i) => (h.position.x = this.def.x + (i === 0 ? -0.001 : 0.001) + shiver));
    }
    const light = this.isOpen ? Math.min(1, this.openT >= 99 ? 1 : THREE.MathUtils.smoothstep(this.openT, 1.5, 6)) : 0;
    (this.shaft.material as THREE.MeshBasicMaterial).opacity = light * (0.32 + Math.sin(time * 0.7) * 0.04);
    this.shaftLight.intensity = light * 60;
  }
}

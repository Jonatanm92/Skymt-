import * as THREE from 'three';
import { glowTexture } from '../render/textures';
import type { PlayerController } from './controller';

const COLD = new THREE.Color(0xbfe9ff);
const WARM = new THREE.Color(0xffc98a);

/**
 * Skymt: small, hooded, faceless but for two pale eye-glints, with an ember in
 * the chest that is the main light source of the depths. Fully procedural
 * animation driven by controller state.
 */
export class SkymtModel {
  root = new THREE.Group();
  private pivot = new THREE.Group(); // squash/stretch + lean
  private body: THREE.Mesh;
  private head = new THREE.Group();
  private hood: THREE.Mesh;
  private eyes: THREE.Mesh[] = [];
  private legs: THREE.Mesh[] = [];
  private arms: THREE.Mesh[] = [];
  private ember: THREE.Mesh;
  private emberGlow: THREE.Sprite;
  light: THREE.PointLight;
  private ring: THREE.Mesh;
  private t = 0;
  private squash = 0;
  private squashV = 0;
  private lean = 0;
  private faceYaw = 0;
  private blink = 0;
  private nextBlink = 3;
  /** 0..1 how awake Skymt is (opening). */
  awake = 1;
  warmth = 0; // permanent warmth gained through the story (0..1)
  lookUp = 0;
  private emberBoost = 0;

  constructor() {
    const cloth = new THREE.MeshStandardMaterial({ color: 0x2c323c, roughness: 0.8, metalness: 0.05 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x101318, roughness: 0.9 });

    // Cloak: a lathe teardrop, slightly flared at the hem.
    const prof = [
      [0.0, 0.02], [0.23, 0.0], [0.24, 0.08], [0.2, 0.26], [0.15, 0.44], [0.11, 0.56], [0.0, 0.6],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const cloakGeo = new THREE.LatheGeometry(prof, 20);
    // Ragged hem: pull the lowest ring up and down unevenly.
    const cp = cloakGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < cp.count; i++) {
      if (cp.getY(i) < 0.03) {
        const a = Math.atan2(cp.getZ(i), cp.getX(i));
        cp.setY(i, cp.getY(i) + (Math.sin(a * 5) * 0.5 + Math.sin(a * 11) * 0.5) * 0.035);
      }
    }
    cloakGeo.computeVertexNormals();
    this.body = new THREE.Mesh(cloakGeo, cloth);
    this.body.position.y = 0.14;
    this.pivot.add(this.body);

    // Head + hood
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14), dark);
    this.head.add(headMesh);
    this.hood = new THREE.Mesh(
      new THREE.SphereGeometry(0.175, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62),
      cloth,
    );
    this.hood.rotation.x = -0.35;
    this.hood.position.set(0, 0.01, -0.02);
    this.head.add(this.hood);
    // Soft point of the hood, bent back.
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 12), cloth);
    tip.position.set(0, 0.17, -0.1);
    tip.rotation.x = -0.75;
    this.head.add(tip);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xdff6ff });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), eyeMat);
      e.position.set(s * 0.055, 0.0, 0.135);
      e.scale.set(1, 1.4, 0.6);
      this.eyes.push(e);
      this.head.add(e);
    }
    this.head.position.y = 0.76;
    this.pivot.add(this.head);

    // Legs and arms: thin capsules pivoting at the top.
    for (const s of [-1, 1]) {
      const g = new THREE.CapsuleGeometry(0.035, 0.14, 3, 6);
      g.translate(0, -0.1, 0);
      const leg = new THREE.Mesh(g, dark);
      leg.position.set(s * 0.08, 0.2, 0);
      this.legs.push(leg);
      this.pivot.add(leg);
      const ga = new THREE.CapsuleGeometry(0.028, 0.16, 3, 6);
      ga.translate(0, -0.1, 0);
      const arm = new THREE.Mesh(ga, cloth);
      arm.position.set(s * 0.17, 0.56, 0.02);
      arm.rotation.z = s * 0.25;
      this.arms.push(arm);
      this.pivot.add(arm);
    }

    // Ember
    this.ember = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 12, 8),
      new THREE.MeshBasicMaterial({ color: COLD.clone() }),
    );
    this.ember.position.set(0, 0.47, 0.14);
    this.pivot.add(this.ember);
    this.emberGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), color: COLD.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.emberGlow.scale.setScalar(0.7);
    this.emberGlow.position.copy(this.ember.position);
    this.pivot.add(this.emberGlow);

    this.light = new THREE.PointLight(COLD.clone(), 3, 9, 1.6);
    this.light.position.set(0, 0.6, 0.6);
    this.root.add(this.light);

    // Hum ring (charging indicator in the world, not the HUD)
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.985, 1, 96),
      new THREE.MeshBasicMaterial({ color: COLD.clone(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.ring.position.set(0, 0.5, 0.05);
    this.root.add(this.ring);

    this.root.add(this.pivot);
  }

  impulseSquash(amount: number) {
    this.squashV -= amount;
  }

  flare(amount = 1) {
    this.emberBoost = Math.max(this.emberBoost, amount);
  }

  update(dt: number, p: PlayerController) {
    this.t += dt;
    const b = p.body;
    this.root.position.set(b.x, b.y, 0);
    const speed = Math.abs(b.vx);
    const moving = p.grounded && speed > 0.3;

    // Facing: turn most of the way to profile but keep a 3/4 view of the ember.
    const yawTarget = p.state === 'lying' || p.state === 'waking' ? 0.2 : p.facing * 1.05 * (this.lookUp > 0.5 ? 0.4 : 1);
    this.faceYaw += (yawTarget - this.faceYaw) * Math.min(1, dt * 12);
    this.pivot.rotation.y = this.faceYaw;

    // Squash & stretch spring.
    const stretchTarget = p.grounded ? 0 : THREE.MathUtils.clamp(b.vy * 0.025, -0.12, 0.14);
    // Sub-stepped so the spring stays stable at low frame rates.
    for (let left = dt; left > 1e-6; left -= 1 / 120) {
      const h = Math.min(left, 1 / 120);
      this.squashV += ((stretchTarget - this.squash) * 180 - this.squashV * 14) * h;
      this.squash += this.squashV * h;
    }
    this.squash = THREE.MathUtils.clamp(this.squash, -0.4, 0.4);
    const sy = 1 + this.squash;
    const sxz = 1 - this.squash * 0.5;
    this.pivot.scale.set(sxz, sy, sxz);

    // Lean into motion.
    const leanTarget = -b.vx * 0.045 + (p.state === 'mantle' ? 0 : 0);
    this.lean += (leanTarget - this.lean) * Math.min(1, dt * 8);
    this.pivot.rotation.z = this.lean;

    // Legs / arms
    const phase = p.stepPhase * Math.PI * 2;
    const walkAmt = moving ? Math.min(1, speed / 3) : 0;
    this.legs[0].rotation.x = Math.sin(phase) * 0.7 * walkAmt;
    this.legs[1].rotation.x = -Math.sin(phase) * 0.7 * walkAmt;
    const bob = moving ? Math.abs(Math.sin(phase)) * 0.035 * walkAmt : 0;
    const breath = Math.sin(this.t * 1.6) * 0.012;
    this.pivot.position.y = bob + breath;
    let armX = -Math.sin(phase) * 0.5 * walkAmt;
    let armZ = 0.25;
    if (!p.grounded && p.state === 'normal') {
      armX = b.vy > 0 ? -0.8 : -1.8;
      armZ = 0.45;
      this.legs[0].rotation.x = 0.35;
      this.legs[1].rotation.x = -0.25;
    }
    if (p.state === 'mantle') {
      const k = p.stateTime / 0.42;
      armX = -2.6 + k * 1.8;
      armZ = 0.15;
      this.legs[0].rotation.x = -0.6 * (1 - k);
      this.legs[1].rotation.x = 0.4 * (1 - k);
    }
    if (p.state === 'singing' || p.humming) {
      armX = -0.35;
      armZ = 0.55 + Math.sin(this.t * 3) * 0.05;
    }
    this.arms.forEach((a, i) => {
      a.rotation.x += ((i === 0 ? armX : p.state === 'normal' && p.grounded ? -armX : armX) - a.rotation.x) * Math.min(1, dt * 14);
      a.rotation.z = (i === 0 ? -1 : 1) * armZ;
    });

    // Head: look up for the finale; tilt while humming.
    const tilt = (p.humming || p.state === 'singing' ? -0.3 : 0) - this.lookUp * 0.7;
    this.head.rotation.x += (tilt - this.head.rotation.x) * Math.min(1, dt * 6);

    // Lying / waking pose: curled on the side.
    if (p.state === 'lying' || p.state === 'waking') {
      const k = p.state === 'lying' ? 0 : THREE.MathUtils.smoothstep(p.stateTime, 0.4, 2.0);
      this.pivot.rotation.z = (1 - k) * 1.35;
      this.pivot.position.y = (1 - k) * 0.12 - k * 0;
      this.pivot.position.x = (1 - k) * -0.2;
      this.head.rotation.x = (1 - k) * 0.5;
    } else this.pivot.position.x = 0;

    // Blink
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink = 0.14;
      this.nextBlink = 2.5 + Math.random() * 4;
    }
    this.blink = Math.max(0, this.blink - dt);
    const eyeOpen = (this.blink > 0 ? 0.1 : 1) * (p.state === 'lying' ? 0.05 : 1) * Math.min(1, this.awake * 1.5);
    this.eyes.forEach((e) => (e.scale.y = 1.4 * eyeOpen));

    // Ember: breathes, brightens with hum, turns warm when singing.
    this.emberBoost = Math.max(0, this.emberBoost - dt * 0.8);
    const charge = p.humCharge;
    const singing = p.state === 'singing' ? 1 : 0;
    const warm = Math.min(1, Math.max(0, charge - 1) + singing + this.warmth * 0.35);
    const col = COLD.clone().lerp(WARM, warm);
    const pulse = 0.85 + Math.sin(this.t * 1.6) * 0.15;
    const intensity = this.awake * (pulse + Math.min(1, charge) * 1.6 + singing * 2.2 + this.emberBoost * 3);
    (this.ember.material as THREE.MeshBasicMaterial).color.copy(col).multiplyScalar(0.6 + intensity * 0.5);
    (this.emberGlow.material as THREE.SpriteMaterial).color.copy(col);
    (this.emberGlow.material as THREE.SpriteMaterial).opacity = Math.min(1, 0.35 + intensity * 0.3);
    this.emberGlow.scale.setScalar(0.55 + intensity * 0.35);
    this.light.color.copy(col);
    this.light.intensity = 2.4 * intensity + 0.2;
    this.light.distance = 8 + Math.min(1, charge) * 4 + singing * 5;

    // Charging ring: grows with the hum, turns warm when it becomes song.
    const ringMat = this.ring.material as THREE.MeshBasicMaterial;
    if (p.humming) {
      const r = 3.2 + Math.min(1, charge) * 3.8;
      this.ring.scale.setScalar(r * (0.96 + Math.sin(this.t * 20) * 0.01));
      ringMat.opacity = 0.06 + Math.min(1, charge) * 0.12;
      ringMat.color.copy(col);
    } else ringMat.opacity = Math.max(0, ringMat.opacity - dt * 1.5);
  }
}

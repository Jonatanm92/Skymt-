import * as THREE from 'three';
import { glowTexture } from './textures';

/** Drifting motes around the camera, slow falling ash in the well, pulse rings. */
export class Atmosphere {
  private dust: THREE.Points;
  private dustBase: Float32Array;
  private fall: THREE.Points;
  private rings: { mesh: THREE.Mesh; t: number; r: number; life: number }[] = [];
  private t = 0;
  warm = 0;

  constructor(private scene: THREE.Scene) {
    const n = 700;
    this.dustBase = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      this.dustBase[i * 4] = Math.random() * 34;
      this.dustBase[i * 4 + 1] = Math.random() * 22;
      this.dustBase[i * 4 + 2] = Math.random() * 12 - 7;
      this.dustBase[i * 4 + 3] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.dust = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ map: glowTexture(), size: 0.09, color: 0xa8d8e8, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.dust.frustumCulled = false;
    scene.add(this.dust);

    const m = 900;
    const fp = new Float32Array(m * 3);
    for (let i = 0; i < m; i++) {
      fp[i * 3] = 96 + Math.random() * 60;
      fp[i * 3 + 1] = 26 + Math.random() * 90;
      fp[i * 3 + 2] = -40 + Math.random() * 42;
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    this.fall = new THREE.Points(
      fg,
      new THREE.PointsMaterial({ map: glowTexture(), size: 0.22, color: 0xffe8cc, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.fall.frustumCulled = false;
    scene.add(this.fall);
  }

  pulse(x: number, y: number, radius: number, warm: boolean) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 96),
      new THREE.MeshBasicMaterial({ color: warm ? 0xffc98a : 0xbfe9ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    mesh.position.set(x, y, 0.2);
    this.scene.add(mesh);
    this.rings.push({ mesh, t: 0, r: radius, life: warm ? 2.2 : 0.9 });
  }

  update(dt: number, focus: THREE.Vector3, showFall: boolean) {
    this.t += dt;
    const pos = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    const n = pos.count;
    const ox = focus.x - 17, oy = focus.y - 8;
    for (let i = 0; i < n; i++) {
      const b = i * 4;
      const s = this.dustBase[b + 3];
      const x = this.dustBase[b] + this.t * (0.12 + s * 0.1) + Math.sin(this.t * 0.3 + s * 20) * 0.4;
      const y = this.dustBase[b + 1] + Math.sin(this.t * 0.2 + s * 30) * 0.6 - this.t * 0.05 * s;
      pos.setXYZ(i, ox + wrap(x - ox, 34), oy + wrap(y - oy, 22), this.dustBase[b + 2]);
    }
    pos.needsUpdate = true;
    const dm = this.dust.material as THREE.PointsMaterial;
    dm.color.setHex(0xa8d8e8).lerp(new THREE.Color(0xffd8a8), this.warm);

    this.fall.visible = showFall;
    if (showFall) {
      const fp = this.fall.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < fp.count; i++) {
        let y = fp.getY(i) - dt * (0.35 + (i % 7) * 0.08);
        if (y < 26) y += 90;
        fp.setY(i, y);
        fp.setX(i, fp.getX(i) + Math.sin(this.t * 0.5 + i) * dt * 0.2);
      }
      fp.needsUpdate = true;
    }

    this.rings = this.rings.filter((r) => {
      r.t += dt;
      const k = r.t / r.life;
      const e = 1 - Math.pow(1 - Math.min(1, k), 3);
      r.mesh.scale.setScalar(Math.max(0.01, e * r.r));
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - k);
      if (k >= 1) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        (r.mesh.material as THREE.Material).dispose();
        return false;
      }
      return true;
    });
  }
}

function wrap(v: number, size: number) {
  return ((v % size) + size) % size;
}

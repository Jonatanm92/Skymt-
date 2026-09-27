// Non-colliding set dressing: back walls, human-scale remnants, vistas.
// Human scale here is ~10 units tall (Skymt is 0.9): a hand is larger than he is.
import * as THREE from 'three';
import type { LevelDef } from '../content/types';
import { buildBackWall, buildLichen, buildRock, makeRockMaterial, rockMaterial } from './rocks';
import { fbm1, glowTexture, rng, shaftTexture } from './textures';

const wood = () => new THREE.MeshStandardMaterial({ color: 0x3b3029, roughness: 0.85 });
const silhouette = new THREE.MeshBasicMaterial({ color: 0x010203 });

export interface Dressing {
  shafts: THREE.Mesh[];
  wellSky: THREE.Group;
  lid: THREE.Group;
}

export function buildWorld(scene: THREE.Scene, level: LevelDef): Dressing {
  level.solids.forEach((s, i) => {
    if (s.look === 'none') return;
    scene.add(buildRock(s, i * 17 + 3));
  });
  scene.add(buildLichen(level.solids));

  // Back walls for enclosed spaces.
  scene.add(buildBackWall(-14, -4, 62, 13, -3.3, 1));
  scene.add(buildBackWall(80, -2, 15, 13, -3.3, 2, 0x72767c));
  scene.add(buildBackWall(94.6, -2, 22.5, 24, -3.3, 3, 0x6c7680));
  scene.add(buildBackWall(109, 20, 9, 9.4, -3.1, 4, 0x80796f));

  buildDepths(scene);
  buildHall(scene);
  buildShaftDressing(scene);
  const wellSky = buildWell(scene);
  const shafts = buildLightShafts(scene);
  buildForeground(scene);
  const lid = buildLid(scene, level);
  return { shafts, wellSky, lid };
}

function buildDepths(scene: THREE.Scene) {
  // The hand pressed into the back wall.
  const mat = new THREE.MeshStandardMaterial({ color: 0x22272c, roughness: 1 });
  const hand = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.85, 0.12), mat);
  hand.add(palm);
  const fingers: [number, number, number][] = [[-0.3, 0.72, 0.1], [-0.1, 0.8, 0.02], [0.1, 0.78, -0.04], [0.29, 0.66, -0.12]];
  for (const [x, len, rot] of fingers) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, len, 4, 8), mat);
    f.position.set(x + rot * 0.8, 0.42 + len / 2, 0);
    f.rotation.z = rot;
    hand.add(f);
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.5, 4, 8), mat);
  thumb.position.set(-0.55, 0.05, 0);
  thumb.rotation.z = 0.9;
  hand.add(thumb);
  hand.position.set(2.6, 0.75, -2.72);
  hand.scale.set(1.15, 1.15, 0.5);
  hand.rotation.z = -0.12;
  scene.add(hand);
  // Lichen gathered around its outline.
  const R = rng(7);
  const glow = new THREE.MeshBasicMaterial({ color: 0x74d8c8 });
  for (let i = 0; i < 9; i++) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.02 + R() * 0.02, 5, 4), glow);
    d.position.set(2.1 + R() * 1.0, 0.75 + R() * 0.3, -2.6);
    scene.add(d);
  }
  // Stalactites from the low ceiling.
  for (let i = 0; i < 14; i++) {
    const h = 0.6 + R() * 1.6;
    const s = new THREE.Mesh(new THREE.ConeGeometry(0.15 + R() * 0.25, h, 6), rockMaterial());
    s.rotation.x = Math.PI;
    s.position.set(-4 + i * 3.1 + R(), 7 - h / 2 + 0.1, -2 + R() * 1.5);
    scene.add(s);
  }
}

function buildHall(scene: THREE.Scene) {
  const far = buildBackWall(20, -30, 80, 100, -46, 11, 0x46505a);
  scene.add(far);
  const R = rng(21);
  // Colossal pillars fading into fog.
  for (let i = 0; i < 6; i++) {
    const r = 1.4 + R() * 2.2;
    const geo = new THREE.CylinderGeometry(r * 0.8, r, 80, 12, 16);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v++) {
      const y = pos.getY(v);
      const k = 1 + fbm1(y * 0.15 + i * 10, i) * 0.25;
      pos.setX(v, pos.getX(v) * k);
      pos.setZ(v, pos.getZ(v) * k);
    }
    geo.computeVertexNormals();
    const p = new THREE.Mesh(geo, rockMaterial());
    p.position.set(44 + i * 8.5 + R() * 4, 20, -12 - R() * 22);
    scene.add(p);
  }
  // A house staircase sunk into the cavern, climbing into nothing.
  const wm = wood();
  const stairs = new THREE.Group();
  for (let i = 0; i < 15; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.22, 6), wm);
    step.position.set(i * 1.6, i * 1.05 + 1.05, 0);
    stairs.add(step);
    const riser = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.05, 6), wm);
    riser.position.set(i * 1.6 - 0.8, i * 1.05 + 0.5, 0);
    stairs.add(riser);
    if (i % 2 === 0) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 5, 0.14), wm);
      post.position.set(i * 1.6, i * 1.05 + 3.5, 2.8);
      stairs.add(post);
    }
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(26, 0.25, 0.25), wm);
  rail.position.set(11.2, 13.2, 2.8);
  rail.rotation.z = Math.atan2(1.05, 1.6);
  stairs.add(rail);
  const stringer = new THREE.Mesh(new THREE.BoxGeometry(26, 1.2, 0.3), wm);
  stringer.position.set(11.2, 7.2, 3);
  stringer.rotation.z = Math.atan2(1.05, 1.6);
  stairs.add(stringer);
  stairs.position.set(50, -2.2, -16);
  stairs.rotation.z = -0.03;
  scene.add(stairs);

  // The chair: human scale, sunk and tilted.
  const chair = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.25, 2.7), wm);
  seat.position.y = 2.6;
  chair.add(seat);
  for (const [x, z] of [[-1.25, -1.2], [1.25, -1.2], [-1.25, 1.2], [1.25, 1.2]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.6, 0.22), wm);
    leg.position.set(x, 1.3, z);
    chair.add(leg);
  }
  for (const x of [-1.25, 1.25]) {
    const up = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.1, 0.22), wm);
    up.position.set(x, 4.2, -1.2);
    chair.add(up);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.5, 0.24), wm);
  top.position.set(0, 5.6, -1.2);
  chair.add(top);
  for (const x of [-0.5, 0, 0.5]) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.4, 0.12), wm);
    slat.position.set(x, 4.1, -1.2);
    chair.add(slat);
  }
  chair.position.set(56.8, -0.5, -2.6);
  chair.rotation.set(0.05, 0.35, -0.09);
  scene.add(chair);

  // A frame around nothing, leaning back against the dark.
  const gilt = new THREE.MeshStandardMaterial({ color: 0x6f5b3a, roughness: 0.45, metalness: 0.55 });
  const frame = new THREE.Group();
  const fw = 3.6, fh = 4.6, t = 0.32;
  [[0, fh / 2, fw + t, t], [0, -fh / 2, fw + t, t]].forEach(([x, y, w, h]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.25), gilt);
    m.position.set(x, y, 0);
    frame.add(m);
  });
  [[-fw / 2, 0], [fw / 2, 0]].forEach(([x, y]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(t, fh, 0.25), gilt);
    m.position.set(x, y, 0);
    frame.add(m);
  });
  frame.position.set(51.5, fh / 2 - 0.05, -3.0);
  frame.rotation.set(-0.22, 0.12, 0.05);
  scene.add(frame);
  const leanRock = buildRock({ id: 'lean', x: 48.8, y: -0.5, w: 6.2, h: 5.4 }, 77);
  leanRock.position.z = -5.4;
  leanRock.scale.z = 0.6;
  scene.add(leanRock);

  // Hanging stalactites high in the hall.
  for (let i = 0; i < 12; i++) {
    const h = 3 + R() * 8;
    const s = new THREE.Mesh(new THREE.ConeGeometry(0.5 + R() * 1.2, h, 7), rockMaterial());
    s.rotation.x = Math.PI;
    s.position.set(48 + i * 3 + R() * 2, 34 - h / 2, -4 - R() * 10);
    scene.add(s);
  }
}

function buildShaftDressing(scene: THREE.Scene) {
  // Old beams across the shaft wall: this was built, once.
  const wm = wood();
  for (const [x, y, w, rot] of [[100, 5.5, 9, 0.06], [104, 14.5, 12, -0.04], [98, 18.5, 6, 0.1]] as const) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.45, 0.5), wm);
    b.position.set(x, y, -2.85);
    b.rotation.z = rot;
    scene.add(b);
  }
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 18, 0.5), wm);
  post.position.set(107.5, 9, -2.9);
  post.rotation.z = 0.03;
  scene.add(post);
}

function buildWell(scene: THREE.Scene): THREE.Group {
  const g = new THREE.Group();
  const cx = 127, cz = -62, radius = 60;
  const wallGeo = new THREE.CylinderGeometry(radius, radius, 205, 96, 40, true);
  const pos = wallGeo.attributes.position as THREE.BufferAttribute;
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    const a = Math.atan2(z, x);
    const k = 1 + fbm1(a * 6 + y * 0.03, 5) * 0.05;
    pos.setX(v, x * k);
    pos.setZ(v, z * k);
  }
  wallGeo.computeVertexNormals();
  const wm = makeRockMaterial(0x6a717a, 0.05);
  wm.side = THREE.BackSide;
  const wall = new THREE.Mesh(wallGeo, wm);
  wall.position.set(cx, 82.5, cz);
  g.add(wall);

  // A spiral stair wound along the well wall, rising toward the light.
  const woodM = wood();
  const R = rng(3);
  const steps = 118;
  const stepGeo = new THREE.BoxGeometry(4, 0.45, 1.8);
  const inst = new THREE.InstancedMesh(stepGeo, woodM, steps);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < steps; i++) {
    const a = -Math.PI * 0.9 + i * 0.16;
    const y = 26 + i * 1.3;
    const r = radius - 2.2;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
    m.compose(new THREE.Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r), q, new THREE.Vector3(1, 1, 1));
    inst.setMatrixAt(i, m);
  }
  g.add(inst);

  // Windows with warm light, far up. Someone lived here.
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffb46a });
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffa050, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 });
  for (let i = 0; i < 26; i++) {
    const a = -Math.PI / 2 + (R() - 0.5) * 2.6;
    const y = 34 + Math.pow(R(), 1.4) * 130;
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), winMat);
    const r = radius - 0.6;
    w.position.set(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r);
    w.lookAt(cx, y, cz);
    g.add(w);
    const s = new THREE.Sprite(glowMat);
    s.position.copy(w.position).lerp(new THREE.Vector3(cx, y, cz), 0.02);
    s.scale.setScalar(7);
    g.add(s);
  }

  // The sky: a pale disc of light at the top of the well.
  const sky = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.44, 48), new THREE.MeshBasicMaterial({ color: 0xe6d3b4, fog: false }));
  sky.rotation.x = Math.PI / 2;
  sky.position.set(cx, 186, cz);
  g.add(sky);
  // The ground above: everything outside the opening is dark rock.
  const capMat = makeRockMaterial(0x2a2f36, 0.03);
  capMat.side = THREE.DoubleSide;
  const cap = new THREE.Mesh(new THREE.RingGeometry(radius * 0.42, 420, 64, 1), capMat);
  cap.rotation.x = Math.PI / 2;
  cap.position.set(cx, 185, cz);
  g.add(cap);
  const skyGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffe4c0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
  skyGlow.position.set(cx, 178, cz);
  skyGlow.scale.setScalar(90);
  (skyGlow.material as THREE.SpriteMaterial).opacity = 0.4;
  (skyGlow.material as THREE.SpriteMaterial).fog = false;
  g.add(skyGlow);
  // Long beam falling down the well.
  const beam = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 160),
    new THREE.MeshBasicMaterial({ map: shaftTexture(), color: 0xffe0b8, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  beam.position.set(cx - 2, 104, cz + 20);
  beam.rotation.z = 0.06;
  g.add(beam);
  // Lower spill of the same light, reaching the ledge Skymt arrives on.
  const low = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 80),
    new THREE.MeshBasicMaterial({ map: shaftTexture(), color: 0xffd9a8, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  low.position.set(cx + 2, 66, -22);
  low.rotation.z = 0.08;
  g.add(low);
  // Ropes hanging from somewhere above.
  for (let i = 0; i < 5; i++) {
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 120, 4), silhouette);
    rope.position.set(cx - 18 + i * 8 + R() * 3, 110 + R() * 20, -10 - R() * 25);
    g.add(rope);
  }
  // The well's bucket, human-sized, hanging on its rope far out in the dark.
  const bucket = new THREE.Group();
  const wm2 = wood();
  const tub = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 2.6, 5.2, 18, 1, true), wm2);
  wm2.side = THREE.DoubleSide;
  bucket.add(tub);
  for (const y of [-1.8, 1.8]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(y > 0 ? 3.1 : 2.75, 0.12, 6, 24), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.5 }));
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    bucket.add(band);
  }
  const handle = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.1, 6, 24, Math.PI), silhouette);
  handle.position.y = 2.6;
  bucket.add(handle);
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 110, 4), silhouette);
  line.position.y = 5.7 + 55;
  bucket.add(line);
  bucket.position.set(cx + 9, 45, -26);
  bucket.rotation.set(0.05, 0.4, 0.08);
  g.add(bucket);
  // Warm glow from high windows spilling down the walls.
  const spill = new THREE.PointLight(0xffb070, 2600, 170, 1.4);
  spill.position.set(cx - 6, 95, cz + 14);
  g.add(spill);
  // Warm key light for the finale ledge.
  const key = new THREE.DirectionalLight(0xffdcb0, 0.0);
  key.position.set(cx - 10, 200, 20);
  key.target.position.set(125, 30, 0);
  key.name = 'wellKey';
  g.add(key, key.target);
  scene.add(g);
  return g;
}

function buildLightShafts(scene: THREE.Scene): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const mk = (x: number, top: number, h: number, w: number, z: number, color: number, op: number, tilt: number) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: shaftTexture(), color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    m.position.set(x, top - h / 2, z);
    m.rotation.z = tilt;
    m.userData.base = op;
    scene.add(m);
    out.push(m);
  };
  mk(56, 34, 36, 4, -5, 0x9fc6d8, 0.12, 0.12);
  mk(66, 34, 38, 2.4, -1.8, 0xa8d0e0, 0.1, 0.08);
  mk(76, 34, 44, 3.4, -2.5, 0xa8d0e0, 0.14, -0.05);
  mk(2, 7, 7, 1.4, -2, 0x8fb8c8, 0.08, 0.1);
  mk(88.5, 9.8, 9, 2.4, -2.2, 0xffd7a8, 0.07, 0.02);
  return out;
}

function buildForeground(scene: THREE.Scene) {
  const R = rng(55);
  // Hanging roots in the depths, near the lens.
  for (const x of [-1.5, 10, 23, 34]) {
    for (let k = 0; k < 3; k++) {
      const pts = [0, 1, 2, 3].map((i) => new THREE.Vector3(x + k * 0.4 + Math.sin(i + k) * 0.25, 9.5 - i * (0.9 + R() * 0.4), 3.5));
      scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.06 + R() * 0.05, 5), silhouette));
    }
  }
  // Dark boulders in the foreground, below the walking line.
  for (const [x, y] of [[13, -2.5], [27, -2.2], [43, -1.4], [62, -3.2], [88, -2.4], [104, -2.3]] as const) {
    const geo = new THREE.IcosahedronGeometry(1.6 + R() * 1.2, 1);
    geo.scale(1.6, 0.8, 0.6);
    const m = new THREE.Mesh(geo, silhouette);
    m.position.set(x, y, 3.8);
    scene.add(m);
  }
}

function buildLid(scene: THREE.Scene, level: LevelDef) {
  // Roots that knit across the chimney mouth behind Skymt once he's up.
  const g = new THREE.Group();
  const r = level.wellLid;
  const mat = new THREE.MeshStandardMaterial({ color: 0xc9bfae, roughness: 0.7 });
  for (let i = 0; i < 6; i++) {
    const pts = [0, 1, 2, 3, 4].map((k) => new THREE.Vector3(r.x - 0.3 + (k / 4) * (r.w + 0.6), r.y + r.h - 0.12 + Math.sin(k * 1.7 + i) * 0.08, -1 + i * 0.4));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.09, 6), mat));
  }
  g.visible = false;
  scene.add(g);
  return g;
}

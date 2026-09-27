import * as THREE from 'three';
import type { SolidDef } from '../content/types';
import { fbm1, rng, rockTextures } from './textures';

const BEVEL = 0.1;
const ZBACK = -2.6;
const DEPTH = 3.3;

let rockMat: THREE.MeshStandardMaterial | null = null;

/**
 * Rock shading with world-space triplanar texturing, so every rock, wall and
 * stone shares one texel density with no UV seams or stretching.
 */
export function makeRockMaterial(color: number, scale = 0.09) {
  const { map } = rockTextures();
  const mat = new THREE.MeshStandardMaterial({ color, map, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTriScale = { value: scale };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNormal;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvTriPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTriNormal = normalize(mat3(modelMatrix) * objectNormal);',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNormal;\nuniform float uTriScale;')
      .replace(
        '#include <map_fragment>',
        `vec3 triW = pow(abs(normalize(vTriNormal)), vec3(4.0));
        triW /= (triW.x + triW.y + triW.z);
        vec4 triC = texture2D(map, vTriPos.zy * uTriScale) * triW.x
                  + texture2D(map, vTriPos.xz * uTriScale) * triW.y
                  + texture2D(map, vTriPos.xy * uTriScale) * triW.z;
        // Soft strata tint by height keeps large walls from reading flat.
        float strata = 0.92 + 0.08 * sin(vTriPos.y * 1.7 + triC.r * 3.0);
        diffuseColor *= vec4(triC.rgb * strata, 1.0);`,
      );
  };
  return mat;
}

export function rockMaterial() {
  if (!rockMat) rockMat = makeRockMaterial(0x7c828a);
  return rockMat;
}

/**
 * Outline of a collider with a hand-cut edge: tops stay flush with the
 * collision surface (so feet never float or sink), sides are inset slightly
 * (never visually overlapping walkable space), undersides hang down freely.
 */
function outline(s: SolidDef, seed: number): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  const x0 = s.x + BEVEL, x1 = s.x + s.w - BEVEL;
  const y0 = s.y + BEVEL, y1 = s.y + s.h - BEVEL;
  const step = 0.3;
  const n = (v: number, k: number) => fbm1(v * 0.55, seed + k);
  // top: left -> right
  for (let x = x0; x < x1; x += step) pts.push(new THREE.Vector2(x, y1 - Math.abs(n(x, 1)) * 0.02));
  // right: top -> bottom
  // Sides: inset only (never intrude on walkable space), rounded near the top lip.
  const side = (y: number, k: number) => {
    const fromTop = y1 - y;
    const lip = fromTop < 0.5 ? (0.5 - fromTop) * 0.25 : 0;
    return Math.abs(n(y, k)) * 0.32 + lip;
  };
  for (let y = y1; y > y0; y -= step) pts.push(new THREE.Vector2(x1 - side(y, 2), y));
  // bottom: right -> left (hanging, rougher)
  const hang = s.y > 2 ? 0.7 : 0.2;
  for (let x = x1; x > x0; x -= step) pts.push(new THREE.Vector2(x, y0 - Math.max(0, n(x, 3)) * hang - Math.max(0, n(x * 3, 9)) * hang * 0.4));
  // left: bottom -> top
  for (let y = y0; y < y1; y += step) pts.push(new THREE.Vector2(x0 + side(y, 4), y));
  return pts;
}

export function buildRock(s: SolidDef, seed: number): THREE.Mesh {
  const shape = new THREE.Shape(outline(s, seed));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: DEPTH,
    bevelEnabled: true,
    bevelThickness: 0.18,
    bevelSize: BEVEL,
    bevelSegments: 2,
    curveSegments: 1,
    steps: 1,
  });
  geo.translate(0, 0, ZBACK);
  const mesh = new THREE.Mesh(geo, rockMaterial());
  mesh.name = s.id;
  return mesh;
}

/** Sparse bioluminescent lichen along walkable tops: beauty and path readability. */
export function buildLichen(solids: SolidDef[]): THREE.InstancedMesh {
  const R = rng(99);
  const spots: THREE.Vector3[] = [];
  for (const s of solids) {
    if (s.look === 'none' || s.w < 1.5) continue;
    const top = s.y + s.h;
    for (let x = s.x + 0.3; x < s.x + s.w - 0.3; x += 0.9) {
      if (R() > 0.33) continue;
      const clusters = 1 + Math.floor(R() * 4);
      for (let i = 0; i < clusters; i++) {
        spots.push(new THREE.Vector3(x + (R() - 0.5) * 0.6, top + 0.01, 0.1 + (R() - 0.2) * 1.2));
      }
    }
  }
  const geo = new THREE.SphereGeometry(0.035, 6, 4);
  const mat = new THREE.MeshBasicMaterial({ color: 0x6fd6c4, transparent: true, opacity: 0.85 });
  const inst = new THREE.InstancedMesh(geo, mat, spots.length);
  const m = new THREE.Matrix4();
  spots.forEach((p, i) => {
    const sc = 0.5 + R() * 1.2;
    m.makeScale(sc, sc * 0.6, sc).setPosition(p);
    inst.setMatrixAt(i, m);
  });
  return inst;
}

/** Large displaced rock plane used as a back wall behind enclosed spaces. */
export function buildBackWall(x: number, y: number, w: number, h: number, z: number, seed: number, tint = 0x6f7984) {
  const seg = Math.max(8, Math.floor(w / 1.2));
  const segH = Math.max(8, Math.floor(h / 1.2));
  const geo = new THREE.PlaneGeometry(w, h, seg, segH);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i);
    pos.setZ(i, fbm1(px * 0.3 + py * 0.11, seed) * 1.2 + fbm1(py * 0.35 - px * 0.05, seed + 3) * 0.8 + fbm1(px * 1.3 + py * 0.9, seed + 5) * 0.2);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, makeRockMaterial(tint));
  mesh.position.set(x + w / 2, y + h / 2, z);
  return mesh;
}

import * as THREE from 'three';

// Deterministic PRNG so the world looks the same every run.
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/** Smooth 1D value noise in [-1, 1]. */
export function noise1(x: number, seed = 0) {
  const h = (n: number) => {
    const v = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return (v - Math.floor(v)) * 2 - 1;
  };
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}

export function fbm1(x: number, seed = 0) {
  return noise1(x, seed) * 0.6 + noise1(x * 2.3, seed + 7) * 0.28 + noise1(x * 5.1, seed + 13) * 0.12;
}

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

let rockTex: { map: THREE.Texture; bump: THREE.Texture } | null = null;

/** Layered rock: soft value noise + sedimentary strata + fine speckle. */
export function rockTextures() {
  if (rockTex) return rockTex;
  const size = 512;
  const c = canvas(size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const R = rng(1337);
  const grid = 32;
  const lattice = Array.from({ length: (grid + 1) * (grid + 1) }, () => R());
  const lat = (x: number, y: number) => lattice[(y % grid) * (grid + 1) + (x % grid)];
  const vnoise = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = lat(xi, yi), b = lat(xi + 1, yi), c2 = lat(xi, yi + 1), d = lat(xi + 1, yi + 1);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c2 * (1 - u) * v + d * u * v;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * grid, fy = (y / size) * grid;
      let n = 0, amp = 0.5, fr = 1;
      for (let o = 0; o < 4; o++) {
        n += vnoise((fx * fr) % grid, (fy * fr) % grid) * amp;
        amp *= 0.5;
        fr *= 2;
      }
      const strata = Math.sin((y / size) * Math.PI * 22 + n * 5) * 0.5 + 0.5;
      const v = Math.min(1, Math.max(0, n * 0.8 + strata * 0.22 + R() * 0.025));
      const i = (y * size + x) * 4;
      const g = 70 + v * 150;
      img.data[i] = g;
      img.data[i + 1] = g * 1.02;
      img.data[i + 2] = g * 1.06;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const bump = new THREE.CanvasTexture(c);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  rockTex = { map, bump };
  return rockTex;
}

/** Soft radial sprite for particles and glows. */
let glowTex: THREE.Texture | null = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = canvas(128);
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.08)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

/** Vertical light-shaft gradient (bright top, fading down and to the sides). */
let shaftTex: THREE.Texture | null = null;
export function shaftTexture() {
  if (shaftTex) return shaftTex;
  const c = canvas(128);
  const ctx = c.getContext('2d')!;
  for (let x = 0; x < 128; x++) {
    const side = Math.sin((x / 127) * Math.PI);
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, `rgba(255,255,255,${0.9 * side * side})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 1, 128);
  }
  shaftTex = new THREE.CanvasTexture(c);
  return shaftTex;
}

/** Carved glyph for echo-stones: concentric arcs, drawn white on black. */
let glyphTex: THREE.Texture | null = null;
export function glyphTexture() {
  if (glyphTex) return glyphTex;
  const c = canvas(256);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = 6;
  ctx.lineWidth = 5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(128, 150, 26 + i * 24, Math.PI * (1.1 + i * 0.05), Math.PI * (1.9 - i * 0.05));
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(128, 175);
  ctx.lineTo(128, 128);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(128, 188, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  glyphTex = new THREE.CanvasTexture(c);
  glyphTex.colorSpace = THREE.SRGBColorSpace;
  return glyphTex;
}

/** Flowing stripes used for light veins (offset animated). */
export function veinTexture() {
  const c = canvas(64);
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.15)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0.15)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

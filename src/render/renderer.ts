import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Quality } from '../core/settings';

// Final grade: gentle split-tone (teal shadows, warm highlights), vignette,
// film grain, brightness, and a fade used for scene transitions.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uFade: { value: 1 },
    uFadeColor: { value: new THREE.Color(0x000000) },
    uBrightness: { value: 0 },
    uVignette: { value: 1 },
    uWarmth: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uFade, uBrightness, uVignette, uWarmth;
    uniform vec3 uFadeColor;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      vec3 shadowTint = vec3(0.86, 0.98, 1.08);
      vec3 highTint = mix(vec3(1.02, 1.0, 0.97), vec3(1.1, 1.0, 0.86), uWarmth);
      c *= mix(shadowTint, highTint, smoothstep(0.05, 0.6, l));
      c = pow(max(c, 0.0), vec3(1.0 / (1.0 + uBrightness * 0.45)));
      c += uBrightness * 0.015;
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.25, length(d * vec2(1.0, 1.15)));
      c *= mix(1.0, v, 0.65 * uVignette);
      float g = hash(vUv * 1000.0 + fract(uTime * 13.0)) - 0.5;
      c += g * 0.028;
      c = mix(c, uFadeColor, uFade);
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

export class Renderer {
  gl: THREE.WebGLRenderer;
  composer: EffectComposer;
  private bloom: UnrealBloomPass;
  grade: ShaderPass;
  quality: Quality = 'high';

  constructor(canvas: HTMLCanvasElement, public scene: THREE.Scene, public camera: THREE.PerspectiveCamera) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1;
    this.composer = new EffectComposer(this.gl);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.7, 0.72);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.bloom.enabled = q !== 'low';
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = this.quality === 'high' ? Math.min(window.devicePixelRatio, 2) : this.quality === 'medium' ? 1 : 0.7;
    this.gl.setPixelRatio(pr);
    this.gl.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    // Keep horizontal framing stable on tall/narrow screens.
    this.camera.fov = w / h < 1.4 ? 40 + (1.4 - w / h) * 18 : 34;
    this.camera.updateProjectionMatrix();
  }

  set fade(v: number) {
    this.grade.uniforms.uFade.value = v;
  }
  get fade() {
    return this.grade.uniforms.uFade.value as number;
  }

  render(time: number) {
    this.grade.uniforms.uTime.value = time;
    this.composer.render();
  }
}

// SKYMT audio: placeholder procedural synthesis behind a cue interface.
// Every sound is addressed by a cue id. If public/audio/manifest.json maps a
// cue id to a file, that file is played instead of the synth — so finished
// assets can replace placeholders without touching gameplay code.
import type { Ambience, MusicState } from '../content/types';
import type { Settings } from '../core/settings';

export type Voice = 'her' | 'skymt' | 'distant';
export type Note = [midi: number, seconds: number];

/** Her melody. Skymt learns this first phrase in the memory. */
export const HER_PHRASE: Note[] = [[62, 0.55], [69, 0.6], [67, 0.5], [65, 1.15]];
/** The answer from above: the part of the song Skymt does not yet know. */
export const ANSWER_PHRASE: Note[] = [[72, 0.5], [69, 0.45], [67, 0.5], [64, 0.65], [62, 1.9]];

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Layer {
  gain: GainNode;
  nodes: AudioScheduledSourceNode[];
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private amb!: GainNode;
  private sfx!: GainNode;
  private reverb!: ConvolverNode;
  private reverbIn!: GainNode;
  private duckGain!: GainNode;
  private noise!: AudioBuffer;
  private brown!: AudioBuffer;
  private buffers = new Map<string, AudioBuffer>();
  private layers = new Map<string, Layer>();
  private ambience: Ambience = 'none';
  private musicState: MusicState = 'none';
  private musicVoices: { gain: GainNode; stop: () => void }[] = [];
  private nextNote = 0;
  private hum: { osc: OscillatorNode[]; gain: GainNode; filter: BiquadFilterNode; warm: GainNode } | null = null;
  listenerX = 0;
  listenerY = 0;
  private pending: Settings | null = null;

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock(settings?: Settings) {
    if (settings) this.pending = settings;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.duckGain = ctx.createGain();
    this.master.connect(this.duckGain).connect(ctx.destination);
    this.music = this.bus();
    this.amb = this.bus();
    this.sfx = this.bus();
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(4.5, 2.6);
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = 0.9;
    this.reverbIn.connect(this.reverb).connect(this.master);
    this.noise = this.makeNoise(false);
    this.brown = this.makeNoise(true);
    if (this.pending) this.applySettings(this.pending);
    void this.loadManifest();
  }

  private bus() {
    const g = this.ctx!.createGain();
    g.connect(this.master);
    return g;
  }

  applySettings(s: Settings) {
    this.pending = s;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.master, t, 0.05);
    this.music.gain.setTargetAtTime(s.music, t, 0.05);
    this.amb.gain.setTargetAtTime(s.ambience, t, 0.05);
    this.sfx.gain.setTargetAtTime(s.sfx, t, 0.05);
  }

  /** Global duck for deliberate silences (0 = silent, 1 = normal). */
  duck(level: number, seconds = 1.5) {
    if (!this.ctx) return;
    this.duckGain.gain.setTargetAtTime(level, this.ctx.currentTime, seconds / 3);
  }

  private async loadManifest() {
    try {
      const res = await fetch('audio/manifest.json');
      if (!res.ok) return;
      const m = (await res.json()) as { cues?: Record<string, string> };
      for (const [cue, file] of Object.entries(m.cues ?? {})) {
        const r = await fetch(`audio/${file}`);
        if (!r.ok) continue;
        this.buffers.set(cue, await this.ctx!.decodeAudioData(await r.arrayBuffer()));
      }
    } catch {
      /* placeholders stay in use */
    }
  }

  private makeNoise(brown: boolean) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  private impulse(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  // ---------------------------------------------------------------- helpers
  private out(x?: number, y?: number, wet = 0.3, bus: GainNode = this.sfx) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const pan = ctx.createStereoPanner();
    let dist = 1;
    if (x !== undefined) {
      pan.pan.value = Math.max(-0.9, Math.min(0.9, (x - this.listenerX) / 14));
      const d = Math.hypot(x - this.listenerX, (y ?? this.listenerY) - this.listenerY);
      dist = 1 / (1 + (d / 11) ** 2);
    }
    g.gain.value = dist;
    g.connect(pan).connect(bus);
    if (wet > 0) {
      const s = ctx.createGain();
      s.gain.value = wet * Math.max(dist, 0.25);
      g.connect(s).connect(this.reverbIn);
    }
    return g;
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private noiseBurst(dest: AudioNode, t: number, dur: number, type: BiquadFilterType, freq: number, q: number, peak: number, brown = false) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = brown ? this.brown : this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, Math.min(0.01, dur / 4), peak, dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 2);
    src.stop(t + dur + 0.1);
    return f;
  }

  private tone(dest: AudioNode, t: number, freq: number, dur: number, peak: number, type: OscillatorType = 'sine', attack = 0.005) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    this.env(g, t, attack, peak, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    return o;
  }

  private playBuffer(cue: string, x?: number, y?: number, gain = 1, rate = 1) {
    const buf = this.buffers.get(cue);
    if (!buf || !this.ctx) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.out(x, y, 0.3);
    g.gain.value *= gain;
    src.connect(g);
    src.start();
    return true;
  }

  // ---------------------------------------------------------------- cues
  play(cue: string, o: { x?: number; y?: number; gain?: number; tone?: number; surface?: string } = {}) {
    if (!this.ctx) return;
    const key = o.surface ? `${cue}.${o.surface}` : cue;
    if (this.playBuffer(key, o.x, o.y, o.gain ?? 1) || this.playBuffer(cue, o.x, o.y, o.gain ?? 1)) return;
    const t = this.ctx.currentTime + 0.005;
    const k = o.gain ?? 1;
    switch (cue) {
      case 'footstep': {
        const out = this.out(o.x, o.y, 0.12);
        const s = o.surface ?? 'stone';
        if (s === 'light') {
          this.tone(out, t, 1800 + Math.random() * 900, 0.18, 0.025 * k);
          this.noiseBurst(out, t, 0.04, 'highpass', 4000, 0.7, 0.03 * k);
        } else if (s === 'root') {
          this.noiseBurst(out, t, 0.07, 'lowpass', 700, 0.8, 0.12 * k, true);
        } else if (s === 'wood') {
          this.noiseBurst(out, t, 0.06, 'bandpass', 600, 1.2, 0.12 * k);
        } else {
          this.noiseBurst(out, t, 0.05, 'bandpass', 900 + Math.random() * 500, 1.1, 0.07 * k);
          this.noiseBurst(out, t, 0.03, 'highpass', 3500, 0.5, 0.015 * k);
        }
        break;
      }
      case 'jump': {
        const out = this.out(o.x, o.y, 0.05);
        this.noiseBurst(out, t, 0.12, 'bandpass', 1300, 0.8, 0.035);
        break;
      }
      case 'land': {
        const out = this.out(o.x, o.y, 0.15);
        const g = Math.min(1, k);
        this.tone(out, t, 70 + Math.random() * 20, 0.16, 0.18 * g);
        this.noiseBurst(out, t, 0.09, 'lowpass', 900, 0.7, 0.14 * g);
        if (o.surface === 'light') this.tone(out, t, 2400, 0.35, 0.03);
        break;
      }
      case 'mantle': {
        const out = this.out(o.x, o.y, 0.1);
        const f = this.noiseBurst(out, t, 0.28, 'bandpass', 600, 1.5, 0.06);
        f.frequency.linearRampToValueAtTime(1600, t + 0.25);
        break;
      }
      case 'wake': {
        const out = this.out(undefined, undefined, 0.4);
        const f = this.noiseBurst(out, t, 1.2, 'bandpass', 400, 1, 0.04);
        f.frequency.linearRampToValueAtTime(1100, t + 1);
        this.tone(out, t + 0.3, mtof(50), 2.2, 0.05, 'sine', 0.6);
        break;
      }
      case 'stone.wake': {
        const out = this.out(o.x, o.y, 0.7);
        const f = mtof(o.tone ?? 62);
        this.tone(out, t, f, 3.2, 0.12);
        this.tone(out, t, f * 2.76, 1.6, 0.04);
        this.tone(out, t, f * 5.4, 0.7, 0.015);
        this.tone(out, t + 0.02, f * 0.5, 2.4, 0.05, 'sine', 0.2);
        break;
      }
      case 'stone.warn': {
        const out = this.out(o.x, o.y, 0.5);
        const f = mtof(o.tone ?? 62);
        for (let i = 0; i < 3; i++) this.tone(out, t + i * 0.45, f * 2, 0.35, 0.025);
        break;
      }
      case 'stone.fade': {
        const out = this.out(o.x, o.y, 0.6);
        const osc = this.tone(out, t, mtof(o.tone ?? 62), 1.4, 0.05, 'sine', 0.05);
        osc.frequency.exponentialRampToValueAtTime(mtof((o.tone ?? 62) - 5), t + 1.3);
        break;
      }
      case 'bridge.solid': {
        const out = this.out(o.x, o.y, 0.6);
        for (let i = 0; i < 4; i++) this.tone(out, t + i * 0.06, 1600 + Math.random() * 1600, 0.5, 0.012);
        break;
      }
      case 'root.stir': {
        const out = this.out(o.x, o.y, 0.3);
        const f = this.noiseBurst(out, t, 0.8, 'bandpass', 300, 4, 0.07, true);
        f.frequency.linearRampToValueAtTime(180, t + 0.8);
        break;
      }
      case 'root.grow': {
        const out = this.out(o.x, o.y, 0.5);
        for (let i = 0; i < 9; i++) this.noiseBurst(out, t + i * 0.25 + Math.random() * 0.1, 0.12, 'bandpass', 250 + Math.random() * 400, 5, 0.08, true);
        const o1 = this.tone(out, t, 110, 2.8, 0.05, 'triangle', 1.2);
        o1.frequency.linearRampToValueAtTime(165, t + 2.6);
        break;
      }
      case 'gate.channel': {
        const out = this.out(o.x, o.y, 0.8);
        const osc = this.tone(out, t, 330, 2.2, 0.05, 'sine', 0.4);
        osc.frequency.exponentialRampToValueAtTime(660, t + 2);
        break;
      }
      case 'gate.refuse': {
        const out = this.out(o.x, o.y, 0.5);
        this.tone(out, t, 55, 0.9, 0.16);
        this.tone(out, t + 0.05, mtof(61), 1.2, 0.03, 'triangle');
        break;
      }
      case 'gate.open': {
        const out = this.out(o.x, o.y, 0.6);
        const f = this.noiseBurst(out, t, 5.5, 'lowpass', 140, 2, 0.5, true);
        f.frequency.linearRampToValueAtTime(420, t + 5);
        this.tone(out, t, 41, 5.2, 0.2, 'sine', 1.5);
        for (let i = 0; i < 10; i++) this.noiseBurst(out, t + 5.4 + i * 0.35, 0.18, 'bandpass', 500, 2, 0.1);
        break;
      }
      case 'drip': {
        const out = this.out(o.x, o.y, 1.1);
        const osc = this.tone(out, t, 1300 + Math.random() * 900, 0.12, 0.05);
        osc.frequency.exponentialRampToValueAtTime(500, t + 0.1);
        break;
      }
      case 'inspect': {
        const out = this.out(undefined, undefined, 0.5);
        this.tone(out, t, mtof(74), 1.6, 0.025, 'sine', 0.3);
        break;
      }
      case 'checkpoint': {
        const out = this.out(undefined, undefined, 0.8);
        this.tone(out, t, mtof(81), 1.6, 0.012, 'sine', 0.2);
        break;
      }
      case 'ui.move': {
        const out = this.out(undefined, undefined, 0.2);
        this.tone(out, t, 1100, 0.05, 0.02);
        break;
      }
      case 'ui.confirm': {
        const out = this.out(undefined, undefined, 0.4);
        this.tone(out, t, mtof(69), 0.5, 0.04);
        this.tone(out, t + 0.06, mtof(76), 0.6, 0.03);
        break;
      }
      case 'fall': {
        const out = this.out(undefined, undefined, 0.8);
        const f = this.noiseBurst(out, t, 1.2, 'bandpass', 900, 1, 0.05);
        f.frequency.exponentialRampToValueAtTime(200, t + 1.1);
        break;
      }
    }
  }

  // ---------------------------------------------------------------- hum
  startHum() {
    if (!this.ctx || this.hum) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const warm = ctx.createGain();
    warm.gain.value = 0;
    const f0 = mtof(57);
    const a = ctx.createOscillator();
    a.type = 'sine';
    a.frequency.value = f0;
    const b = ctx.createOscillator();
    b.type = 'triangle';
    b.frequency.value = f0 * 2.001;
    const c = ctx.createOscillator();
    c.type = 'sawtooth';
    c.frequency.value = f0;
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vibAmt = ctx.createGain();
    vibAmt.gain.value = 1.6;
    vib.connect(vibAmt);
    [a.frequency, b.frequency, c.frequency].forEach((p) => vibAmt.connect(p));
    const bg = ctx.createGain();
    bg.gain.value = 0.25;
    a.connect(filter);
    b.connect(bg).connect(filter);
    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.value = 650;
    formant.Q.value = 2;
    c.connect(formant).connect(warm).connect(filter);
    const out = this.out(undefined, undefined, 0.45);
    filter.connect(gain).connect(out);
    [a, b, c, vib].forEach((o) => o.start(t));
    gain.gain.setTargetAtTime(0.07, t, 0.08);
    this.hum = { osc: [a, b, c, vib], gain, filter, warm };
  }

  setHum(charge: number) {
    if (!this.hum || !this.ctx) return;
    const t = this.ctx.currentTime;
    const cold = Math.min(1, charge);
    const warm = Math.max(0, charge - 1);
    this.hum.gain.gain.setTargetAtTime(0.06 + cold * 0.07, t, 0.05);
    this.hum.filter.frequency.setTargetAtTime(700 + cold * 1400, t, 0.05);
    this.hum.warm.gain.setTargetAtTime(warm * 0.5, t, 0.05);
    const f = mtof(57) * (1 + cold * 0.06);
    this.hum.osc[0].frequency.setTargetAtTime(f, t, 0.1);
    this.hum.osc[1].frequency.setTargetAtTime(f * 2.001, t, 0.1);
    this.hum.osc[2].frequency.setTargetAtTime(f, t, 0.1);
  }

  stopHum(release = 0.25) {
    if (!this.hum || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.hum.gain.gain.cancelScheduledValues(t);
    this.hum.gain.gain.setTargetAtTime(0, t, release / 3);
    const oscs = this.hum.osc;
    oscs.forEach((o) => o.stop(t + release + 0.2));
    this.hum = null;
  }

  /** Hummed melody. Returns its duration in seconds. */
  melody(notes: Note[], voice: Voice, delay = 0): number {
    const total = notes.reduce((s, n) => s + n[1], 0);
    if (!this.ctx) return total;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay + 0.02;
    const distant = voice === 'distant';
    const out = this.out(undefined, undefined, distant ? 2.2 : voice === 'her' ? 0.7 : 0.5, this.sfx);
    if (distant) out.gain.value = 0.35;
    const src = ctx.createOscillator();
    src.type = voice === 'skymt' ? 'triangle' : 'sawtooth';
    const vib = ctx.createOscillator();
    vib.frequency.value = voice === 'skymt' ? 5.2 : 4.6;
    const vAmt = ctx.createGain();
    vAmt.gain.value = voice === 'skymt' ? 2 : 3.5;
    vib.connect(vAmt).connect(src.frequency);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = voice === 'skymt' ? 520 : 720;
    f1.Q.value = 2.2;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'lowpass';
    f2.frequency.value = distant ? 1100 : 2400;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f1).connect(f2).connect(g).connect(out);
    if (voice === 'skymt') {
      const s2 = ctx.createOscillator();
      s2.type = 'sine';
      const g2 = ctx.createGain();
      g2.gain.value = 0.5;
      s2.connect(g2).connect(g);
      let tt = t0;
      for (const [m, d] of notes) {
        s2.frequency.setTargetAtTime(mtof(m), tt, 0.03);
        tt += d;
      }
      s2.start(t0);
      s2.stop(t0 + total + 0.8);
    }
    // Breath
    if (voice !== 'skymt') {
      const n = ctx.createBufferSource();
      n.buffer = this.noise;
      const nf = ctx.createBiquadFilter();
      nf.type = 'bandpass';
      nf.frequency.value = 1500;
      const ng = ctx.createGain();
      ng.gain.value = 0.06;
      n.connect(nf).connect(ng).connect(g);
      n.start(t0);
      n.stop(t0 + total + 0.8);
    }
    const peak = voice === 'her' ? 0.22 : voice === 'distant' ? 0.3 : 0.2;
    let t = t0;
    src.frequency.setValueAtTime(mtof(notes[0][0]), t0);
    g.gain.setValueAtTime(0, t0);
    for (const [m, d] of notes) {
      src.frequency.setTargetAtTime(mtof(m), t, 0.04);
      g.gain.setTargetAtTime(peak, t, 0.07);
      g.gain.setTargetAtTime(peak * 0.7, t + d * 0.6, 0.1);
      t += d;
    }
    g.gain.setTargetAtTime(0, t - 0.2, 0.25);
    src.start(t0);
    vib.start(t0);
    src.stop(t + 1.2);
    vib.stop(t + 1.2);
    return total + delay;
  }

  // ---------------------------------------------------------------- ambience
  setAmbience(a: Ambience) {
    if (a === this.ambience) return;
    this.ambience = a;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [id, layer] of this.layers) layer.gain.gain.setTargetAtTime(id === a ? 1 : 0, t, 1.2);
    if (a !== 'none' && !this.layers.has(a)) {
      const layer = this.buildAmbience(a);
      this.layers.set(a, layer);
      layer.gain.gain.setTargetAtTime(1, t, 1.5);
    }
  }

  private buildAmbience(a: Ambience): Layer {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.amb);
    const nodes: AudioScheduledSourceNode[] = [];
    const file = this.buffers.get(`amb.${a}`);
    if (file) {
      const s = ctx.createBufferSource();
      s.buffer = file;
      s.loop = true;
      s.connect(gain);
      s.start();
      return { gain, nodes: [s] };
    }
    const noise = (buf: AudioBuffer, type: BiquadFilterType, freq: number, q: number, level: number, lfoRate = 0, lfoDepth = 0) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = level;
      s.connect(f).connect(g).connect(gain);
      s.start(0, Math.random() * 2);
      nodes.push(s);
      if (lfoRate > 0) {
        const l = ctx.createOscillator();
        l.frequency.value = lfoRate;
        const la = ctx.createGain();
        la.gain.value = lfoDepth;
        l.connect(la).connect(f.frequency);
        l.start();
        nodes.push(l);
      }
    };
    const drone = (freq: number, level: number, type: OscillatorType = 'sine') => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = level;
      const l = ctx.createOscillator();
      l.frequency.value = 0.05 + Math.random() * 0.08;
      const la = ctx.createGain();
      la.gain.value = level * 0.6;
      l.connect(la).connect(g.gain);
      o.connect(g).connect(gain);
      o.start();
      l.start();
      nodes.push(o, l);
    };
    switch (a) {
      case 'depths':
        noise(this.brown, 'lowpass', 160, 0.7, 0.35);
        drone(41, 0.035);
        break;
      case 'hall':
        noise(this.brown, 'bandpass', 260, 0.6, 0.4, 0.07, 120);
        noise(this.noise, 'bandpass', 2600, 0.5, 0.006, 0.05, 900);
        drone(55, 0.02);
        break;
      case 'shaft':
        noise(this.brown, 'lowpass', 220, 0.8, 0.3);
        drone(55, 0.03);
        drone(82.4, 0.018);
        break;
      case 'well':
        noise(this.noise, 'bandpass', 700, 0.6, 0.03, 0.06, 350);
        noise(this.brown, 'lowpass', 300, 0.5, 0.2);
        drone(880, 0.0025);
        drone(1318, 0.0015);
        break;
    }
    return { gain, nodes };
  }

  // ---------------------------------------------------------------- music
  setMusic(m: MusicState) {
    if (m === this.musicState) return;
    this.musicState = m;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicVoices.forEach((v) => {
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setTargetAtTime(0, t, 1.4);
      v.stop();
    });
    this.musicVoices = [];
    this.nextNote = t + 2.5;
    const file = this.buffers.get(`music.${m}`);
    if (file) {
      const s = this.ctx.createBufferSource();
      s.buffer = file;
      s.loop = true;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(1, t, 1.5);
      s.connect(g).connect(this.music);
      s.start();
      this.musicVoices.push({ gain: g, stop: () => s.stop(this.ctx!.currentTime + 6) });
      return;
    }
    if (m === 'memory') this.pad([50, 57, 65, 64], 0.05, 5);
    if (m === 'ascent') this.pad([50, 57, 62, 65, 69], 0.045, 6);
    if (m === 'well') this.pad([41, 53, 60, 67], 0.03, 8);
    if (m === 'shaft') this.pad([38, 45], 0.03, 8);
  }

  private pad(midis: number[], level: number, attack: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(level, t, attack / 3);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 800;
    f.Q.value = 0.4;
    const l = ctx.createOscillator();
    l.frequency.value = 0.07;
    const la = ctx.createGain();
    la.gain.value = 250;
    l.connect(la).connect(f.frequency);
    const oscs: OscillatorNode[] = [l];
    for (const m of midis) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = det;
        const og = ctx.createGain();
        og.gain.value = 0.3 / midis.length;
        o.connect(og).connect(f);
        oscs.push(o);
      }
    }
    f.connect(g).connect(this.music);
    const send = ctx.createGain();
    send.gain.value = 0.5;
    g.connect(send).connect(this.reverbIn);
    oscs.forEach((o) => o.start());
    this.musicVoices.push({ gain: g, stop: () => oscs.forEach((o) => o.stop(ctx.currentTime + 6)) });
  }

  /** Sparse generative notes for states that have them. */
  update() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t < this.nextNote) return;
    const scale = [62, 64, 65, 67, 69, 72, 74];
    if (this.musicState === 'shaft' || this.musicState === 'well') {
      if (this.buffers.has(`music.${this.musicState}`)) return;
      const high = this.musicState === 'well' ? 12 : 0;
      const m = scale[Math.floor(Math.random() * scale.length)] + high;
      const out = this.ctx.createGain();
      out.gain.value = 1;
      out.connect(this.music);
      const send = this.ctx.createGain();
      send.gain.value = 1.2;
      out.connect(send).connect(this.reverbIn);
      this.tone(out, t, mtof(m), 3.5, 0.03, 'sine', 0.01);
      this.tone(out, t, mtof(m) * 2, 1.2, 0.008, 'sine', 0.01);
      this.nextNote = t + 3 + Math.random() * 5;
    } else this.nextNote = t + 1;
  }
}

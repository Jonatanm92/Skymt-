import * as THREE from 'three';
import { Emitter, type GameEvents } from './core/events';
import { Input } from './core/input';
import { SaveStore, newSave, type SaveData } from './core/save';
import { loadSettings, saveSettings, type Settings } from './core/settings';
import { Scheduler } from './core/scheduler';
import { slice } from './content/slice';
import type { HintDef, ZoneDef } from './content/types';
import { setLang, t } from './content/strings';
import { PhysicsWorld } from './world/physics';
import { PlayerController, type ControlInput } from './player/controller';
import { SkymtModel } from './player/model';
import { Renderer } from './render/renderer';
import { CameraRig } from './render/camera';
import { Atmosphere } from './render/atmosphere';
import { buildWorld, type Dressing } from './render/setdressing';
import { Flags, type Entity, type WorldCtx } from './entities/context';
import { EchoStone, LightBridge } from './entities/stone';
import { MelodyRoot } from './entities/root';
import { Gate } from './entities/gate';
import { Inspectable, MemoryTrace } from './entities/memory';
import { AudioEngine, HER_PHRASE } from './audio/audio';
import { UI } from './ui/ui';
import { buildMenus } from './ui/menus';
import { endingSequence, memorySequence, openingSequence } from './narrative/sequences';

export const STEP = 1 / 120;
type Mode = 'title' | 'playing' | 'paused' | 'ending';

export interface Autopilot {
  control(game: Game, dt: number): ControlInput | null;
}

export class Game {
  mode: Mode = 'title';
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 600);
  renderer: Renderer;
  rig: CameraRig;
  atmosphere: Atmosphere;
  dressing: Dressing;
  events = new Emitter<GameEvents>();
  input = new Input();
  physics = new PhysicsWorld();
  scheduler = new Scheduler();
  audio = new AudioEngine();
  ui: UI;
  store = new SaveStore();
  save: SaveData;
  hasSave: boolean;
  flags: Flags;
  settings: Settings;
  player: PlayerController;
  model = new SkymtModel();
  entities: Entity[] = [];
  stones: EchoStone[] = [];
  bridges: LightBridge[] = [];
  roots: MelodyRoot[] = [];
  gate: Gate;
  memory: MemoryTrace;
  inspectables: Inspectable[] = [];
  zone: ZoneDef | null = null;
  level = slice;
  /** True while a scripted sequence owns the player. */
  sequence: string | null = null;
  musicOverride: import('./content/types').MusicState | null = null;
  autopilot: Autopilot | null = null;
  stepsPerFrame = 0; // 0 = real time; >0 = fixed count (tests)
  /** QA: hold the simulation (still rendering) until released. */
  frozen = false;
  simTime = 0;
  private acc = 0;
  private last = 0;
  private tweens: { t: number; d: number; fn: (k: number) => void; done: () => void }[] = [];
  private hintTimers = new Map<string, number>();
  private moveTime = 0;
  private fog: THREE.FogExp2;
  private hemi: THREE.HemisphereLight;
  private rim: THREE.DirectionalLight;
  private wellKey: THREE.DirectionalLight | null;
  private dripTimers: number[];
  private lidSolid;
  private saidOnce = new Set<string>();
  private interactHintFor: string | null = null;
  endingStarted = false;
  /** Scripted horizontal input used by sequences (null = none). */
  scriptMove: number | null = null;
  endingHint = false;
  errors: string[] = [];

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.settings = loadSettings();
    setLang(this.settings.lang);
    const loaded = this.store.load();
    this.hasSave = loaded !== null && (loaded.checkpoint !== 'start' || Object.keys(loaded.flags).length > 0);
    this.save = loaded ?? newSave();
    this.flags = new Flags(this.save.flags, this.events, () => this.persist());

    this.renderer = new Renderer(canvas, this.scene, this.camera);
    this.rig = new CameraRig(this.camera);
    this.fog = new THREE.FogExp2(0x05080c, 0.05);
    this.scene.fog = this.fog;
    this.scene.background = new THREE.Color(0x05080c);
    this.hemi = new THREE.HemisphereLight(0x8aa6bd, 0x1a1512, 1.5);
    // Rim from high behind: carves silhouettes and catches walkable tops.
    this.rim = new THREE.DirectionalLight(0xb2d4ea, 2.2);
    this.rim.position.set(-8, 30, -22);
    const fill = new THREE.DirectionalLight(0x4c5c6c, 1.0);
    fill.position.set(6, 4, 20);
    this.scene.add(this.hemi, this.rim, fill);

    // --- world
    this.dressing = buildWorld(this.scene, this.level);
    this.wellKey = (this.dressing.wellSky.getObjectByName('wellKey') as THREE.DirectionalLight) ?? null;
    this.atmosphere = new Atmosphere(this.scene);
    for (const s of this.level.solids) this.physics.add({ id: s.id, x: s.x, y: s.y, w: s.w, h: s.h, surface: s.surface ?? 'stone', oneWay: s.oneWay });
    this.lidSolid = this.physics.add({ id: 'well_lid', ...this.level.wellLid, active: false, surface: 'root' });

    const spawn = this.spawnPoint();
    this.player = new PlayerController(this.physics, this.events, spawn.x, spawn.y);
    this.scene.add(this.model.root);

    const ctx: WorldCtx = { scene: this.scene, physics: this.physics, events: this.events, flags: this.flags, player: this.player };
    this.gate = new Gate(this.level.gate, ctx, this.level.stones);
    this.gate.onShake = (a) => this.rig.addShake(a);
    for (const b of this.level.bridges) this.bridges.push(new LightBridge(b, ctx));
    for (const s of this.level.stones) {
      const st = new EchoStone(s, ctx, this.bridges.filter((b) => s.bridges?.includes(b.def.id)), (i) => this.gate.fillChannel(i));
      this.stones.push(st);
    }
    for (const r of this.level.roots) this.roots.push(new MelodyRoot(r, ctx, this.stones));
    this.memory = new MemoryTrace(this.level.memory, ctx);
    this.memory.onWake = () => void memorySequence(this);
    this.memory.onEcho = () => this.audio.melody(HER_PHRASE, 'distant');
    for (const i of this.level.inspectables) this.inspectables.push(new Inspectable(i, ctx));
    this.entities.push(...this.bridges, ...this.stones, ...this.roots, this.gate, this.memory, ...this.inspectables);
    this.dripTimers = this.level.drips.map((d) => d.every * Math.random());

    this.ui = new UI(uiRoot, this.input);
    this.ui.onSound = (c) => this.audio.play(c);
    this.applySettings();
    this.wireEvents();
    this.applyFlagsToWorld();
    this.enterTitle();
    this.input.onAnyInput = () => this.audio.unlock(this.settings);
    window.addEventListener('blur', () => {
      if (this.mode === 'playing') this.pause();
    });
  }

  // ------------------------------------------------------------------ state
  spawnPoint() {
    const cp = this.level.checkpoints.find((c) => c.id === this.save.checkpoint) ?? this.level.checkpoints[0];
    return cp.spawn;
  }

  persist() {
    this.store.write(this.save);
    this.hasSave = true;
  }

  applySettings() {
    const s = this.settings;
    setLang(s.lang);
    this.audio.applySettings(s);
    this.renderer.setQuality(s.quality);
    this.renderer.grade.uniforms.uBrightness.value = s.brightness;
    this.rig.reducedMotion = s.reducedMotion;
    this.ui.setTextSize(s.textSize);
    this.ui.root.classList.toggle('subs-off', !s.subtitles);
    document.documentElement.lang = s.lang;
    saveSettings(s);
  }

  private applyFlagsToWorld() {
    this.player.canSing = this.flags.has('memory.seen');
    if (this.flags.has('memory.seen')) this.model.warmth = 0.5;
    const lid = this.flags.has('well.lid');
    this.lidSolid.active = lid;
    this.dressing.lid.visible = lid;
  }

  enterTitle() {
    this.mode = 'title';
    this.cancelSequence();
    this.audio.duck(1);
    const sp = this.spawnPoint();
    const fresh = !this.flags.has('woke');
    this.player.place(sp.x, sp.y, fresh ? 'lying' : 'normal');
    if (fresh) this.model.awake = 0.35;
    this.zone = this.findZone();
    this.rig.override = fresh ? { x: sp.x + 0.6, y: sp.y + 1.2, distance: 7.5, weight: 1 } : null;
    this.rig.snap(this.player, this.zone);
    this.snapAtmosphere();
    this.renderer.fade = 0.35;
    document.body.classList.remove('cursor-hidden');
    this.ui.hideEnd();
    this.ui.clearSubs();
    this.ui.hideHints();
    this.ui.chapter(false);
    this.ui.replace(buildMenus(this).title);
  }

  /** Begin or continue from the title screen. */
  start(fresh: boolean) {
    this.audio.unlock(this.settings);
    this.ui.closeAll();
    this.input.flush();
    this.mode = 'playing';
    document.body.classList.add('cursor-hidden');
    if (fresh || !this.flags.has('woke')) {
      void openingSequence(this);
    } else {
      void this.respawn('load');
    }
  }

  beginAnew() {
    this.store.clear();
    try {
      sessionStorage.setItem('skymt.autostart', '1');
    } catch {
      /* ignore */
    }
    location.reload();
  }

  pause() {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.audio.stopHum(0.1);
    this.audio.duck(0.35, 0.4);
    document.body.classList.remove('cursor-hidden');
    this.ui.replace(buildMenus(this).pause);
  }

  resume() {
    if (this.mode !== 'paused') return;
    this.ui.closeAll();
    this.input.flush();
    this.audio.duck(1, 0.4);
    if (this.player.humming) this.audio.startHum();
    this.mode = 'playing';
    document.body.classList.add('cursor-hidden');
  }

  cancelSequence() {
    this.scheduler.reset();
    this.tweens = [];
    this.scriptMove = null;
    this.endingHint = false;
    this.sequence = null;
    this.endingStarted = false;
    this.memory.running = false;
    this.memory.apparition.hide();
    this.ui.clearSubs();
    this.rig.override = null;
    this.musicOverride = null;
    this.model.lookUp = 0;
    if (this.player.state === 'locked' || this.player.state === 'singing') this.player.setState('normal');
  }

  /** Fade out, return to the last checkpoint, fade in. */
  async respawn(kind: 'fall' | 'rest' | 'load') {
    this.cancelSequence();
    this.sequence = 'respawn';
    this.player.setState('locked');
    if (kind === 'fall') this.audio.play('fall');
    const from = this.renderer.fade;
    await this.animate(kind === 'load' ? 0.01 : 0.8, (k) => (this.renderer.fade = Math.max(from, k)));
    const sp = this.spawnPoint();
    this.player.place(sp.x, sp.y, 'locked');
    this.zone = this.findZone();
    this.rig.snap(this.player, this.zone);
    this.snapAtmosphere();
    this.model.awake = 1;
    this.applyFlagsToWorld();
    await this.scheduler.wait(0.25);
    this.player.setState('normal');
    this.sequence = null;
    this.audio.duck(1);
    await this.animate(1.1, (k) => (this.renderer.fade = 1 - k));
  }

  animate(seconds: number, fn: (k: number) => void): Promise<void> {
    return new Promise((done) => this.tweens.push({ t: 0, d: Math.max(0.001, seconds), fn, done }));
  }

  say(key: string, seconds = 4, kind: 'thought' | 'caption' = 'thought') {
    this.ui.say(t(key), seconds, kind);
  }

  sayOnce(key: string, seconds = 4) {
    if (this.saidOnce.has(key) || this.flags.has(`said.${key}`)) return;
    this.saidOnce.add(key);
    this.flags.set(`said.${key}`);
    this.say(key, seconds);
  }

  // ------------------------------------------------------------------ events
  private wireEvents() {
    const e = this.events;
    const a = this.audio;
    e.on('footstep', (p) => a.play('footstep', { x: p.x, y: this.player.y, surface: p.surface }));
    e.on('jump', (p) => {
      a.play('jump', { x: p.x });
      this.flags.set('learned.jump');
    });
    e.on('land', (p) => {
      a.play('land', { x: p.x, gain: Math.min(1.2, p.impact / 10), surface: p.surface });
      this.model.impulseSquash(Math.min(0.35, p.impact * 0.025));
    });
    e.on('mantle', (p) => {
      a.play('mantle', { x: p.x });
      this.flags.set('learned.climb');
    });
    e.on('wake', () => a.play('wake'));
    e.on('hum:start', () => a.startHum());
    e.on('hum:stop', () => a.stopHum());
    e.on('song:start', () => {
      a.melody(HER_PHRASE, 'skymt');
      this.flags.set('learned.sing');
    });
    e.on('pulse', (p) => {
      this.atmosphere.pulse(p.x, p.y, p.radius, p.kind === 'song');
      if (p.kind === 'hum') this.flags.set('learned.hum');
      for (const ent of this.entities) ent.onPulse?.(p);
    });
    e.on('stone:wake', (p) => {
      const s = this.level.stones.find((s) => s.id === p.id)!;
      a.play('stone.wake', { x: p.x, y: p.y, tone: s.tone, gain: p.renewed ? 0.5 : 1 });
      if (!p.renewed && s.bridges?.length) a.play('bridge.solid', { x: p.x + 3, y: p.y });
    });
    e.on('stone:warn', (p) => a.play('stone.warn', { x: p.x, y: p.y, tone: this.level.stones.find((s) => s.id === p.id)!.tone }));
    e.on('stone:fade', (p) => a.play('stone.fade', { x: p.x, y: p.y, tone: this.level.stones.find((s) => s.id === p.id)!.tone }));
    e.on('root:stir', (p) => {
      a.play('root.stir', { x: p.x, y: p.y });
      this.scheduler.wait(1.2).then(() => this.sayOnce('root.dark', 4));
    });
    e.on('root:grow', (p) => {
      a.play('root.grow', { x: p.x, y: p.y });
      this.rig.addShake(0.08);
    });
    e.on('gate:channel', () => a.play('gate.channel', { x: this.level.gate.x, y: this.level.gate.y }));
    e.on('gate:refuse', () => {
      a.play('gate.refuse', { x: this.level.gate.x, y: this.level.gate.y });
      this.scheduler.wait(1.4).then(() => this.sayOnce('gate.wait', 4));
    });
    e.on('gate:open', () => {
      a.play('gate.open', { x: this.level.gate.x, y: this.level.gate.y });
      this.say('cap.gate', 4, 'caption');
      this.musicOverride = 'ascent';
      this.rig.override = { x: this.level.gate.x, y: this.level.gate.y - 3, distance: 16, weight: 0.7 };
      this.scheduler.wait(7).then(() => {
        if (this.rig.override && this.sequence === null) this.rig.override = null;
      });
    });
  }

  // ------------------------------------------------------------------ loop
  frame(now: number) {
    const dt = Math.min(0.1, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    try {
      this.input.poll();
      if (this.mode === 'playing') {
        if (this.input.pressed('pause')) this.pause();
      } else if (this.ui.menuOpen) {
        this.ui.update();
        if (this.mode === 'paused' && this.input.pressed('pause') && this.ui.currentMenu === 'pause') this.resume();
      }
      const simulate = (this.mode === 'playing' || this.mode === 'ending') && !this.frozen;
      if (simulate) {
        if (this.stepsPerFrame > 0) {
          for (let i = 0; i < this.stepsPerFrame; i++) this.fixed(STEP);
        } else {
          this.acc += dt;
          let n = 0;
          while (this.acc >= STEP && n < 12) {
            this.fixed(STEP);
            this.acc -= STEP;
            n++;
          }
          if (n === 12) this.acc = 0;
        }
      } else {
        // Title / pause: world keeps breathing, nothing advances.
        for (const ent of this.entities) ent.update(0, now / 1000);
      }
      this.visuals(dt, now / 1000);
      this.renderer.render(now / 1000);
    } catch (err) {
      this.errors.push(String(err));
      console.error(err);
    }
  }

  private controlInput(): ControlInput {
    if (this.autopilot) {
      const c = this.autopilot.control(this, STEP);
      if (c) return c;
    }
    const inp = this.input;
    return {
      moveX: inp.moveX(),
      jumpPressed: inp.consume('jump'),
      jumpHeld: inp.held('jump'),
      humHeld: inp.held('hum'),
    };
  }

  private fixed(dt: number) {
    this.simTime += dt;
    this.save.playTime += dt;
    const ci = this.controlInput();
    if (this.sequence && this.player.state !== 'lying') {
      ci.moveX = this.scriptMove ?? 0;
      ci.jumpPressed = false;
      ci.humHeld = this.sequence === 'ending-song' ? ci.humHeld : false;
    }
    this.player.step(dt, ci);
    for (const ent of this.entities) ent.update(dt, this.simTime);
    this.scheduler.update(dt);
    this.tweens = this.tweens.filter((tw) => {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.d);
      tw.fn(k);
      if (k >= 1) {
        tw.done();
        return false;
      }
      return true;
    });
    if (this.mode !== 'playing') return;

    const p = this.player;
    if (Math.abs(p.body.vx) > 1) {
      this.moveTime += dt;
      if (this.moveTime > 0.6) this.flags.set('learned.move');
    }
    // Falls
    if (p.y < this.level.killY && this.sequence !== 'respawn') void this.respawn('fall');
    // Checkpoints
    if (p.grounded && p.state === 'normal') {
      for (const c of this.level.checkpoints) {
        if (c.id !== this.save.checkpoint && inside(c.area, p.x, p.y)) {
          this.save.checkpoint = c.id;
          if (c.id === 'well') this.flags.set('well.lid');
          this.applyFlagsToWorld();
          this.persist();
        }
      }
    }
    // Zone
    const z = this.findZone();
    if (z !== this.zone) {
      this.zone = z;
      this.events.emit('zone', { id: z?.id ?? '' });
    }
    // Interaction
    if (this.input.consume('interact') && !this.sequence && p.state === 'normal') this.tryInteract();
    // Ending
    if (!this.sequence && p.grounded && inside(this.level.ending.trigger, p.x, p.y) && !this.endingStarted) {
      this.endingStarted = true;
      void endingSequence(this);
    }
    // Drips
    this.dripTimers = this.dripTimers.map((tm, i) => {
      tm -= dt;
      if (tm <= 0) {
        const d = this.level.drips[i];
        if (Math.abs(d.x - p.x) < 26) this.audio.play('drip', { x: d.x, y: d.y });
        return d.every * (0.7 + Math.random() * 0.6);
      }
      return tm;
    });
    this.updateHintTimers(dt);
  }

  tryInteract() {
    const p = this.player;
    const insp = this.inspectables.find((i) => i.inRange);
    if (insp) {
      p.facing = insp.def.x >= p.x ? 1 : -1;
      p.moveLock = 0.9;
      this.audio.play('inspect');
      this.say(insp.def.line, 5);
      this.flags.set(`inspect.${insp.def.id}`);
      this.flags.set('learned.interact');
      return;
    }
    const m = this.level.memory;
    if (!this.flags.has('memory.seen') && Math.abs(p.x - m.x) < 3.5) this.hintTimers.set('memory-hum', 99);
  }

  findZone(): ZoneDef | null {
    let found: ZoneDef | null = null;
    for (const z of this.level.zones) if (inside(z.area, this.player.x, this.player.y + 0.4)) found = z;
    return found ?? this.zone;
  }

  // ------------------------------------------------------------------ hints
  private hintVisible(h: HintDef): boolean {
    if (this.flags.has(h.learnedFlag)) return false;
    if (h.requiresFlag && !this.flags.has(h.requiresFlag)) return false;
    return (this.hintTimers.get(h.id) ?? 0) >= h.delay;
  }

  private updateHintTimers(dt: number) {
    const p = this.player;
    const eligible = p.state === 'normal' || p.state === 'lying';
    for (const h of this.level.hints) {
      const inArea = inside(h.area, p.x, p.y) && eligible && !this.sequence;
      const cur = this.hintTimers.get(h.id) ?? 0;
      this.hintTimers.set(h.id, inArea ? cur + dt : Math.max(0, Math.min(cur, h.delay) - dt * 2));
    }
    // A player walking past the memory without waking it gets a nudge.
    const m = this.level.memory;
    const passing = !this.flags.has('memory.seen') && p.x > m.x + 2.5 && p.x < 100 && p.y < 4;
    const mh = this.hintTimers.get('memory-hum') ?? 0;
    this.hintTimers.set('memory-hum', passing ? Math.max(mh, 3) : Math.max(0, mh - dt * (mh > 50 ? 0.02 : 1)));
    const inspecting = this.inspectables.find((i) => i.inRange && !this.flags.has('learned.interact'));
    this.interactHintFor = inspecting && !this.sequence ? inspecting.def.id : null;
  }

  private worldToScreen(x: number, y: number) {
    const v = new THREE.Vector3(x, y, 0).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }

  private hintText(id: string) {
    return t(`hint.${id}.${this.input.lastDevice === 'gamepad' ? 'g' : 'k'}`);
  }

  private drawHints() {
    if (this.mode !== 'playing') {
      this.ui.hideHints();
      return;
    }
    for (const h of this.level.hints) {
      const vis = this.hintVisible(h);
      const anchor = h.id === 'move' && this.player.state === 'lying' ? { x: this.player.x + 0.3, y: this.player.y + 1.4 } : h.anchor;
      const s = this.worldToScreen(anchor.x, anchor.y);
      this.ui.hint(h.id, vis ? this.hintText(h.id) : null, s.x, s.y);
    }
    const m = this.level.memory;
    const mem = (this.hintTimers.get('memory-hum') ?? 0) >= 2.5 && !this.flags.has('memory.seen') && !this.sequence;
    const ms = this.worldToScreen(m.x, m.y + 2.2);
    this.ui.hint('memory-hum', mem ? this.hintText('hum') : null, ms.x, ms.y);
    const es = this.worldToScreen(this.player.x, this.player.y + 2);
    this.ui.hint('ending-sing', this.endingHint ? this.hintText('sing') : null, es.x, es.y);
    const ins = this.inspectables.find((i) => i.def.id === this.interactHintFor);
    if (ins) {
      const s = this.worldToScreen(ins.def.x, ins.def.y + 2.3);
      this.ui.hint('interact', this.hintText('interact'), s.x, s.y);
    } else this.ui.hint('interact', null);
  }

  /** Jump atmosphere straight to the current zone (after teleports/loads). */
  snapAtmosphere() {
    const z = this.zone;
    if (!z) return;
    this.fog.color.setHex(z.fog.color);
    this.fog.density = z.fog.density;
    (this.scene.background as THREE.Color).setHex(z.fog.color);
    this.renderer.gl.toneMappingExposure = z.exposure;
  }

  // ------------------------------------------------------------------ visuals
  private visuals(dt: number, time: number) {
    const p = this.player;
    this.model.update(dt, p);
    this.rig.update(dt, p, this.zone);
    const z = this.zone;
    if (z) {
      const k = 1 - Math.exp(-dt * 0.9);
      const target = new THREE.Color(z.fog.color);
      this.fog.color.lerp(target, k);
      this.fog.density += (z.fog.density - this.fog.density) * k;
      (this.scene.background as THREE.Color).copy(this.fog.color);
      const exp = this.renderer.gl.toneMappingExposure;
      this.renderer.gl.toneMappingExposure = exp + (z.exposure - exp) * k;
      const warmT = z.id === 'well' ? 0.7 : z.id === 'chimney' ? 0.4 : 0;
      const gw = this.renderer.grade.uniforms.uWarmth;
      gw.value += (warmT - gw.value) * k;
      this.atmosphere.warm += ((z.id === 'well' || z.id === 'chimney' ? 1 : z.id === 'alcove' ? 0.35 : 0) - this.atmosphere.warm) * k;
      if (this.wellKey) this.wellKey.intensity += ((z.id === 'well' ? 1.2 : 0) - this.wellKey.intensity) * k;
      if (this.mode === 'playing' || this.mode === 'ending') {
        this.audio.setAmbience(z.ambience);
        this.audio.setMusic(this.musicOverride ?? (z.id === 'shaft' && !this.flags.has('memory.seen') ? 'none' : z.music ?? 'none'));
      }
    }
    const focus = new THREE.Vector3(this.rig.x, this.rig.y, 0);
    this.atmosphere.update(dt, focus, this.player.y > 20 || this.rig.y > 22);
    for (const s of this.dressing.shafts) {
      (s.material as THREE.MeshBasicMaterial).opacity = s.userData.base * (0.8 + 0.2 * Math.sin(time * 0.5 + s.position.x));
    }
    this.audio.listenerX = p.x;
    this.audio.listenerY = p.y;
    if (p.humming) this.audio.setHum(p.humCharge);
    this.audio.update();
    this.drawHints();
  }
}

export function inside(r: { x: number; y: number; w: number; h: number }, x: number, y: number) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

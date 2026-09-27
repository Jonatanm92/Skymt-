import { describe, expect, it } from 'vitest';
import { PhysicsWorld } from '../src/world/physics';
import { PlayerController, TUNING, type ControlInput } from '../src/player/controller';
import { Emitter, type GameEvents } from '../src/core/events';
import { SaveStore, newSave, parseSave, type Storage } from '../src/core/save';
import { slice } from '../src/content/slice';

const STEP = 1 / 120;
const idle = (): ControlInput => ({ moveX: 0, jumpPressed: false, jumpHeld: false, humHeld: false });

function rig() {
  const world = new PhysicsWorld();
  const events = new Emitter<GameEvents>();
  const log: string[] = [];
  (['jump', 'land', 'mantle', 'pulse', 'song:start'] as const).forEach((k) => events.on(k, () => log.push(k)));
  const p = new PlayerController(world, events, 0, 0);
  return { world, events, p, log };
}

function run(p: PlayerController, seconds: number, input: (t: number) => ControlInput) {
  for (let t = 0; t < seconds; t += STEP) p.step(STEP, input(t));
}

describe('physics + controller', () => {
  it('lands on ground and stays there', () => {
    const { world, p } = rig();
    world.add({ id: 'floor', x: -10, y: -1, w: 20, h: 1 });
    p.place(0, 2);
    run(p, 1.5, idle);
    expect(p.grounded).toBe(true);
    expect(p.y).toBeCloseTo(0, 3);
  });

  it('accelerates to max speed and stops without sliding far', () => {
    const { world, p } = rig();
    world.add({ id: 'floor', x: -50, y: -1, w: 100, h: 1 });
    p.place(0, 0);
    run(p, 1, () => ({ ...idle(), moveX: 1 }));
    expect(p.body.vx).toBeCloseTo(TUNING.maxSpeed, 3);
    const x0 = p.x;
    run(p, 0.5, idle);
    expect(p.body.vx).toBe(0);
    expect(p.x - x0).toBeLessThan(0.4);
  });

  it('full jump clears ~1.6 units, tap jump is lower', () => {
    const heights: number[] = [];
    for (const hold of [true, false]) {
      const { world, p } = rig();
      world.add({ id: 'floor', x: -10, y: -1, w: 20, h: 1 });
      p.place(0, 0);
      let maxY = 0;
      run(p, 1.2, (t) => ({ ...idle(), jumpPressed: t < STEP, jumpHeld: hold || t < STEP }));
      for (let t = 0; t < 1.2; t += STEP) {
        maxY = Math.max(maxY, p.y);
        p.step(STEP, idle());
      }
      const { world: w2, p: p2 } = rig();
      w2.add({ id: 'floor', x: -10, y: -1, w: 20, h: 1 });
      p2.place(0, 0);
      maxY = 0;
      for (let t = 0; t < 1.2; t += STEP) {
        p2.step(STEP, { ...idle(), jumpPressed: t < STEP, jumpHeld: hold || t < STEP * 2 });
        maxY = Math.max(maxY, p2.y);
      }
      heights.push(maxY);
      void world;
      void p;
    }
    expect(heights[0]).toBeGreaterThan(1.5);
    expect(heights[0]).toBeLessThan(1.8);
    expect(heights[1]).toBeLessThan(heights[0] * 0.6);
  });

  it('steps over pebbles without jumping', () => {
    const { world, p } = rig();
    world.add({ id: 'floor', x: -10, y: -1, w: 30, h: 1 });
    world.add({ id: 'pebble', x: 2, y: 0, w: 2, h: 0.28 });
    p.place(0, 0);
    run(p, 1.5, () => ({ ...idle(), moveX: 1 }));
    expect(p.x).toBeGreaterThan(4);
  });

  it('is blocked by a tall wall', () => {
    const { world, p } = rig();
    world.add({ id: 'floor', x: -10, y: -1, w: 30, h: 1 });
    world.add({ id: 'wall', x: 3, y: 0, w: 2, h: 5 });
    p.place(0, 0);
    run(p, 2, () => ({ ...idle(), moveX: 1 }));
    expect(p.x).toBeLessThan(3);
    expect(p.wallContact).toBe(1);
  });

  it('mantles onto a ledge ~2.3 units up when jumping toward it', () => {
    const { world, p, log } = rig();
    world.add({ id: 'floor', x: -10, y: -1, w: 30, h: 1 });
    world.add({ id: 'ledge', x: 2, y: 0, w: 20, h: 2.3 });
    p.place(1.4, 0);
    run(p, 2, (t) => ({ ...idle(), moveX: 1, jumpPressed: t < STEP, jumpHeld: true }));
    expect(log).toContain('mantle');
    expect(p.y).toBeCloseTo(2.3, 2);
    expect(p.x).toBeGreaterThan(2);
  });

  it('cannot mantle a 3.3 unit wall', () => {
    const { world, p } = rig();
    world.add({ id: 'floor', x: -10, y: -1, w: 30, h: 1 });
    world.add({ id: 'wall', x: 2, y: 0, w: 5, h: 3.3 });
    p.place(1.4, 0);
    run(p, 2, (t) => ({ ...idle(), moveX: 1, jumpPressed: t < STEP, jumpHeld: true }));
    expect(p.y).toBeLessThan(0.01);
  });

  it('one-way slabs can be jumped through from below and stood on', () => {
    const { world, p } = rig();
    world.add({ id: 'floor', x: -10, y: -1, w: 30, h: 1 });
    world.add({ id: 'slab', x: -1, y: 1.0, w: 2, h: 0.3, oneWay: true });
    p.place(0, 0);
    run(p, 1.5, (t) => ({ ...idle(), jumpPressed: t < STEP, jumpHeld: true }));
    expect(p.grounded).toBe(true);
    expect(p.y).toBeCloseTo(1.3, 3);
  });

  it('falls when a slab deactivates underfoot', () => {
    const { world, p } = rig();
    world.add({ id: 'floor', x: -10, y: -5, w: 30, h: 1 });
    const slab = world.add({ id: 'slab', x: -1, y: 1.0, w: 2, h: 0.3, oneWay: true });
    p.place(0, 1.3);
    run(p, 0.2, idle);
    expect(p.grounded).toBe(true);
    slab.active = false;
    run(p, 1.5, idle);
    expect(p.y).toBeCloseTo(-4, 2);
  });

  it('short hum releases a pulse; long hum sings only once the melody is known', () => {
    const { world, p, log } = rig();
    world.add({ id: 'floor', x: -10, y: -1, w: 30, h: 1 });
    p.place(0, 0);
    run(p, 0.3, () => ({ ...idle(), humHeld: true }));
    run(p, 0.1, idle);
    expect(log.filter((l) => l === 'pulse').length).toBe(1);
    run(p, 2, () => ({ ...idle(), humHeld: true }));
    expect(log).not.toContain('song:start');
    run(p, 0.1, idle);
    p.canSing = true;
    run(p, 1.6, () => ({ ...idle(), humHeld: true }));
    expect(log).toContain('song:start');
    expect(p.state).toBe('singing');
    run(p, 3.5, () => ({ ...idle(), humHeld: true }));
    expect(p.state).toBe('normal');
    expect(log.filter((l) => l === 'song:start').length).toBe(1);
  });
});

describe('save', () => {
  const mem = (): Storage => {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
  };

  it('round-trips progression', () => {
    const store = new SaveStore(mem(), 'k');
    const d = newSave();
    d.checkpoint = 'shaft';
    d.flags['memory.seen'] = true;
    store.write(d);
    const back = store.load()!;
    expect(back.checkpoint).toBe('shaft');
    expect(back.flags['memory.seen']).toBe(true);
  });

  it('rejects corrupt or foreign data instead of crashing', () => {
    expect(parseSave('{not json')).toBeNull();
    expect(parseSave('null')).toBeNull();
    expect(parseSave(JSON.stringify({ checkpoint: 3, flags: {} }))).toBeNull();
    const d = parseSave(JSON.stringify({ checkpoint: 'hall', flags: { a: true, b: 'yes', c: false }, playTime: 'x' }))!;
    expect(d.flags).toEqual({ a: true });
    expect(d.playTime).toBe(0);
  });
});

describe('level data', () => {
  it('every checkpoint spawn stands on solid ground', () => {
    const world = new PhysicsWorld();
    for (const s of slice.solids) world.add({ ...s, surface: 'stone' });
    for (const c of slice.checkpoints) {
      const g = world.groundUnder({ x: c.spawn.x, y: c.spawn.y, w: TUNING.width, h: TUNING.height, vx: 0, vy: 0 });
      expect(g, `checkpoint ${c.id}`).not.toBeNull();
      expect(world.isFree({ x: c.spawn.x - TUNING.width / 2, y: c.spawn.y + 0.01, w: TUNING.width, h: TUNING.height }), `checkpoint ${c.id} clear`).toBe(true);
    }
  });

  it('stones referencing bridges and channels are consistent', () => {
    const bridgeIds = new Set(slice.bridges.map((b) => b.id));
    for (const s of slice.stones) for (const b of s.bridges ?? []) expect(bridgeIds.has(b)).toBe(true);
    const channels = slice.stones.filter((s) => s.channel !== undefined).map((s) => s.channel).sort();
    expect(channels).toEqual([...Array(slice.gate.channels).keys()]);
    const stoneIds = new Set(slice.stones.map((s) => s.id));
    for (const r of slice.roots) for (const id of r.needsLightFrom ?? []) expect(stoneIds.has(id)).toBe(true);
  });
});

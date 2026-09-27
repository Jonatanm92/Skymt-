// SKYMT — Chapter I "Djupet" (vertical slice).
// Units: Skymt is ~0.9 tall. Human-made remnants are built at human scale
// (~6x Skymt), which is deliberate: the world was made for someone larger.
//
// Route: Bottnen (wake) -> Salen (great hall, first echo-stone over the chasm)
// -> Alcove (memory) -> Schaktet (shaft: stones + singing roots + gate)
// -> Chimney -> Brunnen (the well, finale).
import type { LevelDef } from './types';

const r = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

// Gate stairs: slabs that slide out of the chimney walls, zig-zagging upward.
const stairs = Array.from({ length: 10 }, (_, i) => {
  const left = i % 2 === 0;
  return r(left ? 111.25 : 113.85, 16 + 1.3 * (i + 1) - 0.3, 1.5, 0.3);
});

export const slice: LevelDef = {
  killY: -7,
  solids: [
    // --- Bottnen
    { id: 'A_leftwall', ...r(-14, -6, 10, 40) },
    { id: 'A_floor1', ...r(-4, -6, 22, 6) },
    { id: 'A_pebble', ...r(8, 0, 2.2, 0.28) },
    { id: 'A_floor2', ...r(18, -6, 10, 7.2) },
    { id: 'A_pit', ...r(28, -6, 2.6, 5.4) },
    { id: 'A_floor3', ...r(30.6, -6, 8, 7.2) },
    { id: 'A_wall', ...r(38.6, -6, 7, 9.5) },
    { id: 'A_ceiling', ...r(-14, 7, 52.6, 30) },
    { id: 'A_ceiling2', ...r(38.6, 5.3, 8.5, 32) },
    // --- Salen
    { id: 'B_floor1', ...r(45.6, -6, 20, 6) },
    { id: 'B_boulder', ...r(60, 0, 1.8, 0.8) },
    { id: 'B_rise', ...r(65.6, -6, 6, 7) },
    { id: 'B_pitfloor', ...r(66, -40, 20, 4), look: 'none' },
    { id: 'B_far', ...r(80.6, -6, 14, 7) },
    { id: 'B_ceiling', ...r(47.1, 34, 33.5, 12), look: 'none' },
    { id: 'C_leftwall', ...r(80.6, 9.8, 14, 36) },
    { id: 'C_divider', ...r(93.4, 3.0, 1.2, 6.8) },
    // --- Schaktet
    { id: 'C_floor', ...r(94.6, -6, 22, 7) },
    { id: 'C_rightwall', ...r(116.6, -6, 10, 27) },
    { id: 'C_L1', ...r(108, 1, 8.6, 3) },
    { id: 'C_L3', ...r(94.6, 8.2, 4, 0.8), look: 'ledge' },
    { id: 'C_L4', ...r(109.2, 11.2, 7.4, 0.8), look: 'ledge' },
    { id: 'C_L5', ...r(111.8, 15.2, 4.8, 0.8), look: 'ledge' },
    { id: 'C_ceilL', ...r(94.6, 21, 16.6, 13) },
    // --- Brunnen
    { id: 'W_floor', ...r(115.4, 21, 21.6, 9) },
    { id: 'W_leftwall', ...r(86, 34, 25.2, 30), look: 'none' },
    { id: 'W_stop', ...r(133.6, 30, 0.5, 8), look: 'none' },
  ],

  stones: [
    { id: 'S0', x: 69.8, y: 1, duration: 9, tone: 62, bridges: ['b_chasm'] },
    { id: 'S1', x: 100.2, y: 1, duration: 13, tone: 57, channel: 0 },
    { id: 'S2', x: 114.6, y: 4, duration: 11, tone: 64, bridges: ['b_shaft1'], channel: 1 },
    { id: 'S3', x: 96.2, y: 9, duration: 12, tone: 67, bridges: ['b_shaft2'], channel: 2 },
    { id: 'S4', x: 115.7, y: 12, duration: 13, tone: 69 },
  ],

  bridges: [
    { id: 'b_chasm', slabs: [r(72.3, 0.65, 1.7, 0.3), r(75.1, 1.25, 1.7, 0.3), r(77.9, 0.7, 1.7, 0.3)] },
    { id: 'b_shaft1', slabs: [r(104.4, 5.0, 1.8, 0.3), r(101.2, 6.3, 1.8, 0.3), r(98.9, 7.6, 1.6, 0.3)] },
    { id: 'b_shaft2', slabs: [r(99.4, 9.9, 1.8, 0.3), r(102.8, 10.7, 1.8, 0.3), r(106.2, 11.3, 1.8, 0.3)] },
  ],

  roots: [
    {
      id: 'R1',
      x: 105.8,
      y: 1,
      steps: [r(103.8, 1, 1.8, 0.9), r(105.6, 1, 1.4, 1.9), r(107.0, 1, 1.0, 2.7)],
      needsLightFrom: ['S1'],
    },
    {
      id: 'R2',
      x: 110.4,
      y: 12,
      steps: [r(109.4, 12, 2.0, 1.2), r(109.4, 12, 1.0, 2.4)],
      needsLightFrom: ['S4'],
    },
  ],

  gate: { x: 113.3, y: 21.2, width: 4.2, channels: 3, plug: r(111.2, 20.6, 4.2, 1.2), stairs },
  wellLid: r(111.2, 29.6, 4.2, 0.4),
  memory: { x: 88.6, y: 1, radius: 3.2 },

  inspectables: [
    { id: 'hand', x: 2.6, y: 0, radius: 1.6, line: 'inspect.hand' },
    { id: 'frame', x: 51.5, y: 0, radius: 2.2, line: 'inspect.frame' },
    { id: 'chair', x: 56.8, y: 0, radius: 2.4, line: 'inspect.chair' },
    { id: 'gate', x: 113.8, y: 16, radius: 2.2, line: 'inspect.gate' },
  ],

  checkpoints: [
    { id: 'start', area: r(-4, -1, 8, 4), spawn: { x: 0, y: 0 } },
    { id: 'hall', area: r(46.5, -1, 4, 4), spawn: { x: 48, y: 0 } },
    { id: 'chasm', area: r(66, 0.5, 5, 3), spawn: { x: 67.4, y: 1 } },
    { id: 'alcove', area: r(81, 0.5, 5, 3), spawn: { x: 82.6, y: 1 } },
    { id: 'shaft', area: r(96.5, 0.5, 3, 3), spawn: { x: 97.6, y: 1 } },
    { id: 'shaft_mid', area: r(94.6, 8.9, 4, 2), spawn: { x: 95.4, y: 9 } },
    { id: 'shaft_top', area: r(111.8, 15.9, 4.8, 2), spawn: { x: 115.2, y: 16 } },
    { id: 'well', area: r(116, 29.9, 6, 3), spawn: { x: 118.5, y: 30 } },
  ],

  zones: [
    {
      id: 'depths', area: r(-14, -10, 60, 20), ambience: 'depths', music: 'none',
      fog: { color: 0x0c1218, density: 0.034 }, exposure: 1.0,
      camera: { distance: 11.5, offsetY: 1.1 },
    },
    {
      id: 'hall', area: r(45.6, -40, 35, 80), ambience: 'hall', music: 'none',
      fog: { color: 0x17222c, density: 0.02 }, exposure: 1.1,
      camera: { distance: 16.5, offsetY: 2.3 },
    },
    {
      id: 'alcove', area: r(80.6, -10, 12.8, 19.8), ambience: 'hall', music: 'none',
      fog: { color: 0x141a20, density: 0.03 }, exposure: 1.05,
      camera: { distance: 15, offsetY: 2.4 },
    },
    {
      id: 'shaft', area: r(94.6, -2, 22, 23), ambience: 'shaft', music: 'shaft',
      fog: { color: 0x131d25, density: 0.024 }, exposure: 1.1,
      camera: { distance: 17.5, offsetY: 1.6, focusX: 105.6, focusWeight: 0.45 },
    },
    {
      id: 'chimney', area: r(111.2, 16.5, 4.2, 13.5), ambience: 'shaft', music: 'ascent',
      fog: { color: 0x2a2621, density: 0.026 }, exposure: 1.15,
      camera: { distance: 13, offsetY: 2.2, focusX: 113.3, focusWeight: 0.7 },
    },
    {
      id: 'well', area: r(111.2, 29.5, 30, 60), ambience: 'well', music: 'well',
      fog: { color: 0x2b333d, density: 0.009 }, exposure: 1.2,
      camera: { distance: 18, offsetY: 2.6, lookUp: 0.06 },
    },
  ],

  hints: [
    { id: 'move', area: r(-4, -1, 7, 4), delay: 4.5, learnedFlag: 'learned.move', anchor: { x: 0.6, y: 1.7 } },
    { id: 'jump', area: r(14, -0.5, 4, 2.5), delay: 3, learnedFlag: 'learned.jump', anchor: { x: 17.2, y: 2.4 } },
    { id: 'climb', area: r(34, 1, 4.6, 2.5), delay: 3.5, learnedFlag: 'learned.climb', anchor: { x: 37.4, y: 3.4 } },
    { id: 'hum', area: r(66, 0.9, 5.6, 3), delay: 4, learnedFlag: 'learned.hum', anchor: { x: 69.8, y: 3.4 } },
    { id: 'sing', area: r(98.5, 0.9, 9.5, 3), delay: 7, learnedFlag: 'learned.sing', requiresFlag: 'memory.seen', anchor: { x: 104, y: 3.6 } },
  ],

  ending: { trigger: r(125, 29.9, 9, 4), stopX: 133.6 },

  drips: [
    { x: 6, y: 6.6, every: 7 },
    { x: 27, y: 6.8, every: 9.5 },
    { x: 58, y: 18, every: 11 },
    { x: 90, y: 5.4, every: 6.5 },
    { x: 103, y: 20.5, every: 8 },
  ],
};

export type CheckpointId = (typeof slice.checkpoints)[number]['id'];

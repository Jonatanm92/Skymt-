import type { Rect, Surface } from '../world/physics';

export type Ambience = 'depths' | 'hall' | 'shaft' | 'well' | 'none';
export type MusicState = 'none' | 'memory' | 'shaft' | 'ascent' | 'well' | 'finale';
export type HintId = 'move' | 'jump' | 'climb' | 'hum' | 'sing' | 'interact';

export interface SolidDef extends Rect {
  id: string;
  surface?: Surface;
  /** Visual treatment. 'none' = collision only. */
  look?: 'rock' | 'ledge' | 'none';
  oneWay?: boolean;
}

export interface StoneDef {
  id: string;
  x: number;
  y: number;
  /** Seconds the stone stays awake. */
  duration: number;
  /** Note (MIDI) the stone rings at. */
  tone: number;
  bridges?: string[];
  /** Gate channel this stone feeds (permanent once lit). */
  channel?: number;
}

export interface BridgeDef {
  id: string;
  slabs: Rect[];
}

export interface RootDef {
  id: string;
  x: number;
  y: number;
  /** Solids that appear when grown. */
  steps: Rect[];
  /** Stone ids whose light the root needs (any one lit is enough). */
  needsLightFrom?: string[];
}

export interface GateDef {
  x: number;
  y: number;
  width: number;
  channels: number;
  plug: Rect;
  /** Slabs that slide out of the walls once the gate opens. */
  stairs: Rect[];
}

export interface CheckpointDef {
  id: string;
  area: Rect;
  spawn: { x: number; y: number };
}

export interface ZoneDef {
  id: string;
  area: Rect;
  ambience: Ambience;
  music?: MusicState;
  fog: { color: number; density: number };
  exposure: number;
  camera: { distance: number; offsetY: number; focusX?: number; focusWeight?: number; lookUp?: number };
}

export interface InspectDef {
  id: string;
  x: number;
  y: number;
  radius: number;
  line: string;
}

export interface HintDef {
  id: HintId;
  area: Rect;
  delay: number;
  /** Save flag that means the player already knows this. */
  learnedFlag: string;
  requiresFlag?: string;
  anchor: { x: number; y: number };
}

export interface LevelDef {
  solids: SolidDef[];
  stones: StoneDef[];
  bridges: BridgeDef[];
  roots: RootDef[];
  gate: GateDef;
  memory: { x: number; y: number; radius: number };
  inspectables: InspectDef[];
  checkpoints: CheckpointDef[];
  zones: ZoneDef[];
  hints: HintDef[];
  killY: number;
  wellLid: Rect;
  ending: { trigger: Rect; stopX: number };
  drips: { x: number; y: number; every: number }[];
}

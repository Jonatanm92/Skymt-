import type * as THREE from 'three';
import type { Emitter, GameEvents } from '../core/events';
import type { PhysicsWorld } from '../world/physics';
import type { PlayerController } from '../player/controller';

/** Persistent boolean progression flags (backed by SaveData.flags). */
export class Flags {
  constructor(
    public data: Record<string, boolean>,
    private events: Emitter<GameEvents>,
    private onChange: () => void,
  ) {}
  has(k: string) {
    return this.data[k] === true;
  }
  set(k: string) {
    if (this.data[k]) return;
    this.data[k] = true;
    this.events.emit('flag', { key: k });
    this.onChange();
  }
}

export interface WorldCtx {
  scene: THREE.Scene;
  physics: PhysicsWorld;
  events: Emitter<GameEvents>;
  flags: Flags;
  player: PlayerController;
}

export interface Entity {
  update(dt: number, time: number): void;
  onPulse?(p: GameEvents['pulse']): void;
}

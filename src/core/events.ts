// Tiny typed event bus. Gameplay systems emit, audio/UI/narrative listen.
type Handler<T> = (payload: T) => void;

export class Emitter<E extends Record<string, unknown>> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(key: K, fn: Handler<E[K]>): () => void {
    let set = this.handlers.get(key);
    if (!set) this.handlers.set(key, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => set!.delete(fn as Handler<never>);
  }

  emit<K extends keyof E>(key: K, payload: E[K]): void {
    const set = this.handlers.get(key);
    if (!set) return;
    for (const fn of [...set]) (fn as Handler<E[K]>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}

export type PulseKind = 'hum' | 'song';

export interface GameEvents extends Record<string, unknown> {
  pulse: { x: number; y: number; radius: number; kind: PulseKind };
  'hum:start': undefined;
  'hum:stop': undefined;
  'song:start': undefined;
  footstep: { x: number; surface: string };
  jump: { x: number };
  land: { x: number; impact: number; surface: string };
  mantle: { x: number };
  wake: undefined;
  'stone:wake': { id: string; x: number; y: number; tone: number; renewed: boolean };
  'stone:warn': { id: string; x: number; y: number };
  'stone:fade': { id: string; x: number; y: number };
  'bridge:solid': { id: string; x: number; y: number };
  'root:stir': { id: string; x: number; y: number };
  'root:grow': { id: string; x: number; y: number };
  'gate:channel': { id: string; index: number };
  'gate:refuse': undefined;
  'gate:open': undefined;
  flag: { key: string };
  checkpoint: { id: string };
  respawn: undefined;
  inspect: { id: string };
  zone: { id: string };
}

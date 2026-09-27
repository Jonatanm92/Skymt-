// Persistent progression. Everything the world needs to rebuild itself lives in
// `flags` (puzzle state, narrative beats, learned verbs) plus the checkpoint.
// Transient state (a stone's glow timer) is intentionally not saved.
export const SAVE_VERSION = 1;
const KEY = 'skymt.save.v1';

export interface SaveData {
  version: number;
  checkpoint: string;
  flags: Record<string, boolean>;
  playTime: number;
  savedAt: number;
}

export function newSave(): SaveData {
  return { version: SAVE_VERSION, checkpoint: 'start', flags: {}, playTime: 0, savedAt: Date.now() };
}

export interface Storage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Validates and migrates raw data. Returns null for anything unusable. */
export function parseSave(raw: string | null): SaveData | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<SaveData>;
    if (typeof d !== 'object' || d === null) return null;
    if (typeof d.checkpoint !== 'string' || typeof d.flags !== 'object' || d.flags === null) return null;
    const flags: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(d.flags)) if (v === true) flags[k] = true;
    return {
      version: SAVE_VERSION,
      checkpoint: d.checkpoint,
      flags,
      playTime: typeof d.playTime === 'number' && isFinite(d.playTime) ? d.playTime : 0,
      savedAt: typeof d.savedAt === 'number' ? d.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export class SaveStore {
  constructor(private store: Storage | null = storage(), private key = KEY) {}

  load(): SaveData | null {
    try {
      return parseSave(this.store?.getItem(this.key) ?? null);
    } catch {
      return null;
    }
  }

  write(data: SaveData) {
    data.savedAt = Date.now();
    try {
      this.store?.setItem(this.key, JSON.stringify(data));
    } catch {
      /* storage full or blocked: the game keeps running with in-memory state */
    }
  }

  clear() {
    try {
      this.store?.removeItem(this.key);
    } catch {
      /* ignore */
    }
  }
}

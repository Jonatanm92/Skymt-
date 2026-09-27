export type Lang = 'en' | 'sv';
export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  master: number;
  music: number;
  ambience: number;
  sfx: number;
  subtitles: boolean;
  textSize: 'small' | 'medium' | 'large';
  lang: Lang;
  brightness: number; // -1..1
  reducedMotion: boolean;
  quality: Quality;
}

const KEY = 'skymt.settings.v1';

export function defaultSettings(): Settings {
  const sv = typeof navigator !== 'undefined' && /^sv|^nb|^da|^no/i.test(navigator.language || '');
  return {
    master: 0.8,
    music: 0.7,
    ambience: 0.8,
    sfx: 0.8,
    subtitles: true,
    textSize: 'medium',
    lang: sv ? 'sv' : 'en',
    brightness: 0,
    reducedMotion: false,
    quality: 'high',
  };
}

export function loadSettings(): Settings {
  const base = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const d = JSON.parse(raw) as Partial<Settings>;
    const out = { ...base };
    for (const k of Object.keys(base) as (keyof Settings)[]) {
      if (d[k] !== undefined && typeof d[k] === typeof base[k]) (out as Record<string, unknown>)[k] = d[k];
    }
    return out;
  } catch {
    return base;
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

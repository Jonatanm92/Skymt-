import type { Game } from '../game';
import { t } from '../content/strings';
import type { Item } from './ui';

export function buildMenus(g: Game) {
  const s = g.settings;
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => {
    s[k] = v;
    g.applySettings();
  };
  const onOff = [
    { value: 'on', label: () => t('opt.on') },
    { value: 'off', label: () => t('opt.off') },
  ];

  const settingsItems: Item[] = [
    { kind: 'range', label: () => t('set.master'), get: () => s.master, set: (v) => set('master', v), min: 0, max: 1, step: 0.1 },
    { kind: 'range', label: () => t('set.music'), get: () => s.music, set: (v) => set('music', v), min: 0, max: 1, step: 0.1 },
    { kind: 'range', label: () => t('set.ambience'), get: () => s.ambience, set: (v) => set('ambience', v), min: 0, max: 1, step: 0.1 },
    { kind: 'range', label: () => t('set.sfx'), get: () => s.sfx, set: (v) => set('sfx', v), min: 0, max: 1, step: 0.1 },
    { kind: 'choice', label: () => t('set.subtitles'), options: onOff, get: () => (s.subtitles ? 'on' : 'off'), set: (v) => set('subtitles', v === 'on') },
    {
      kind: 'choice', label: () => t('set.textSize'),
      options: (['small', 'medium', 'large'] as const).map((v) => ({ value: v, label: () => t(`opt.${v}`) })),
      get: () => s.textSize, set: (v) => set('textSize', v as typeof s.textSize),
    },
    {
      kind: 'choice', label: () => t('set.lang'),
      options: [{ value: 'en', label: () => 'English' }, { value: 'sv', label: () => 'Svenska' }],
      get: () => s.lang, set: (v) => set('lang', v as typeof s.lang),
    },
    { kind: 'range', label: () => t('set.brightness'), get: () => s.brightness, set: (v) => set('brightness', v), min: -1, max: 1, step: 0.1 },
    {
      kind: 'choice', label: () => t('set.motion'),
      options: [{ value: 'full', label: () => t('opt.full') }, { value: 'reduced', label: () => t('opt.reduced') }],
      get: () => (s.reducedMotion ? 'reduced' : 'full'), set: (v) => set('reducedMotion', v === 'reduced'),
    },
    {
      kind: 'choice', label: () => t('set.quality'),
      options: (['low', 'medium', 'high'] as const).map((v) => ({ value: v, label: () => t(`opt.${v}`) })),
      get: () => s.quality, set: (v) => set('quality', v as typeof s.quality),
    },
    {
      kind: 'button', label: () => t('set.fullscreen'),
      act: () => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.().catch(() => undefined);
      },
    },
    { kind: 'button', label: () => t('menu.back'), act: () => g.ui.close() },
  ];

  const settings = {
    id: 'settings', className: 'settings', title: () => t('menu.settings'),
    items: settingsItems, onBack: () => g.ui.close(),
  };

  const confirm = {
    id: 'confirm', className: 'confirm', title: () => t('menu.confirmNew'),
    items: [
      { kind: 'button', label: () => t('menu.no'), act: () => g.ui.close() },
      { kind: 'button', label: () => t('menu.yes'), act: () => g.beginAnew() },
    ] as Item[],
    onBack: () => g.ui.close(),
  };

  const title = {
    id: 'title', className: 'title', title: () => t('title.name'), subtitle: () => t('title.sub'),
    items: [
      { kind: 'button', label: () => t('menu.continue'), act: () => g.start(false), hidden: () => !g.hasSave },
      { kind: 'button', label: () => (g.hasSave ? t('menu.new') : t('menu.begin')), act: () => (g.hasSave ? g.ui.open(confirm) : g.start(true)) },
      { kind: 'button', label: () => t('menu.settings'), act: () => g.ui.open(settings) },
    ] as Item[],
    note: () => (g.input.lastDevice === 'gamepad' ? '' : t('menu.hintKeys')),
  };

  const pause = {
    id: 'pause', className: 'pause', title: () => t('menu.paused'),
    items: [
      { kind: 'button', label: () => t('menu.resume'), act: () => g.resume() },
      { kind: 'button', label: () => t('menu.settings'), act: () => g.ui.open(settings) },
      {
        kind: 'button', label: () => t('menu.rest'),
        act: () => {
          g.resume();
          void g.respawn('rest');
        },
        hidden: () => !g.flags.has('woke'),
      },
      { kind: 'button', label: () => t('menu.quit'), act: () => g.enterTitle() },
    ] as Item[],
    onBack: () => g.resume(),
    note: () => (g.input.lastDevice === 'gamepad' ? '' : t('menu.hintKeys')),
  };

  return { title, pause, settings, confirm };
}

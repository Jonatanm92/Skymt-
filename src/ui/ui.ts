// DOM overlay UI. Everything is driven through Input actions so keyboard,
// gamepad and mouse all work in menus.
import type { Input } from '../core/input';
import { t } from '../content/strings';

export type Item =
  | { kind: 'button'; label: () => string; act: () => void; hidden?: () => boolean }
  | { kind: 'range'; label: () => string; get: () => number; set: (v: number) => void; min: number; max: number; step: number }
  | { kind: 'choice'; label: () => string; options: { value: string; label: () => string }[]; get: () => string; set: (v: string) => void };

interface MenuDef {
  id: string;
  title?: () => string;
  subtitle?: () => string;
  className: string;
  items: Item[];
  onBack?: () => void;
  note?: () => string;
}

export class UI {
  root: HTMLElement;
  private menuEl: HTMLElement;
  private subsEl: HTMLElement;
  private chapterEl: HTMLElement;
  private hintsEl: HTMLElement;
  private endEl: HTMLElement;
  private stack: MenuDef[] = [];
  private index = 0;
  private rows: HTMLElement[] = [];
  onSound?: (cue: 'ui.move' | 'ui.confirm') => void;

  constructor(parent: HTMLElement, private input: Input) {
    this.root = parent;
    this.menuEl = this.el('div', 'menu hidden');
    this.subsEl = this.el('div', 'subs');
    this.chapterEl = this.el('div', 'chapter');
    this.hintsEl = this.el('div', 'hints');
    this.endEl = this.el('div', 'endcard hidden');
    parent.append(this.hintsEl, this.subsEl, this.chapterEl, this.menuEl, this.endEl);
  }

  private el(tag: string, cls: string) {
    const e = document.createElement(tag);
    e.className = cls;
    return e;
  }

  get menuOpen() {
    return this.stack.length > 0;
  }

  get currentMenu() {
    return this.stack[this.stack.length - 1]?.id ?? null;
  }

  open(def: MenuDef) {
    this.stack.push(def);
    this.index = 0;
    this.render();
  }

  replace(def: MenuDef) {
    this.stack = [def];
    this.index = 0;
    this.render();
  }

  close() {
    this.stack.pop();
    this.index = 0;
    this.render();
  }

  closeAll() {
    this.stack = [];
    this.render();
  }

  refresh() {
    this.render(true);
  }

  private visibleItems(def: MenuDef) {
    return def.items.filter((i) => !(i.kind === 'button' && i.hidden?.()));
  }

  private render(keepIndex = false) {
    const def = this.stack[this.stack.length - 1];
    if (!def) {
      this.menuEl.className = 'menu hidden';
      this.menuEl.innerHTML = '';
      return;
    }
    const items = this.visibleItems(def);
    if (!keepIndex) this.index = 0;
    this.index = Math.min(this.index, items.length - 1);
    this.menuEl.className = `menu ${def.className}`;
    this.menuEl.innerHTML = '';
    if (def.title) {
      const h = this.el('h1', 'm-title');
      h.textContent = def.title();
      this.menuEl.append(h);
    }
    if (def.subtitle) {
      const h = this.el('div', 'm-sub');
      h.textContent = def.subtitle();
      this.menuEl.append(h);
    }
    const list = this.el('div', 'm-list');
    this.rows = items.map((item, i) => {
      const row = this.el('div', 'm-item');
      row.tabIndex = -1;
      const label = this.el('span', 'm-label');
      label.textContent = item.label();
      row.append(label);
      if (item.kind === 'range') {
        const bar = this.el('span', 'm-range');
        const fill = this.el('span', 'm-fill');
        fill.style.width = `${((item.get() - item.min) / (item.max - item.min)) * 100}%`;
        bar.append(fill);
        row.append(bar);
        bar.addEventListener('mousedown', (e) => {
          const r = bar.getBoundingClientRect();
          const k = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
          item.set(Math.round((item.min + k * (item.max - item.min)) / item.step) * item.step);
          this.render(true);
        });
      } else if (item.kind === 'choice') {
        const v = this.el('span', 'm-value');
        const opt = item.options.find((o) => o.value === item.get());
        v.textContent = `‹ ${opt ? opt.label() : ''} ›`;
        row.append(v);
      }
      row.addEventListener('mouseenter', () => {
        if (this.index !== i) {
          this.index = i;
          this.highlight();
        }
      });
      row.addEventListener('click', (e) => {
        if (item.kind === 'button') this.activate(item);
        else if (item.kind === 'choice') this.cycle(item, 1);
        e.stopPropagation();
      });
      list.append(row);
      return row;
    });
    this.menuEl.append(list);
    if (def.note) {
      const n = this.el('div', 'm-note');
      n.textContent = def.note();
      this.menuEl.append(n);
    }
    this.highlight();
  }

  private highlight() {
    this.rows.forEach((r, i) => r.classList.toggle('active', i === this.index));
  }

  private activate(item: Item) {
    if (item.kind !== 'button') return;
    this.onSound?.('ui.confirm');
    item.act();
  }

  private cycle(item: Extract<Item, { kind: 'choice' }>, dir: number) {
    const i = item.options.findIndex((o) => o.value === item.get());
    const n = item.options[(i + dir + item.options.length) % item.options.length];
    item.set(n.value);
    this.onSound?.('ui.move');
    this.render(true);
  }

  /** Menu navigation; call every frame while a menu is open. */
  update() {
    const def = this.stack[this.stack.length - 1];
    if (!def) return;
    const items = this.visibleItems(def);
    const inp = this.input;
    if (inp.pressed('down') || inp.pressed('up')) {
      this.index = (this.index + (inp.pressed('down') ? 1 : -1) + items.length) % items.length;
      this.onSound?.('ui.move');
      this.highlight();
    }
    const item = items[this.index];
    if (!item) return;
    if (inp.pressed('left') || inp.pressed('right')) {
      const dir = inp.pressed('right') ? 1 : -1;
      if (item.kind === 'range') {
        item.set(Math.min(item.max, Math.max(item.min, +(item.get() + dir * item.step).toFixed(3))));
        this.onSound?.('ui.move');
        this.render(true);
      } else if (item.kind === 'choice') this.cycle(item, dir);
    }
    if (inp.pressed('confirm')) {
      if (item.kind === 'button') this.activate(item);
      else if (item.kind === 'choice') this.cycle(item, 1);
    } else if (inp.pressed('back') && def.onBack) {
      this.onSound?.('ui.move');
      def.onBack();
    }
  }

  // ------------------------------------------------------------ subtitles
  private subTimer = 0;
  say(text: string, seconds: number, kind: 'thought' | 'caption' = 'thought') {
    const line = this.el('div', `sub ${kind}`);
    line.textContent = text;
    this.subsEl.innerHTML = '';
    this.subsEl.append(line);
    requestAnimationFrame(() => line.classList.add('show'));
    const id = ++this.subTimer;
    window.setTimeout(() => {
      if (id !== this.subTimer) return;
      line.classList.remove('show');
    }, seconds * 1000);
  }

  clearSubs() {
    this.subTimer++;
    this.subsEl.innerHTML = '';
  }

  setTextSize(size: string) {
    document.documentElement.dataset.textSize = size;
  }

  chapter(show: boolean) {
    if (show) {
      this.chapterEl.innerHTML = `<div class="c-num">${t('chapter.num')}</div><div class="c-name">${t('chapter.name')}</div><div class="c-gloss">${t('chapter.gloss')}</div>`;
      this.chapterEl.classList.add('show');
    } else this.chapterEl.classList.remove('show');
  }

  // ------------------------------------------------------------ hints
  private hintEls = new Map<string, HTMLElement>();
  hint(id: string, text: string | null, sx = 0, sy = 0) {
    let e = this.hintEls.get(id);
    if (!text) {
      e?.classList.remove('show');
      return;
    }
    if (!e) {
      e = this.el('div', 'hint');
      this.hintsEl.append(e);
      this.hintEls.set(id, e);
    }
    if (e.textContent !== text) e.textContent = text;
    e.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
    e.classList.add('show');
  }

  hideHints() {
    this.hintEls.forEach((e) => e.classList.remove('show'));
  }

  // ------------------------------------------------------------ end card
  showEnd(onReturn: () => void) {
    this.endEl.innerHTML = `
      <div class="e-title">${t('title.name')}</div>
      <div class="e-sub">${t('title.sub')}</div>
      <div class="e-line">${t('end.card')}</div>
      <div class="e-thanks">${t('end.thanks')}</div>`;
    this.endEl.className = 'endcard';
    requestAnimationFrame(() => this.endEl.classList.add('show'));
    window.setTimeout(() => {
      this.open({
        id: 'end',
        className: 'end-menu',
        items: [{ kind: 'button', label: () => t('menu.quit'), act: onReturn }],
      });
    }, 4500);
  }

  hideEnd() {
    this.endEl.className = 'endcard hidden';
  }
}

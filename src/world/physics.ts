// 2D kinematic collision on the gameplay plane (z = 0). Solids are AABBs;
// `oneWay` solids only collide from above (light slabs). Bodies are anchored
// at the feet: x = centre, y = bottom.
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Surface = 'stone' | 'light' | 'root' | 'wood' | 'metal';

export interface Solid extends Rect {
  id: string;
  active: boolean;
  oneWay?: boolean;
  surface: Surface;
}

export interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
}

export interface Contacts {
  ground: Solid | null;
  ceiling: boolean;
  wall: -1 | 0 | 1;
  stepped: boolean;
}

export interface Ledge {
  solid: Solid;
  top: number;
  standX: number;
}

const EPS = 1e-4;
export const STEP_HEIGHT = 0.36;

export function overlaps(a: Rect, b: Rect, eps = EPS): boolean {
  return a.x < b.x + b.w - eps && a.x + a.w > b.x + eps && a.y < b.y + b.h - eps && a.y + a.h > b.y + eps;
}

export function bodyRect(b: { x: number; y: number; w: number; h: number }, x = b.x, y = b.y): Rect {
  return { x: x - b.w / 2, y, w: b.w, h: b.h };
}

export class PhysicsWorld {
  solids: Solid[] = [];

  add(s: Omit<Solid, 'active' | 'surface'> & Partial<Pick<Solid, 'active' | 'surface'>>): Solid {
    const solid: Solid = { active: true, surface: 'stone', ...s };
    this.solids.push(solid);
    return solid;
  }

  get(id: string) {
    return this.solids.find((s) => s.id === id);
  }

  /** First active solid overlapping r (one-way solids ignored unless requested). */
  hit(r: Rect, includeOneWay = false, ignore?: Solid): Solid | null {
    for (const s of this.solids) {
      if (!s.active || s === ignore || (s.oneWay && !includeOneWay)) continue;
      if (overlaps(r, s)) return s;
    }
    return null;
  }

  isFree(r: Rect): boolean {
    return this.hit(r) === null;
  }

  groundUnder(body: Body, probe = 0.06): Solid | null {
    const r = { x: body.x - body.w / 2 + 0.02, y: body.y - probe, w: body.w - 0.04, h: probe + 0.001 };
    let best: Solid | null = null;
    for (const s of this.solids) {
      if (!s.active) continue;
      const top = s.y + s.h;
      if (top > body.y + 0.001 || top < body.y - probe) continue;
      if (r.x < s.x + s.w && r.x + r.w > s.x) {
        if (!best || top > best.y + best.h) best = s;
      }
    }
    return best;
  }

  /** Moves a body with axis-separated resolution. Mutates body. */
  move(body: Body, dt: number, grounded: boolean): Contacts {
    const c: Contacts = { ground: null, ceiling: false, wall: 0, stepped: false };

    // --- X axis
    if (body.vx !== 0) {
      let nx = body.x + body.vx * dt;
      for (const s of this.solids) {
        if (!s.active || s.oneWay) continue;
        const r = bodyRect(body, nx, body.y);
        if (!overlaps(r, s)) continue;
        const top = s.y + s.h;
        const rise = top - body.y;
        if (grounded && rise > 0 && rise <= STEP_HEIGHT && this.isFree(bodyRect(body, nx, top + EPS))) {
          body.y = top;
          c.stepped = true;
          continue;
        }
        if (body.vx > 0) {
          nx = s.x - body.w / 2 - EPS;
          c.wall = 1;
        } else {
          nx = s.x + s.w + body.w / 2 + EPS;
          c.wall = -1;
        }
      }
      if (c.wall !== 0) body.vx = 0;
      body.x = nx;
    }

    // --- Y axis
    const prevY = body.y;
    let ny = body.y + body.vy * dt;
    for (const s of this.solids) {
      if (!s.active) continue;
      const r = bodyRect(body, body.x, ny);
      if (!overlaps(r, s)) continue;
      const top = s.y + s.h;
      if (body.vy <= 0 && prevY >= top - 0.02) {
        ny = top;
        c.ground = s;
      } else if (body.vy > 0 && !s.oneWay && prevY + body.h <= s.y + 0.05) {
        ny = s.y - body.h - EPS;
        c.ceiling = true;
      }
    }
    body.y = ny;
    if (c.ground || c.ceiling) body.vy = 0;

    if (!c.ground && body.vy <= 0) {
      const g = this.groundUnder(body);
      if (g) {
        body.y = g.y + g.h;
        body.vy = 0;
        c.ground = g;
      }
    }
    return c;
  }

  /** Pushes a body out of solids that appeared around it (growing roots, sliding slabs). */
  depenetrate(body: Body) {
    for (let i = 0; i < 4; i++) {
      const s = this.hit(bodyRect(body));
      if (!s) return;
      const top = s.y + s.h;
      if (top - body.y < 1.2) body.y = top + EPS;
      else if (body.x < s.x + s.w / 2) body.x = s.x - body.w / 2 - EPS;
      else body.x = s.x + s.w + body.w / 2 + EPS;
    }
  }

  /** A ledge the body can pull itself onto when facing `dir`. */
  findLedge(body: Body, dir: 1 | -1, minRise = 0.4, maxRise = 1.3): Ledge | null {
    const front = dir > 0 ? body.x + body.w / 2 : body.x - body.w / 2;
    const probe = { x: dir > 0 ? front - 0.05 : front - 0.3, w: 0.35 };
    let best: Ledge | null = null;
    for (const s of this.solids) {
      if (!s.active) continue;
      const top = s.y + s.h;
      const rise = top - body.y;
      if (rise < minRise || rise > maxRise) continue;
      if (!(probe.x < s.x + s.w && probe.x + probe.w > s.x)) continue;
      // Stand just inside the ledge edge, never past its far end.
      let standX = dir > 0 ? Math.max(s.x + body.w / 2 + 0.08, body.x + 0.2) : Math.min(s.x + s.w - body.w / 2 - 0.08, body.x - 0.2);
      standX = Math.min(Math.max(standX, s.x + body.w / 2), s.x + s.w - body.w / 2);
      if (!this.isFree(bodyRect(body, standX, top + EPS))) continue;
      // Clear column above the body up to the ledge top.
      const column = { x: body.x - body.w / 2 + 0.03, y: body.y + 0.05, w: body.w - 0.06, h: top - body.y + body.h * 0.6 };
      if (this.hit(column, false, s)) continue;
      if (!best || top < best.top) best = { solid: s, top, standX };
    }
    return best;
  }
}

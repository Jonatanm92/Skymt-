// Game-time coroutines for scripted sequences. Time only advances while the
// game simulation runs, so pausing freezes every sequence in place.
interface Waiter {
  until: number;
  resolve: () => void;
}

export class Scheduler {
  time = 0;
  private waiters: Waiter[] = [];
  private conds: { test: () => boolean; resolve: () => void }[] = [];

  wait(seconds: number): Promise<void> {
    return new Promise((resolve) => this.waiters.push({ until: this.time + seconds, resolve }));
  }

  waitUntil(test: () => boolean): Promise<void> {
    if (test()) return Promise.resolve();
    return new Promise((resolve) => this.conds.push({ test, resolve }));
  }

  update(dt: number) {
    this.time += dt;
    const due = this.waiters.filter((w) => w.until <= this.time);
    this.waiters = this.waiters.filter((w) => w.until > this.time);
    due.forEach((w) => w.resolve());
    const ready = this.conds.filter((c) => c.test());
    this.conds = this.conds.filter((c) => !ready.includes(c));
    ready.forEach((c) => c.resolve());
  }

  /** Abandon all pending waits (on respawn/quit); their sequences never resume. */
  reset() {
    this.waiters = [];
    this.conds = [];
  }
}

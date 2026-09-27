// Scripted story beats. Each runs on game time (pausing freezes them) and is
// abandoned cleanly by Game.cancelSequence() on respawn/quit.
import * as THREE from 'three';
import type { Game } from '../game';
import { ANSWER_PHRASE, HER_PHRASE } from '../audio/audio';

const ease = (k: number) => k * k * (3 - 2 * k);

export async function openingSequence(g: Game) {
  g.cancelSequence();
  g.sequence = 'opening';
  const p = g.player;
  const sp = g.spawnPoint();
  p.place(sp.x, sp.y, 'locked');
  g.model.awake = 0;
  g.renderer.fade = 1;
  g.rig.override = { x: sp.x + 0.6, y: sp.y + 1.1, distance: 6.5, weight: 1 };
  g.zone = g.findZone();
  g.rig.snap(p, g.zone);
  g.audio.duck(0.5, 0.1);
  await g.scheduler.wait(1.4);
  g.audio.play('drip', { x: sp.x + 2.5, y: 5 });
  await g.scheduler.wait(1.2);
  // The ember kindles, with a few false starts, as the dark lifts.
  void g.animate(5, (k) => (g.renderer.fade = 1 - ease(k)));
  g.audio.duck(1, 5);
  await g.animate(3.4, (k) => {
    const flicker = k < 0.55 ? (Math.sin(k * 70) > 0.2 ? 1 : 0.15) : 1;
    g.model.awake = 0.35 * ease(k) * flicker;
  });
  p.setState('lying');
  g.sequence = null;
  await g.scheduler.waitUntil(() => p.state !== 'lying');
  g.flags.set('woke');
  g.persist();
  await g.animate(2.2, (k) => (g.model.awake = 0.35 + 0.65 * ease(k)));
  g.rig.override = null;
  await g.scheduler.wait(2.8);
  g.ui.chapter(true);
  await g.scheduler.wait(6);
  g.ui.chapter(false);
}

export async function memorySequence(g: Game) {
  if (g.sequence) {
    g.memory.running = false;
    return;
  }
  g.sequence = 'memory';
  const p = g.player;
  const m = g.level.memory;
  p.setState('locked');
  p.facing = m.x >= p.x ? 1 : -1;
  g.musicOverride = 'memory';
  g.rig.override = { x: m.x, y: m.y + 3.4, distance: 17.5, weight: 1 };
  await g.scheduler.wait(1.0);
  g.memory.apparition.form(3.6);
  await g.scheduler.wait(2.4);
  const dur = g.audio.melody(HER_PHRASE, 'her');
  g.say('cap.humming', dur + 1.2, 'caption');
  await g.scheduler.wait(dur + 1.4);
  g.say('memory.1', 3.4);
  await g.scheduler.wait(3.8);
  g.memory.apparition.dissolveInto(new THREE.Vector3(p.x, p.y + 0.5, 0.1), 3.2);
  await g.scheduler.wait(2.6);
  g.model.flare(1.3);
  void g.animate(1.5, (k) => (g.model.warmth = 0.5 * k));
  g.audio.play('stone.wake', { x: p.x, y: p.y, tone: 74, gain: 0.6 });
  await g.scheduler.wait(1.0);
  g.say('memory.2', 3.6);
  await g.scheduler.wait(4.0);
  g.say('memory.3', 5);
  await g.scheduler.wait(2.5);
  g.flags.set('memory.seen');
  p.canSing = true;
  g.rig.override = null;
  g.musicOverride = null;
  p.setState('normal');
  g.sequence = null;
  g.memory.running = false;
}

export async function endingSequence(g: Game) {
  const p = g.player;
  g.sequence = 'ending';
  g.musicOverride = 'none';
  g.audio.duck(0.7, 3);
  g.rig.override = { x: 129.5, y: 31.2, distance: 21, lookUp: 0.14, weight: 1 };
  g.scriptMove = 0.45;
  await Promise.race([g.scheduler.waitUntil(() => p.x >= g.level.ending.stopX - 1.2), g.scheduler.wait(4)]);
  g.scriptMove = null;
  await g.scheduler.wait(1.2);
  await g.animate(2.2, (k) => (g.model.lookUp = ease(k)));

  // Skymt waits for the player to sing.
  g.sequence = 'ending-song';
  let sang = false;
  const off = g.events.on('song:start', () => (sang = true));
  const hintAt = g.simTime + 6;
  await g.scheduler.waitUntil(() => {
    g.endingHint = !sang && g.simTime > hintAt;
    return sang;
  });
  off();
  g.endingHint = false;
  g.sequence = 'ending';
  await g.scheduler.wait(3.3);

  // Silence. Then, from far above, the rest of the song.
  g.audio.duck(0.3, 2);
  await g.scheduler.wait(2.4);
  g.audio.duck(1, 0.5);
  const dur = g.audio.melody(ANSWER_PHRASE, 'distant', 0.2);
  g.say('cap.answer', dur + 1.5, 'caption');
  g.rig.override = { x: 127, y: 36, distance: 16, lookUp: 2.4, weight: 1 };
  await g.scheduler.wait(dur * 0.5);
  g.model.flare(1.6);
  void g.animate(2.5, (k) => (g.model.warmth = 0.5 + 0.5 * k));
  await g.scheduler.wait(dur * 0.5 + 1.6);
  g.say('end.1', 3.6);
  await g.scheduler.wait(4.2);
  g.say('end.2', 5);
  await g.scheduler.wait(5.5);
  g.flags.set('chapter1.complete');
  g.mode = 'ending';
  g.audio.duck(0, 4);
  await g.animate(4, (k) => (g.renderer.fade = ease(k)));
  document.body.classList.remove('cursor-hidden');
  g.ui.showEnd(() => {
    g.ui.closeAll();
    g.audio.duck(1, 1);
    g.enterTitle();
  });
}

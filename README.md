# SKYMT — Det som dröjer

Atmospheric narrative puzzle adventure. This repository holds a playable vertical
slice: **Chapter I, "Djupet"**, from Skymt waking at the bottom of the world to
the first glimpse of what lies above.

Stack: TypeScript, Three.js (rendering only), Vite. No runtime services.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build to dist/
npm test           # unit tests (physics, controller, save, level data)
npm run build && npm run playtest            # headless full playthrough (autopilot)
npm run build && node tools/playtest.mjs --shots --quality=medium   # + screenshots at story beats
node tools/dev-views.mjs <outdir> [low|medium|high] [prefix]        # fixed art-review viewpoints
```

Controls: A/D or arrows move · Space/W jump (hold for height; hold toward a ledge to
climb) · F/Q/Shift **hum** (tap/hold: cold pulse; after the memory, keep holding to
**sing**) · E look · Esc pause. Gamepad (standard mapping): stick/d-pad, A jump,
RB/RT/B hum, X look, Start pause.

## The slice (golden path)

1. **Bottnen** – wake (any input), walk, step, jump, pit, mantle up a wall. Inspect the hand.
2. **Salen** – vast hall with human-scale remnants (chair, empty frame, house stairs).
   Chasm: hum at the echo-stone → light slabs hold for 9 s.
3. **Alcove** – warm trace; humming wakes the memory (two figures on a bench, her
   melody). Skymt learns the phrase → can now *sing*.
4. **Schaktet** – singing grows roots, but only near a lit stone; stones light
   bridges; three stones feed veins into the gate (permanent once lit).
5. **Gate** – sing with all three veins lit → seal opens, stairs slide out, warm light.
6. **Brunnen** – the well. Sing at the lip; far above, someone answers with the rest
   of the song. End card.

## Architecture (where to change things)

| Area | File |
|---|---|
| Level layout, puzzles, zones, hints, checkpoints (data only) | `src/content/slice.ts` (types in `types.ts`) |
| All player-facing text, EN/SV | `src/content/strings.ts` |
| Game loop, wiring, checkpoints, zones, hints, interaction | `src/game.ts` |
| Story sequences (opening, memory, ending) | `src/narrative/sequences.ts` |
| Movement/verbs (pure logic, unit-tested) | `src/player/controller.ts` (`TUNING`) |
| Skymt visuals/animation | `src/player/model.ts` |
| AABB collision, one-way slabs, ledge finding | `src/world/physics.ts` |
| Echo-stones + light bridges / roots / gate / memory + inspectables | `src/entities/*.ts` |
| Audio cues, ambience, music states, melodies | `src/audio/audio.ts` |
| Rendering, post (bloom, grade, fade), camera, atmosphere, set dressing | `src/render/*.ts` |
| Menus / subtitles / hints UI | `src/ui/*.ts`, `src/styles.css` |
| Save (`flags` + checkpoint), settings | `src/core/save.ts`, `src/core/settings.ts` |
| QA autopilot + test hooks (`?test` only) | `src/dev/autopilot.ts`, `tools/*.mjs` |

Conventions:
- **Progression is flags.** Anything persistent is a boolean in `SaveData.flags`
  (`memory.seen`, `root.R1`, `gate.ch0`, `gate.open`, `learned.*`, `inspect.*`).
  Entities read flags on construction to restore state. Transient state (a stone's
  glow timer) is never saved.
- **Gameplay → events → presentation.** Controller/entities emit typed events
  (`src/core/events.ts`); audio, UI and narrative react in `Game.wireEvents()`.
- **Sequences** are `async` functions on game time (`scheduler.wait`), cancelled
  by `Game.cancelSequence()` on respawn/quit, so an interrupted beat simply replays.
- **Physics** runs at a fixed 120 Hz; everything gameplay-relevant happens in `Game.fixed()`.

## Audio

All sound is procedural placeholder synthesis addressed by **cue id** (`footstep.stone`,
`stone.wake`, `gate.open`, `amb.hall`, `music.shaft`, …). To use real assets, drop files
in `public/audio/` and map them in `public/audio/manifest.json`:

```json
{ "cues": { "footstep.stone": "steps_stone_01.ogg", "amb.depths": "depths_loop.ogg", "music.shaft": "shaft.ogg" } }
```

Mapped cues play the file instead of the synth; unmapped cues keep the placeholder.
No finished music or recorded audio exists yet. Silence is intentional: music
states are `none` in most spaces.

## Canon notes

No Story/Art/Audio Bibles were present when this slice was built. The slice keeps
to the brief: Skymt does not remember Her; the hook is implication (her melody, two
figures, the answer from above). Reunion is treated as genuinely possible, not a
wrong ending. When the Bibles are added, reconcile `strings.ts` and `sequences.ts`
with them first.

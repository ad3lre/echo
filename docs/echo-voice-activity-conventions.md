# Echo Voice-Activity Conventions

The voice **activity games** (Hangman, Codenames, Skriggles, Tic-Tac-Toe,
Wordline/Wordle, Watch-Together) are sibling features that share almost the same
shape: a pure reducer/core, a realtime session, a set of components, and audio
feedback. Historically each one was written slightly differently, which made the
family drift apart (4 naming schemes, 3 copies of the optimistic-merge "tick",
two audio engines, three result shapes).

This doc is the **canonical convention** for that family. The crisp, mechanical
parts are enforced by `server/ops/scripts/check-voice-activity-conventions.mjs` (run via
`npm run check:voice-activity`, part of `npm run test:ci:guards`). Existing
violations are grandfathered in
`server/ops/scripts/voice-activity-conventions-allowlist.json` — the guard only blocks
**new** drift, so the family converges as files are touched.

Scope: `clients/web/src/features/voice/`.

---

## 1. Naming

| Artifact                      | Convention                                        | Example                                 |
| ----------------------------- | ------------------------------------------------- | --------------------------------------- |
| Activity component (`.vue`)   | `Vc<Game><Part>.vue`                              | `VcSkrigglesLobby.vue`                  |
| Game logic module (`.ts`)     | `vc<Game><Role>.ts`                               | `vcCodenamesReducer.ts`                 |
| Realtime session orchestrator | `<game>VoiceSession.ts`                           | `skrigglesVoiceSession.ts`              |
| Pure rules/state core         | `vc<Game>Reducer.ts`                              | `vcHangmanReducer.ts`                   |
| Shared cross-game primitives  | under `features/voice/shared/` or `@shared/games` | `ActivityTick`, hangman/codenames cores |

- **One word per game.** Don't ship a feature under two names (the existing
  `Wordline` vs `Wordle` split is grandfathered, not a precedent — pick one for
  any new game).
- Pick `Reducer` **or** `Core` for the pure-logic suffix; prefer `Reducer` for
  state-machine games (the majority) and reserve `Core` for stateless rule
  engines. Don't introduce a third suffix.

**Enforced:** `.vue` files inside a game folder's `components/` dir must start
with `Vc`.

## 2. Module structure

Every game lives in its **own folder** under
`clients/web/src/features/voice/` (not split between the folder and the
voice feature root or `features/voice/components/`):

```
clients/web/src/features/voice/<game>/
  vc<Game>Reducer.ts          # pure, no Vue / no socket imports
  <game>VoiceSession.ts       # realtime glue (optimistic merge, host election)
  components/Vc<Game>*.vue     # UI, prefixed Vc — only after ≥3 related .vue files
  composables/use<Game>*.ts    # Vue-facing hooks — same ≥3 rule
```

Authoritative rules stay in `server/activities/cores/games/` (`@shared/games`).
The Node `GameModule` sidecar stays in `server/activities/src/games/`.
Client Socket.IO room transport stays in `clients/web/src/features/games/`.

- The reducer is **pure**: no `.vue`, no socket, no `AudioContext` imports.
- Realtime orchestration goes in `<game>VoiceSession.ts`, **not** inlined into
  the top-level `Vc<Game>Game.vue`. (Hangman's inlined orchestration is
  grandfathered; new games must extract it.)

## 3. Shared primitives — declare once

These are identical across games and must **not** be re-declared per game.
Import them from `server/activities/cores/` (`@shared/games`) or a shared
voice helper — not a per-game copy:

- **Optimistic-merge tick** — the `{ updatedAt: number; revision: number }`
  type and its `isNewer*Tick()` comparator. One shared `ActivityTick` +
  `isNewerActivityTick()`.
- **Host election** — `*OrchestratorUserId()` / `*ArbiterUserId()` (pick the
  authoritative client from a sorted roster). One shared helper; alias per game
  via `export { ... as ... }` if a game-specific name reads better — do **not**
  copy the body.
- **Roster coercion** — `coerce*ActivityToLocalRoster` and
  `shouldLocalClientApply*Guess` share the same logic; factor the common core
  into `@shared/games`.

**Enforced:** new `*Tick = { updatedAt; revision }` types, new `isNewer*Tick`
declarations, and new `*OrchestratorUserId`/`*ArbiterUserId` declarations are
only allowed under `clients/web/src/features/voice/shared/` (the check's
`sharedDir`). Existing per-game copies are grandfathered.

## 4. Audio & haptics — one engine

All sound goes through the shared SFX engine
`clients/web/src/features/voice/composables/useVoiceGameSfx.ts`. Do **not** create a private
`AudioContext` per game.

**Enforced:** `new AudioContext` / `webkitAudioContext` is forbidden under
`clients/web/src/features/voice/` outside `useVoiceGameSfx.ts`. (Tic-Tac-Toe's private context,
ringtone, LiveKit remote playback, and level monitoring are grandfathered.)

## 5. Result / error shape (convention, not yet machine-enforced)

For fallible operations, use **one** of these two shapes consistently — do not
invent a third:

- **Discriminated union with machine-readable reason codes** (preferred for
  anything the UI must branch on):
  ```ts
  type Result =
    | { ok: true; value: T }
    | { ok: false; reason: 'slot_not_found' | 'invalid_word' };
  ```
  Map `reason` → user-facing copy in the component / i18n layer. Don't bake
  English prose into the reducer (Hangman's `error: 'At most 48 characters.'` is
  the anti-pattern).
- **Bare string-literal outcome union** for simple flows with no payload
  (e.g. `'ready' | 'join_muted' | 'cancelled'`).

Fallible compute helpers may return `T | null`, but keep the success type a flat
domain bag — don't fold presentation hints and side-channel data into the
outcome type.

---

## Updating the allowlist

When you fix a grandfathered violation, **remove its entry** from
`server/ops/scripts/voice-activity-conventions-allowlist.json` so it can't regress. The
guard fails if an allowlist entry no longer corresponds to a real violation, so
the list can only shrink.

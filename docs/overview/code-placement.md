# Frontend code placement

**Single source of truth** for where new frontend files go.  
**Enforcement:** `server/ops/scripts/check-code-placement.mjs` (CI + pre-commit).  
**Migration program:** [p1-code-placement-program.md](./p1-code-placement-program.md).

**Current tree (2026-08-17):** directory-structure score **100 / 100** (12 clean, 0 mild, 0 material). Formula: `100 − 4×material − 2×mild`. Web leftover dumps and `features/chat/services/` are emptied and frozen at 0. Chat outbound/inbound/search live under noun folders. Docs architecture is one folder. Backend tests nest by capability (`auth/`, `messages/`, `permissions/`, …); new tests colocate. Echo API route files in `routes/echo/` no longer repeat the folder name.

---

## Quick answer

| You are building…                                                                | Put it here                                                                                                       |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Feature UI (chat bubble, DM panel, server settings section, voice stage widget)  | `clients/web/src/features/<domain>/` — feature root until that domain has ≥3 related UI files, then `components/` |
| Feature orchestration (`use*` composables)                                       | Same: feature root until ≥3 related orchestration files, then `composables/`                                      |
| Feature Pinia store                                                              | Feature root, or `stores/` only after ≥3 store files                                                              |
| Feature API wrappers                                                             | Feature root, or `services/` / a named file (`paperApi.ts`) only after ≥3 related wrappers                        |
| Cross-feature Echo UI primitive (`EchoDropdown`, date picker, segmented control) | `clients/web/src/components/Echo*.vue`                                                                            |
| Cross-feature server/media/emoji primitive (allowlisted)                         | `clients/web/src/components/<Name>.vue` — see allowlist in `server/ops/scripts/code-placement-config.json`        |
| Route entry page                                                                 | `clients/web/src/views/`                                                                                          |

**Never** add feature code under `clients/web/src/components/`. That directory holds **primitives only** (10 files, no subdirectories).

**Never** add new files under `clients/web/src/utils/`, `clients/web/src/composables/`, `clients/web/src/stores/`, `clients/web/src/services/`, `clients/web/src/types/`, `clients/web/src/domain/`, `clients/web/src/ui/`, `clients/web/src/data/`, `clients/web/src/constants/`, `clients/web/src/shared/`, or `clients/web/src/features/chat/services/`. Those leftover dumps are emptied and frozen at zero (CP-6).

Message embed media players live under `clients/web/src/features/chat/components/media/`.

---

## Feature module shape

Start flat. Add a folder only when the code already proves you need it (about three related files of that kind). Do not copy a sibling feature’s layer kit.

```
features/<domain>/
  # files live at the domain root by default
  components/       # only after ≥3 related UI files
  composables/      # only after ≥3 related orchestration files
  stores/           # optional; same ≥3 rule
  services/         # optional; same ≥3 rule
  types/            # optional; colocate types with the file that uses them unless they are a published API
```

Pick `<domain>` from an existing folder under `clients/web/src/features/` when possible. New domains need a one-line justification in the PR (avoid proliferation).

Large features that already earned layers (chat, layout, paper, voice, settings, server-settings) may keep them. Tiny domains (one `.vue` or one helper) stay flat — see `features/youtube/`, `features/forums/forumPostChannel.ts`.

Public barrels (`index.ts`) belong at a **real module boundary**, not in every folder. Do not add a barrel because a template asked for one.

**Import rule:** feature A must not import `features/B/**` internals (`components/`, `composables/`, `stores/`, `services/`, `editor/`). Cross-feature coordination goes through app layout composition (`features/layout`), shared utils, or `@/api`. Importing a feature's _public surface_ (root-level file / `index.ts` barrel) is allowed.

**Enforcement:** `server/ops/scripts/check-feature-boundaries.mjs` (`npm run check:feature-boundaries`, in `test:ci:guards`). It blocks **new** crossings; the ones that exist today are grandfathered in `server/ops/scripts/feature-boundaries-allowlist.json` (**shrink-only** — a stale entry fails the build, so every fix is permanent). The composer feature(s) in `server/ops/scripts/feature-boundaries-config.json` (`layout`, the app shell) are exempt as importers — wiring features together is their job.

To shrink the allowlist: remove the cross-feature import (expose a feature public surface, move the helper into `contracts/`, or route through `layout`), then delete its entry. Prefer promoting shared widgets to a feature **root** public file (e.g. `features/voice/CameraPreview.vue`) over cross-importing `components/`. Do not grow `src/composables/` or `src/utils/` to “fix” a crossing. Feature-boundary allowlist is empty (0 crossings) — residual shared chat/voice/paper surfaces are feature-root public files.

---

## `components/` — primitives only (P1 complete)

**10 files**, flat (no subdirectories):

- **`Echo*.vue`** (4) — `EchoDateTimePicker`, `EchoDropdown`, `EchoHoverHintsHost`, `EchoSegmentedControl`
- **Config primitives** (6) — see `server/ops/scripts/code-placement-config.json`: `TwemojiText`, `StatusIndicator`, `LimitedGifImg`, `PausedGifAvatar`, `EmojiCategorySection`, `LegalDocsModal`

`server/ops/scripts/code-placement-allowlist.json` **`legacyPaths` is empty** — nothing grandfathered under `components/` anymore.

Chat message media players: `features/chat/components/media/` (`EchoAudioPlayer`, `EchoVideoPlayer`, …).

---

## Leftover dumps (shrink-only)

These folders collect unrelated files. New code goes next to the feature it changes. Shared helpers wait until a **second real caller** exists, then still prefer a named feature-root file over growing the dump.

| Folder                                                                       | Why it is frozen                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clients/web/src/utils/`                                                     | Emptied leftover dump (CP-6, recursive, freeze at 0)                                                                                                                                                                                                                                                                |
| `clients/web/src/composables/`                                               | Emptied leftover dump (CP-6, recursive, freeze at 0)                                                                                                                                                                                                                                                                |
| `clients/web/src/stores/`                                                    | Emptied leftover dump (CP-6, recursive, freeze at 0)                                                                                                                                                                                                                                                                |
| `clients/web/src/services/`                                                  | Emptied leftover dump (CP-6, recursive, freeze at 0)                                                                                                                                                                                                                                                                |
| `clients/web/src/types/`, `domain/`, `ui/`, `data/`, `constants/`, `shared/` | Emptied leftover layer crumbs (CP-6, recursive, freeze at 0). Types and helpers live next to the caller or in `contracts/`.                                                                                                                                                                                         |
| `clients/web/src/features/chat/services/`                                    | Emptied extra MVC axis (CP-6, recursive, freeze at 0). Send/ingest/search live under noun folders `chat/send/`, `chat/ingest/`, `chat/search/`.                                                                                                                                                                     |
| `clients/web/src/features/layout/composables/`                               | Emptied leftover dump (CP-6, **immediate files only**, freeze at 0). Glue lives in `controller/`. Nest new files under a durable UI domain (`controller/`, `dm/`, `rail/`, `voice/`, `more-servers/`, `profiles/`, `messaging/`, `shell/`, `server/`, `realtime/`, …) — do not add files at the top of this folder. |
| `server/backend/src/services/`                                               | Flat dump (CP-6, **immediate files only**). Nest new files under a capability folder (`uploads/`, `discordImport/`, `discordBridge/`, `search/`, `watchTogether/`, `channelWebhooks/`, …).                                                                                                                          |
| `server/backend/src/domain/`                                                 | Flat dump (CP-6, **immediate files only**). Nest new files under a noun folder (`discord/`, `permissions/`, `youtube/`, `echoStore/`, …).                                                                                                                                                                           |
| `server/backend/src/domain/echoStore/`                                       | Nested leftover dump (CP-6, **immediate files only**, freeze at 4: `index.ts`, `constants.ts`, `bootstrap.ts`, `marketingPoll.ts`). Nest new modules under a durable noun (`roles/`, `channels/`, `messages/`, `servers/`, `members/`, `voice/`, …).                                                                |
| `server/backend/src/tests/`                                                  | Nested leftover dump (CP-6, recursive freeze at 185; **immediate files 0**). Capability folders (`auth/`, `messages/`, `permissions/`, `uploads/`, …). **New tests colocate** next to the module they cover. Do not add files at the top of this folder.                                                            |

HTTP client / transport stays in `clients/web/src/api/`. Shared published types stay in `@shared/types` / `contracts/`.

---

## CI

```bash
npm run placement:check
```

Fails when:

- A new file lands in `components/` outside primitives (CP-1)
- A new `components/<subdir>/` path appears (CP-2)
- `components/` file count exceeds the ratchet baseline (CP-4)
- A grandfather allowlist entry is stale (CP-5)
- A leftover dump folder grows (CP-6) — including backend `src/tests/` and files added at the top of backend `services/`, `domain/`, `echoStore/`, or `layout/composables/`
- A layer-named folder under `features/` has fewer than 3 source files (CP-7)

Emergency bypass (local only): `ECHO_CODE_PLACEMENT_BYPASS=1`

---

## Related docs

- [features/README.md](../../clients/web/src/features/README.md) — feature module conventions
- [agents.md](./agents.md) — layer responsibilities (model / controller / view)
- [echo-code-charter.md](../echo-code-charter.md) — rule C13 (placement)
- [p1-code-placement-program.md](./p1-code-placement-program.md) — P1 complete; leftover dumps freeze at 0

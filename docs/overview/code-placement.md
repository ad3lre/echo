# Frontend code placement

**Single source of truth** for where new frontend files go.  
**Enforcement:** `scripts/check-code-placement.mjs` (CI + pre-commit).  
**Migration program:** [p1-code-placement-program.md](./p1-code-placement-program.md).

---

## Quick answer

| You are building…                                                                | Put it here                                                                                  |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Feature UI (chat bubble, DM panel, server settings section, voice stage widget)  | `frontend/src/features/<domain>/components/`                                                 |
| Feature orchestration (`use*` composables)                                       | `frontend/src/features/<domain>/composables/`                                                |
| Feature Pinia store                                                              | `frontend/src/features/<domain>/stores/`                                                     |
| Feature API wrappers                                                             | `frontend/src/features/<domain>/services/`                                                   |
| Cross-feature Echo UI primitive (`EchoDropdown`, date picker, segmented control) | `frontend/src/components/Echo*.vue`                                                          |
| Cross-feature media/emoji primitive (allowlisted)                                | `frontend/src/components/<Name>.vue` — see allowlist in `scripts/code-placement-config.json` |
| Route entry page                                                                 | `frontend/src/views/`                                                                        |

**Never** add feature code under `frontend/src/components/`. That directory holds **primitives only** (10 files, no subdirectories).

Message embed media players live under `frontend/src/features/chat/components/media/`.

---

## Feature module shape

```
features/<domain>/
  components/       # required once domain has UI
  composables/      # required once domain has orchestration
  stores/           # optional
  services/         # optional
  types/            # optional
  index.ts          # public re-exports (required for new domains)
```

Pick `<domain>` from an existing folder under `frontend/src/features/` when possible. New domains need a one-line justification in the PR (avoid proliferation).

**Import rule:** feature A must not import `features/B/**` internals (`components/`, `composables/`, `stores/`, `services/`, `editor/`). Cross-feature coordination goes through app layout composition (`features/layout`), shared utils, or `@/api`. Importing a feature's _public surface_ (root-level file / `index.ts` barrel) is allowed.

**Enforcement:** `scripts/check-feature-boundaries.mjs` (`npm run check:feature-boundaries`, in `test:ci:guards`). It blocks **new** crossings; the ones that exist today are grandfathered in `scripts/feature-boundaries-allowlist.json` (**shrink-only** — a stale entry fails the build, so every fix is permanent). The composer feature(s) in `scripts/feature-boundaries-config.json` (`layout`, the app shell) are exempt as importers — wiring features together is their job.

To shrink the allowlist: remove the cross-feature import (move the shared util to `shared/`/`composables/`, expose a feature public surface, or route through `layout`), then delete its entry. Highest-value consolidations today: `useContextMenuPosition`, `useMessageLinkActions`/`copyToClipboard`, and the `layout/components/member-profile/*` cluster are each imported by several features and belong in a shared/owning home.

---

## `components/` — primitives only (P1 complete)

**10 files**, flat (no subdirectories):

- **`Echo*.vue`** (4) — `EchoDateTimePicker`, `EchoDropdown`, `EchoHoverHintsHost`, `EchoSegmentedControl`
- **Config primitives** (6) — see `scripts/code-placement-config.json`: `TwemojiText`, `StatusIndicator`, `LimitedGifImg`, `PausedGifAvatar`, `EmojiCategorySection`, `LegalDocsModal`

`scripts/code-placement-allowlist.json` **`legacyPaths` is empty** — nothing grandfathered under `components/` anymore.

Chat message media players: `features/chat/components/media/` (`EchoAudioPlayer`, `EchoVideoPlayer`, …).

---

## What not to put in features

| Layer                                        | Home (P2+)                                      |
| -------------------------------------------- | ----------------------------------------------- |
| App-wide composables not tied to one feature | `frontend/src/composables/` (legacy; shrinking) |
| HTTP client / transport                      | `frontend/src/api/`                             |
| Shared types                                 | `@shared/types`, `shared/`                      |

---

## CI

```bash
npm run placement:check
```

Fails when:

- A new file lands in `components/` outside primitives
- A new `components/<subdir>/` path appears
- `components/` file count exceeds the ratchet baseline
- A grandfather allowlist entry is stale (fixed file still listed)

Emergency bypass (local only): `ECHO_CODE_PLACEMENT_BYPASS=1`

---

## Related docs

- [features/README.md](../../frontend/src/features/README.md) — feature module conventions
- [agents.md](./agents.md) — layer responsibilities (model / controller / view)
- [echo-code-charter.md](../echo-code-charter.md) — rule C13 (placement)

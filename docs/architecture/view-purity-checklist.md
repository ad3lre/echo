# View purity checklist (AGENTS.md)

Reference: [agents.md](../overview/agents.md) — **Client Charter** and **Controller Rules**.

This checklist defines what “pure view” means for `frontend/src` and how to verify it after refactors.

## Allowed in the view layer

- **Vue SFCs (`.vue`)**: render props/state, handle DOM input, emit intents/events, local UI state (open panels, focus, transitions).
- **Layout/visual logic**: spacing, responsive breakpoints, conditional classes, virtualizer sizing — as long as it does not merge competing **workspace/messaging** truth.
- **Thin projection**: derive display-only rows from **one** upstream snapshot (e.g. `MessageWithAuthor` from canonical `RawMessage` + `users`) without adding merge policy or staleness rules.

## Forbidden in the view layer

- Merging multiple sources of truth for shared app state (workspace roster, messages, attention, DM threads).
- Business rules, priority/fallback for canonical data (beyond documented UX-only gating where server still enforces).
- HTTP/socket orchestration, retries, debounced persistence, or transport fan-out **inside `.vue`** (use composables/controllers; composables that remain merge-heavy belong in `services/orchestration/`, not under “view”).
- Files named `viewModel` that own **load/pagination**, **snapshot apply**, or **lifecycle coordination** — those are controller/orchestration concerns; implementation should live under `services/orchestration/` (or a dedicated controller module), with the `features/**/viewModel` entry reduced to re-exports or thin wiring.

## Module placement (current convention)

| Concern                                            | Target area                                                  |
| -------------------------------------------------- | ------------------------------------------------------------ |
| Channel index / merge batch semantics              | `services/realtime/` (until single message authority exists) |
| History load, read-state timers, attention hydrate | `services/orchestration/`                                    |
| Workspace hydrate, session apply, shell policy     | `services/orchestration/`                                    |
| Message search fetch + debounce                    | `services/orchestration/`                                    |
| DM/presence/voice merge helpers                    | `services/orchestration/`                                    |

## Verification

- `npx vue-tsc --noEmit`
- Vitest: `viewLayerForbiddenPatterns.test.ts`, `vueEchoWorkspaceApplyForbidden.test.ts`, affected composable tests
- Manual: no new `@/api/`\* calls added to `.vue` without an explicit allowlist entry in the forbidden-pattern test (if you extend the guard).

## SFC audit baseline (2026)

- `MessageList.vue` has no direct `fetch`/merge/workspace-apply calls; history IO lives in orchestration (`echoHistoryOrchestration`).

## Honest ceiling

Chat/history views cannot be “perfectly pure” until **one message authority** replaces dual-write (`channelMessageAuthority` + index); this checklist still applies to **what may live in SFCs and presentation imports**.

# Client Charter — Presence Merge, Explore Directory, and Server Settings Roles (Rows 48–50)

Charter: [agents.md](../overview/agents.md).

Status (2026-04-11): row 50 is relatively clean. Row 48 and part of row 49 still point at current boundary debt and must not be read as final model-compliant ownership.

## Row 48 — `useEchoPresenceSync`

Current code path:

- REST path: `fetchEchoPresenceBatch` updates `echoSession.patchPresence`.
- Socket path: `applyEchoPresenceFromSocket` also updates `echoSession.patchPresence`.
- `echoSession.patchPresence` currently routes into [`patchPresenceOnEchoSession`](../../frontend/src/features/layout/viewModel/echoWorkspaceSessionApply.ts).

Why this is still debt:

- `echoWorkspaceSessionApply.ts` also owns snapshot merge, version gating, message disposal, and reset behavior.
- Presence truth should not depend on a model-like file that already mixes multiple workspace authorities.

## Row 49 — Explore directory

Healthy part:

- [`ExploreView.vue`](../../frontend/src/features/layout/components/ExploreView.vue) remains prop-driven and presentation-only.

Current caveat:

- [`useAppLayoutGridChrome.ts`](../../frontend/src/features/layout/composables/useAppLayoutGridChrome.ts) filters directory rows through [`exploreDirectoryRows.ts`](../../frontend/src/services/domain/exploreDirectoryRows.ts); HTTP→row mapping (including default icon) lives in [`exploreDirectoryMap.ts`](../../frontend/src/services/orchestration/exploreDirectoryMap.ts).
- `exploreDirectoryRows.ts` still chooses display or icon fallback assets in `services/domain`.
- That display choice belongs in view/projection code, not model/domain logic.

## Row 50 — Server settings roles

The role-manager path remains comparatively clean:

- one builder path through [`fetchManagedRolesFromEcho.ts`](../../frontend/src/features/server-settings/domain/fetchManagedRolesFromEcho.ts)
- no second competing role-normalization authority in the modal or editor composables

For the broader charter context, see [overview/agents.md](../overview/agents.md) and [client-layer-violations.md](./client-layer-violations.md).

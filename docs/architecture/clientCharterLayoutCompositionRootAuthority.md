# Client charter — layout composition root (leak goal row 1)

Charter: [agents.md](../overview/agents.md). Leak goal **1** in [client-charter-leak-goals.md](./client-charter-leak-goals.md).

## Authority

[`useAppLayoutController.ts`](../../frontend/src/features/layout/composables/useAppLayoutController.ts) is the **public facade** (thin delegate). The composition root is [`createAppLayoutController.ts`](../../frontend/src/features/layout/composables/createAppLayoutController.ts) plus phased wiring:

| Module                                                                                                                          | Role                                         |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| [`createAppLayoutController.ts`](../../frontend/src/features/layout/composables/createAppLayoutController.ts)                   | 3-phase orchestrator                         |
| [`wireAppLayoutDmAndShell.ts`](../../frontend/src/features/layout/composables/wireAppLayoutDmAndShell.ts)                       | Phase 1 — DM state, shell nav, UI state      |
| [`wireAppLayoutVoiceAndRealtime.ts`](../../frontend/src/features/layout/composables/wireAppLayoutVoiceAndRealtime.ts)           | Phase 2 — voice bridge, history, realtime    |
| [`wireAppLayoutMessagingAndProfiles.ts`](../../frontend/src/features/layout/composables/wireAppLayoutMessagingAndProfiles.ts)   | Phase 3 — profiles, search, context adapters |
| [`buildAppLayoutAssemblyDeps.ts`](../../frontend/src/features/layout/composables/buildAppLayoutAssemblyDeps.ts)                 | Pure field-mapping into slice/core dep bags  |
| [`assembleAppLayoutControllerContext.ts`](../../frontend/src/features/layout/composables/assembleAppLayoutControllerContext.ts) | Slice instantiation + context merge          |

These modules wire region composables, pass refs, and build context. They do **not** call Echo HTTP helpers, import `@/api/echo/*` modules, or attach raw `socket.on` listeners.

## Regression tests

- [`useAppLayoutController.thinSurface.test.ts`](../../frontend/src/features/layout/composables/useAppLayoutController.thinSurface.test.ts) — forbids `echoFetch` / `fetchEcho*` / `postEcho*` / `patchEcho*` calls, Echo API path imports, and `socket.on(` across the facade + phased wiring + assembly modules.
- [`useAppLayoutController.wiringOrder.test.ts`](../../frontend/src/features/layout/composables/useAppLayoutController.wiringOrder.test.ts) — setup order for voice / DM / chat / unread / realtime (leak goal **2**); see [clientCharterLayoutReactiveGraphAuthority.md](./clientCharterLayoutReactiveGraphAuthority.md).
- [`assembleAppLayoutControllerContext.parity.test.ts`](../../frontend/src/features/layout/composables/assembleAppLayoutControllerContext.parity.test.ts) — slice dep key completeness and high-risk injection points (voice handlers, server chrome, dm group friends, preview moderation).

## Related (workspace command layer)

Optimistic server list / category graph updates after create/delete server live in [`workspaceLocalServerGraphApply.ts`](../../frontend/src/services/domain/workspaceLocalServerGraphApply.ts) (leak goal row **34**), not in the layout composition root.

## Revision

| Date       | Note                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------- |
| 2026-04-11 | Thin-surface contract test + this authority map at 100%.                                    |
| 2026-06-13 | Document phased wiring + PR2 context assembly (`assemble*` / `buildAppLayoutAssemblyDeps`). |

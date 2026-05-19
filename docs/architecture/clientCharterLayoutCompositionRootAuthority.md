# Client charter — layout composition root (leak goal row 1)

Charter: [agents.md](../overview/agents.md). Leak goal **1** in [client-charter-leak-goals.md](./client-charter-leak-goals.md).

## Authority

[`useAppLayoutController.ts`](../../frontend/src/features/layout/composables/useAppLayoutController.ts) is the **composition root**: it wires region composables, passes refs, and builds context. It does **not** call Echo HTTP helpers, import `@/api/echo/*` modules, or attach raw `socket.on` listeners.

## Regression tests

- [`useAppLayoutController.thinSurface.test.ts`](../../frontend/src/features/layout/composables/useAppLayoutController.thinSurface.test.ts) — forbids `echoFetch` / `fetchEcho*` / `postEcho*` / `patchEcho*` calls, Echo API path imports, and `socket.on(` in the controller source.
- [`useAppLayoutController.wiringOrder.test.ts`](../../frontend/src/features/layout/composables/useAppLayoutController.wiringOrder.test.ts) — setup order for voice / DM / chat / unread / realtime (leak goal **2**); see [clientCharterLayoutReactiveGraphAuthority.md](./clientCharterLayoutReactiveGraphAuthority.md).

## Related (workspace command layer)

Optimistic server list / category graph updates after create/delete server live in [`workspaceLocalServerGraphApply.ts`](../../frontend/src/services/domain/workspaceLocalServerGraphApply.ts) (leak goal row **34**), not in `useAppLayoutController`.

## Revision

| Date       | Note                                                     |
| ---------- | -------------------------------------------------------- |
| 2026-04-11 | Thin-surface contract test + this authority map at 100%. |

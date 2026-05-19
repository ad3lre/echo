# Client charter — business rules stay server-side (leak goal row 27)

Charter: [agents.md](../overview/agents.md). Leak goal **27** in [client-charter-leak-goals.md](./client-charter-leak-goals.md).

## Policy

Product **rules of record** (who may do what, rate limits, spam classification, permission matrices, DM eligibility, etc.) are enforced on the **server** and expressed in **shared DTO/types** where the client needs shape only.

The client may:

- Map server booleans / error codes to **UX copy** (e.g. `[permissions.ts](../../frontend/src/services/domain/permissions.ts)` strings).
- Run **pure** helpers that mirror server _shape_ for forms (validation that matches API contracts), not a second source of truth.

The client must not:

- Invent permission outcomes or “fix up” server decisions with client-only priority stacks.

## Known client simulation (documented)

Some UX still _simulates_ role preview (`chatRolePreviewPermissions`) — explicitly labeled simulation in [client-charter-leak-goals.md](./client-charter-leak-goals.md) row **54**, not live RBAC; server remains SoT for real permissions.

## Regression

`[vueEchoWorkspaceApplyForbidden.test.ts](../../frontend/src/vueEchoWorkspaceApplyForbidden.test.ts)` — `.vue` trees under `components/`, `features/`, and `views/` must not reference `echoWorkspaceSessionApply` (workspace merge authority stays out of templates).

## Revision

| Date       | Note                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| 2026-04-11 | Boundary + Vue regression test; row 27 at 100%; doc uses **Known client simulation** (leak row **54**), not live RBAC. |

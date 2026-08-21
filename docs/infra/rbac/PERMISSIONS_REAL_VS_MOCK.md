# Permissions: backend (real) vs mock UI logic

**Status (2026-03):** A full line-by-line map of server vs client permission checks was **not** carried forward here. Use these instead:

- **Server truth:** [`echoPermissionEvaluate.ts`](../../../server/backend/src/domain/permissions/echoPermissionEvaluate.ts), [`echoPermissions.ts`](../../../server/backend/src/domain/permissions/echoPermissions.ts), [`echoPolicy.ts`](../../../server/backend/src/domain/echoPolicy.ts).
- **Client send / preview choke points:** [`docs/web/CHAT_PERMISSIONS_ARCHITECTURE.md`](../frontend/CHAT_PERMISSIONS_ARCHITECTURE.md) — `getSendState` / `executeShellSend`, `chatRolePreviewPermissions.ts`.

**Production:** The SPA **never** runs mock data mode (`USE_MOCK_DATA` is false in production builds); permission UI should align with the same permission keys the API enforces. **Local dev** may still use mock UI; treat any divergence there as **demo-only** until branches are removed from `AppLayout` / `useMockData`.

**Future work:** Restore a detailed parity table (backend bit → UI affordance) in this file if product needs an audit trail.

# `useAppLayoutController` Charter Checklist

Charter reference: [agents.md](../overview/agents.md).

Status (2026-04-11): this checklist is for keeping the controller thin. It is **not** evidence that the hotspot is complete. Current workspace and realtime helpers still leak merge, bootstrap, or navigation policy into model-like files; see [overview/agents.md](../overview/agents.md) and [client-charter-violations.md](./client-charter-violations.md).

## Controller should own

- intent routing
- composition order
- lifecycle timing
- host and callback wiring
- passing results to the view layer

## Controller should not own

- truth, merge, fallback, or priority rules
- workspace snapshot semantics
- message reconciliation rules
- shell navigation policy that belongs in dedicated navigation modules

## Current debt to avoid treating as final architecture

- [`workspaceSocketEventHandler.ts`](../../frontend/src/services/orchestration/workspaceSocketEventHandler.ts)
- [`workspaceRosterMerge.ts`](../../frontend/src/services/orchestration/workspaceRosterMerge.ts)
- [x] [`workspaceSocialHydrate.ts`](../../frontend/src/services/orchestration/workspaceSocialHydrate.ts)
- [`workspaceFirstGuildBootstrapGuard.ts`](../../frontend/src/services/orchestration/workspaceFirstGuildBootstrapGuard.ts)
- [x] [`workspaceServerDeletionNav.ts`](../../frontend/src/services/orchestration/workspaceServerDeletionNav.ts)
- [`workspaceShellResetOnLogout.ts`](../../frontend/src/services/orchestration/workspaceShellResetOnLogout.ts)
- [`echoWorkspaceLifecycleViewModel.ts`](../../frontend/src/features/layout/viewModel/echoWorkspaceLifecycleViewModel.ts)

These files may be on the controller call path today, but they are not the final compliant homes for merge, bootstrap, refresh, or navigation policy.

## Checklist

- [ ] Keep `useAppLayoutController.ts` as ordered wiring and pass-through only.
- [ ] Move workspace truth into one model/domain authority instead of the current split across `viewModel` and `services/domain` helpers.
- [ ] Keep realtime transport in `services/realtime` and move execution order or rollback wiring into controller/orchestration code.
- [ ] Add new behavior to a model/domain owner when it decides truth, or to controller/orchestration code when it decides execution flow.
- [ ] Do not grow the controller by absorbing policy that only exists elsewhere because those helpers are already overloaded.

## Regression guards

- [`useAppLayoutController.thinSurface.test.ts`](../../frontend/src/features/layout/composables/useAppLayoutController.thinSurface.test.ts)
- [`useAppLayoutController.wiringOrder.test.ts`](../../frontend/src/features/layout/composables/useAppLayoutController.wiringOrder.test.ts)

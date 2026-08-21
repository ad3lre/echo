# `useAppLayoutController` Charter Checklist

Charter reference: [agents.md](../overview/agents.md).

Status (2026-06-13): facade + phased wiring complete; context assembly extracted to `assembleAppLayoutControllerContext` / `buildAppLayoutAssemblyDeps`. Phase 3 wiring file remains large — see god-file enrollment.

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

- [`workspaceSocketEventHandler.ts`](../../clients/web/src/features/layout/realtime/workspaceSocketEventHandler.ts)
- [`workspaceRosterMerge.ts`](../../clients/web/src/features/layout/echoWorkspace/workspaceRosterMerge.ts)
- [x] [`workspaceSocialHydrate.ts`](../../clients/web/src/features/layout/echoWorkspace/workspaceSocialHydrate.ts)
- [`workspaceFirstGuildBootstrapGuard.ts`](../../clients/web/src/features/layout/echoWorkspace/workspaceFirstGuildBootstrapGuard.ts)
- [x] [`workspaceServerDeletionNav.ts`](../../clients/web/src/features/layout/echoWorkspace/workspaceServerDeletionNav.ts)
- [`workspaceShellResetOnLogout.ts`](../../clients/web/src/features/layout/echoWorkspace/workspaceShellResetOnLogout.ts)
- `echoWorkspaceLifecycleViewModel.ts`

These files may be on the controller call path today, but they are not the final compliant homes for merge, bootstrap, refresh, or navigation policy.

## Checklist

- [x] Keep `useAppLayoutController.ts` as ordered wiring and pass-through only (facade delegates to `createAppLayoutController`).
- [x] Context assembly DRY: slice dep builders + `assembleAppLayoutControllerContext` + `buildAppLayoutAssemblyDeps`.
- [ ] Move workspace truth into one model/domain authority instead of the current split across `viewModel` and `services/domain` helpers.
- [ ] Keep realtime transport in `services/realtime` and move execution order or rollback wiring into controller/orchestration code.
- [ ] Add new behavior to a model/domain owner when it decides truth, or to controller/orchestration code when it decides execution flow.
- [ ] Do not grow the controller by absorbing policy that only exists elsewhere because those helpers are already overloaded.

## Regression guards

- [`useAppLayoutController.thinSurface.test.ts`](../../clients/web/src/features/layout/composables/controller/useAppLayoutController.thinSurface.test.ts)
- [`useAppLayoutController.wiringOrder.test.ts`](../../clients/web/src/features/layout/composables/controller/useAppLayoutController.wiringOrder.test.ts)
- [`assembleAppLayoutControllerContext.parity.test.ts`](../../clients/web/src/features/layout/composables/controller/assembleAppLayoutControllerContext.parity.test.ts)

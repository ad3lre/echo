# Client Charter — Workspace Commands, Layout Echo API, and Voice Orchestration (Rows 34–35, 39)

Charter: [agents.md](../overview/agents.md).

## Row 34 — `workspaceServerActions` / `workspaceUserActions`

These modules are the command entrypoints for workspace and user mutations initiated from UI composables.

Healthy part:

- optimistic local graph edits can live in focused helpers such as `[workspaceLocalServerGraphApply.ts](../../clients/web/src/features/layout/echoWorkspace/workspaceLocalServerGraphApply.ts)` when they only apply canonical graph changes
- `[workspaceServerActions.ts](../../clients/web/src/features/layout/echoWorkspace/workspaceServerActions.ts)` can stay as HTTP plus ref wiring

Guardrail:

- new merge, fallback, ordering, bootstrap, or navigation rules do **not** belong in the current `services/domain/workspace*.ts` helper cluster when those files already mix controller or shell behavior
- put truth in one model/domain authority and execution flow in controller/orchestration code

## Row 35 — Layout composables that call Echo API

Layout composables may call transport when they only dispatch user intent and return results to the shell.

Red flags:

- inline workspace-payload merge
- ad-hoc socket-vs-HTTP priority
- duplicate normalization already owned elsewhere
- new lifecycle or workflow logic pushed into a `viewModel` wrapper just because that wrapper already exists

When adding behavior:

- prefer one model/domain truth owner for canonical state
- prefer controller/orchestration modules for execution flow
- keep the composable as wiring

## Row 39 — Voice orchestration

This boundary remains the intended one:

- LiveKit join/session orchestration belongs under `services/orchestration/` and transport modules
- layout owns chrome and navigation hooks only
- do not duplicate room rules or permission policy in layout code

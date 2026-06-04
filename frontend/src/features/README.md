# Frontend Feature Modules

This directory is the target home for feature-first modularization.

## Purpose

- Move domain orchestration out of large top-level components.
- Group related state/composables/components by feature.
- Reduce cross-feature coupling and improve testability.

## Conventions

- `features/<feature>/composables`: feature orchestration and view-model logic.
- `features/<feature>/components`: feature-specific UI.
- `features/<feature>/store`: feature-scoped Pinia stores (if needed).
- `features/<feature>/services`: API/domain command wrappers.
- `features/<feature>/types`: feature-local types that are not shared contracts.

## Import Rules

- Feature modules can import from:
  - `@/shared` (future)
  - `@/utils`
  - `@/api`
  - `@shared/types`
- Feature modules should not directly import internals from other feature modules.
- Cross-feature coordination should happen in app-level composition layers.

## Migration Notes

- Existing `components/*` and `composables/*` remain valid during migration.
- New extraction work should prefer creating feature modules here.
- Keep behavior unchanged while moving logic from large orchestrator files.

## File Size Guardrails

- Soft limit: 400 lines per frontend source file.
- Hard limit: 700 lines per frontend source file.
- Use `npm run modularity:check` from repo root to report oversized files.
- **God-file ratchet (CI + pre-commit):** files already at or above 700 lines are frozen in `scripts/god-file-baselines.json`. They cannot grow without raising that baseline in a reviewed PR. Emergency local bypass: `ECHO_GOD_FILE_RATCHET_BYPASS=1`. Check: `npm run god-file:check`.

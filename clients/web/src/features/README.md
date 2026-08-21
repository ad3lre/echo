# Frontend Feature Modules

This directory is the **home for all feature-owned code**. See **[docs/overview/code-placement.md](../../../../docs/overview/code-placement.md)** for the full rule set and **[docs/overview/p1-code-placement-program.md](../../../../docs/overview/p1-code-placement-program.md)** for the migration program.

## Purpose

- Move domain orchestration out of large top-level components.
- Group related state/composables/components by feature.
- Reduce cross-feature coupling and improve testability.

## Conventions

- Start **flat** at `features/<feature>/`. Add `components/`, `composables/`, `stores/`, `services/`, or `types/` only after that feature has about three related files of that kind.
- Do not copy another feature’s layer kit onto a small domain.
- Do not add an `index.ts` barrel unless this folder is a real public module boundary (`member-profile` is the example, not the template).
- `clients/web/src/utils/`, `composables/`, `stores/`, `services/`, `types/`, `domain/`, `ui/`, `data/`, `constants/`, `shared/`, and `features/chat/services/` are emptied leftover dumps — freeze at zero; new code belongs in a feature. Chat send/ingest/search live under noun folders, not `services/`.

## Import Rules

- Feature modules can import from:
  - `@/api`
  - `@shared/types`
  - another feature's **public surface** (root file or a non-layer domain folder)
  - the composer (`features/layout`) for app-level coordination
- Feature modules should not directly import internals from other feature modules.
- Cross-feature coordination should happen in app-level composition layers.

## Migration

- **P1 complete (2026-06):** all feature UI now lives under `features/<domain>/`. `components/` is primitives-only (see [code-placement.md](../../../../docs/overview/code-placement.md)).
- **New work must land under `features/<domain>/`**, not `components/`.
- Keep behavior unchanged while moving logic from large orchestrator files.

## File Size Guardrails

- Soft limit: 400 lines per frontend source file.
- Hard limit: 700 lines per frontend source file.
- Use `npm run modularity:check` from repo root to report oversized files.
- **God-file ratchet (CI + pre-commit):** files already at or above 700 lines are frozen in `server/ops/scripts/god-file-baselines.json`. They cannot grow without raising that baseline in a reviewed PR. Emergency local bypass: `ECHO_GOD_FILE_RATCHET_BYPASS=1`. Check: `npm run god-file:check`.

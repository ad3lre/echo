# Frontend Services

This folder implements a 4-layer service architecture:

- `api/` — low-level HTTP / socket wrappers (side-effecting).
- `domain/` — pure business logic and transformations (no side effects).
- `orchestration/` — workflows that compose `domain` + `api`.
- `adapters/` — framework/runtime glue (Pinia stores, sockets, platform).

Rules:

- Prefer plain exported functions in `domain/`. Use factories only when runtime dependencies or stateful behavior are required.
- Inject all runtime dependencies explicitly. Do not import stores or sockets directly inside `domain/` or `orchestration/` modules.
- Keep composables thin — they should wire reactive refs and call services rather than contain heavy business logic.

Testing:

- Unit-test `domain/` functions with Vitest.
- Mock adapters when testing `orchestration/`.

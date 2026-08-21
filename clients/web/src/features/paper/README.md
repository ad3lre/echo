# Paper

Echo **Paper** feature (TipTap editor, collab, share UI) hosted inside `clients/web`.

## Ownership

- **Lives here:** document editor, panel chrome, composables, and paper-local API helpers under `src/`.
- **Stays in `clients/web/`:** channel-type routing, AppLayout paper section, guild RBAC / channel settings chrome, public `/paper/s/…` shell view.
- **Stays in `server/backend/`:** paper HTTP + socket domain (not a separate auth product yet).

## Location

Sources live at `clients/web/src/features/paper` (formerly top-level `paper/`). Shared extraction can happen later if apple needs the same kit.

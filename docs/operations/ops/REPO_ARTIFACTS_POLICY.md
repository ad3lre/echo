# Repository artifacts policy

This document defines what **must not** be committed as part of normal feature work, so code review and quality audits stay focused on intentional changes.

## Bot export output

- **`bot/exports/**`** — Local Discord export trees produced by the export bot. Treat as **machine-local data\*\*.
- **Do not commit** new export folders unless the team explicitly needs a golden fixture (prefer a minimal redacted sample under `backend/src/tests` fixtures if required).

## Bot build output

- **`bot/dist/**`** — TypeScript emit from `npm run build -w bot`.
- **Policy:** Same as other workspaces: `dist` may appear in dev trees but should be **gitignored** if it is not already, or regenerated in CI; avoid committing churn unless the repo explicitly version-pins bot artifacts (this repo does not).

## Root build

- **`npm run build`** (root) runs **frontend**, **backend**, and **bot** builds so a clean clone can verify all three without extra steps.

## Prettier / `format:check`

- **CI:** GitLab job **`prettier`** (stage `quality`) runs `npm run format:check` on merge requests and on pushes to the default branch when matched source paths change (see [`.gitlab-ci.yml`](../../.gitlab-ci.yml)). Merge requests must pass this check.
- **Local:** Before pushing, run `npm run format` at the repo root or `npx prettier --write <paths>` on files you edited. Excluded paths (for example `node_modules`, build output, `.cursor/`, lockfiles) are listed in `.prettierignore`.
- **Milestone:** A one-time Prettier baseline was applied so the tree matches the root `.prettierrc`; avoid mixing unrelated functional changes with mass-format commits.

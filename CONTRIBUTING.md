# Contributing to Echo

Thanks for helping improve Echo.

Echo is open source under the **GNU Affero General Public License v3** — see the root [`LICENSE`](./LICENSE) file. If you open a pull request, you agree your contributions are licensed under the same terms.

## Where to start

- **[docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)** — fastest path from clone to `npm run dev` and PR checks.
- **[Documentation index](./docs/README.md)** — specs, architecture notes, infra, and reviews.
- **[Releases / native builds](./releases/README.md)** — Tauri installers and Android outputs; links into `docs/operations/` for depth.
- **[Contributor / agent charter](./docs/overview/agents.md)** — boundaries for client vs model/controller work, debugging discipline, and scope expectations.
- Root **[AGENTS.md](./AGENTS.md)** points at the same charter.

## Pull request checklist

Before requesting review:

1. **CI precheck:** `npm run ci:precheck` from the repo root (or enable `./scripts/setup-githooks.sh` so `git push` runs it automatically on non-GitHub remotes).
2. **Format:** covered by `ci:precheck` / `format:check` (or explain if your change is outside Prettier coverage).
3. **Tests:** For tight scopes you may run a subset instead of full `ci:precheck`, for example:
   - `npm run test -w frontend -- --run <path-to-test>.ts`
   - `npm run test:storage-mode -w backend` and other `npm run test:* -w backend` scripts used in `package.json` `test:ci:backend`.
4. **Contracts:** If you change REST or Socket.IO behavior, update or verify [`docs/contracts/`](./docs/contracts/) and linked specs.
5. **UI:** Describe how to verify in the PR (screenshots optional; keep images small and in-repo only when necessary).

Prefer **small, focused PRs** with a clear intent line in the description.

## Conventions

- Follow existing patterns in the package you touch (`frontend/`, `backend/`, etc.).
- Questions or ambiguous behavior: verify in code and logs rather than guessing — see `docs/overview/agents.md`.

## Maintainer: first push to GitHub without history

See **[docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)** (“Maintainer: publishing a fresh GitHub repo”). Summary: export a clean tree, run **gitleaks** and `node scripts/check-oss-artifacts.mjs`, `git init` + single initial commit (or a tiny number of intentional commits), enable GitHub security reporting and branch protection.

## Third-party licenses (dependency audit)

AGPL affects how you combine this code with other libraries. Maintainers should periodically run a license audit from the repo root after `npm ci`, for example:

```bash
npx --yes license-checker@25.0.1 --production --excludePrivate --summary
```

A sample run at the **root** `dependencies` (not all workspaces) reported SPDX families including **MIT**, **Apache-2.0**, **BSD-3-Clause**, **0BSD**, and **(Apache-2.0 AND BSD-3-Clause)**. **Re-run before each release** and scan **each workspace** (`frontend/`, `backend/`, `bot/`, …) because the root summary does not replace per-package compliance review.

Review any **`UNKNOWN`** licenses or unexpected **copyleft** in dependencies and document remediation (replacement library, version pin, or legal review). This is **not** automated in CI by default because allowlists are policy-specific.

## Security

Do **not** open a public issue for undisclosed vulnerabilities. Use [`.github/SECURITY.md`](./.github/SECURITY.md) and GitHub **private vulnerability reporting** when enabled.

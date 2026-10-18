# Echo product versioning

Echo uses a three-part version `MAJOR.MINOR.PATCH` stored in the repo-root
[`VERSION`](../../VERSION) file (kept in sync with root [`package.json`](../../package.json)).
This is **not** classic SemVer.

| Segment   | Meaning                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------- |
| **Major** | Marketing / “new evolution” of Echo. Raised only deliberately.                                  |
| **Minor** | Compatibility-breaking for **self-hosters** (lost feature, or behavior that breaks an upgrade). |
| **Patch** | Non-breaking change.                                                                            |

The product line starts at **`0.0.0`**. Workspace package versions under
`clients/`, `server/`, etc. are independent and are not kept in lockstep.

GitLab branch `release/1.0.0` is the **public publish line** name, not the
product version. See [github-release-mirror.md](./github-release-mirror.md).

## Signal to self-hosters

- **Minor went up** → treat the upgrade as breaking; read release notes / migrate.
- **Only patch went up** → expect compatibility for an in-place update.

## One bump per push

Every push to GitLab `main` is one change set. All commits in that push round
to a **single** bump level: the highest that applies (`patch`, or `minor` if
anything in the push is self-host breaking, or `major` for an evolution).

Agents and humans are **not** trusted to mark individual commits with trailers.
Declaration is the `VERSION` file change itself; enforcement is a **pre-push
gate**.

## Workflow

```bash
# … feature / fix commits …
bun run version:bump -- patch   # or: minor | major
git push origin main            # follow-tags is enabled after setup-githooks
```

`bun run version:bump`:

1. Advances `VERSION` and root `package.json` by exactly one step.
2. Commits `chore(version): X.Y.Z`.
3. Creates annotated tag `vX.Y.Z`.

### Pre-push gate

When pushing `refs/heads/main` to a non-GitHub remote, the hook:

1. Compares `VERSION` at the remote tip vs the local tip.
2. **Refuses** if unchanged, or if the delta is not exactly one allowed step
   (no skipping `0.0.1` → `0.0.5`).
3. **Refuses** if annotated tag `vX.Y.Z` for the new version is missing or not
   part of this push.

Skip (break-glass only): `ECHO_SKIP_VERSION_GATE=1 git push …`.

Hooks setup (also enables `push.followTags` so version tags ride along):

```bash
./server/ops/scripts/setup-githooks.sh
```

## Choosing the level

Ask: _If someone self-hosting Echo updates to this tip, do they lose a feature
or hit behavior that breaks their upgrade?_

- Yes → `minor` (or `major` if this is a marketed evolution).
- No → `patch`.

If the push mixes fixes and a breaking change, bump **once** with `minor`.

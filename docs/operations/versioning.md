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

Agents and humans **must** declare impact explicitly. The number alone is not
enough: `version:bump` and the pre-push gate require an **attest** that matches
the level, plus a written judgment. Defaulting to `patch` because it is easiest
is a process failure.

## Choosing the level (mandatory judgment)

Ask: _If someone self-hosting Echo updates to this tip, do they lose a feature
or hit behavior that breaks their upgrade?_

| Answer                        | Level   | `--attest`   |
| ----------------------------- | ------- | ------------ |
| No — in-place upgrade is fine | `patch` | `compatible` |
| Yes — upgrade is breaking     | `minor` | `breaking`   |
| Deliberate marketed evolution | `major` | `evolution`  |

Examples that are **minor / breaking** (not patch):

- Hardening auth so existing login/register flows gain new required steps
- Removing or renaming env/config that self-hosters rely on
- Schema or API contract changes that break older clients or operators
- Turning on a gate by default with no production opt-out

Examples that are **patch / compatible**:

- CI / test-only fixes
- Pure refactors with unchanged operator-facing behavior
- Bug fixes that restore documented behavior

If the push mixes fixes and a breaking change, bump **once** with `minor`.

## Workflow

```bash
# … feature / fix commits with meaningful subjects …

bun run version:bump -- patch \
  --attest compatible \
  --summary "Fix pipeline hang in websocket and outbox dual-target paths" \
  --why "Self-host compatible: CI/test hang fix only; no API, auth, or schema behavior change for operators."

# If auth/API/db/contracts paths changed but you still claim compatible:
bun run version:bump -- patch \
  --attest compatible \
  --summary "Allowlist verify routes in auth middleware" \
  --why "Self-host compatible: allowlist-only; login and upgrade behavior unchanged." \
  --risk-ok "Still compatible: no new login gates; operators can in-place upgrade with no auth break."

# Breaking example:
bun run version:bump -- minor \
  --attest breaking \
  --summary "Lock password accounts until email verify; require new-IP email OTP" \
  --why "Self-host breaking: upgrades force email-verify lock and new-IP OTP with no production opt-out."

git push origin main   # follow-tags is enabled after setup-githooks
```

`bun run version:bump`:

1. Refuses unless `--attest` matches the level (`patch↔compatible`,
   `minor↔breaking`, `major↔evolution`).
2. Requires `--summary` (what changed) and `--why` (self-host judgment). Lazy
   placeholders are rejected.
3. Scans commits since the previous `v*` tag for self-host **risk paths**
   (auth, API routes, db/schema, contracts, SQL). A `compatible` attest with
   risk-path hits also requires `--risk-ok`.
4. Advances `VERSION` and root `package.json` by exactly one step.
5. Commits with a meaningful subject (not `chore(version)`):

   `release: X.Y.Z — <summary>`

   Body trailers: `Echo-Version-Attest`, `Echo-Version-Why`, optional
   `Echo-Version-Risk-Ok`, plus an **Included changes** list from commit
   subjects in the range.

6. Creates annotated tag `vX.Y.Z` whose message repeats the summary, judgment,
   and included change subjects.

### Pre-push gate

When pushing `refs/heads/main` to a non-GitHub remote, the hook:

1. Compares `VERSION` at the remote tip vs the local tip.
2. **Refuses** if unchanged, or if the delta is not exactly one allowed step
   (no skipping `0.0.1` → `0.0.5`).
3. **Refuses** if annotated tag `vX.Y.Z` for the new version is missing or not
   part of this push.
4. **Refuses** if the VERSION-bump commit is still `chore(version): …`, or lacks
   matching attest/why trailers, or claims `compatible` while risk paths changed
   without `Echo-Version-Risk-Ok`.

Skip (break-glass only): `ECHO_SKIP_VERSION_GATE=1 git push …`.

Hooks setup (also enables `push.followTags` so version tags ride along):

```bash
./server/ops/scripts/setup-githooks.sh
```

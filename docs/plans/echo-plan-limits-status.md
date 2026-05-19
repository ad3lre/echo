# Echo plan limits — implemented vs not yet

This document tracks **Echo (free)**, **Echo+**, and **Echo Black** product limits relative to the codebase. Canonical numeric caps live in [`shared/echoPlanLimits.ts`](../../shared/echoPlanLimits.ts).

## Implemented (enforced or exposed)

| Area                          | Behavior                                                                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plan storage**              | Postgres `auth_users.echo_plan` (`free` / `plus` / `black`), default `free`. No payment integration yet — change tier manually or via future billing.                         |
| **GET `/api/v1/auth/me`**     | Returns `planLimits` (upload cap, server cap, group DM max, theme tier, feature flags) when the database is available; merges `echoPlan` / `hasActiveSubscription` on `user`. |
| **Uploads (presign + local)** | Single-object size limited per plan. Free: 30 MB, or **250 MB** when phone is verified (`phone_e164` + `phone_verified_at`). Echo+: 2 GB. Echo Black: 8 GB.                   |
| **Local disk uploads**        | `PUT` body size is capped by **`ECHO_LOCAL_UPLOAD_MAX_BYTES`** (default 256 MB). Larger tier limits require S3-compatible object storage, not buffering whole files in Node.  |
| **Joined servers**            | Free: max **200** memberships (excluding the synthetic DM realm server). Echo+ / Black: unlimited. Enforced on **create server**, **directory join**, and **invite join**.    |
| **Group DM size**             | Max members (including initiator): free **25**, plus **50**, black **250**. Enforced in `createEchoGroupDmThread`; UI uses `planLimits.groupDmMaxMembers`.                    |
| **Theme UI (client)**         | Amoled / Sunny swatches require Echo+ or Echo Black when `THEMES_SELECTION_COMING_SOON` is true; Light/Dark stay available.                                                   |

## Not implemented or only partial

| Product / doc claim                                                  | Gap                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Daily upload quotas** (e.g. 1 GB / 50 GB / 100 GB per day)         | No per-user rolling counters or enforcement. Only **per-file** caps exist.                                                                                                                                                                                                             |
| **Free tier 500 MB “verified + 20 h on platform”**                   | **Playtime** is not tracked; the **500 MB** path is not implemented. Phone bump stops at 250 MB for free.                                                                                                                                                                              |
| **Low / Raw / default “heavy” compression**                          | There is **no** user-selectable media compression pipeline tied to plan. Chat uploads use optional **client-side image** compression only; **GIF/video** are not re-encoded server-side by plan. “Low compression” and “Raw” are **marketing/UI flags** in `planLimits.features` only. |
| **Resolution / FPS caps** (1080p, 2K, 4K)                            | Not enforced in API or LiveKit minting; SFU policy does not read `echo_plan`.                                                                                                                                                                                                          |
| **Voice sample rate** (96 kHz / 196 kHz / 256 kHz)                   | Browser / codec constraints differ; no plan-based audio constraint layer.                                                                                                                                                                                                              |
| **“24 premium themes” / “true custom mode”**                         | Only four theme ids exist in the client; full theme packs and unrestricted token/CSS editing are not implemented.                                                                                                                                                                      |
| **Custom emoji packs count**                                         | No per-user pack limit in DB or API.                                                                                                                                                                                                                                                   |
| **HD streaming priority, profile effects, badges, priority support** | Not wired to product behavior.                                                                                                                                                                                                                                                         |
| **Billing / Stripe**                                                 | `hasActiveSubscription` is derived from `echo_plan` only; no webhook-driven upgrades.                                                                                                                                                                                                  |

## Operations notes

- **`ECHO_LOCAL_UPLOAD_MAX_BYTES`**: Raise only if you accept higher memory use for local PUT handling (see config in `backend/src/config.ts`).
- **Changing a user’s plan**: `UPDATE auth_users SET echo_plan = 'plus' WHERE id = '…';` — session cache may show stale `echoPlan` until the next `/me` or re-login; enforcement paths load fresh entitlements from the DB where it matters (uploads, joins, group DM).

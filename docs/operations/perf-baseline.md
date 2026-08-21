# Production perf baseline

Measure real load and interaction timings on deployed Echo (`https://chat-echo.com`) for before/after performance work. Results are JSON baselines with **median** and **p95** across repeated iterations.

## What is measured

| Scenario        | Metrics                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------ |
| **cold_boot**   | Spinner → Vue mount → boot gate dismissed → shell visible → workspace settled → chat ready |
| **warm_boot**   | Same boot milestones on in-session reload (cache warm)                                     |
| **chat_switch** | Channel A → B: UI rendered, first message visible                                          |
| **vc_connect**  | Voice channel click → LiveKit **Voice Connected**                                          |
| **misc_nav**    | Explore open, DM tab, server rail switch, return to guild channel                          |

Timings come from the client [`perfHarness`](../../clients/web/src/observability/perfHarness.ts) (`?perfHarness=1`) plus Playwright wall-clock for misc navigation.

## One-time fixture setup (production)

Create a **dedicated account** (e.g. `perf-bot`) — do not use a personal account.

1. Register/login on production.
2. Create a guild with:
   - **≥2 text channels**, each with **≥20 messages** (stable history load).
   - **1 voice channel** (prefer empty for join latency).
3. Copy snowflake IDs from the URL bar: `/channels/{serverId}/{channelId}`.
4. Copy [`.env.perf.example`](../../.env.perf.example) → `.env.perf` and fill:

```bash
PERF_BASE_URL=https://chat-echo.com
PERF_TEST_USERNAME=...
PERF_TEST_PASSWORD=...
PERF_SERVER_ID=...
PERF_CHANNEL_A=...
PERF_CHANNEL_B=...
PERF_VOICE_CHANNEL=...
PERF_ITERATIONS=5
```

**LiveKit** must be configured on production (`LIVEKIT_*` — see [livekit-production.md](./livekit-production.md)). The VC scenario uses fake mic devices and will choose **Join muted** if the mic preflight modal appears.

## Run the suite

From repo root:

```bash
npm install
npx playwright install chromium
npm run test:perf:prod
```

Outputs:

- `server/ops/perf/results/<run-id>/baseline.json` — full report
- `server/ops/perf/results/<run-id>/baseline.md` — human summary
- `server/ops/perf/baselines/prod-<date>.json` — dated copy for commit/compare

Auth uses the REST login API in Playwright global setup (cookie session + CSRF), then caches `server/ops/perf/.auth/storage.json` (refreshed every 6 hours).

Until the frontend perf harness is deployed, boot/chat/VC harness milestones may be empty; the suite still records **Navigation Timing** and wall-clock fallbacks (see `server/ops/perf/lib/harness.mjs`).

## Compare baselines

```bash
npm run test:perf:prod:compare -- server/ops/perf/baselines/prod-2026-01-01.json server/ops/perf/baselines/prod-2026-06-14.json
```

Fails when any metric median regresses more than **10%** (`PERF_COMPARE_THRESHOLD` overrides).

## Reproducibility notes

- Fixed viewport **1280×720**, Playwright Chromium only.
- **Cold boot** disables network cache via CDP but keeps the auth cookie session.
- Run during quiet periods; production load adds variance — trust **median/p95**, not a single sample.
- Do **not** wire this to every PR CI (rate limits, secrets). Use manual runs or `workflow_dispatch` with GitHub secrets if needed later.

## Harness API (browser)

When `?perfHarness=1` is present:

```js
window.__echoPerf.getReport();
window.__echoPerf.reset();
```

No server ingest; safe on production.

# Chat video HLS packaging

Background transcoding for chat video uploads into adaptive HLS (fMP4 VOD). Progressive MP4 remains the source of truth; HLS is a best-effort playback optimization.

## Requirements

- **ffmpeg** and **ffprobe** on the host that runs the transcode worker (`FFMPEG_PATH` / `FFPROBE_PATH`, or on `PATH`).
- Postgres (`echo_video_hls_queue`, `echo_video_playback` tables).
- Object storage or local upload dir for source + HLS pack objects (same `ECHO_S3_*` / `ECHO_LOCAL_UPLOADS` as the API).

## Worker topology

| `ECHO_VIDEO_HLS_WORKER` | API process                                             | Transcode process                                           |
| ----------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| `embedded` (default)    | Runs drain loop + in-process kick after upload register | Same process                                                |
| `standalone`            | Enqueues only; `pg_notify` wakes external worker(s)     | `npm run worker:video-hls` (or PM2 `echo-video-hls-worker`) |

Multiple standalone workers are safe: jobs use `FOR UPDATE SKIP LOCKED`.

**Local dev:** leave `embedded` (default) so `npm run dev` does not need a second process.

**Production:** `ECHO_VIDEO_HLS_WORKER=standalone` is required (startup gate) unless `ECHO_ALLOW_EMBEDDED_VIDEO_HLS=true` for deliberate single-process smoke. From repo root, `pm2 start ecosystem.config.cjs` loads [`.env`](../../.env) into both `echo-backend` and `echo-video-hls-worker` via `env_file`. The worker process is **required** (install **ffmpeg** on that host). On shutdown, the worker waits for the current transcode to finish (up to `ECHO_VIDEO_HLS_TIMEOUT_MS` + 30s) before exit.

## Environment

| Variable                         | Default                | Purpose                                                                                                     |
| -------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `ECHO_VIDEO_HLS_WORKER`          | `embedded`             | `embedded` or `standalone`. Production refuses `embedded` unless `ECHO_ALLOW_EMBEDDED_VIDEO_HLS=true`.      |
| `ECHO_ALLOW_EMBEDDED_VIDEO_HLS`  | `false`                | Opt-in for production single-process smoke only.                                                            |
| `ECHO_SOCKET_MESSAGE_SLIM`       | `true`                 | Omit TipTap `contentJson` on socket create fan-out (ack/REST unchanged).                                    |
| `ECHO_PG_POOL_MAX`               | `10`                   | Max clients in the shared `pg.Pool` (1–100).                                                                |
| `ECHO_VIDEO_OPTIMIZE_MS`         | `15000`                | Poll interval (ms). Upload register also wakes worker (in-process kick or `pg_notify`). Set `0` to disable. |
| `ECHO_VIDEO_HLS_MAX_DURATION_S`  | `600`                  | Max source duration (seconds).                                                                              |
| `ECHO_VIDEO_HLS_MAX_INPUT_BYTES` | `125829120` (~120 MiB) | Max source file size.                                                                                       |
| `ECHO_VIDEO_HLS_TIMEOUT_MS`      | `900000` (15 min)      | Per-job ffmpeg timeout; also stale `processing` reclaim threshold.                                          |
| `ECHO_VIDEO_HLS_MAX_ATTEMPTS`    | `3`                    | Transcode attempts before marking playback `failed`.                                                        |
| `ECHO_FFMPEG_THREADS`            | `2`                    | ffmpeg thread cap per job.                                                                                  |

## Flow

1. Client uploads MP4/WebM/MOV via presign, then `POST /uploads/register` with `kind: video` + `channelId`.
2. Row inserted into `echo_video_hls_queue` (`pending`) and `echo_video_playback` (`pending`).
3. Background worker drains pending jobs, runs ffmpeg, and publishes `{sourceKey sans ext}/hls/` pack.
4. Client calls `GET /uploads/video-playback?url=` and polls every ~2s while `pending`; switches to HLS when `ready`.

## Commands

```bash
# After npm run build -w backend (or root npm run build)
npm run worker:video-hls          # production binary
npm run worker:video-hls:dev      # ts-node (backend workspace)
```

## Ladder

Fixed rungs (not plan-tier selectable): 360p / 720p / 1080p. Short clips (&lt;10s or &lt;5MB) get a single rendition (highest eligible rung).

Each rung is encoded with **per-output-stream** rate control (`-c:v:i` / `-b:v:i` / `-maxrate:v:i` / `-bufsize:v:i`), so the rungs are real bitrate steps (e.g. 360p ≈ 0.8 Mbps vs 720p ≈ 2.5 Mbps), not just resolution labels.

## Packaging correctness (`echoVideoHlsProcessor.ts`)

Guarantees enforced by the packager + `validateHlsOutput`:

- **Segments co-locate with playlists.** ffmpeg runs with `cwd=outDir` and relative output names, so `.m4s` segments, `*_init.mp4`, variant playlists, and `master.m3u8` all land in `outDir` with flat relative URIs. (Absolute `-hls_segment_filename` previously wrote segments to the worker cwd while playlists referenced them locally → published packs missing every segment.)
- **Every playlist reference is verified before publish.** `validateHlsOutput` walks master → each variant → each `EXT-X-MAP` init + media segment and requires the file to exist with non-zero size, rejects absolute URIs, and requires `EXT-X-ENDLIST`. (The old check only sampled for "a `.m4s`/init-ish file", which missed the missing-segment bug.)
- **IDR-aligned segments.** A keyframe is forced at every segment boundary (`-force_key_frames expr:gte(t,n_forced*SEGMENT_SECONDS)`, `-sc_threshold 0`), so `EXT-X-TARGETDURATION ≈ SEGMENT_SECONDS` and `EXT-X-INDEPENDENT-SEGMENTS` is truthful.

**Cache headers** ([`echoUploadHlsObjectStore.ts`](../../backend/src/services/echoUploadHlsObjectStore.ts) `cacheControlForHlsObjectKey`): segments/init → `public, max-age=31536000, immutable`; manifests (`.m3u8`) → `public, max-age=60, must-revalidate`, because the manifest lives at a stable, non-versioned path (`…/hls/master.m3u8`) and is rewritten in place when a changed source is republished.

**Golden test:** `npm run test:video-hls-golden` (backend; needs ffmpeg/ffprobe, skips otherwise) builds a real two-rung pack and asserts every referenced file exists, bitrate separation between rungs, `TARGETDURATION` ≈ segment length, independent-segments, and that the validator rejects a pack with a deleted segment.

## Failure behavior

- Transient ffmpeg errors: queue row returns to `pending` until `ECHO_VIDEO_HLS_MAX_ATTEMPTS` is reached.
- Stuck `processing` rows (worker crash): reclaimed to `pending` after `ECHO_VIDEO_HLS_TIMEOUT_MS`.
- Terminal failure: playback `failed`; client keeps progressive MP4 fallback.

## Logs

- `echo.video_hls.worker_started` — standalone worker boot.
- `echo.video_hls.listen_started` / `echo.video_hls.listen_failed_poll_only` — Postgres NOTIFY listener.
- `echo.video_hls.shutdown_idle_timeout` — SIGTERM/SIGINT exited before idle (stale reclaim will reset `processing`).
- `echo.video_hls.done` — successful transcode (includes rendition count).
- `echo.video_hls.failed` — job error (includes `storageKey`, `err`).
- `echo.video_hls.tick_failed` — worker tick exception.

## Scope

Chat channel uploads only (`echo/channels/…`). Discord import and webhook inbound videos are not enqueued today.

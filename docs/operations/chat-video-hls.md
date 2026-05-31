# Chat video HLS packaging

Background transcoding for chat video uploads into adaptive HLS (fMP4 VOD). Progressive MP4 remains the source of truth; HLS is a best-effort playback optimization.

## Requirements

- **ffmpeg** and **ffprobe** on the API host (`FFMPEG_PATH` / `FFPROBE_PATH`, or on `PATH`).
- Postgres (`echo_video_hls_queue`, `echo_video_playback` tables).
- Object storage or local upload dir for source + HLS pack objects.

## Environment

| Variable                         | Default                | Purpose                                                                                                        |
| -------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `ECHO_VIDEO_OPTIMIZE_MS`         | `15000`                | Fallback worker poll interval (ms). Upload registration also wakes the worker immediately. Set `0` to disable. |
| `ECHO_VIDEO_HLS_MAX_DURATION_S`  | `600`                  | Max source duration (seconds).                                                                                 |
| `ECHO_VIDEO_HLS_MAX_INPUT_BYTES` | `125829120` (~120 MiB) | Max source file size.                                                                                          |
| `ECHO_VIDEO_HLS_TIMEOUT_MS`      | `900000` (15 min)      | Per-job ffmpeg timeout; also stale `processing` reclaim threshold.                                             |
| `ECHO_VIDEO_HLS_MAX_ATTEMPTS`    | `3`                    | Transcode attempts before marking playback `failed`.                                                           |
| `ECHO_FFMPEG_THREADS`            | `2`                    | ffmpeg thread cap per job.                                                                                     |

## Flow

1. Client uploads MP4/WebM/MOV via presign, then `POST /uploads/register` with `kind: video` + `channelId`.
2. Row inserted into `echo_video_hls_queue` (`pending`) and `echo_video_playback` (`pending`).
3. Background worker (`startVideoUploadOptimizeJob`) wakes immediately after upload registration, drains pending jobs, runs ffmpeg, and publishes `{sourceKey sans ext}/hls/` pack.
4. Client calls `GET /uploads/video-playback?url=` and polls every ~2s while `pending`; switches to HLS when `ready`.

## Ladder

Fixed rungs (not plan-tier selectable): 360p / 720p / 1080p. Short clips (&lt;10s or &lt;5MB) get a single rendition (highest eligible rung).

## Failure behavior

- Transient ffmpeg errors: queue row returns to `pending` until `ECHO_VIDEO_HLS_MAX_ATTEMPTS` is reached.
- Stuck `processing` rows (worker crash): reclaimed to `pending` after `ECHO_VIDEO_HLS_TIMEOUT_MS`.
- Terminal failure: playback `failed`; client keeps progressive MP4 fallback.

## Logs

- `echo.video_hls.done` — successful transcode (includes rendition count).
- `echo.video_hls.failed` — job error (includes `storageKey`, `err`).
- `echo.video_hls.tick_failed` — worker tick exception.

## Scope

Chat channel uploads only (`echo/channels/…`). Discord import and webhook inbound videos are not enqueued today.

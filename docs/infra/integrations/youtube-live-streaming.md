# YouTube live streaming (stage channels)

Echo can send a **room-composite program feed** from a stage voice channel to **YouTube Live** over RTMP—similar to StreamYard: connect a channel once, then **Go live on YouTube** from the stage UI.

## Prerequisites

1. **Google Cloud OAuth client** (same app as [Google user OAuth](./google-user-oauth.md) is fine).
2. **YouTube Data API v3** enabled for that project.
3. **Live streaming** enabled on the YouTube channel (Creator Studio → Features).
4. **LiveKit** configured (`LIVEKIT_*`) **and** the [LiveKit Egress](https://docs.livekit.io/home/egress/overview/) service running.
5. **Postgres** (`ECHO_BACKEND_STORAGE=postgres`).

## Environment

| Variable                            | Notes                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| `GOOGLE_OAUTH_CLIENT_ID`            | Same OAuth client as Google sign-in/link.                                               |
| `GOOGLE_OAUTH_CLIENT_SECRET`        | Server-only.                                                                            |
| `YOUTUBE_OAUTH_REDIRECT_URI`        | e.g. `http://localhost:8080/api/v1/auth/youtube/callback` — register in Google Console. |
| `YOUTUBE_OAUTH_SCOPES`              | Default: `openid email profile https://www.googleapis.com/auth/youtube.force-ssl`       |
| `ECHO_DISCORD_TOKEN_ENCRYPTION_KEY` | Encrypts YouTube OAuth tokens (shared federated key).                                   |
| `ECHO_APP_PUBLIC_URL`               | SPA origin for post-OAuth redirect (`youtube_linked`, `youtube_error`).                 |
| `LIVEKIT_EGRESS_ENABLED`            | Must be `true` when LiveKit Egress is deployed (defaults to **off**).                   |

## User flow

### Channel link (recommended)

1. **Settings → Google → Connect Google account** (required before YouTube OAuth; same Google account must be used for YouTube OAuth).
2. **Settings → YouTube → Connect YouTube channel** (`POST /api/v1/auth/youtube/start` → Google consent with YouTube scopes).
3. In a **stage** channel, users with **Manage Channels** see **Go live on YouTube** (title + privacy).
4. Echo creates a YouTube `liveBroadcast` + `liveStream`, binds them, starts **LiveKit room composite RTMP egress** to the ingest URL, then transitions the broadcast to **live**.
5. **End live** stops egress and completes the YouTube broadcast.

### Stream key only (no YouTube API account link)

1. **Settings → YouTube → Stream key only** — paste the **stream key** (and optional RTMP server URL) from YouTube Studio. Echo encrypts the full ingest URL (`ECHO_DISCORD_TOKEN_ENCRYPTION_KEY`) and **never returns the secret** after save.
2. **Revoke** via `DELETE /api/v1/me/youtube/stream-key` clears the stored key and stops active stage streams.
3. **Go live on YouTube** from a stage sends LiveKit egress to the saved RTMP URL only. The user must start/end the broadcast in YouTube Studio; Echo does not create watch links or call broadcast transition APIs.
4. If both a channel link and a stream key exist, **channel link wins** for go-live until the OAuth link is removed.

Disconnecting Google in Settings also unlinks YouTube OAuth, revokes any saved stream key, and stops active stage streams for that user.

## API (authenticated)

| Method   | Path                                                               | Purpose                                                               |
| -------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `GET`    | `/api/v1/me/youtube`                                               | Link status, `connectionMode`, stream-key metadata (never the secret) |
| `PUT`    | `/api/v1/me/youtube/stream-key`                                    | Save encrypted RTMP ingest (stream key + optional server URL)         |
| `DELETE` | `/api/v1/me/youtube/stream-key`                                    | Revoke saved stream key                                               |
| `DELETE` | `/api/v1/me/youtube`                                               | Unlink OAuth channel                                                  |
| `GET`    | `/api/v1/echo/servers/:serverId/channels/:channelId/stage/youtube` | Stream status for stage                                               |
| `POST`   | `.../stage/youtube/start`                                          | Start YouTube live + egress                                           |
| `POST`   | `.../stage/youtube/stop`                                           | Stop live                                                             |

## Limitations

- **Voice E2EE** on the stage blocks server-side egress; disable E2EE on that channel to go live.
- **One active YouTube stream per stage channel** at a time.
- **Watch URL visibility:** `public` streams expose the YouTube link to all server members; `unlisted` / `private` show a live badge to members but only moderators get the link.
- Unlinking YouTube in Settings **stops** any active stage streams tied to your account first.
- Layout is LiveKit **`speaker`** composite (not a full custom multiview editor yet).
- Egress must be operated and scaled like any LiveKit sidecar (CPU for compositing + RTMP).

## Operations

- If go-live fails with `LIVEKIT_EGRESS_*`, confirm egress health and that `LIVEKIT_EGRESS_ENABLED=true`.
- If YouTube rejects transition, confirm the channel is verified for live streaming and quotas are not exceeded.
- Tokens refresh automatically; users reconnect via Settings if refresh is revoked.

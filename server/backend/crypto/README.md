# Crypto

Echo **E2EE / MLS** kit under `server/backend/crypto` (libsignal messaging + voice MLS). No Vue or client chrome.

## Ownership

- **`src/e2ee/`** — Signal-style device/pairing/message crypto (ex-`clients/web/src/services/e2ee`).
- **`src/mls/`** — Voice MLS group/key helpers (ex-`clients/web/src/services/voice/mls`).
- **Stays in `clients/web/`:** E2EE settings UI, LiveKit join wiring (`voiceE2eePrepare`, room connect), API wrappers under `clients/web/src/api/echo/e2ee.ts`.

## Host coupling (temporary)

Web resolves `@/services/e2ee` and `@/services/voice/mls` to this package via Vite/TS path aliases.

Do not add Vue/SFC files here.

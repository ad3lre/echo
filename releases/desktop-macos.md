# macOS desktop (Tauri)

## Artifacts (local build)

Typical outputs:

- `src-tauri/target/release/bundle/dmg/` — `.dmg`
- `src-tauri/target/release/bundle/macos/` — `.app` (as produced by the bundler)

Universal binary (Apple Silicon + Intel): add `--target universal-apple-darwin` to the Tauri build (see platform doc).

## Build (repo root)

```bash
export VITE_API_URL="https://chat-echo.com"
export VITE_SOCKET_IO_URL="https://chat-echo.com"
npm run tauri:build
```

## Details

Developer ID, notarization, and release checklist: [`docs/operations/desktop-macos.md`](../docs/operations/desktop-macos.md). Updater roadmap: [`docs/operations/tauri-phase2.md`](../docs/operations/tauri-phase2.md).

## Pre-release QA matrix

Run against a **production-like build** (`VITE_API_URL` / `VITE_SOCKET_IO_URL` pointing at the target API) before shipping a macOS desktop release. Use `VITE_ECHO_AUTH_DEBUG=1` and [`sessionDiagnostics`](../frontend/src/observability/sessionDiagnostics.ts) trace IDs for postmortems.

| Scenario                 | What to verify                                                              | Automated coverage                                                                |
| ------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Cold start**           | Cached registered user + flaky network: no guest mint, no workspace wipe    | `useEchoWorkspaceStartInitialLoad.test.ts`                                        |
| **Guest → register**     | Stay logged in; send a message within 30s; no triple warnings               | `authClient.desktopTransport.test.ts`, `authSession.test.ts`, `transport.test.ts` |
| **Login → upload**       | Presign + PUT succeeds (preflight path for mutators)                        | Manual only                                                                       |
| **OAuth handoff return** | No auto-guest before restore completes                                      | Manual only (Discord + Google)                                                    |
| **Password change**      | Banner, logout, socket dead                                                 | Manual only                                                                       |
| **macOS chrome**         | Traffic lights visible; drag works; double-click zoom stable                | Manual only (`lib.rs` window-state + `DesktopTitlebar.vue`)                       |
| **Voice (mic publish)**  | Join unmuted: green speaking ring locally; remote sees unmuted; audio heard | Manual only; see `echoLocalMicPublishHealth` / WebKit AudioContext resume         |
| **Voice (playback)**     | Remote participants audible after first click; volume boost works           | Manual only; `echoRemotePlaybackWebAudio` + `audioPlaybackUnlock`                 |
| **Camera**               | Permission prompt shows Echo copy; video publishes after allow              | Manual only; `Info.macos.plist` `NSCameraUsageDescription`                        |
| **Screen share**         | Permission prompt + picker; share starts after allow                        | Manual only; `Info.macos.plist` `NSScreenCaptureUsageDescription`                 |
| **Logout → reload**      | No auto-guest                                                               | Manual only                                                                       |

**Regression suite (CI):** `npm run test -w frontend -- --run src/api/authClient.desktopTransport.test.ts src/composables/__tests__/useEchoWorkspaceStartInitialLoad.test.ts src/services/orchestration/__tests__/workspaceEchoHydrateFromApi.test.ts src/api/authenticatedApiFetch.test.ts src/api/echo/transport.test.ts src/services/realtime/__tests__/echoSocketComposableEffects.test.ts src/stores/authSession.test.ts`

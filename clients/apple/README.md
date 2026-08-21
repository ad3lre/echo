# Echo for Apple platforms

This directory is the source of truth for Echo's native Apple clients. It is
intentionally independent of `clients/web/`: the Apple apps use SwiftUI and Apple
frameworks directly, and integrate with Echo through the documented backend
contracts only.

## Product direction

- **iOS first:** `EchoiOS` is the first shipping target.
- **macOS shared where it is product-neutral:** `EchoMacOS` uses the same
  domain, networking, persistence, and feature modules, but owns its own app
  entry point. Desktop parity includes Sign in with Apple, ⌘↩ send, shared
  launch wordmark, and APNs registration / attention refresh hooks.
- **Native by default:** SwiftUI, Observation, Swift Concurrency, URLSession,
  Keychain, UserNotifications, Universal Links, and Apple accessibility APIs
  are the intended foundations. No WebView or web UI shell is used.
- **Backend is the shared surface:** REST and realtime payloads are governed by
  [`docs/contracts/ECHO_CONTRACT_V1.md`](../../docs/contracts/ECHO_CONTRACT_V1.md)
  and [`docs/contracts/ECHO_CONTRACT_V2.md`](../../docs/contracts/ECHO_CONTRACT_V2.md).
  Domain rules remain server-owned; the client renders server state and sends
  user intent.

New Apple client work belongs here. The web SPA in `clients/web/` remains the
browser/PWA client; it is not embedded in these apps.

## Layout

```
clients/apple/
  Apps/                 # Thin iOS and macOS composition roots
  Modules/
    EchoDomain/         # Platform-neutral domain types
    EchoNetworking/     # Typed REST endpoints and Socket.IO realtime adapter
    EchoPersistence/    # Keychain and on-device persistence
    EchoFeatures/       # SwiftUI feature surfaces and navigation
      Sources/
        Authentication/                 # Auth state, passkeys, push, and auth UI
        Home/                           # Authenticated home and DM surface
        Profile/                        # Profile editing and account menu
        Settings/                       # Settings navigation, rows, sheets, and sounds
        Shared/                         # Cross-feature media, avatars, and welcome visuals
        EchoRootView.swift              # Root routing and session composition
  Resources/            # Per-target Info.plist, entitlements, and app icons
  Tests/                # Swift package tests for shared modules
  project.yml           # XcodeGen project definition (source of truth)
  EchoApple.xcodeproj/  # Generated, committed Xcode project
```

Feature UI stays in `Modules/EchoFeatures`; `Apps/` only wires dependencies and
selects platform presentation. Do not copy Vue stores, components, or Tauri
commands into this directory.

## Open and verify

Requirements: Xcode 26.5 or newer and [XcodeGen](https://github.com/yonaskolb/XcodeGen).

```bash
cd clients/apple
xcodegen generate
open EchoApple.xcodeproj
swift test --package-path .
npm run apple:maintainability
npm run apple:maintainability:test
xcrun swift-format format --in-place --recursive --parallel Apps Modules Tests
xcrun swift-format lint --recursive Apps Modules Tests
xcodebuild -project EchoApple.xcodeproj -scheme EchoiOS \
  -sdk iphonesimulator -configuration Debug build CODE_SIGNING_ALLOWED=NO
xcodebuild -project EchoApple.xcodeproj -scheme EchoMacOS \
  -sdk macosx -configuration Debug build CODE_SIGNING_ALLOWED=NO
```

### Maintainability gate

`npm run apple:maintainability` (also in `test:ci:guards` and format CI) enforces:

- Modules/Apps Swift files ≤ **650** LOC; Apps entry files ≤ **120**; Apps total ≤ **250**
- Tests ≤ **600** LOC per file
- `Color(red:…)` only in `EchoTheme.swift` and `EchoWelcomeScene.swift`
- Domain/Persistence/Networking stay free of Features/UIKit/SwiftUI imports
- No `print(` in Apps/Modules
- EchoFeatures raw `Text(`/`Button(`/`Label(`/`TextField(` English literals must use `EchoCopy` (theme/welcome/markdown allowlisted)
- `Localizable.xcstrings` keys must include **en** and **es** localizations

Local emergency bypass only: `ECHO_APPLE_MAINTAINABILITY_BYPASS=1`.

User-facing copy for EchoFeatures goes through `EchoCopy` +
`Modules/EchoFeatures/Resources/Localizable.xcstrings` (SPM
`defaultLocalization: "en"`, second locale **es**). Add keys to the catalog when introducing new
English UI strings. Prefer `EchoCopy.format` for interpolations.

`project.yml` is the source of truth. Regenerate the Xcode project after
editing it; do not hand-edit `project.pbxproj`.

The two app targets intentionally stay thin. API selection comes from the
`EchoAPIBaseURL` Info.plist value (`$(ECHO_API_BASE_URL)`). Debug builds talk
to `http://localhost:3000`; Release stays on `https://chat-echo.com`.
`EchoAPIConfiguration` only allows plain HTTP for loopback hosts.

Local Apple e2e (Postgres + native bearer, not the in-memory `dev:e2e` stack):

```bash
colima start          # or Docker Desktop
npm run db:up
npm run dev:core      # API on :3000
npm run apple:e2e     # REST + Socket.IO contract harness
```

Sign into the simulator with the accounts written to `clients/apple/.e2e-local.json`
(`applee2ea` / `applee2eb`, password `AppleE2e-dev-1`).

Both targets use the same canonical Echo artwork for their native app icon;
the iOS and macOS asset catalogs only differ in the platform metadata needed by
Xcode.

## First delivery slices

1. App configuration, Keychain session persistence, OAuth/Universal Link
   return handling, the native profile surface, and the first DM list slice.
2. Workspace snapshot, channel history, message send/retry, and a Socket.IO
   adapter that preserves the v1 ordering/idempotency rules.
3. Native notifications, badges, background refresh, uploads that wait for
   connectivity, and media playback using Apple frameworks.
4. Voice, accessibility, offline behavior, iPad layouts, then a macOS-specific
   interaction pass.

## Realtime (Socket.IO)

Apple uses [socket.io-client-swift](https://github.com/socketio/socket.io-client-swift)
16.1.x (SPM product `SocketIO`) as the Engine.IO / Socket.IO client. That library
speaks the same framing, acknowledgements, and reconnects as the web client.
`URLSessionWebSocketTask` is not a Socket.IO implementation and is not used here.

Handshake: path `/socket.io`, Engine.IO polling then WebSocket (library default),
Socket.IO v3 connect payload `{ token }` (server `handshake.auth.token`) plus
`Authorization: Bearer` with the native session-bound access token. Production
requires an authenticated handshake.

REST stays the source of truth for history, send, uploads, and poll votes. The
socket is the inbound live bus (`message`, `message_ack`, `poll:updated`,
`presence:update`, `channel:typing`, `dm:activity`) plus outbound `joinChannel`
/ `leaveChannel`, `channel:typing`, `presence:set` / `presence:heartbeat`, and
`client:ping` liveness (25s interval, 10s ack timeout, recycle after two misses).

The socket stays up while the scene is active and reconnects with backoff on
token refresh, path recovery, or a failed first handshake. Foregrounding
refetches the open DM after the last known message id. APNs covers the
backgrounded / killed app: alert + `aps.badge` for new DMs, mark-read when a
conversation is open, and attachment uploads that wait for connectivity. iOS
also registers a `BGAppRefresh` task to resync the unread badge when Keychain
can be read without a prompt.

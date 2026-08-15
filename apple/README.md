# Echo for Apple platforms

This directory is the source of truth for Echo's native Apple clients. It is
intentionally independent of `frontend/`: the Apple apps use SwiftUI and Apple
frameworks directly, and integrate with Echo through the documented backend
contracts only.

## Product direction

- **iOS first:** `EchoiOS` is the first shipping target.
- **macOS shared where it is product-neutral:** `EchoMacOS` uses the same
  domain, networking, persistence, and feature modules, but owns its own app
  entry point and platform-specific interaction design.
- **Native by default:** SwiftUI, Observation, Swift Concurrency, URLSession,
  Keychain, UserNotifications, Universal Links, and Apple accessibility APIs
  are the intended foundations. No WebView or web UI shell is used.
- **Backend is the shared surface:** REST and realtime payloads are governed by
  [`docs/contracts/ECHO_CONTRACT_V1.md`](../docs/contracts/ECHO_CONTRACT_V1.md)
  and [`docs/contracts/ECHO_CONTRACT_V2.md`](../docs/contracts/ECHO_CONTRACT_V2.md).
  Domain rules remain server-owned; the client renders server state and sends
  user intent.

New Apple client work belongs here. The web SPA in `frontend/` remains the
browser/PWA client; it is not embedded in these apps.

## Layout

```
apple/
  Apps/                 # Thin iOS and macOS composition roots
  Modules/
    EchoDomain/         # Platform-neutral domain types
    EchoNetworking/     # Typed REST endpoints and future realtime adapter
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
cd apple
xcodegen generate
open EchoApple.xcodeproj
swift test --package-path .
xcrun swift-format format --in-place --recursive --parallel Apps Modules Tests
xcrun swift-format lint --recursive Apps Modules Tests
xcodebuild -project EchoApple.xcodeproj -scheme EchoiOS \
  -sdk iphonesimulator -configuration Debug build CODE_SIGNING_ALLOWED=NO
xcodebuild -project EchoApple.xcodeproj -scheme EchoMacOS \
  -sdk macosx -configuration Debug build CODE_SIGNING_ALLOWED=NO
```

`project.yml` is the source of truth. Regenerate the Xcode project after
editing it; do not hand-edit `project.pbxproj`.

The two app targets intentionally stay thin. API selection comes from the
`EchoAPIBaseURL` Info.plist value and is resolved by
`EchoAPIConfiguration`, while authentication and feature state remain inside
the shared modules. This keeps environment wiring out of the UI and prevents
the Apple client from depending on frontend assets or implementation details.

Both targets use the same canonical Echo artwork for their native app icon;
the iOS and macOS asset catalogs only differ in the platform metadata needed by
Xcode.

## First delivery slices

1. App configuration, Keychain session persistence, OAuth/Universal Link
   return handling, the native profile surface, and the first DM list slice.
2. Workspace snapshot, channel history, message send/retry, and a Socket.IO
   adapter that preserves the v1 ordering/idempotency rules.
3. Native notifications, badges, background refresh, uploads with background
   `URLSession`, and media playback using Apple frameworks.
4. Voice, accessibility, offline behavior, iPad layouts, then a macOS-specific
   interaction pass.

Before implementing realtime, choose and document a maintained Swift
Socket.IO client or an Echo gateway that uses a native WebSocket protocol.
`URLSessionWebSocketTask` alone is not a Socket.IO implementation.

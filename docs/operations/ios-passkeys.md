# iOS Passkeys

Echo iOS passkeys depend on both app entitlements and the public webcredentials association file.

## App entitlement

[`clients/apple/Resources/iOS/EchoiOS.entitlements`](../../clients/apple/Resources/iOS/EchoiOS.entitlements) must include:

```xml
<key>com.apple.developer.associated-domains</key>
<array>
  <string>webcredentials:chat-echo.com</string>
  <string>applinks:chat-echo.com</string>
</array>
```

macOS uses [`clients/apple/Resources/macOS/EchoMacOS.entitlements`](../../clients/apple/Resources/macOS/EchoMacOS.entitlements) for Shared Web Credentials.

## Domain association

`https://chat-echo.com/.well-known/apple-app-site-association` must be served without redirects and with JSON content. Generated from [`clients/apple/project.yml`](../../clients/apple/project.yml) by `server/ops/scripts/generate-apple-app-site-association.mjs` during the frontend build:

```json
{
  "webcredentials": {
    "apps": ["<APPLE_TEAM_ID>.com.echo.ios", "<APPLE_TEAM_ID>.com.echo.macos"]
  }
}
```

Replace `<APPLE_TEAM_ID>` with the Apple Developer Team ID used to sign builds (e.g. `7HBQV8236H`). If a bundle identifier changes, update both `clients/apple/project.yml` and the Associated Domains capability together.

Verify locally after a frontend build: `npm run verify:aasa`. Optional live check: `ECHO_AASA_VERIFY_URL=https://chat-echo.com npm run verify:aasa`.

## Server policy

The backend passkey routes intentionally request discoverable credentials and required user verification. Registration and login verification also require user verification, so Face ID / Touch ID expectations are consistent before and after the platform prompt.

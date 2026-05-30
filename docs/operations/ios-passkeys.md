# iOS Passkeys

Echo iOS passkeys depend on both app entitlements and the public webcredentials association file.

## App entitlement

`src-tauri/gen/apple/echo-desktop_iOS/echo-desktop_iOS.entitlements` must include:

```xml
<key>com.apple.developer.associated-domains</key>
<array>
  <string>webcredentials:chat-echo.com</string>
</array>
```

## Domain association

`https://chat-echo.com/.well-known/apple-app-site-association` must be served without redirects and with JSON content. Add the signed production app identifier:

```json
{
  "webcredentials": {
    "apps": ["<APPLE_TEAM_ID>.com.echo.tauri.ios.dev"]
  }
}
```

Replace `<APPLE_TEAM_ID>` with the Apple Developer Team ID used to sign the iOS build. If the production bundle identifier changes, update both this file and the Associated Domains capability together.

## Server policy

The backend passkey routes intentionally request discoverable credentials and required user verification. Registration and login verification also require user verification, so Face ID / Touch ID expectations are consistent before and after the platform prompt.

# iOS / macOS Passkeys & Shared Web Credentials

Echo native passkeys and “you have an account here” AutoFill depend on:

1. App entitlements (`webcredentials:` + `applinks:`)
2. The public AASA file on `chat-echo.com`
3. AutoFill-assisted authorization on the sign-in form (`EchoPasskeyAutoFill`)

Safari passkeys / passwords for `chat-echo.com` are then offered when focusing username or password:

- **iOS** — AutoFill-assisted passkey + password sheet (`performAutoFillAssistedRequests` via `EchoPasskeyAutoFill`).
- **macOS** — Password AutoFill is field-driven (`textContentType` + `webcredentials:`). Passkeys use **Sign in with Passkey** (Apple does not expose AutoFill-assisted passkey requests on macOS).

## App entitlement

[`clients/apple/Resources/iOS/EchoiOS.entitlements`](../../clients/apple/Resources/iOS/EchoiOS.entitlements) (and `project.yml`) must include Sign in with Apple, APNs, and Associated Domains:

```xml
<key>com.apple.developer.applesignin</key>
<array>
  <string>Default</string>
</array>
<key>com.apple.developer.aps-environment</key>
<string>$(APS_ENVIRONMENT)</string>
<key>com.apple.developer.associated-domains</key>
<array>
  <string>webcredentials:chat-echo.com</string>
  <string>applinks:chat-echo.com</string>
</array>
```

These capabilities require a **paid** Apple Developer Program membership. macOS uses [`clients/apple/Resources/macOS/EchoMacOS.entitlements`](../../clients/apple/Resources/macOS/EchoMacOS.entitlements) (includes `?mode=developer` entries for Debug association without waiting on Apple’s CDN).

**Signing note:** Ad-hoc / unsigned Debug installs (`CODE_SIGN_IDENTITY="-"`) strip Associated Domains — AutoFill will not see the website. Use a development-team-signed build pointed at `https://chat-echo.com` (or a backend whose WebAuthn RP ID is `chat-echo.com`) to exercise the prompt.

## Sign in with Apple token revoke (account deletion)

Native login sends Apple’s one-time `authorizationCode`. When configured, the API
exchanges it for a refresh token (`auth_apple_user_links.apple_refresh_token`) and
revokes that token via `https://appleid.apple.com/auth/revoke` on `DELETE /me`
(TN3194 / App Review 5.1.1(v)).

Set all of:

- `APPLE_SIWA_KEY_ID` — Key ID for a .p8 key with **Sign in with Apple** enabled
- `APPLE_SIWA_KEY_P8` — PKCS#8 PEM (inline; `\n` escapes OK)
- `APPLE_SIWA_TEAM_ID` — optional; falls back to `APNS_TEAM_ID`
- `APPLE_SIWA_CLIENT_ID` — optional; defaults to `com.echo.ios` / `APPLE_CLIENT_IDS`

## Domain association

`https://chat-echo.com/.well-known/apple-app-site-association` must be served without redirects and with JSON content. Generated from [`clients/apple/project.yml`](../../clients/apple/project.yml) by `server/ops/scripts/generate-apple-app-site-association.mjs` during the frontend build:

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": [
          "<APPLE_TEAM_ID>.com.echo.ios",
          "<APPLE_TEAM_ID>.com.echo.macos"
        ],
        "components": [
          { "/": "/channels/*" },
          { "/": "/explore" },
          { "/": "/*" }
        ]
      }
    ]
  },
  "webcredentials": {
    "apps": ["<APPLE_TEAM_ID>.com.echo.ios", "<APPLE_TEAM_ID>.com.echo.macos"]
  }
}
```

The Apple apps route `/channels/*`, `/explore`, `/invite/*` and vanity invite slugs through `EchoDeepLinkRouter` (`onOpenURL` / `onContinueUserActivity`). Replace `<APPLE_TEAM_ID>` with the Apple Developer Team ID used to sign builds (e.g. `7HBQV8236H`). If a bundle identifier changes, update both `clients/apple/project.yml` and the Associated Domains capability together.

Verify locally after a frontend build: `bun run verify:aasa`. Optional live check: `ECHO_AASA_VERIFY_URL=https://chat-echo.com bun run verify:aasa`.

## Server policy

The backend passkey routes intentionally request discoverable credentials and required user verification. Registration and login verification also require user verification, so Face ID / Touch ID expectations are consistent before and after the platform prompt.

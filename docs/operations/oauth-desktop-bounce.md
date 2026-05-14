# Desktop OAuth handoff (Discord)

End-to-end **Discord sign-in in the system browser** for the Tauri app, without relying on a shared HttpOnly cookie between the WebView and the browser.

## Flow

1. **Start** — `POST /api/v1/auth/discord/login/start` with optional JSON `{ "desktopBrowserHandoff": true }`. The API returns an `authorizeUrl` whose OAuth `state` is a **signed blob** (`encodeDiscordLoginSignedState` in [`backend/src/domain/discordOAuthState.ts`](../../backend/src/domain/discordOAuthState.ts)).
2. **Browser** — The desktop client opens that URL with the system browser (`openExternal`). Discord redirects to **`DISCORD_OAUTH_REDIRECT_URI`** (the API callback).
3. **Callback** — `GET /api/v1/auth/discord/callback` verifies `state` via the signature (cookie optional). On success, if handoff was requested, the API stores a **one-time code** and redirects to **`ECHO_APP_PUBLIC_URL` + `/oauth-desktop-bridge.html?echo_handoff=…`** ([`discordOAuthDesktopBridgeRedirect`](../../backend/src/domain/discordOAuthRedirect.ts)).
4. **Bridge** — Static [`frontend/public/oauth-desktop-bridge.html`](../../frontend/public/oauth-desktop-bridge.html) redirects to `echo://oauth?echo_handoff=…`.
5. **App** — [`desktopDeepLink.ts`](../../frontend/src/platform/desktopDeepLink.ts) / [`main.ts`](../../frontend/src/main.ts) pick up `echo_handoff`, call **`POST /api/v1/auth/desktop/redeem-handoff`** with `{ "code" }`, and establish the normal browser session in the WebView ([`authDesktopRedeemHandoff`](../../frontend/src/api/authClient.ts)).

## Operations

- **`ECHO_APP_PUBLIC_URL`** must point at the same origin that serves the built SPA (so `/oauth-desktop-bridge.html` is reachable).
- **Google** sign-in does not yet use this handoff path (same pattern can be added later).

## Related

- [tauri-phase2.md](tauri-phase2.md) — Phase 2 roadmap.
- [desktop-windows.md](desktop-windows.md) — Windows desktop notes.

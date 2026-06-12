# Desktop OAuth handoff (Discord & Google)

End-to-end **OAuth sign-in in the system browser** for the Tauri app, without relying on a shared HttpOnly cookie between the WebView and the browser.

## Flow

1. **Start** — `POST /api/v1/auth/discord/login/start` or `POST /api/v1/auth/google/login/start` with optional JSON `{ "desktopBrowserHandoff": true }` (Tauri also uses CORS-simple form/query POSTs — see [client auth invariants](../infra/auth/OPTION_A_SESSION_ARCHITECTURE.md#client-auth-invariants-frontend-contract)). The API returns an `authorizeUrl` whose OAuth `state` is a **signed blob** (Discord: [`encodeDiscordLoginSignedState`](../../backend/src/domain/discordOAuthState.ts); Google: parallel signed-state path).
2. **Browser** — The desktop client opens that URL with the system browser (`openExternal`). The provider redirects to the configured API callback.
3. **Callback** — The provider callback verifies `state` via signature (cookie optional). On success, if handoff was requested, the API stores a **one-time code** and redirects to **`ECHO_APP_PUBLIC_URL` + `/oauth-desktop-bridge.html?echo_handoff=…`** ([`discordOAuthDesktopBridgeRedirect`](../../backend/src/domain/discordOAuthRedirect.ts) and the Google equivalent).
4. **Bridge** — Static [`frontend/public/oauth-desktop-bridge.html`](../../frontend/public/oauth-desktop-bridge.html) redirects to `echo://oauth?echo_handoff=…`.
5. **App** — [`desktopDeepLink.ts`](../../frontend/src/platform/desktopDeepLink.ts) / [`main.ts`](../../frontend/src/main.ts) pick up `echo_handoff`, call **`POST /api/v1/auth/desktop/redeem-handoff`** with `{ "code" }` (CORS-simple on Tauri), and establish the normal browser session in the WebView ([`authDesktopRedeemHandoff`](../../frontend/src/api/authClient.ts)).

## Operations

- **`ECHO_APP_PUBLIC_URL`** must point at the same origin that serves the built SPA (so `/oauth-desktop-bridge.html` is reachable).
- **Session rotation:** after handoff redeem, the socket and fetch layers must recycle on `authStateGeneration` — see [client auth invariants](../infra/auth/OPTION_A_SESSION_ARCHITECTURE.md#client-auth-invariants-frontend-contract).
- Desktop shell entry point is [`src-tauri/src/lib.rs`](../../src-tauri/src/lib.rs) (thin [`main.rs`](../../src-tauri/src/main.rs) calls `echo_desktop_lib::run()`).

## Related

- [tauri-phase2.md](tauri-phase2.md) — Phase 2 roadmap.
- [desktop-windows.md](desktop-windows.md) — Windows desktop notes.

/** Default timeouts (ms) for outbound HTTP from the API process. */

export const GIPHY_FETCH_MS = 15_000;
export const SERPER_FETCH_MS = 15_000;
export const TELNYX_SMS_FETCH_MS = 25_000;
export const TURNSTILE_VERIFY_MS = 12_000;
/** Discord/Google OAuth token, userinfo, and JWKS fetches. */
export const OAUTH_UPSTREAM_FETCH_MS = 15_000;
export const DISCORD_BOT_INTERNAL_FETCH_MS = 60_000;
export const YOUTUBE_SEARCH_FETCH_MS = 12_000;
/** Honcho conversational memory API (`@honcho-ai/sdk`). */
export const HONCHO_FETCH_MS = 30_000;

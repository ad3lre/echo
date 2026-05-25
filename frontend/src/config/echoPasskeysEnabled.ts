/**
 * WebAuthn passkeys are always enabled in the Echo UI (login, welcome gate,
 * account settings). The backend registers passkey routes unconditionally;
 * actual availability depends on the backend running with Postgres storage
 * (the API returns 503 if not).
 */
export const ECHO_PASSKEYS_ENABLED = true;

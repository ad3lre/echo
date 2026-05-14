function parseEnvBool(v: unknown): boolean {
  if (v === true) return true;
  if (v === false || v == null) return false;
  const s = String(v).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(s);
}

/**
 * WebAuthn passkeys in the Echo UI (login, welcome gate, account settings).
 * **Off by default.** Set `VITE_ECHO_PASSKEYS_ENABLED=1` at build time to enable.
 * Must match the backend (`ECHO_PASSKEYS_ENABLED`) or passkey API calls will fail.
 */
export const ECHO_PASSKEYS_ENABLED = parseEnvBool(
  import.meta.env.VITE_ECHO_PASSKEYS_ENABLED,
);

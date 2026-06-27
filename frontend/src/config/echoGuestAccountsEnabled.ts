function parseEnvBool(v: unknown): boolean {
  if (v === true) return true;
  if (v === false || v == null) return false;
  const s = String(v).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(s);
}

/**
 * Slack-style guest mint / auto-guest on first load.
 * **Off by default.** Set `VITE_ECHO_GUEST_ACCOUNTS_ENABLED=1` at build time, enable
 * `guest.enabled` in `echo.instance.json`, or rely on runtime
 * `GET /api/v1/system/instance-policy` (see `echoGuestAccountsRuntime.ts`).
 */
export const ECHO_GUEST_ACCOUNTS_ENABLED = parseEnvBool(
  import.meta.env.VITE_ECHO_GUEST_ACCOUNTS_ENABLED,
);

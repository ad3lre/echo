/**
 * Sign in with Apple REST token exchange / revoke env
 * (`APPLE_SIWA_*`; team id falls back to `APNS_TEAM_ID`).
 */
export type AppleSiwaConfigSlice = {
  readonly appleSiwaKeyId: string | null;
  readonly appleSiwaTeamId: string | null;
  readonly appleSiwaKeyP8: string | null;
  readonly appleSiwaClientId: string | null;
};

/** Normalize env-inline PEM (supports `\n` escapes). */
export function normalizeInlinePem(raw: string | undefined): string | null {
  const inline = raw?.trim();
  if (!inline) return null;
  return inline.replace(/\\n/g, '\n');
}

export function resolveAppleSiwaConfig(): AppleSiwaConfigSlice {
  return {
    appleSiwaKeyId: process.env.APPLE_SIWA_KEY_ID?.trim() || null,
    appleSiwaTeamId:
      process.env.APPLE_SIWA_TEAM_ID?.trim() ||
      process.env.APNS_TEAM_ID?.trim() ||
      null,
    appleSiwaKeyP8: normalizeInlinePem(process.env.APPLE_SIWA_KEY_P8),
    appleSiwaClientId: process.env.APPLE_SIWA_CLIENT_ID?.trim() || null,
  };
}

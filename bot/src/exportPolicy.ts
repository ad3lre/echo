/** Env-driven policy for unattended (GuildCreate) exports and invite code export. */
type Env = Record<string, string | undefined>;

export function parseGuildAllowlist(env: Env = process.env): Set<string> {
  return new Set(
    (env.ECHO_DISCORD_EXPORT_GUILD_ALLOWLIST ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** Auto-export on GuildCreate only for allowlisted guilds, or when explicitly opted in for all. */
export function shouldAutoExportGuild(
  guildId: string,
  env: Env = process.env,
): boolean {
  if (env.ECHO_DISCORD_AUTO_EXPORT_ALL?.trim() === '1') return true;
  return parseGuildAllowlist(env).has(guildId);
}

export function shouldExportInviteCodes(env: Env = process.env): boolean {
  return env.ECHO_DISCORD_EXPORT_INVITE_CODES?.trim() === '1';
}

/** Drops the `code` / `url` fields (invite codes are bearer secrets) unless opted in. */
export function sanitizeInviteJson(
  invite: Record<string, unknown>,
  env: Env = process.env,
): Record<string, unknown> {
  if (shouldExportInviteCodes(env)) return invite;
  const { code: _code, url: _url, ...rest } = invite;
  return rest;
}

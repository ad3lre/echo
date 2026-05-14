import 'dotenv/config';

export type CliFlags = {
  outDir: string;
  includeInvites: boolean;
  includeWebhooks: boolean;
  includeScheduledEvents: boolean;
  includeAutoMod: boolean;
  includeOverwritesJsonl: boolean;
  computeEffectivePermissions: boolean;
  effectiveMemberLimit: number;
  effectiveChannelLimit: number;
  /** Default false: keep voice `bitrate` in channels.json for Echo `bitrate_bps`. */
  stripVoiceBitrate: boolean;
  /** Fail export when Echo-core completeness checks fail. */
  strict: boolean;
  /** With `--serve`, export all cached guilds once on ready (sequential, delayed). */
  serveBootstrap: boolean;
};

export function loadEnvGuildId(): string | undefined {
  const v = process.env.DISCORD_GUILD_ID?.trim();
  return v || undefined;
}

export function loadEnvToken(): string | undefined {
  const v = process.env.DISCORD_BOT_TOKEN?.trim();
  return v || undefined;
}

export function loadExportBaseDir(): string {
  const v = process.env.EXPORT_BASE_DIR?.trim();
  if (v) return v;
  return 'exports';
}

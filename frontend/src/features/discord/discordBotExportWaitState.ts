export const DISCORD_BOT_WAIT_STORAGE_KEY = 'echo_discord_bot_wait_v1';
export const DISCORD_BOT_BG_WAIT_MAX_MS = 24 * 60 * 60 * 1000;

export type DiscordBotExportWaitState = {
  guildId: string;
  guildName: string;
  startedAt?: number;
};

function getSessionStorage(): Storage | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage;
}

export function parseDiscordBotExportWaitState(
  raw: string | null | undefined,
): DiscordBotExportWaitState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      guildId?: unknown;
      guildName?: unknown;
      startedAt?: unknown;
    };
    if (typeof parsed.guildId !== 'string' || !parsed.guildId.trim()) {
      return null;
    }
    return {
      guildId: parsed.guildId,
      guildName:
        typeof parsed.guildName === 'string' && parsed.guildName.trim()
          ? parsed.guildName
          : 'Discord server',
      startedAt:
        typeof parsed.startedAt === 'number' && parsed.startedAt > 0
          ? parsed.startedAt
          : undefined,
    };
  } catch {
    return null;
  }
}

export function readDiscordBotExportWaitState(): DiscordBotExportWaitState | null {
  return parseDiscordBotExportWaitState(
    getSessionStorage()?.getItem(DISCORD_BOT_WAIT_STORAGE_KEY),
  );
}

export function writeDiscordBotExportWaitState(
  wait: DiscordBotExportWaitState,
): void {
  try {
    getSessionStorage()?.setItem(
      DISCORD_BOT_WAIT_STORAGE_KEY,
      JSON.stringify(wait),
    );
  } catch {
    /* ignore */
  }
}

export function clearDiscordBotExportWaitState(): void {
  try {
    getSessionStorage()?.removeItem(DISCORD_BOT_WAIT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function ensureDiscordBotExportWaitStartedAt(
  wait: DiscordBotExportWaitState,
  now = Date.now(),
): DiscordBotExportWaitState {
  if (wait.startedAt != null && wait.startedAt > 0) return wait;
  return { ...wait, startedAt: now };
}

export function isDiscordBotExportWaitExpired(
  wait: DiscordBotExportWaitState,
  maxAgeMs: number,
  now = Date.now(),
): boolean {
  const startedAt = wait.startedAt;
  if (startedAt == null || startedAt <= 0) return false;
  return now - startedAt > maxAgeMs;
}

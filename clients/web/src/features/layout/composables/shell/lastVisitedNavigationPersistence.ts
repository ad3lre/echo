const LAST_VISITED_GUILD_STORAGE_KEY = 'echo-last-visited-guild-v1';
export const LAST_VISITED_SERVER_CHANNEL_STORAGE_KEY =
  'echo-last-visited-server-channel-v1';

const ECHO_SERVER_ID = 'echo';

export function readLastVisitedGuildId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LAST_VISITED_GUILD_STORAGE_KEY)?.trim();
    if (!raw || raw === ECHO_SERVER_ID) return null;
    return raw;
  } catch {
    return null;
  }
}

export function writeLastVisitedGuildId(serverId: string | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (!serverId || serverId === ECHO_SERVER_ID) return;
    localStorage.setItem(LAST_VISITED_GUILD_STORAGE_KEY, serverId);
  } catch {
    /* ignore quota / private mode */
  }
}

export function readLastVisitedServerChannelMap(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LAST_VISITED_SERVER_CHANNEL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [serverId, channelId] of Object.entries(parsed)) {
      if (
        typeof serverId === 'string' &&
        serverId.trim() &&
        typeof channelId === 'string' &&
        channelId.trim()
      ) {
        out[serverId.trim()] = channelId.trim();
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function writeLastVisitedServerChannelMap(
  map: Record<string, string>,
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      LAST_VISITED_SERVER_CHANNEL_STORAGE_KEY,
      JSON.stringify(map),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

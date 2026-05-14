import type pg from 'pg';
import { discordUserCanImportFromGuild } from '../domain/discordImportableGuilds';
import { getDiscordUserAccessTokenForApi } from '../domain/discordUserAccessToken';
import {
  fetchDiscordUserGuildsAll,
  type DiscordUserGuildApi,
} from './integrations/discordApiClient';

type DiscordImportAuthorizationDeps = {
  getDiscordUserAccessTokenForApi?: typeof getDiscordUserAccessTokenForApi;
  fetchDiscordUserGuildsAll?: typeof fetchDiscordUserGuildsAll;
};

export class DiscordImportAuthorizationError extends Error {
  readonly statusCode: number;
  readonly errorCode: string;
  readonly publicMessage: string;

  constructor(
    statusCode: number,
    errorCode: string,
    publicMessage: string,
    cause?: unknown,
  ) {
    super(publicMessage);
    this.name = 'DiscordImportAuthorizationError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.publicMessage = publicMessage;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

function normalizeDiscordGuildId(raw: string): string | null {
  const s = raw.trim();
  return /^\d{10,25}$/.test(s) ? s : null;
}

export function findImportableDiscordGuild(
  guilds: readonly DiscordUserGuildApi[],
  discordGuildId: string,
): DiscordUserGuildApi | null {
  const gid = normalizeDiscordGuildId(discordGuildId);
  if (!gid) return null;
  const match = guilds.find((g) => g.id === gid);
  if (!match || !discordUserCanImportFromGuild(match)) return null;
  return match;
}

export async function requireDiscordImportableGuildForUser(
  pool: pg.Pool,
  userId: string,
  discordGuildId: string,
  deps: DiscordImportAuthorizationDeps = {},
): Promise<DiscordUserGuildApi> {
  const gid = normalizeDiscordGuildId(discordGuildId);
  if (!gid) {
    throw new DiscordImportAuthorizationError(
      400,
      'INVALID_GUILD_ID',
      'Invalid Discord server id.',
    );
  }

  const getAccessToken =
    deps.getDiscordUserAccessTokenForApi ?? getDiscordUserAccessTokenForApi;
  const fetchGuilds =
    deps.fetchDiscordUserGuildsAll ?? fetchDiscordUserGuildsAll;

  let accessToken: string;
  try {
    accessToken = await getAccessToken(pool, userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'NOT_LINKED') {
      throw new DiscordImportAuthorizationError(
        403,
        'FORBIDDEN',
        'Discord is not linked.',
        e,
      );
    }
    if (msg === 'TOKEN_EXPIRED' || msg.startsWith('discord_refresh_failed')) {
      throw new DiscordImportAuthorizationError(
        401,
        'DISCORD_TOKEN_EXPIRED',
        'Reconnect Discord in Settings.',
        e,
      );
    }
    throw new DiscordImportAuthorizationError(
      502,
      'DISCORD_UNAVAILABLE',
      'Could not verify your Discord access.',
      e,
    );
  }

  let guilds: DiscordUserGuildApi[];
  try {
    guilds = await fetchGuilds(accessToken);
  } catch (e) {
    throw new DiscordImportAuthorizationError(
      502,
      'DISCORD_UNAVAILABLE',
      'Could not load your Discord servers.',
      e,
    );
  }

  const guild = findImportableDiscordGuild(guilds, gid);
  if (!guild) {
    throw new DiscordImportAuthorizationError(
      403,
      'FORBIDDEN',
      'You cannot import this server.',
    );
  }

  return guild;
}

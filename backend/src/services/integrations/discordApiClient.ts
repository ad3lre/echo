import { OAUTH_UPSTREAM_FETCH_MS } from '../../constants/outboundHttp';
import { config } from '../../config';

const DISCORD_API = 'https://discord.com/api/v10';

/**
 * True if the bot token can access this guild (bot is a member). False on 404 or error.
 * @see https://discord.com/developers/docs/resources/guild#get-guild
 */
export async function discordBotIsMemberOfGuild(
  botToken: string,
  guildId: string,
  fetchImpl: FetchLike = fetch,
): Promise<boolean> {
  const token = botToken.trim();
  if (!token || !guildId.trim()) return false;
  const res = await fetchImpl(
    `${DISCORD_API}/guilds/${encodeURIComponent(guildId.trim())}`,
    {
      headers: { Authorization: `Bot ${token}` },
    },
  );
  return res.status === 200;
}

/** Guild name for UI labels (bot must be in guild). */
export async function discordBotFetchGuildName(
  botToken: string,
  guildId: string,
  fetchImpl: FetchLike = fetch,
): Promise<string | null> {
  const token = botToken.trim();
  if (!token || !guildId.trim()) return null;
  const res = await fetchImpl(
    `${DISCORD_API}/guilds/${encodeURIComponent(guildId.trim())}?with_counts=false`,
    { headers: { Authorization: `Bot ${token}` } },
  );
  if (!res.ok) return null;
  const j = (await res.json()) as { name?: string };
  return typeof j.name === 'string' ? j.name : null;
}

export type DiscordGuildChannelApi = {
  id: string;
  name: string;
  type: number;
  position?: number;
  parent_id?: string | null;
};

/**
 * @see https://discord.com/developers/docs/resources/guild#get-guild-channels
 */
export async function discordBotFetchGuildChannels(
  botToken: string,
  guildId: string,
  fetchImpl: FetchLike = fetch,
): Promise<DiscordGuildChannelApi[]> {
  const token = botToken.trim();
  if (!token || !guildId.trim()) return [];
  const res = await fetchImpl(
    `${DISCORD_API}/guilds/${encodeURIComponent(guildId.trim())}/channels`,
    { headers: { Authorization: `Bot ${token}` } },
  );
  if (!res.ok) return [];
  const arr = (await res.json()) as unknown;
  return Array.isArray(arr) ? (arr as DiscordGuildChannelApi[]) : [];
}

export type DiscordWebhookApi = {
  id: string;
  name: string | null;
  url?: string;
};

/**
 * @see https://discord.com/developers/docs/resources/webhook#get-channel-webhooks
 */
export async function discordBotListChannelWebhooks(
  botToken: string,
  channelId: string,
  fetchImpl: FetchLike = fetch,
): Promise<DiscordWebhookApi[]> {
  const token = botToken.trim();
  if (!token || !channelId.trim()) return [];
  const res = await fetchImpl(
    `${DISCORD_API}/channels/${encodeURIComponent(channelId.trim())}/webhooks`,
    { headers: { Authorization: `Bot ${token}` } },
  );
  if (!res.ok) return [];
  const arr = (await res.json()) as unknown;
  return Array.isArray(arr) ? (arr as DiscordWebhookApi[]) : [];
}

/**
 * @see https://discord.com/developers/docs/resources/webhook#create-webhook
 */
export async function discordBotCreateWebhook(
  botToken: string,
  channelId: string,
  name: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ id: string; url: string } | null> {
  const token = botToken.trim();
  if (!token || !channelId.trim()) return null;
  const safeName = name.trim().slice(0, 80) || 'Echo bridge';
  const res = await fetchImpl(
    `${DISCORD_API}/channels/${encodeURIComponent(channelId.trim())}/webhooks`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: safeName }),
    },
  );
  if (!res.ok) return null;
  const j = (await res.json()) as { id?: string; url?: string };
  if (typeof j.url === 'string' && j.url.startsWith('https://')) {
    return { id: String(j.id ?? ''), url: j.url };
  }
  return null;
}

export type DiscordTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
};

export type FetchLike = typeof fetch;

function oauthFetchInit(init?: RequestInit): RequestInit {
  return {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(OAUTH_UPSTREAM_FETCH_MS),
  };
}

export async function exchangeDiscordOAuthCode(
  code: string,
  redirectUri: string,
  codeVerifier: string | undefined,
  fetchImpl: FetchLike = fetch,
): Promise<DiscordTokenResponse> {
  const body = new URLSearchParams({
    client_id: config.discordOauthClientId,
    client_secret: config.discordOauthClientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
  if (codeVerifier?.trim()) {
    body.set('code_verifier', codeVerifier.trim());
  }
  const res = await fetchImpl(
    'https://discord.com/api/oauth2/token',
    oauthFetchInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }),
  );
  const data = (await res.json()) as DiscordTokenResponse & { error?: string };
  if (!res.ok) {
    throw new Error(
      `discord_token_exchange_failed:${data?.error ?? res.status}`,
    );
  }
  if (!data.access_token) throw new Error('discord_token_missing');
  return data;
}

export async function fetchDiscordMe(
  accessToken: string,
  fetchImpl: FetchLike = fetch,
) {
  const res = await fetchImpl(
    `${DISCORD_API}/users/@me`,
    oauthFetchInit({
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  );
  if (!res.ok) throw new Error(`discord_me_failed:${res.status}`);
  return (await res.json()) as import('../../domain/discordNormalized').DiscordMeApi;
}

export type DiscordUserGuildApi = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  /** Bitfield string per Discord API */
  permissions: string;
};

export async function fetchDiscordGuildCount(
  accessToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<number | null> {
  try {
    const res = await fetchImpl(`${DISCORD_API}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const arr = (await res.json()) as unknown;
    return Array.isArray(arr) ? arr.length : null;
  } catch {
    return null;
  }
}

/** Paginated GET /users/@me/guilds (requires `guilds` OAuth scope). */
export async function fetchDiscordUserGuildsAll(
  accessToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<DiscordUserGuildApi[]> {
  const out: DiscordUserGuildApi[] = [];
  let after: string | undefined;
  for (;;) {
    const u = new URL(`${DISCORD_API}/users/@me/guilds`);
    u.searchParams.set('limit', '200');
    if (after) u.searchParams.set('after', after);
    const res = await fetchImpl(u.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const err = new Error(`discord_guilds_failed:${res.status}`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    const batch = (await res.json()) as DiscordUserGuildApi[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    after = batch[batch.length - 1]!.id;
    if (batch.length < 200) break;
  }
  return out;
}

export async function refreshDiscordOAuthToken(
  refreshToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<DiscordTokenResponse> {
  const body = new URLSearchParams({
    client_id: config.discordOauthClientId,
    client_secret: config.discordOauthClientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const res = await fetchImpl(
    'https://discord.com/api/oauth2/token',
    oauthFetchInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }),
  );
  const data = (await res.json()) as DiscordTokenResponse & { error?: string };
  if (!res.ok) {
    throw new Error(`discord_refresh_failed:${data?.error ?? res.status}`);
  }
  if (!data.access_token) throw new Error('discord_refresh_missing_token');
  return data;
}

export async function fetchDiscordConnectionsCount(
  accessToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<number | null> {
  try {
    const res = await fetchImpl(`${DISCORD_API}/users/@me/connections`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const arr = (await res.json()) as unknown;
    return Array.isArray(arr) ? arr.length : null;
  } catch {
    return null;
  }
}

export function buildDiscordAuthorizeUrl(state: string): string {
  const u = new URL('https://discord.com/api/oauth2/authorize');
  u.searchParams.set('client_id', config.discordOauthClientId);
  u.searchParams.set('redirect_uri', config.discordOauthRedirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set(
    'scope',
    config.discordOauthScopes.replace(/\s+/g, ' ').trim(),
  );
  u.searchParams.set('state', state);
  return u.toString();
}

export function buildDiscordAuthorizeUrlWithPkce(
  state: string,
  codeChallenge: string,
): string {
  const u = new URL(buildDiscordAuthorizeUrl(state));
  u.searchParams.set('code_challenge', codeChallenge.trim());
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

import { API_BASE } from '@/config';
import type { ApiErrorBody } from '@shared/types/api';
import { authenticatedApiFetch } from '@/api/authenticatedApiFetch';
import { AuthApiError, echoAuthLogRequestFailure } from '@/api/authClient';
import { echoCsrfHeaders } from '@/features/layout/ids/echoCsrf';

const API_ROOT = `${API_BASE.replace(/\/$/, '')}/api/v1`;

function assertNetworkAllowed(): void {}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function throwIfError(res: Response, data: unknown, operation: string): void {
  if (res.ok) return;
  echoAuthLogRequestFailure(operation, res, data);
  const body = data as ApiErrorBody;
  throw new AuthApiError(res.status, {
    code: typeof body?.code === 'string' ? body.code : 'UNKNOWN',
    message: typeof body?.message === 'string' ? body.message : res.statusText,
    ...(typeof body?.detail === 'string' ? { detail: body.detail } : {}),
  });
}

export type MeDiscordLinkedProfile = {
  discordUserId: string;
  username: string;
  globalName: string | null;
  bio?: string | null;
  avatarUrl: string | null;
  /** Profile banner image URL (Discord CDN); omitted on older API responses. */
  bannerUrl?: string | null;
  emailPresent: boolean;
  premiumType: number | null;
  guildCount: number | null;
  connectionsCount: number | null;
};

export type MeDiscordResponse =
  | { linked: false }
  | {
      linked: true;
      mergeKind: 'full' | 'partial';
      profile: MeDiscordLinkedProfile;
    };

export async function fetchMeDiscord(): Promise<MeDiscordResponse> {
  assertNetworkAllowed();
  const res = await authenticatedApiFetch(`${API_ROOT}/me/discord`, {
    method: 'GET',
  });
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'GET /api/v1/me/discord');
  return data as MeDiscordResponse;
}

export type MeGoogleLinkedProfile = {
  googleSub: string;
  name: string | null;
  picture: string | null;
  emailPresent: boolean;
};

export type MeGoogleResponse =
  | { linked: false; configured?: boolean; oauthRedirectUri?: string | null }
  | {
      linked: true;
      configured?: boolean;
      oauthRedirectUri?: string | null;
      mergeKind: 'full' | 'partial';
      profile: MeGoogleLinkedProfile;
    };

export async function fetchMeGoogle(): Promise<MeGoogleResponse> {
  assertNetworkAllowed();
  const res = await authenticatedApiFetch(`${API_ROOT}/me/google`, {
    method: 'GET',
  });
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'GET /api/v1/me/google');
  return data as MeGoogleResponse;
}

export async function disconnectMeGoogle(): Promise<void> {
  assertNetworkAllowed();
  const res = await authenticatedApiFetch(`${API_ROOT}/me/google`, {
    method: 'DELETE',
    headers: echoCsrfHeaders(),
  });
  if (res.status === 204) return;
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'DELETE /api/v1/me/google');
}

export type DiscordImportableGuildDto = {
  id: string;
  name: string;
  iconUrl: string | null;
  botInviteUrl: string;
};

export type FetchDiscordImportableGuildsResult =
  | { linked: false; guilds: [] }
  | {
      linked: true;
      guilds: DiscordImportableGuildDto[];
      tokenExpired?: boolean;
      missingGuildsScope?: boolean;
    };

export async function fetchDiscordImportableGuilds(): Promise<FetchDiscordImportableGuildsResult> {
  assertNetworkAllowed();
  const res = await authenticatedApiFetch(
    `${API_ROOT}/me/discord/importable-guilds`,
    {
      method: 'GET',
    },
  );
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'GET /api/v1/me/discord/importable-guilds');
  const linked = data.linked === true;
  if (!linked) {
    return { linked: false, guilds: [] };
  }
  const guildsRaw = data.guilds;
  const guilds: DiscordImportableGuildDto[] = Array.isArray(guildsRaw)
    ? guildsRaw
        .map((g) => {
          if (!g || typeof g !== 'object') return null;
          const o = g as Record<string, unknown>;
          const id = typeof o.id === 'string' ? o.id : '';
          const name = typeof o.name === 'string' ? o.name : '';
          const botInviteUrl =
            typeof o.botInviteUrl === 'string' ? o.botInviteUrl : '';
          const iconUrl =
            o.iconUrl === null || typeof o.iconUrl === 'string'
              ? o.iconUrl
              : null;
          if (!id || !name) return null;
          return { id, name, iconUrl, botInviteUrl };
        })
        .filter((x): x is DiscordImportableGuildDto => x != null)
    : [];
  return {
    linked: true,
    guilds,
    ...(data.tokenExpired === true ? { tokenExpired: true as const } : {}),
    ...(data.missingGuildsScope === true
      ? { missingGuildsScope: true as const }
      : {}),
  };
}

export type DiscordBotExportPendingRow = {
  discordGuildId: string;
  guildName: string;
  ready: boolean;
  updatedAt: string;
};

export async function fetchDiscordBotInGuild(discordGuildId: string): Promise<{
  botInGuild: boolean;
  checkSkipped: boolean;
}> {
  assertNetworkAllowed();
  const res = await authenticatedApiFetch(
    `${API_ROOT}/me/discord/bot-in-guild?${new URLSearchParams({ discordGuildId })}`,
    { method: 'GET' },
  );
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'GET /api/v1/me/discord/bot-in-guild');
  return {
    botInGuild: data.botInGuild === true,
    checkSkipped: data.checkSkipped === true,
  };
}

export async function postDiscordBotExportPending(
  discordGuildId: string,
  guildName: string,
): Promise<void> {
  assertNetworkAllowed();
  const res = await authenticatedApiFetch(
    `${API_ROOT}/me/discord/bot-export-pending`,
    {
      method: 'POST',
      headers: { ...echoCsrfHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ discordGuildId, guildName }),
    },
  );
  if (res.status === 204) return;
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'POST /api/v1/me/discord/bot-export-pending');
}

export async function fetchDiscordBotExportPending(): Promise<{
  pending: DiscordBotExportPendingRow[];
}> {
  assertNetworkAllowed();
  const res = await authenticatedApiFetch(
    `${API_ROOT}/me/discord/bot-export-pending`,
    {
      method: 'GET',
    },
  );
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'GET /api/v1/me/discord/bot-export-pending');
  const raw = data.pending;
  const pending: DiscordBotExportPendingRow[] = Array.isArray(raw)
    ? raw
        .map((row) => {
          if (!row || typeof row !== 'object') return null;
          const o = row as Record<string, unknown>;
          const discordGuildId =
            typeof o.discordGuildId === 'string' ? o.discordGuildId : '';
          const guildName = typeof o.guildName === 'string' ? o.guildName : '';
          const updatedAt = typeof o.updatedAt === 'string' ? o.updatedAt : '';
          const ready = o.ready === true;
          if (!discordGuildId) return null;
          return { discordGuildId, guildName, ready, updatedAt };
        })
        .filter((x): x is DiscordBotExportPendingRow => x != null)
    : [];
  return { pending };
}

import { echoFetch } from './transport';
import type { EchoDiscordImportState } from './types';

export async function fetchEchoDiscordImportState(
  token: string,
  serverId: string,
): Promise<{ state: EchoDiscordImportState | null }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/discord-import`,
  );
}

export async function postEchoDiscordImportStep(
  token: string,
  serverId: string,
  step: 'metadata' | 'roles' | 'members' | 'channels',
  opts?: { force?: boolean },
): Promise<{ state: EchoDiscordImportState; nextChannelId?: string }> {
  const body: Record<string, unknown> = { step };
  if (opts?.force === true) body.force = true;
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/discord-import`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export async function postEchoDiscordImportBind(
  token: string,
  serverId: string,
  discordGuildId: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/discord-import/bind`,
    {
      method: 'POST',
      body: JSON.stringify({ discordGuildId }),
    },
  );
}

/** Bind (when `discordGuildId` set) + metadata, roles, and channels in one request. */
export async function postEchoDiscordImportRunFull(
  token: string,
  serverId: string,
  opts?: { discordGuildId?: string },
): Promise<{ state: EchoDiscordImportState; nextChannelId?: string }> {
  const body: Record<string, unknown> = {};
  const gid = opts?.discordGuildId?.trim();
  if (gid) body.discordGuildId = gid;
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/discord-import/run-full`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

/** Re-apply branding + emoji pack and replace channels from the latest on-disk export bundle. */
export async function postEchoDiscordImportRefreshFromExport(
  token: string,
  serverId: string,
): Promise<{ state: EchoDiscordImportState; nextChannelId?: string }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/discord-import/refresh-from-export`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export async function postEchoDiscordImportMessages(
  token: string,
  serverId: string,
  channelId: string,
  opts?: { limit?: number },
): Promise<{ importedCount: number }> {
  const body: Record<string, unknown> = {};
  if (opts?.limit) body.limit = opts.limit;
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/discord-import-messages`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

/** Batch-import Discord messages for a forum and all of its post threads. */
export async function postEchoDiscordForumImportMessages(
  token: string,
  serverId: string,
  forumChannelId: string,
  opts?: { limit?: number },
): Promise<{
  forumChannelId: string;
  totalImportedMessages: number;
  channels: Array<{
    channelId: string;
    status: string;
    importedCount?: number;
    reason?: string;
    message?: string;
  }>;
}> {
  const body: Record<string, unknown> = {};
  if (opts?.limit != null) body.limit = opts.limit;
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/forums/${encodeURIComponent(forumChannelId)}/discord-import-messages`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

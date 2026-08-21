import { echoFetch } from './transport';

export type EchoDiscordBridgeState = {
  discordGuildId?: string;
  discordChannelId: string;
  inboundEnabled: boolean;
  outboundEnabled: boolean;
  /** GET returns bridgeConfigured; PUT may still return hasWebhook/hasBridge. */
  bridgeConfigured?: boolean;
  hasWebhook?: boolean;
  hasBridge?: boolean;
};

export type EchoDiscordBridgeGuildOption = {
  id: string;
  name: string;
  iconUrl: string | null;
  botInGuild: boolean;
  botInviteUrl: string;
};

export type EchoDiscordBridgeGuildsResponse =
  | {
      linked: false;
      tokenExpired?: boolean;
      missingGuildsScope?: boolean;
      botConfigured: boolean;
      guilds: readonly [];
    }
  | {
      linked: true;
      tokenExpired: boolean;
      missingGuildsScope: boolean;
      botConfigured: boolean;
      guilds: EchoDiscordBridgeGuildOption[];
    };

export type EchoDiscordBridgeChannelOption = {
  id: string;
  name: string;
  type: number;
  categoryName: string | null;
};

export async function getEchoDiscordBridge(
  token: string,
  serverId: string,
  channelId: string,
): Promise<EchoDiscordBridgeState> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/discord-bridge`,
  );
}

export async function putEchoDiscordBridge(
  token: string,
  serverId: string,
  channelId: string,
  body: {
    inboundEnabled: boolean;
    outboundEnabled: boolean;
    discordWebhookUrl?: string | null;
    discordGuildId?: string;
    discordChannelId?: string;
  },
): Promise<EchoDiscordBridgeState> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/discord-bridge`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
  );
}

export async function deleteEchoDiscordBridge(
  token: string,
  serverId: string,
  channelId: string,
): Promise<EchoDiscordBridgeState> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/discord-bridge`,
    {
      method: 'DELETE',
    },
  );
}

export async function getEchoDiscordBridgeGuilds(
  token: string,
  serverId: string,
  channelId: string,
): Promise<EchoDiscordBridgeGuildsResponse> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/discord-bridge/discord-guilds`,
  );
}

export async function getEchoDiscordBridgeChannels(
  token: string,
  serverId: string,
  channelId: string,
  discordGuildId: string,
): Promise<{ channels: EchoDiscordBridgeChannelOption[] }> {
  const q = new URLSearchParams({ discordGuildId });
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/discord-bridge/discord-channels?${q.toString()}`,
  );
}

export type EchoDiscordBridgeCategoryBulkResult = {
  applied: number;
  failed: number;
  skipped: number;
  failures: { channelId: string; message: string }[];
};

/** Apply the same bridge toggles to all text/forum channels in a category. */
export async function postEchoDiscordBridgeCategoryBulkApply(
  token: string,
  serverId: string,
  categoryId: string,
  body: { inboundEnabled: boolean; outboundEnabled: boolean },
): Promise<EchoDiscordBridgeCategoryBulkResult> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/categories/${encodeURIComponent(categoryId)}/discord-bridge/bulk-apply`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

/** Remove Discord bridge rows for every text/forum channel in a category. */
export async function postEchoDiscordBridgeCategoryBulkClear(
  token: string,
  serverId: string,
  categoryId: string,
): Promise<EchoDiscordBridgeCategoryBulkResult> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/categories/${encodeURIComponent(categoryId)}/discord-bridge/bulk-clear`,
    {
      method: 'POST',
    },
  );
}

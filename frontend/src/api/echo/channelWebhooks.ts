import { echoFetch } from './transport';

export type EchoChannelWebhookDto = {
  id: string;
  serverId: string;
  channelId: string;
  name: string;
  avatarUrl: string | null;
  createdByUserId: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

export type EchoChannelWebhookCreateResponse = {
  id: string;
  name: string;
  avatarUrl: string | null;
  channelId: string;
  serverId: string;
  createdAt: string;
  token: string;
  url: string;
};

export type EchoChannelWebhookRegenerateResponse = {
  token: string;
  url: string;
};

export async function listEchoChannelWebhooks(
  token: string,
  serverId: string,
  channelId: string,
): Promise<{ webhooks: EchoChannelWebhookDto[] }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/webhooks`,
  );
}

export async function createEchoChannelWebhook(
  token: string,
  serverId: string,
  channelId: string,
  body: { name: string; avatarUrl?: string | null },
): Promise<EchoChannelWebhookCreateResponse> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/webhooks`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export async function deleteEchoChannelWebhook(
  token: string,
  serverId: string,
  channelId: string,
  webhookId: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/webhooks/${encodeURIComponent(webhookId)}`,
    { method: 'DELETE' },
  );
}

export async function regenerateEchoChannelWebhookToken(
  token: string,
  serverId: string,
  channelId: string,
  webhookId: string,
): Promise<EchoChannelWebhookRegenerateResponse> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/webhooks/${encodeURIComponent(webhookId)}/regenerate-token`,
    { method: 'POST', body: '{}' },
  );
}

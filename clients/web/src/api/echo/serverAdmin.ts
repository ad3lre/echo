import { echoFetch } from './transport';

export async function postEchoModerationAction(
  token: string,
  serverId: string,
  body: {
    action: string;
    targetUserId: string;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/moderation`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export async function patchEchoMemberNickname(
  token: string,
  serverId: string,
  userId: string,
  nickname: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/members/${encodeURIComponent(userId)}/nickname`,
    {
      method: 'PATCH',
      body: JSON.stringify({ nickname }),
    },
  );
}

export async function postEchoTransferServerOwnership(
  token: string,
  serverId: string,
  newOwnerId: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/transfer-ownership`,
    {
      method: 'POST',
      body: JSON.stringify({ newOwnerId }),
    },
  );
}

export async function deleteEchoServer(
  token: string,
  serverId: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}`,
    {
      method: 'DELETE',
    },
  );
}

export async function postEchoLeaveServer(
  token: string | null | undefined,
  serverId: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/leave`,
    { method: 'POST' },
  );
}

import { echoFetch } from './transport';
import { echoOutboundPresenceActiveClient } from '@/utils/echoOutboundPresenceClient';
import { normalizeCanonicalPresenceStatus } from '@/services/domain/presence';
import {
  normalizeEchoDmThreadsHttpPayload,
  type EchoDmThreadFromApi,
} from '@/services/domain/echoDmThreadsFromHttp';

export type { EchoDmThreadFromApi };

export type EchoUserPublicProfileFromApi = {
  id: string;
  name: string;
  pfp: string;
  username?: string;
};

/** Minimal profile for DM/group peers not yet present in workspace snapshots. */
export async function fetchEchoUserPublicProfile(
  token: string,
  userId: string,
  init?: Pick<RequestInit, 'signal'>,
): Promise<EchoUserPublicProfileFromApi> {
  const id = userId.trim();
  return echoFetch<EchoUserPublicProfileFromApi>(
    token,
    `/users/${encodeURIComponent(id)}/profile`,
    init,
  );
}

export async function postEchoOpenDm(
  token: string,
  peerUserId: string,
  init?: Pick<RequestInit, 'signal'>,
): Promise<{ channelId: string; peerUserId: string }> {
  return echoFetch(token, '/dm/open', {
    method: 'POST',
    body: JSON.stringify({ peerUserId }),
    ...init,
  });
}

export async function postEchoOpenGroupDm(
  token: string,
  body: { memberUserIds: string[]; name?: string },
  init?: Pick<RequestInit, 'signal'>,
): Promise<{ channelId: string }> {
  return echoFetch(token, '/dm/group/open', {
    method: 'POST',
    body: JSON.stringify({
      memberUserIds: body.memberUserIds,
      name: body.name ?? '',
    }),
    ...init,
  });
}

export async function deleteEchoGroupDmMember(
  token: string,
  channelId: string,
  userId: string,
  init?: Pick<RequestInit, 'signal'>,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/dm/group/${encodeURIComponent(channelId)}/members/${encodeURIComponent(userId)}`,
    {
      method: 'DELETE',
      ...init,
    },
  );
}

export async function postEchoLeaveGroupDm(
  token: string,
  channelId: string,
  init?: Pick<RequestInit, 'signal'>,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/dm/group/${encodeURIComponent(channelId)}/leave`,
    {
      method: 'POST',
      body: JSON.stringify({}),
      ...init,
    },
  );
}

export async function postEchoAddGroupDmMembers(
  token: string,
  channelId: string,
  body: { memberUserIds: string[] },
  init?: Pick<RequestInit, 'signal'>,
): Promise<{ addedMemberUserIds: string[] }> {
  return echoFetch(
    token,
    `/dm/group/${encodeURIComponent(channelId)}/members`,
    {
      method: 'POST',
      body: JSON.stringify({
        memberUserIds: body.memberUserIds,
      }),
      ...init,
    },
  );
}

export async function patchEchoGroupDm(
  token: string,
  channelId: string,
  body: { name?: string; pfp?: string },
  init?: Pick<RequestInit, 'signal'>,
): Promise<void> {
  const payload: Record<string, string> = {};
  if (body.name !== undefined) payload.name = body.name;
  if (body.pfp !== undefined) payload.pfp = body.pfp;
  await echoFetch<Record<string, unknown>>(
    token,
    `/dm/group/${encodeURIComponent(channelId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
      ...init,
    },
  );
}

export async function fetchEchoDmThreads(
  token: string,
): Promise<{ threads: EchoDmThreadFromApi[] }> {
  const raw = await echoFetch(token, '/dm/threads');
  return normalizeEchoDmThreadsHttpPayload(raw);
}

export async function fetchEchoDmMessageRequests(token: string): Promise<{
  requests: {
    id: string;
    channelId: string;
    fromUserId: string;
    preview: string;
  }[];
}> {
  return echoFetch(token, '/dm/message-requests');
}

export async function postEchoAcceptMessageRequest(
  token: string,
  requestId: string,
): Promise<{ channelId: string; peerUserId: string }> {
  return echoFetch(
    token,
    `/dm/message-requests/${encodeURIComponent(requestId)}/accept`,
    {
      method: 'POST',
    },
  );
}

export async function postEchoIgnoreMessageRequest(
  token: string,
  requestId: string,
): Promise<void> {
  await echoFetch(
    token,
    `/dm/message-requests/${encodeURIComponent(requestId)}/ignore`,
    {
      method: 'POST',
    },
  );
}

export async function fetchEchoBlockedUsers(
  token: string,
): Promise<{ blockedUserIds: string[] }> {
  return echoFetch(token, '/blocks');
}

export async function postEchoBlockUser(
  token: string,
  targetUserId: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(token, '/blocks', {
    method: 'POST',
    body: JSON.stringify({ targetUserId }),
  });
}

export async function deleteEchoUnblockUser(
  token: string,
  targetUserId: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/blocks/${encodeURIComponent(targetUserId)}`,
    {
      method: 'DELETE',
    },
  );
}

export async function postEchoReportUser(
  token: string,
  body: { targetUserId: string; reason?: string },
): Promise<void> {
  await echoFetch<Record<string, unknown>>(token, '/reports/user', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchEchoFriends(
  token: string,
): Promise<{ friends: { peerId: string; status: string }[] }> {
  return echoFetch(token, '/friends');
}

export async function postEchoFriendRequest(
  token: string,
  peerId: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(token, '/friends/request', {
    method: 'POST',
    body: JSON.stringify({ peerId }),
  });
}

export async function postEchoAcceptFriend(
  token: string,
  peerId: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(token, '/friends/accept', {
    method: 'POST',
    body: JSON.stringify({ peerId }),
  });
}

export async function fetchEchoFriendRequests(token: string): Promise<{
  incoming: { id: string; fromUserId: string }[];
  outgoing: { id: string; toUserId: string }[];
}> {
  return echoFetch(token, '/friends/requests');
}

export async function postEchoDeclineFriend(
  token: string,
  peerId: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(token, '/friends/decline', {
    method: 'POST',
    body: JSON.stringify({ peerId }),
  });
}

export async function postEchoCancelFriendRequest(
  token: string,
  peerId: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(token, '/friends/cancel', {
    method: 'POST',
    body: JSON.stringify({ peerId }),
  });
}

export async function postEchoRemoveFriend(
  token: string,
  peerId: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(token, '/friends/remove', {
    method: 'POST',
    body: JSON.stringify({ peerId }),
  });
}

export async function fetchEchoMutualFriends(
  token: string,
  peerId: string,
): Promise<{ userIds: string[] }> {
  return echoFetch(
    token,
    `/friends/mutual?peerId=${encodeURIComponent(peerId)}`,
  );
}

export async function postEchoPresenceHttp(
  token: string,
  status: string,
): Promise<void> {
  const client = echoOutboundPresenceActiveClient();
  await echoFetch<Record<string, unknown>>(token, '/presence', {
    method: 'POST',
    body: JSON.stringify({ status, client }),
  });
}

export type EchoPresenceBatchResult = {
  presence: Record<string, string>;
  /** Sparse: user ids currently on a phone-style client (for mobile status icon). */
  presenceClient: Record<string, 'mobile'>;
  /** Timestamps (ISO 8601) when each user was last online. Only included if user has enabled showing last online. */
  lastOnlineAt?: Record<string, string>;
};

/** Batch GET `/presence` (chunked). Peers with no DB row are omitted from the map. */
export async function fetchEchoPresenceBatch(
  token: string,
  userIds: string[],
): Promise<EchoPresenceBatchResult> {
  const unique = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  if (!unique.length) return { presence: {}, presenceClient: {} };
  /** Must stay ≤ backend `ECHO_PRESENCE_BATCH_MAX_USER_IDS` (echoStore/presence.ts). */
  const CHUNK = 200;
  const out: Record<string, string> = {};
  const presenceClient: Record<string, 'mobile'> = {};
  const lastOnlineAt: Record<string, string> = {};
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const q = chunk.map((id) => encodeURIComponent(id)).join(',');
    const res = await echoFetch<{
      presence?: Record<string, string>;
      presenceClient?: Record<string, 'mobile'>;
      lastOnlineAt?: Record<string, string>;
    }>(token, `/presence?ids=${q}`);
    const p = res.presence ?? {};
    for (const [k, v] of Object.entries(p)) {
      const status = normalizeCanonicalPresenceStatus(v);
      if (status) out[k] = status;
    }
    const pc = res.presenceClient ?? {};
    for (const [k, v] of Object.entries(pc)) {
      if (v === 'mobile') presenceClient[k] = 'mobile';
    }
    const lo = res.lastOnlineAt ?? {};
    for (const [k, v] of Object.entries(lo)) {
      if (v) lastOnlineAt[k] = v;
    }
  }
  return { presence: out, presenceClient, lastOnlineAt };
}

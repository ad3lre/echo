import { echoFetch } from '@/api/echo/transport';

/**
 * REST client for the MLS delivery service. `serverId === null` selects the
 * DM/group-DM route family; otherwise the guild route family is used. Payloads
 * are base64-encoded opaque MLS bytes — the server never inspects them.
 */
export type MlsScope =
  | { kind: 'dm'; channelId: string }
  | { kind: 'guild'; serverId: string; channelId: string };

function basePath(scope: MlsScope): string {
  if (scope.kind === 'dm') {
    return `/dm/channels/${encodeURIComponent(scope.channelId)}/voice/mls`;
  }
  return `/servers/${encodeURIComponent(scope.serverId)}/channels/${encodeURIComponent(scope.channelId)}/voice/mls`;
}

export type MlsGroupInfoResponse = {
  enabled: boolean;
  groupId: string | null;
  currentEpoch: string | null;
  groupInfo: string | null;
};

export type MlsLogMessageWire = {
  seq: string;
  epoch: string;
  msgType: 'commit' | 'proposal' | 'welcome';
  senderUserId: string;
  senderDeviceId: string;
  recipientUserId: string | null;
  recipientDeviceId: string | null;
  payload: string;
};

export async function fetchMlsGroupInfo(
  token: string,
  scope: MlsScope,
): Promise<MlsGroupInfoResponse> {
  return echoFetch(token, `${basePath(scope)}/group-info`, { method: 'GET' });
}

export async function fetchMlsMessages(
  token: string,
  scope: MlsScope,
  sinceSeq: string,
): Promise<{ messages: MlsLogMessageWire[] }> {
  return echoFetch(
    token,
    `${basePath(scope)}/messages?since=${encodeURIComponent(sinceSeq)}`,
    { method: 'GET' },
  );
}

export async function postMlsInit(
  token: string,
  scope: MlsScope,
  body: { groupInfo: string },
): Promise<{ created: boolean; groupId: string; currentEpoch: string }> {
  return echoFetch(token, `${basePath(scope)}/init`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export type MlsWelcomeOut = {
  recipientUserId: string;
  recipientDeviceId: string;
  payload: string;
};

export async function postMlsCommit(
  token: string,
  scope: MlsScope,
  body: {
    expectedEpoch: string;
    commit: string;
    groupInfo: string;
    deviceId: string;
    welcomes?: MlsWelcomeOut[];
  },
): Promise<{ seq: string; epoch: string }> {
  return echoFetch(token, `${basePath(scope)}/commit`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function postMlsProposal(
  token: string,
  scope: MlsScope,
  body: { epoch: string; payload: string; deviceId: string },
): Promise<{ seq: string }> {
  return echoFetch(token, `${basePath(scope)}/proposal`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function publishMlsKeyPackages(
  token: string,
  body: { deviceId: string; packages: Array<{ ref: string; keyPackage: string }> },
): Promise<void> {
  await echoFetch(token, `/e2ee/mls/key-packages`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function claimMlsPeerKeyPackage(
  token: string,
  peerUserId: string,
  peerDeviceId: string,
): Promise<{ ref: string; keyPackage: string }> {
  return echoFetch(
    token,
    `/e2ee/mls/peer/${encodeURIComponent(peerUserId)}/device/${encodeURIComponent(peerDeviceId)}/key-package`,
    { method: 'GET' },
  );
}

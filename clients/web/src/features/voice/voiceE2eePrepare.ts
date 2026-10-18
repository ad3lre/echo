import { fetchEchoDmThreads } from '@/api/echo/social';
import { fetchEchoVoiceParticipants } from '@/api/echo/voice';
import {
  buildVoiceMediaKeyEnvelopesForPeers,
  decryptVoiceMediaKeyInbox,
  fetchVoiceMediaKeyInbox,
  keyIndexForRotation,
  postVoiceMediaKeyAnnounce,
  prepareVoiceMediaKeys as prepareVoiceMediaKeysCore,
  randomBytes32,
  toArrayBuffer,
} from '@/services/voice/e2ee/voiceMediaKeyPrepare';
import {
  clearActiveVoiceMediaKeySession,
  getActiveVoiceMediaKeySession,
  setActiveVoiceMediaKeySession,
  updateActiveVoiceMediaKeyRotation,
  voiceMediaKeyChannelKey,
  type VoiceMediaKeyScope,
} from '@/services/voice/e2ee/voiceMediaKeySession';
import { activeVoiceE2eeChannelKey } from '@/features/voice/voiceE2eeActiveState';

/** Result of client-side voice E2EE prepare (media key + local device id for session mint). */
export type VoiceE2eePrepareResult = {
  mediaKey: ArrayBuffer | null;
  senderDeviceId: string;
  keyIndex?: number;
  senderKeys?: ReadonlyMap<string, ArrayBuffer>;
};

/** @deprecated Legacy v1 error; kept so older call sites still type-check. */
export class VoiceE2eeEnvelopeMissingError extends Error {
  readonly code = 'VOICE_E2EE_ENVELOPE_MISSING' as const;
  constructor(message?: string) {
    super(
      message ??
        'No encrypted key material for your account on this call. Wait for the key distributor or refresh.',
    );
    this.name = 'VoiceE2eeEnvelopeMissingError';
  }
}

async function resolveDmVoiceMemberUserIds(opts: {
  channelId: string;
  token: string;
  viewerUserId: string;
  memberUserIds: string[];
}): Promise<string[]> {
  const uid = opts.viewerUserId.trim();
  const members = [
    ...new Set(
      (opts.memberUserIds.length > 0 ? opts.memberUserIds : [uid])
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
  if (!members.includes(uid)) members.push(uid);
  try {
    const threads = await fetchEchoDmThreads(opts.token);
    const thread = threads.threads?.find(
      (t) => t.channelId?.trim() === opts.channelId.trim(),
    );
    if (
      thread &&
      'peerUserId' in thread &&
      typeof thread.peerUserId === 'string'
    ) {
      const peer = thread.peerUserId.trim();
      if (peer && !members.includes(peer)) members.push(peer);
    }
    if (
      thread &&
      'memberUserIds' in thread &&
      Array.isArray(thread.memberUserIds)
    ) {
      for (const id of thread.memberUserIds) {
        const m = String(id).trim();
        if (m && !members.includes(m)) members.push(m);
      }
    }
  } catch {
    /* use passed roster */
  }
  return members;
}

async function prepareVoiceMediaKeys(opts: {
  scope: VoiceMediaKeyScope;
  token: string;
  viewerUserId: string;
  memberUserIds: string[];
}): Promise<VoiceE2eePrepareResult> {
  const result = await prepareVoiceMediaKeysCore(opts);
  if (!result.mediaKey) {
    clearActiveVoiceMediaKeySession();
    activeVoiceE2eeChannelKey.value = null;
    return { mediaKey: null, senderDeviceId: '' };
  }

  const channelKey = result.channelKey ?? voiceMediaKeyChannelKey(opts.scope);
  setActiveVoiceMediaKeySession({
    channelKey,
    scope: opts.scope,
    viewerUserId: opts.viewerUserId.trim(),
    senderDeviceId: result.senderDeviceId,
    token: opts.token,
    mediaKey: result.mediaKey,
    rotation: result.rotation ?? 0,
    keyIndex: result.keyIndex ?? 0,
  });
  activeVoiceE2eeChannelKey.value = channelKey;

  return {
    mediaKey: result.mediaKey,
    senderDeviceId: result.senderDeviceId,
    keyIndex: result.keyIndex,
    senderKeys: result.senderKeys,
  };
}

/**
 * Rotate the local sender key and re-announce to peers (join/leave FS).
 */
export async function rotateAndAnnounceVoiceMediaKey(opts: {
  peerUserIds: string[];
}): Promise<{
  raw: ArrayBuffer;
  keyIndex: number;
  senderKeys: ReadonlyMap<string, ArrayBuffer>;
} | null> {
  const session = getActiveVoiceMediaKeySession();
  if (!session) return null;
  const seed = randomBytes32();
  const rotation = session.rotation + 1;
  const keyIndex = keyIndexForRotation(rotation);
  const mediaKey = toArrayBuffer(seed);
  const peers = opts.peerUserIds
    .map((id) => id.trim())
    .filter((id) => id && id !== session.viewerUserId);

  const { envelopes } = await buildVoiceMediaKeyEnvelopesForPeers({
    viewerUserId: session.viewerUserId,
    token: session.token,
    senderDeviceId: session.senderDeviceId,
    seed,
    peerUserIds: peers,
  });

  const posted = await postVoiceMediaKeyAnnounce({
    scope: session.scope,
    token: session.token,
    senderDeviceId: session.senderDeviceId,
    keyIndex,
    envelopes,
  });
  if (posted === 'disabled') return null;

  updateActiveVoiceMediaKeyRotation({ mediaKey, rotation, keyIndex });

  const senderKeys = new Map<string, ArrayBuffer>();
  senderKeys.set(session.viewerUserId, mediaKey);
  return { raw: mediaKey, keyIndex, senderKeys };
}

export async function pullVoiceMediaKeyInbox(opts?: {
  senderUserId?: string;
}): Promise<{
  senderKeys: ReadonlyMap<string, ArrayBuffer>;
  keyIndex: number;
} | null> {
  const session = getActiveVoiceMediaKeySession();
  if (!session) return null;
  const inbox = await fetchVoiceMediaKeyInbox({
    scope: session.scope,
    token: session.token,
    senderUserId: opts?.senderUserId,
  });
  if (inbox === 'disabled' || inbox.length === 0) {
    return { senderKeys: new Map(), keyIndex: session.keyIndex };
  }
  const decrypted = await decryptVoiceMediaKeyInbox({
    envelopes: inbox,
    viewerUserId: session.viewerUserId,
  });
  const senderKeys = new Map<string, ArrayBuffer>();
  let maxIndex = session.keyIndex;
  for (const [identity, k] of decrypted) {
    senderKeys.set(identity, k.raw);
    if (k.keyIndex > maxIndex) maxIndex = k.keyIndex;
  }
  return { senderKeys, keyIndex: maxIndex };
}

export function stopVoiceMediaKeySession(): void {
  clearActiveVoiceMediaKeySession();
  activeVoiceE2eeChannelKey.value = null;
}

export async function prepareDmVoiceE2eeMediaKey(opts: {
  channelId: string;
  token: string;
  viewerUserId: string;
  memberUserIds: string[];
}): Promise<VoiceE2eePrepareResult> {
  const memberUserIds = await resolveDmVoiceMemberUserIds(opts);
  return prepareVoiceMediaKeys({
    scope: { kind: 'dm', channelId: opts.channelId },
    token: opts.token,
    viewerUserId: opts.viewerUserId,
    memberUserIds,
  });
}

export async function prepareGuildVoiceE2eeMediaKey(opts: {
  serverId: string;
  channelId: string;
  token: string;
  viewerUserId: string;
  memberUserIds: string[];
}): Promise<VoiceE2eePrepareResult> {
  const uid = opts.viewerUserId.trim();
  let memberUserIds = [
    ...new Set(
      (opts.memberUserIds.length > 0 ? opts.memberUserIds : [uid])
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
  if (!memberUserIds.includes(uid)) memberUserIds.push(uid);

  try {
    const { participants } = await fetchEchoVoiceParticipants(
      opts.token,
      opts.serverId,
      opts.channelId,
    );
    const apiIds = participants
      .map((id) => id.trim())
      .filter((id) => id && id !== uid);
    if (apiIds.length > 0) {
      memberUserIds = [uid, ...apiIds];
    }
  } catch {
    /* fall back to workspace roster passed in */
  }

  return prepareVoiceMediaKeys({
    scope: {
      kind: 'guild',
      serverId: opts.serverId,
      channelId: opts.channelId,
    },
    token: opts.token,
    viewerUserId: opts.viewerUserId,
    memberUserIds,
  });
}

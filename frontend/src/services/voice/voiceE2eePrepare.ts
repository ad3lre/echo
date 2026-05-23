import { fetchEchoDmThreads } from '@/api/echo/social';
import { fetchEchoVoiceParticipants } from '@/api/echo/voice';
import { EchoApiError, echoFetch } from '@/api/echo/transport';
import { getOrCreateLocalE2eeDevice } from '@/services/e2ee/e2eeDeviceStore';
import {
  e2eeDecryptIncomingDmBytes,
  e2eeEncryptDmBytes,
} from '@/services/e2ee/e2eeMessageCrypto';

export type EchoVoiceE2eeEnvelopeWire = {
  recipientUserId: string;
  recipientDeviceId: string;
  ciphertext: string;
  envelope?: unknown;
};

export type EchoVoiceE2eeEnvelopesResponse = {
  epochId: string | null;
  roomName: string | null;
  createdByUserId: string | null;
  envelopes: EchoVoiceE2eeEnvelopeWire[];
};

/** Result of client-side voice E2EE prepare (media key + local device id for session mint). */
export type VoiceE2eePrepareResult = {
  mediaKey: ArrayBuffer | null;
  senderDeviceId: string;
};

/** Thrown when an active epoch exists but this client must not rotate it. */
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

async function fetchPeerDeviceIds(
  token: string,
  peerUserId: string,
): Promise<string[]> {
  const res = await echoFetch<Record<string, unknown>>(
    token,
    `/e2ee/peer/${encodeURIComponent(peerUserId)}/device-bundle`,
    { method: 'GET' },
  );
  const bundles = res.bundles as { deviceId?: string }[] | undefined;
  const primary = res.bundle as { deviceId?: string } | undefined;
  const ids: string[] = [];
  if (Array.isArray(bundles)) {
    for (const b of bundles) {
      const id = b?.deviceId?.trim();
      if (id && !ids.includes(id)) ids.push(id);
    }
  }
  const legacy = primary?.deviceId?.trim();
  if (legacy && !ids.includes(legacy)) ids.unshift(legacy);
  if (!ids.length) {
    throw new Error('Peer has no registered E2EE device for voice.');
  }
  return ids;
}

export async function fetchDmVoiceE2eeEnvelopes(
  token: string,
  channelId: string,
): Promise<EchoVoiceE2eeEnvelopesResponse> {
  return echoFetch(
    token,
    `/dm/channels/${encodeURIComponent(channelId)}/voice/e2ee/envelopes`,
    { method: 'GET' },
  );
}

export async function postDmVoiceE2eeEpoch(
  token: string,
  channelId: string,
  body: {
    epochId: string;
    envelopes: Array<{
      recipientUserId: string;
      recipientDeviceId: string;
      ciphertext: string;
      envelope?: unknown;
    }>;
  },
): Promise<void> {
  await echoFetch(
    token,
    `/dm/channels/${encodeURIComponent(channelId)}/voice/e2ee/epoch`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export async function fetchGuildVoiceE2eeEnvelopes(
  token: string,
  serverId: string,
  channelId: string,
): Promise<EchoVoiceE2eeEnvelopesResponse> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/voice/e2ee/envelopes`,
    { method: 'GET' },
  );
}

export async function postGuildVoiceE2eeEpoch(
  token: string,
  serverId: string,
  channelId: string,
  body: {
    epochId: string;
    envelopes: Array<{
      recipientUserId: string;
      recipientDeviceId: string;
      ciphertext: string;
      envelope?: unknown;
    }>;
  },
): Promise<void> {
  await echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/voice/e2ee/epoch`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

function randomBytes32(): Uint8Array {
  const u = new Uint8Array(32);
  crypto.getRandomValues(u);
  return u;
}

function toArrayBuffer(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(
    u.byteOffset,
    u.byteOffset + u.byteLength,
  ) as ArrayBuffer;
}

/** Server returns 403 VOICE_E2EE_DISABLED when the channel/thread has no voice E2EE. */
function isVoiceE2eeNotEnabledOnServer(err: unknown): boolean {
  return (
    err instanceof EchoApiError &&
    err.status === 403 &&
    err.body.code === 'VOICE_E2EE_DISABLED'
  );
}

/**
 * Non-creators must not POST a new epoch when one is already active — that
 * supersedes the room key and disconnects everyone else.
 */
export function assertMayCreateVoiceE2eeEpoch(
  res: EchoVoiceE2eeEnvelopesResponse,
  viewerUserId: string,
): void {
  const epochId = res.epochId?.trim();
  if (!epochId) return;
  const creator = res.createdByUserId?.trim() ?? '';
  const viewer = viewerUserId.trim();
  if (creator && creator === viewer) return;
  throw new VoiceE2eeEnvelopeMissingError();
}

/** Resolve DM/group-DM participants when the caller only knows the viewer id. */
async function resolveDmVoiceMemberUserIds(opts: {
  token: string;
  channelId: string;
  viewerUserId: string;
  memberUserIds: string[];
}): Promise<string[]> {
  const uid = opts.viewerUserId.trim();
  const cid = opts.channelId.trim();
  let members = [
    ...new Set(
      opts.memberUserIds
        .map((id) => id.trim())
        .filter((id) => id && id !== uid),
    ),
  ];
  if (members.length > 0) {
    return [uid, ...members];
  }
  try {
    const { threads } = await fetchEchoDmThreads(opts.token);
    const thread = threads.find((t) => t.channelId === cid);
    if (thread?.kind === 'group') {
      members = thread.memberUserIds
        .map((id) => id.trim())
        .filter((id) => id && id !== uid);
    } else if (thread?.kind === 'direct') {
      const peer = thread.peerUserId.trim();
      if (peer && peer !== uid) members = [peer];
    }
  } catch (e) {
    throw new Error(
      'Could not load conversation members for encrypted voice. Check your connection and try again.',
      { cause: e },
    );
  }
  return [uid, ...members];
}

async function postVoiceE2eeEpochOrSkip(
  post: () => Promise<void>,
): Promise<'posted' | 'skipped'> {
  try {
    await post();
    return 'posted';
  } catch (e) {
    if (isVoiceE2eeNotEnabledOnServer(e)) return 'skipped';
    throw e;
  }
}

/**
 * When an active epoch exists, decrypt the viewer's envelope if present.
 * Returns null if there is no active epoch yet.
 */
async function decryptVoiceE2eeMediaKeyFromActiveEpoch(opts: {
  res: EchoVoiceE2eeEnvelopesResponse;
  viewerUserId: string;
  senderDeviceId: string;
}): Promise<ArrayBuffer | null> {
  const { res, viewerUserId, senderDeviceId } = opts;
  if (!res.epochId || !res.createdByUserId) return null;
  const ordered = [...res.envelopes].sort((a, b) => {
    if (a.recipientDeviceId === senderDeviceId) return -1;
    if (b.recipientDeviceId === senderDeviceId) return 1;
    return 0;
  });
  for (const mine of ordered) {
    try {
      const pt = await e2eeDecryptIncomingDmBytes({
        viewerUserId,
        authorUserId: res.createdByUserId,
        envelope: mine.envelope ?? { protocol: 'libsignal-v1' },
        ciphertext: mine.ciphertext,
      });
      return toArrayBuffer(pt);
    } catch {
      /* try next device envelope */
    }
  }
  return null;
}

type EnvelopeOut = {
  recipientUserId: string;
  recipientDeviceId: string;
  ciphertext: string;
  envelope?: unknown;
};

async function buildEnvelopesForPeers(opts: {
  viewerUserId: string;
  token: string;
  senderDeviceId: string;
  seed: Uint8Array;
  peerUserIds: string[];
}): Promise<{ envelopes: EnvelopeOut[]; skippedPeerIds: string[] }> {
  const envelopes: EnvelopeOut[] = [];
  const skippedPeerIds: string[] = [];
  for (const uid of opts.peerUserIds) {
    let deviceIds: string[];
    try {
      deviceIds = await fetchPeerDeviceIds(opts.token, uid);
    } catch {
      skippedPeerIds.push(uid);
      continue;
    }
    for (const peerDeviceId of deviceIds) {
      try {
        const enc = await e2eeEncryptDmBytes({
          viewerUserId: opts.viewerUserId,
          peerUserId: uid,
          plaintextBytes: opts.seed,
          senderDeviceId: opts.senderDeviceId,
          authToken: opts.token,
          peerRecipientDeviceUuid: peerDeviceId,
        });
        envelopes.push({
          recipientUserId: uid,
          recipientDeviceId: peerDeviceId,
          ciphertext: enc.ciphertext,
          envelope: enc.envelope,
        });
      } catch {
        skippedPeerIds.push(uid);
        break;
      }
    }
  }
  return { envelopes, skippedPeerIds };
}

/**
 * Returns raw 32-byte material for {@link ExternalE2EEKeyProvider#setKey} (HKDF path).
 */
export async function prepareDmVoiceE2eeMediaKey(opts: {
  channelId: string;
  token: string;
  viewerUserId: string;
  memberUserIds: string[];
}): Promise<VoiceE2eePrepareResult> {
  const memberUserIds = await resolveDmVoiceMemberUserIds(opts);
  const dev = await getOrCreateLocalE2eeDevice(opts.viewerUserId, opts.token);
  const senderDeviceId = dev.deviceId;

  const peers = memberUserIds.filter((u) => u !== opts.viewerUserId);
  if (peers.length === 0) {
    const seed = randomBytes32();
    const posted = await postVoiceE2eeEpochOrSkip(() =>
      postDmVoiceE2eeEpoch(opts.token, opts.channelId, {
        epochId: crypto.randomUUID(),
        envelopes: [],
      }),
    );
    return {
      mediaKey: posted === 'posted' ? toArrayBuffer(seed) : null,
      senderDeviceId,
    };
  }

  const res = await fetchDmVoiceE2eeEnvelopes(opts.token, opts.channelId);
  const fromEpoch = await decryptVoiceE2eeMediaKeyFromActiveEpoch({
    res,
    viewerUserId: opts.viewerUserId,
    senderDeviceId,
  });
  if (fromEpoch) {
    return { mediaKey: fromEpoch, senderDeviceId };
  }
  if (res.epochId && res.envelopes.length > 0) {
    throw new VoiceE2eeEnvelopeMissingError(
      'Voice E2EE: active epoch exists but no envelope for this device. ' +
        'The epoch creator must include all participant devices.',
    );
  }
  assertMayCreateVoiceE2eeEpoch(res, opts.viewerUserId);

  const seed = randomBytes32();
  const epochId = crypto.randomUUID();
  const { envelopes } = await buildEnvelopesForPeers({
    viewerUserId: opts.viewerUserId,
    token: opts.token,
    senderDeviceId,
    seed,
    peerUserIds: peers,
  });

  const posted = await postVoiceE2eeEpochOrSkip(() =>
    postDmVoiceE2eeEpoch(opts.token, opts.channelId, {
      epochId,
      envelopes,
    }),
  );
  return {
    mediaKey: posted === 'posted' ? toArrayBuffer(seed) : null,
    senderDeviceId,
  };
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

  const dev = await getOrCreateLocalE2eeDevice(opts.viewerUserId, opts.token);
  const senderDeviceId = dev.deviceId;

  const peers = memberUserIds.filter((u) => u !== uid);
  if (peers.length === 0) {
    const seed = randomBytes32();
    const posted = await postVoiceE2eeEpochOrSkip(() =>
      postGuildVoiceE2eeEpoch(opts.token, opts.serverId, opts.channelId, {
        epochId: crypto.randomUUID(),
        envelopes: [],
      }),
    );
    return {
      mediaKey: posted === 'posted' ? toArrayBuffer(seed) : null,
      senderDeviceId,
    };
  }

  const res = await fetchGuildVoiceE2eeEnvelopes(
    opts.token,
    opts.serverId,
    opts.channelId,
  );
  const fromEpoch = await decryptVoiceE2eeMediaKeyFromActiveEpoch({
    res,
    viewerUserId: opts.viewerUserId,
    senderDeviceId,
  });
  if (fromEpoch) {
    return { mediaKey: fromEpoch, senderDeviceId };
  }
  if (res.epochId && res.envelopes.length > 0) {
    throw new VoiceE2eeEnvelopeMissingError(
      'Voice E2EE: active epoch exists but no envelope for this device. ' +
        'The epoch creator must include all participant devices.',
    );
  }
  assertMayCreateVoiceE2eeEpoch(res, opts.viewerUserId);

  const seed = randomBytes32();
  const epochId = crypto.randomUUID();
  const { envelopes } = await buildEnvelopesForPeers({
    viewerUserId: opts.viewerUserId,
    token: opts.token,
    senderDeviceId,
    seed,
    peerUserIds: peers,
  });

  const posted = await postVoiceE2eeEpochOrSkip(() =>
    postGuildVoiceE2eeEpoch(opts.token, opts.serverId, opts.channelId, {
      epochId,
      envelopes,
    }),
  );
  return {
    mediaKey: posted === 'posted' ? toArrayBuffer(seed) : null,
    senderDeviceId,
  };
}

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

async function fetchPeerDeviceId(
  token: string,
  peerUserId: string,
): Promise<string> {
  const res = await echoFetch<Record<string, unknown>>(
    token,
    `/e2ee/peer/${encodeURIComponent(peerUserId)}/device-bundle`,
    { method: 'GET' },
  );
  // Prefer the full bundles array (multi-device API); fall back to legacy single bundle.
  const bundles = res.bundles as { deviceId?: string }[] | undefined;
  const primary = res.bundle as { deviceId?: string } | undefined;
  const id = (
    (Array.isArray(bundles) && bundles.length > 0 ? bundles[0] : primary)
      ?.deviceId ?? ''
  ).trim();
  if (!id) throw new Error('Peer has no registered E2EE device for voice.');
  return id;
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

/** Server returns 403 when voice E2EE is disabled for the channel/thread. */
function isVoiceE2eeNotEnabledOnServer(err: unknown): boolean {
  return err instanceof EchoApiError && err.status === 403;
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
  const mine = res.envelopes.find(
    (e) => e.recipientDeviceId === senderDeviceId,
  );
  if (!mine) return null;
  const pt = await e2eeDecryptIncomingDmBytes({
    viewerUserId,
    authorUserId: res.createdByUserId,
    envelope: mine.envelope ?? { protocol: 'libsignal-v1' },
    ciphertext: mine.ciphertext,
  });
  return toArrayBuffer(pt);
}

/**
 * Returns raw 32-byte material for {@link ExternalE2EEKeyProvider#setKey} (HKDF path).
 */
export async function prepareDmVoiceE2eeMediaKey(opts: {
  channelId: string;
  token: string;
  viewerUserId: string;
  memberUserIds: string[];
}): Promise<ArrayBuffer | null> {
  const dev = await getOrCreateLocalE2eeDevice(opts.viewerUserId, opts.token);
  const senderDeviceId = dev.deviceId;

  const peers = opts.memberUserIds.filter((u) => u !== opts.viewerUserId);
  if (peers.length === 0) {
    const seed = randomBytes32();
    const posted = await postVoiceE2eeEpochOrSkip(() =>
      postDmVoiceE2eeEpoch(opts.token, opts.channelId, {
        epochId: crypto.randomUUID(),
        envelopes: [],
      }),
    );
    return posted === 'posted' ? toArrayBuffer(seed) : null;
  }

  const res = await fetchDmVoiceE2eeEnvelopes(opts.token, opts.channelId);
  const fromEpoch = await decryptVoiceE2eeMediaKeyFromActiveEpoch({
    res,
    viewerUserId: opts.viewerUserId,
    senderDeviceId,
  });
  if (fromEpoch) return fromEpoch;
  if (res.epochId && res.envelopes.length > 0) {
    throw new Error(
      'Voice E2EE: active epoch exists but no envelope for this device. ' +
        'The epoch creator must include all participant devices.',
    );
  }

  // No usable epoch — this client becomes the epoch creator (or rotates).
  const seed = randomBytes32();
  const epochId = crypto.randomUUID();
  const envelopes: Array<{
    recipientUserId: string;
    recipientDeviceId: string;
    ciphertext: string;
    envelope?: unknown;
  }> = [];

  for (const uid of peers) {
    const peerDeviceId = await fetchPeerDeviceId(opts.token, uid);
    const enc = await e2eeEncryptDmBytes({
      viewerUserId: opts.viewerUserId,
      peerUserId: uid,
      plaintextBytes: seed,
      senderDeviceId,
      authToken: opts.token,
      peerRecipientDeviceUuid: peerDeviceId,
    });
    envelopes.push({
      recipientUserId: uid,
      recipientDeviceId: peerDeviceId,
      ciphertext: enc.ciphertext,
      envelope: enc.envelope,
    });
  }

  const posted = await postVoiceE2eeEpochOrSkip(() =>
    postDmVoiceE2eeEpoch(opts.token, opts.channelId, {
      epochId,
      envelopes,
    }),
  );
  return posted === 'posted' ? toArrayBuffer(seed) : null;
}

export async function prepareGuildVoiceE2eeMediaKey(opts: {
  serverId: string;
  channelId: string;
  token: string;
  viewerUserId: string;
  memberUserIds: string[];
}): Promise<ArrayBuffer | null> {
  const memberUserIds =
    opts.memberUserIds.length > 0 ? opts.memberUserIds : [opts.viewerUserId];
  const dev = await getOrCreateLocalE2eeDevice(opts.viewerUserId, opts.token);
  const senderDeviceId = dev.deviceId;

  const peers = memberUserIds.filter((u) => u !== opts.viewerUserId);
  if (peers.length === 0) {
    const seed = randomBytes32();
    const posted = await postVoiceE2eeEpochOrSkip(() =>
      postGuildVoiceE2eeEpoch(opts.token, opts.serverId, opts.channelId, {
        epochId: crypto.randomUUID(),
        envelopes: [],
      }),
    );
    return posted === 'posted' ? toArrayBuffer(seed) : null;
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
  if (fromEpoch) return fromEpoch;
  if (res.epochId && res.envelopes.length > 0) {
    throw new Error(
      'Voice E2EE: active epoch exists but no envelope for this device. ' +
        'The epoch creator must include all participant devices.',
    );
  }

  // No usable epoch — this client becomes the epoch creator (or rotates).
  const seed = randomBytes32();
  const epochId = crypto.randomUUID();
  const envelopes: Array<{
    recipientUserId: string;
    recipientDeviceId: string;
    ciphertext: string;
    envelope?: unknown;
  }> = [];

  for (const uid of peers) {
    const peerDeviceId = await fetchPeerDeviceId(opts.token, uid);
    const enc = await e2eeEncryptDmBytes({
      viewerUserId: opts.viewerUserId,
      peerUserId: uid,
      plaintextBytes: seed,
      senderDeviceId,
      authToken: opts.token,
      peerRecipientDeviceUuid: peerDeviceId,
    });
    envelopes.push({
      recipientUserId: uid,
      recipientDeviceId: peerDeviceId,
      ciphertext: enc.ciphertext,
      envelope: enc.envelope,
    });
  }

  const posted = await postVoiceE2eeEpochOrSkip(() =>
    postGuildVoiceE2eeEpoch(opts.token, opts.serverId, opts.channelId, {
      epochId,
      envelopes,
    }),
  );
  return posted === 'posted' ? toArrayBuffer(seed) : null;
}

/**
 * Element Call–style voice media-key prepare (shared by web + Apple MlsBridge).
 * No Vue / browser-only deps — callers own session lifecycle UI state.
 */
import { echoFetch, EchoApiError } from '@/api/echo/transport';
import { getOrCreateLocalE2eeDevice } from '@/services/e2ee/e2eeDeviceStore';
import {
  e2eeDecryptIncomingDmBytes,
  e2eeEncryptDmBytes,
} from '@/services/e2ee/e2eeMessageCrypto';
import { ECHO_VOICE_KEYRING_SIZE } from './echoParticipantKeyProvider';
import type { VoiceMediaKeyScope } from './voiceMediaKeySession';
import { voiceMediaKeyChannelKey } from './voiceMediaKeySession';

export type VoiceMediaKeyEnvelopeWire = {
  senderUserId?: string;
  senderDeviceId?: string;
  keyIndex?: number;
  recipientUserId: string;
  recipientDeviceId: string;
  ciphertext: string;
  envelope?: unknown;
};

export type VoiceMediaKeyPrepareResult = {
  mediaKey: ArrayBuffer | null;
  senderDeviceId: string;
  keyIndex?: number;
  senderKeys?: ReadonlyMap<string, ArrayBuffer>;
  channelKey?: string;
  rotation?: number;
};

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

export function keyIndexForRotation(rotation: number): number {
  const size = ECHO_VOICE_KEYRING_SIZE;
  return ((rotation % size) + size) % size;
}

function isVoiceE2eeNotEnabledOnServer(err: unknown): boolean {
  return (
    err instanceof EchoApiError &&
    err.status === 403 &&
    err.body.code === 'VOICE_E2EE_DISABLED'
  );
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

type EnvelopeOut = {
  recipientUserId: string;
  recipientDeviceId: string;
  ciphertext: string;
  envelope?: unknown;
};

export async function buildVoiceMediaKeyEnvelopesForPeers(opts: {
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

function mediaKeysPath(scope: VoiceMediaKeyScope): string {
  if (scope.kind === 'dm') {
    return `/dm/channels/${encodeURIComponent(scope.channelId)}/voice/e2ee/media-keys`;
  }
  return `/servers/${encodeURIComponent(scope.serverId)}/channels/${encodeURIComponent(scope.channelId)}/voice/e2ee/media-keys`;
}

export async function postVoiceMediaKeyAnnounce(opts: {
  scope: VoiceMediaKeyScope;
  token: string;
  senderDeviceId: string;
  keyIndex: number;
  envelopes: EnvelopeOut[];
}): Promise<'posted' | 'disabled'> {
  try {
    await echoFetch(opts.token, mediaKeysPath(opts.scope), {
      method: 'POST',
      body: JSON.stringify({
        senderDeviceId: opts.senderDeviceId,
        keyIndex: opts.keyIndex,
        envelopes: opts.envelopes,
      }),
    });
    return 'posted';
  } catch (e) {
    if (isVoiceE2eeNotEnabledOnServer(e)) return 'disabled';
    throw e;
  }
}

export async function fetchVoiceMediaKeyInbox(opts: {
  scope: VoiceMediaKeyScope;
  token: string;
  senderUserId?: string;
}): Promise<VoiceMediaKeyEnvelopeWire[] | 'disabled'> {
  try {
    const q = opts.senderUserId?.trim()
      ? `?senderUserId=${encodeURIComponent(opts.senderUserId.trim())}`
      : '';
    const res = await echoFetch<{ envelopes?: VoiceMediaKeyEnvelopeWire[] }>(
      opts.token,
      `${mediaKeysPath(opts.scope)}${q}`,
      { method: 'GET' },
    );
    return Array.isArray(res.envelopes) ? res.envelopes : [];
  } catch (e) {
    if (isVoiceE2eeNotEnabledOnServer(e)) return 'disabled';
    throw e;
  }
}

export async function decryptVoiceMediaKeyInbox(opts: {
  envelopes: VoiceMediaKeyEnvelopeWire[];
  viewerUserId: string;
}): Promise<Map<string, { raw: ArrayBuffer; keyIndex: number }>> {
  const bySender = new Map<string, { raw: ArrayBuffer; keyIndex: number }>();
  const sorted = [...opts.envelopes].sort(
    (a, b) => (b.keyIndex ?? 0) - (a.keyIndex ?? 0),
  );
  for (const env of sorted) {
    const sender = env.senderUserId?.trim() ?? '';
    if (!sender || bySender.has(sender)) continue;
    try {
      const pt = await e2eeDecryptIncomingDmBytes({
        viewerUserId: opts.viewerUserId,
        authorUserId: sender,
        envelope: env.envelope ?? { protocol: 'libsignal-v1' },
        ciphertext: env.ciphertext,
      });
      bySender.set(sender, {
        raw: toArrayBuffer(pt),
        keyIndex: env.keyIndex ?? 0,
      });
    } catch {
      /* try next */
    }
  }
  return bySender;
}

export async function prepareVoiceMediaKeys(opts: {
  scope: VoiceMediaKeyScope;
  token: string;
  viewerUserId: string;
  memberUserIds: string[];
  /** Prefer an existing device id (e.g. Apple Keychain). */
  preferredDeviceId?: string;
}): Promise<VoiceMediaKeyPrepareResult> {
  const uid = opts.viewerUserId.trim();
  const dev = await getOrCreateLocalE2eeDevice(uid, opts.token);
  // Prefer Keychain / caller device id when it matches registered device.
  const senderDeviceId = opts.preferredDeviceId?.trim() || dev.deviceId;
  const peers = opts.memberUserIds
    .map((id) => id.trim())
    .filter((id) => id && id !== uid);

  const seed = randomBytes32();
  const rotation = 0;
  const keyIndex = keyIndexForRotation(rotation);
  const mediaKey = toArrayBuffer(seed);

  const { envelopes } = await buildVoiceMediaKeyEnvelopesForPeers({
    viewerUserId: uid,
    token: opts.token,
    senderDeviceId,
    seed,
    peerUserIds: peers,
  });

  const posted = await postVoiceMediaKeyAnnounce({
    scope: opts.scope,
    token: opts.token,
    senderDeviceId,
    keyIndex,
    envelopes,
  });
  if (posted === 'disabled') {
    return { mediaKey: null, senderDeviceId: '' };
  }

  const inbox = await fetchVoiceMediaKeyInbox({
    scope: opts.scope,
    token: opts.token,
  });
  if (inbox === 'disabled') {
    return { mediaKey: null, senderDeviceId: '' };
  }

  const decrypted = await decryptVoiceMediaKeyInbox({
    envelopes: inbox,
    viewerUserId: uid,
  });
  const senderKeys = new Map<string, ArrayBuffer>();
  senderKeys.set(uid, mediaKey);
  for (const [identity, k] of decrypted) {
    senderKeys.set(identity, k.raw);
  }

  return {
    mediaKey,
    senderDeviceId,
    keyIndex,
    senderKeys,
    channelKey: voiceMediaKeyChannelKey(opts.scope),
    rotation,
  };
}

export { toArrayBuffer, randomBytes32 };

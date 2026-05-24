import { echoFetch } from '@/api/echo/transport';
import { getEchoE2eeDevices } from '@/api/echo/e2ee';
import {
  EncryptionResultMessageType,
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
} from '@privacyresearch/libsignal-protocol-typescript';
import type { DeviceType } from '@privacyresearch/libsignal-protocol-typescript';
import { base64ToBytes } from '@/services/e2ee/e2eeBase64';
import { ensureLibsignalWeb } from '@/services/e2ee/e2eeSignalInit';
import {
  ensureEchoSignalBootstrap,
  getCachedLocalProtocolDeviceId,
  setCachedLocalProtocolDeviceId,
} from '@/services/e2ee/e2eeSignalStore';
import type { E2eeOutboundEncryption } from '@/services/e2ee/e2eeTypes';

type PeerBundleWire = {
  deviceId: string;
  protocolDeviceId?: number;
  registrationId: number;
  identityPubB64: string;
  signedPreKey: {
    keyId: number;
    pubKeyB64: string;
    signatureB64: string;
  };
  oneTimePreKey?: { keyId: number; pubKeyB64: string };
};

type LibsignalCiphertextPart = {
  type: number;
  body: string;
  registrationId?: number;
};

type E2eeV2Wire = {
  kind: 'echo-e2ee-v2';
  parts: Array<LibsignalCiphertextPart & { targetProtocolDeviceId: number }>;
};

function b64ToBuf(s: string): ArrayBuffer {
  const u = base64ToBytes(s.trim());
  return u.buffer.slice(
    u.byteOffset,
    u.byteOffset + u.byteLength,
  ) as ArrayBuffer;
}

function peerBundleToDeviceType(b: PeerBundleWire): DeviceType<ArrayBuffer> {
  const out: DeviceType<ArrayBuffer> = {
    identityKey: b64ToBuf(b.identityPubB64),
    signedPreKey: {
      keyId: b.signedPreKey.keyId,
      publicKey: b64ToBuf(b.signedPreKey.pubKeyB64),
      signature: b64ToBuf(b.signedPreKey.signatureB64),
    },
    registrationId: b.registrationId,
  };
  if (b.oneTimePreKey) {
    out.preKey = {
      keyId: b.oneTimePreKey.keyId,
      publicKey: b64ToBuf(b.oneTimePreKey.pubKeyB64),
    };
  }
  return out;
}

function normalizePeerBundle(b: PeerBundleWire): PeerBundleWire {
  const pid =
    typeof b.protocolDeviceId === 'number' &&
    Number.isInteger(b.protocolDeviceId) &&
    b.protocolDeviceId >= 1
      ? b.protocolDeviceId
      : 1;
  return { ...b, protocolDeviceId: pid };
}

async function fetchPeerDeviceBundles(
  authToken: string | null | undefined,
  peerUserId: string,
): Promise<PeerBundleWire[]> {
  const token = authToken?.trim() ?? '';
  if (!token)
    throw new Error('Not authenticated — cannot fetch peer E2EE bundle');
  const res = (await echoFetch(
    token,
    `/e2ee/peer/${encodeURIComponent(peerUserId)}/device-bundle`,
    { method: 'GET' },
  )) as {
    bundle?: PeerBundleWire;
    bundles?: PeerBundleWire[];
  };
  const raw =
    Array.isArray(res.bundles) && res.bundles.length > 0
      ? res.bundles
      : res.bundle
        ? [res.bundle]
        : [];
  const out = raw
    .filter((x) => x?.identityPubB64 && x.signedPreKey)
    .map((x) => normalizePeerBundle(x as PeerBundleWire));
  if (!out.length) throw new Error('Peer E2EE bundle incomplete');
  return out;
}

async function resolveSenderProtocolDeviceId(
  viewerUserId: string,
  senderDeviceUuid: string,
  authToken: string | null | undefined,
): Promise<number> {
  const cached = await getCachedLocalProtocolDeviceId(viewerUserId);
  if (cached !== undefined) return cached;
  const token = authToken?.trim() ?? '';
  if (!token) return 1;
  const rows = await getEchoE2eeDevices(token);
  const row = rows.devices.find(
    (d) => d.deviceId === senderDeviceUuid && !d.revokedAt,
  );
  const pid =
    row && typeof row.protocolDeviceId === 'number' && row.protocolDeviceId >= 1
      ? row.protocolDeviceId
      : 1;
  await setCachedLocalProtocolDeviceId(viewerUserId, pid);
  return pid;
}

function senderPidFromEnvelope(envelope: unknown): number {
  const env = envelope as { senderProtocolDeviceId?: unknown } | null;
  const n = env?.senderProtocolDeviceId;
  if (typeof n === 'number' && Number.isInteger(n) && n >= 1) return n;
  return 1;
}

async function decryptLibsignalPayload(
  store: Awaited<ReturnType<typeof ensureEchoSignalBootstrap>>['store'],
  authorUserId: string,
  senderProtocolDeviceId: number,
  parsed: LibsignalCiphertextPart,
): Promise<ArrayBuffer> {
  const addr = new SignalProtocolAddress(
    `echo:${authorUserId}`,
    senderProtocolDeviceId,
  );
  const cipher = new SessionCipher(store, addr);
  if (typeof parsed.body !== 'string' || typeof parsed.type !== 'number') {
    throw new Error('Invalid E2EE ciphertext payload');
  }
  if (parsed.type === EncryptionResultMessageType.PreKeyWhisperMessage) {
    return await cipher.decryptPreKeyWhisperMessage(parsed.body, 'base64');
  }
  return await cipher.decryptWhisperMessage(parsed.body, 'base64');
}

/** Binary payload (e.g. voice media seed) wrapped for a peer device via LibSignal. */
export async function e2eeEncryptDmBytes(opts: {
  viewerUserId: string;
  peerUserId: string;
  plaintextBytes: Uint8Array;
  senderDeviceId: string;
  authToken: string | null | undefined;
  /** When set, encrypt only for this peer device UUID (voice envelopes). */
  peerRecipientDeviceUuid?: string;
}): Promise<E2eeOutboundEncryption> {
  await ensureLibsignalWeb();
  const { store } = await ensureEchoSignalBootstrap(opts.viewerUserId);
  let bundles = await fetchPeerDeviceBundles(opts.authToken, opts.peerUserId);
  const uuid = opts.peerRecipientDeviceUuid?.trim();
  if (uuid) {
    bundles = bundles.filter((b) => b.deviceId === uuid);
    if (!bundles.length) {
      throw new Error('Peer E2EE bundle incomplete for requested device');
    }
  }
  const senderPid = await resolveSenderProtocolDeviceId(
    opts.viewerUserId,
    opts.senderDeviceId,
    opts.authToken,
  );
  const pt = opts.plaintextBytes;
  const ptBuf = pt.buffer.slice(
    pt.byteOffset,
    pt.byteOffset + pt.byteLength,
  ) as ArrayBuffer;

  if (bundles.length === 1) {
    const bundle = bundles[0]!;
    const addr = new SignalProtocolAddress(
      `echo:${opts.peerUserId}`,
      bundle.protocolDeviceId ?? 1,
    );
    const device = peerBundleToDeviceType(bundle);
    const builder = new SessionBuilder(store, addr);
    await builder.processPreKey(device);
    const cipher = new SessionCipher(store, addr);
    const msg = await cipher.encrypt(ptBuf);
    return {
      kind: 'e2ee',
      version: 1,
      senderDeviceId: opts.senderDeviceId,
      envelope: {
        protocol: 'libsignal-v1',
        signalMsgType: msg.type,
        senderProtocolDeviceId: senderPid,
      },
      ciphertext: JSON.stringify({
        type: msg.type,
        body: msg.body,
        registrationId: msg.registrationId,
      }),
    };
  }

  const parts: E2eeV2Wire['parts'] = [];
  for (const bundle of bundles) {
    const addr = new SignalProtocolAddress(
      `echo:${opts.peerUserId}`,
      bundle.protocolDeviceId ?? 1,
    );
    const device = peerBundleToDeviceType(bundle);
    const builder = new SessionBuilder(store, addr);
    await builder.processPreKey(device);
    const cipher = new SessionCipher(store, addr);
    const msg = await cipher.encrypt(ptBuf);
    const body = typeof msg.body === 'string' ? msg.body : '';
    if (!body)
      throw new Error('LibSignal encrypt returned empty ciphertext body');
    parts.push({
      targetProtocolDeviceId: bundle.protocolDeviceId ?? 1,
      type: msg.type,
      body,
      ...(msg.registrationId !== undefined
        ? { registrationId: msg.registrationId }
        : {}),
    });
  }
  const wire: E2eeV2Wire = { kind: 'echo-e2ee-v2', parts };
  return {
    kind: 'e2ee',
    version: 2,
    senderDeviceId: opts.senderDeviceId,
    envelope: {
      protocol: 'libsignal-v1-multi',
      senderProtocolDeviceId: senderPid,
      partCount: parts.length,
    },
    ciphertext: JSON.stringify(wire),
  };
}

export async function e2eeDecryptIncomingDmBytes(opts: {
  viewerUserId: string;
  authorUserId: string;
  envelope: unknown;
  ciphertext: string;
}): Promise<Uint8Array> {
  const envTop = opts.envelope as { alg?: string; protocol?: string } | null;
  if (envTop && envTop.alg === 'AES-GCM') {
    throw new Error('Legacy AES-GCM thread keys cannot decrypt voice material');
  }
  let isV2 = envTop?.protocol === 'libsignal-v1-multi';
  if (!isV2) {
    try {
      const probe = JSON.parse(opts.ciphertext) as { kind?: unknown };
      if (probe?.kind === 'echo-e2ee-v2') isV2 = true;
    } catch {
      /* single-device ciphertext */
    }
  }
  if (isV2) {
    await ensureLibsignalWeb();
    const { store } = await ensureEchoSignalBootstrap(opts.viewerUserId);
    const myPid =
      (await getCachedLocalProtocolDeviceId(opts.viewerUserId)) ?? 1;
    let wire: E2eeV2Wire;
    try {
      wire = JSON.parse(opts.ciphertext) as E2eeV2Wire;
    } catch {
      throw new Error('Invalid E2EE ciphertext payload');
    }
    if (wire?.kind !== 'echo-e2ee-v2' || !Array.isArray(wire.parts)) {
      throw new Error('Invalid E2EE ciphertext payload');
    }
    const part =
      wire.parts.find((p) => p.targetProtocolDeviceId === myPid) ??
      wire.parts[0];
    if (!part) throw new Error('Invalid E2EE ciphertext payload');
    const senderPid = senderPidFromEnvelope(opts.envelope);
    const buf = await decryptLibsignalPayload(
      store,
      opts.authorUserId,
      senderPid,
      part,
    );
    return new Uint8Array(buf);
  }
  await ensureLibsignalWeb();
  const { store } = await ensureEchoSignalBootstrap(opts.viewerUserId);
  const senderPid = senderPidFromEnvelope(opts.envelope);
  const parsed = JSON.parse(opts.ciphertext) as LibsignalCiphertextPart;
  const buf = await decryptLibsignalPayload(
    store,
    opts.authorUserId,
    senderPid,
    parsed,
  );
  return new Uint8Array(buf);
}

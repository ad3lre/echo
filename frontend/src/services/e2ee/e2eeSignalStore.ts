import type {
  Direction,
  KeyPairType,
  StorageType,
} from '@privacyresearch/libsignal-protocol-typescript';
import { KeyHelper } from '@privacyresearch/libsignal-protocol-typescript';
import { base64ToBytes, bytesToBase64 } from '@/services/e2ee/e2eeBase64';
import { ensureLibsignalWeb } from '@/services/e2ee/e2eeSignalInit';
import type { E2eeDeviceRegistration } from '@/services/e2ee/e2eeTypes';
import {
  echoSignalPersistenceExportPrefix,
  echoSignalPersistenceGet,
  echoSignalPersistenceImportEntries,
  echoSignalPersistenceRemove,
  echoSignalPersistenceSet,
} from '@/services/e2ee/e2eeSignalPersistence';
import { randomUuidV4 } from '@/utils/randomUuid';

function bufToB64(ab: ArrayBuffer): string {
  return bytesToBase64(new Uint8Array(ab));
}

function b64ToBuf(s: string): ArrayBuffer {
  const u = base64ToBytes(s);
  return u.buffer.slice(
    u.byteOffset,
    u.byteOffset + u.byteLength,
  ) as ArrayBuffer;
}

function keyPairToJson(kp: KeyPairType<ArrayBuffer>): string {
  return JSON.stringify({
    pub: bufToB64(kp.pubKey),
    priv: bufToB64(kp.privKey),
  });
}

function keyPairFromJson(s: string): KeyPairType<ArrayBuffer> | undefined {
  try {
    const o = JSON.parse(s) as { pub?: string; priv?: string };
    if (typeof o.pub !== 'string' || typeof o.priv !== 'string')
      return undefined;
    return { pubKey: b64ToBuf(o.pub), privKey: b64ToBuf(o.priv) };
  } catch {
    return undefined;
  }
}

/**
 * LibSignal calls isTrustedIdentity with address.getName() ("echo:userId") but calls
 * saveIdentity with address.toString() ("echo:userId.1"). Normalise both to the name
 * form so they share the same IDB slot and TOFU pinning actually works.
 */
function normalizeIdentAddress(identifier: string): string {
  const lastDot = identifier.lastIndexOf('.');
  if (lastDot <= 0) return identifier;
  const suffix = identifier.slice(lastDot + 1);
  // Only strip if everything after the last dot is a non-negative integer (device id).
  return /^\d+$/.test(suffix) ? identifier.slice(0, lastDot) : identifier;
}

/**
 * Per-account libsignal persistence (IndexedDB with localStorage migration). Keys are scoped
 * to `authUserId` so switching accounts does not leak state.
 */
export function createEchoSignalProtocolStore(authUserId: string): StorageType {
  const scope = authUserId.trim();
  const prefix = `echo_sig_v1:${scope}:`;

  function k(sub: string): string {
    return `${prefix}${sub}`;
  }

  return {
    async getIdentityKeyPair(): Promise<KeyPairType<ArrayBuffer> | undefined> {
      const raw = await echoSignalPersistenceGet(k('id_keypair'));
      if (!raw) return undefined;
      return keyPairFromJson(raw);
    },

    async getLocalRegistrationId(): Promise<number | undefined> {
      const raw = await echoSignalPersistenceGet(k('registration_id'));
      if (!raw) return undefined;
      const n = Number(raw);
      return Number.isInteger(n) && n > 0 ? n : undefined;
    },

    async isTrustedIdentity(
      identifier: string,
      identityKey: ArrayBuffer,
      _direction: Direction,
    ): Promise<boolean> {
      const stored = await echoSignalPersistenceGet(
        k(`ident:${normalizeIdentAddress(identifier)}`),
      );
      if (!stored) return true;
      return stored === bufToB64(identityKey);
    },

    async saveIdentity(
      identifier: string,
      publicKey: ArrayBuffer,
      _nonblockingApproval?: boolean,
    ): Promise<boolean> {
      await echoSignalPersistenceSet(
        k(`ident:${normalizeIdentAddress(identifier)}`),
        bufToB64(publicKey),
      );
      return true;
    },

    async loadPreKey(
      keyId: string | number,
    ): Promise<KeyPairType<ArrayBuffer> | undefined> {
      const raw = await echoSignalPersistenceGet(k(`prek:${keyId}`));
      if (!raw) return undefined;
      return keyPairFromJson(raw);
    },

    async storePreKey(
      keyId: string | number,
      keyPair: KeyPairType<ArrayBuffer>,
    ): Promise<void> {
      await echoSignalPersistenceSet(
        k(`prek:${keyId}`),
        keyPairToJson(keyPair),
      );
    },

    async removePreKey(keyId: string | number): Promise<void> {
      await echoSignalPersistenceRemove(k(`prek:${keyId}`));
    },

    async storeSession(encodedAddress: string, record: string): Promise<void> {
      await echoSignalPersistenceSet(k(`sess:${encodedAddress}`), record);
    },

    async loadSession(encodedAddress: string): Promise<string | undefined> {
      return (
        (await echoSignalPersistenceGet(k(`sess:${encodedAddress}`))) ??
        undefined
      );
    },

    async loadSignedPreKey(
      keyId: string | number,
    ): Promise<KeyPairType<ArrayBuffer> | undefined> {
      const raw = await echoSignalPersistenceGet(k(`sigk:${keyId}`));
      if (!raw) return undefined;
      return keyPairFromJson(raw);
    },

    async storeSignedPreKey(
      keyId: string | number,
      keyPair: KeyPairType<ArrayBuffer>,
    ): Promise<void> {
      await echoSignalPersistenceSet(
        k(`sigk:${keyId}`),
        keyPairToJson(keyPair),
      );
    },

    async removeSignedPreKey(keyId: string | number): Promise<void> {
      await echoSignalPersistenceRemove(k(`sigk:${keyId}`));
    },
  };
}

const storeCache = new Map<string, StorageType>();

export function getEchoSignalProtocolStore(authUserId: string): StorageType {
  const id = authUserId.trim();
  let s = storeCache.get(id);
  if (!s) {
    s = createEchoSignalProtocolStore(id);
    storeCache.set(id, s);
  }
  return s;
}

export async function exportEchoSignalLocalBackup(
  authUserId: string,
): Promise<Record<string, string>> {
  const prefix = `echo_sig_v1:${authUserId.trim()}:`;
  return echoSignalPersistenceExportPrefix(prefix);
}

export async function importEchoSignalLocalBackup(
  authUserId: string,
  backup: Record<string, string>,
): Promise<void> {
  const prefix = `echo_sig_v1:${authUserId.trim()}:`;
  const filtered: Record<string, string> = {};
  for (const [key, val] of Object.entries(backup)) {
    if (!key.startsWith(prefix)) continue;
    filtered[key] = val;
  }
  await echoSignalPersistenceImportEntries(filtered);
  storeCache.delete(authUserId.trim());
}

const DEVICE_UUID_KEY = 'echo_e2ee_device_id_v1';

function protocolPidStorageKey(authUserId: string): string {
  return `echo_sig_v1:${authUserId.trim()}:my_protocol_device_id`;
}

/** LibSignal protocol device id for this browser (from server `echo_e2ee_devices`). */
export async function getCachedLocalProtocolDeviceId(
  authUserId: string,
): Promise<number | undefined> {
  const raw = (
    await echoSignalPersistenceGet(protocolPidStorageKey(authUserId))
  )?.trim();
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
}

export async function setCachedLocalProtocolDeviceId(
  authUserId: string,
  protocolDeviceId: number,
): Promise<void> {
  if (!Number.isInteger(protocolDeviceId) || protocolDeviceId < 1) return;
  await echoSignalPersistenceSet(
    protocolPidStorageKey(authUserId),
    String(protocolDeviceId),
  );
}

async function getOrCreateEchoServerDeviceId(): Promise<string> {
  const existing =
    (await echoSignalPersistenceGet(DEVICE_UUID_KEY))?.trim() ?? '';
  if (existing) return existing;
  const id = randomUuidV4();
  try {
    await echoSignalPersistenceSet(DEVICE_UUID_KEY, id);
  } catch {
    /* private mode */
  }
  return id;
}

async function listOneTimePrekeyPublicRows(authUserId: string): Promise<
  {
    keyId: number;
    pubKeyB64: string;
  }[]
> {
  const prefix = `echo_sig_v1:${authUserId.trim()}:prek:`;
  const rows = await echoSignalPersistenceExportPrefix(prefix);
  const out: { keyId: number; pubKeyB64: string }[] = [];
  for (const [key, raw] of Object.entries(rows)) {
    if (!key.startsWith(prefix)) continue;
    const idPart = key.slice(prefix.length);
    const keyId = Number(idPart);
    if (!Number.isInteger(keyId)) continue;
    const kp = keyPairFromJson(raw);
    if (!kp) continue;
    out.push({ keyId, pubKeyB64: bufToB64(kp.pubKey) });
  }
  out.sort((a, b) => a.keyId - b.keyId);
  return out;
}

async function readSignedPreKeyPublicRow(
  authUserId: string,
  keyId: number,
): Promise<{ pubKeyB64: string; signatureB64: string } | null> {
  const prefix = `echo_sig_v1:${authUserId.trim()}:`;
  const kpRaw = await echoSignalPersistenceGet(`${prefix}sigk:${keyId}`);
  const sigRaw = await echoSignalPersistenceGet(`${prefix}sigk_sig:${keyId}`);
  if (!kpRaw || !sigRaw) return null;
  const kp = keyPairFromJson(kpRaw);
  if (!kp) return null;
  return { pubKeyB64: bufToB64(kp.pubKey), signatureB64: sigRaw };
}

/**
 * Ensures Curve25519 identity + prekeys exist locally and returns a server registration payload.
 */
export async function ensureEchoSignalBootstrap(
  authUserId: string,
): Promise<{ store: StorageType; registration: E2eeDeviceRegistration }> {
  await ensureLibsignalWeb();
  const uid = authUserId.trim();
  if (!uid) throw new Error('authUserId required');
  const store = getEchoSignalProtocolStore(uid);
  const prefix = `echo_sig_v1:${uid}:`;

  let idPair = await store.getIdentityKeyPair();
  if (!idPair) {
    idPair = await KeyHelper.generateIdentityKeyPair();
    await echoSignalPersistenceSet(
      `${prefix}id_keypair`,
      keyPairToJson(idPair),
    );
  }

  let registrationId = await store.getLocalRegistrationId();
  if (!registrationId) {
    registrationId = KeyHelper.generateRegistrationId();
    await echoSignalPersistenceSet(
      `${prefix}registration_id`,
      String(registrationId),
    );
  }

  const signedRow = await readSignedPreKeyPublicRow(uid, 1);
  if (!signedRow) {
    const signed = await KeyHelper.generateSignedPreKey(idPair, 1);
    await store.storeSignedPreKey(signed.keyId, signed.keyPair);
    await echoSignalPersistenceSet(
      `${prefix}sigk_sig:${signed.keyId}`,
      bufToB64(signed.signature),
    );
    await echoSignalPersistenceSet(`${prefix}active_signed_prekey_id`, '1');
  }

  let activeSignedPreKeyId = Number(
    (await echoSignalPersistenceGet(`${prefix}active_signed_prekey_id`)) ?? '1',
  );
  if (!Number.isInteger(activeSignedPreKeyId) || activeSignedPreKeyId < 1) {
    activeSignedPreKeyId = 1;
  }
  const lastRotRaw = await echoSignalPersistenceGet(
    `${prefix}signed_prekey_rotated_ms`,
  );
  const lastRot = lastRotRaw ? Number(lastRotRaw) : 0;
  const ROTATE_MS = 14 * 86400000;
  if (
    Number.isFinite(lastRot) &&
    lastRot > 0 &&
    Date.now() - lastRot > ROTATE_MS &&
    idPair
  ) {
    const newId = activeSignedPreKeyId + 1;
    const signed = await KeyHelper.generateSignedPreKey(idPair, newId);
    await store.storeSignedPreKey(signed.keyId, signed.keyPair);
    await echoSignalPersistenceSet(
      `${prefix}sigk_sig:${signed.keyId}`,
      bufToB64(signed.signature),
    );
    await echoSignalPersistenceSet(
      `${prefix}active_signed_prekey_id`,
      String(newId),
    );
    await echoSignalPersistenceSet(
      `${prefix}signed_prekey_rotated_ms`,
      String(Date.now()),
    );
    activeSignedPreKeyId = newId;
  } else if (!Number.isFinite(lastRot) || lastRot <= 0) {
    await echoSignalPersistenceSet(
      `${prefix}signed_prekey_rotated_ms`,
      String(Date.now()),
    );
  }

  const activeSignedRow = await readSignedPreKeyPublicRow(
    uid,
    activeSignedPreKeyId,
  );
  if (!activeSignedRow) {
    const signed = await KeyHelper.generateSignedPreKey(
      idPair,
      activeSignedPreKeyId,
    );
    await store.storeSignedPreKey(signed.keyId, signed.keyPair);
    await echoSignalPersistenceSet(
      `${prefix}sigk_sig:${signed.keyId}`,
      bufToB64(signed.signature),
    );
  }

  const existingOtks = await listOneTimePrekeyPublicRows(uid);
  if (existingOtks.length < 5) {
    const start = existingOtks.length
      ? existingOtks[existingOtks.length - 1]!.keyId + 1
      : 1;
    for (let i = 0; i < 10; i += 1) {
      const pk = await KeyHelper.generatePreKey(start + i);
      await store.storePreKey(pk.keyId, pk.keyPair);
    }
  }

  const deviceId = await getOrCreateEchoServerDeviceId();
  const idPubB64 = bufToB64(idPair.pubKey);
  const activeId = Number(
    (await echoSignalPersistenceGet(`${prefix}active_signed_prekey_id`)) ?? '1',
  );
  const signedKeyId =
    Number.isInteger(activeId) && activeId >= 1 ? activeId : 1;
  const sp = await readSignedPreKeyPublicRow(uid, signedKeyId);
  if (!sp) throw new Error('Signed prekey missing after bootstrap');
  const otks = await listOneTimePrekeyPublicRows(uid);

  const registration: E2eeDeviceRegistration = {
    deviceId,
    identityKey: idPubB64,
    registrationId,
    signedPrekey: {
      keyId: signedKeyId,
      pubKeyB64: sp.pubKeyB64,
      signatureB64: sp.signatureB64,
    },
    oneTimePrekeys: otks,
  };
  return { store, registration };
}

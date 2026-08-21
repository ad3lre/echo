import {
  ciphersuites,
  getCiphersuiteFromName,
  getCiphersuiteImpl,
  mlsExporter,
  type CiphersuiteImpl,
  type ClientState,
} from 'ts-mls';

/**
 * Ciphersuite for Echo voice MLS groups:
 * MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519.
 * AES-128-GCM matches LiveKit's frame-encryption key size (128-bit), and
 * X25519 / Ed25519 are fast and broadly supported across WebCrypto and SDKs.
 */
export const ECHO_MLS_CIPHERSUITE_NAME =
  'MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519' as const;

/** LiveKit AES-128-GCM frame key length in bytes. */
export const ECHO_MLS_MEDIA_KEY_BYTES = 16;

/** Domain-separation label + context for the legacy shared epoch media key. */
const MEDIA_KEY_LABEL = 'echo-voice-sframe';
const MEDIA_KEY_CONTEXT = new TextEncoder().encode('echo-voice/v2');

/** Per-sender derivation (DAVE-style): label + sender identity context. */
const SENDER_MEDIA_KEY_LABEL = 'echo-voice-sframe-sender';
const senderContextEnc = new TextEncoder();

let cachedImpl: Promise<CiphersuiteImpl> | null = null;

/** Lazily-initialized, shared ciphersuite implementation (singleton). */
export function echoMlsCiphersuite(): Promise<CiphersuiteImpl> {
  if (!cachedImpl) {
    cachedImpl = getCiphersuiteImpl(
      getCiphersuiteFromName(ECHO_MLS_CIPHERSUITE_NAME),
    );
  }
  return cachedImpl;
}

export { ciphersuites };

function toArrayBuffer(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(
    u.byteOffset,
    u.byteOffset + u.byteLength,
  ) as ArrayBuffer;
}

/** UTF-8 MLS exporter context for a sender's LiveKit participant identity. */
export function encodeSenderKeyContext(senderUserId: string): Uint8Array {
  return senderContextEnc.encode(`sender:${senderUserId.trim()}`);
}

/**
 * Derive the LiveKit media key for the current MLS epoch from the group's
 * exporter secret. Every member derives byte-identical material for a given
 * epoch (legacy shared-key mode).
 */
export async function deriveMediaKeyForEpoch(
  state: ClientState,
  cs: CiphersuiteImpl,
): Promise<ArrayBuffer> {
  const raw = await mlsExporter(
    state.keySchedule.exporterSecret,
    MEDIA_KEY_LABEL,
    MEDIA_KEY_CONTEXT,
    ECHO_MLS_MEDIA_KEY_BYTES,
    cs,
  );
  return toArrayBuffer(raw);
}

/**
 * Derive a per-sender media key for the current MLS epoch (DAVE-style). Each
 * sender encrypts with their own key; receivers install the same material under
 * that sender's LiveKit participant identity.
 */
export async function deriveMediaKeyForSender(
  state: ClientState,
  cs: CiphersuiteImpl,
  senderUserId: string,
): Promise<ArrayBuffer> {
  const raw = await mlsExporter(
    state.keySchedule.exporterSecret,
    SENDER_MEDIA_KEY_LABEL,
    encodeSenderKeyContext(senderUserId),
    ECHO_MLS_MEDIA_KEY_BYTES,
    cs,
  );
  return toArrayBuffer(raw);
}

/** Current MLS epoch of a group state. */
export function epochOf(state: ClientState): bigint {
  return state.groupContext.epoch;
}

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

/** Domain-separation label + context for the exported media key. */
const MEDIA_KEY_LABEL = 'echo-voice-sframe';
const MEDIA_KEY_CONTEXT = new TextEncoder().encode('echo-voice/v2');

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

/**
 * Derive the LiveKit media key for the current MLS epoch from the group's
 * exporter secret. Every member derives byte-identical material for a given
 * epoch, so no key transport is needed.
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

/** Current MLS epoch of a group state. */
export function epochOf(state: ClientState): bigint {
  return state.groupContext.epoch;
}

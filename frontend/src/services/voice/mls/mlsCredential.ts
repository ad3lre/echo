import type { AuthenticationService, Credential, CiphersuiteImpl } from 'ts-mls';
import { bytesToBase64, base64ToBytes } from '@/services/e2ee/e2eeBase64';
import {
  echoSignalPersistenceGet,
  echoSignalPersistenceSet,
} from '@/services/e2ee/e2eeSignalPersistence';

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Basic MLS credential identity for an Echo device: `echo:<userId>:<deviceId>`. */
export function buildEchoCredential(
  userId: string,
  deviceId: string,
): Credential {
  return {
    credentialType: 'basic',
    identity: enc.encode(`echo:${userId.trim()}:${deviceId.trim()}`),
  };
}

export type EchoCredentialIdentity = { userId: string; deviceId: string };

export function parseEchoCredentialIdentity(
  credential: Credential,
): EchoCredentialIdentity | null {
  if (credential.credentialType !== 'basic') return null;
  const s = dec.decode(credential.identity);
  const m = /^echo:([^:]+):(.+)$/.exec(s);
  if (!m) return null;
  const userId = m[1]?.trim() ?? '';
  const deviceId = m[2]?.trim() ?? '';
  if (!userId || !deviceId) return null;
  return { userId, deviceId };
}

// --- Persistent per-device MLS signature keypair (stable across key packages) ---

function sigKeyStoreKey(userId: string): string {
  return `echo_mls_v1:${userId.trim()}:sigkey`;
}

export type EchoMlsSignatureKeyPair = {
  publicKey: Uint8Array;
  signKey: Uint8Array;
};

/**
 * Load (or generate + persist) this device's stable MLS signature keypair. A
 * stable key makes the TOFU identity pin meaningful across epochs and reconnects.
 */
export async function getOrCreateMlsSignatureKeyPair(
  userId: string,
  cs: CiphersuiteImpl,
): Promise<EchoMlsSignatureKeyPair> {
  const stored = await echoSignalPersistenceGet(sigKeyStoreKey(userId));
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as { pub: string; sk: string };
      if (parsed?.pub && parsed?.sk) {
        return {
          publicKey: base64ToBytes(parsed.pub),
          signKey: base64ToBytes(parsed.sk),
        };
      }
    } catch {
      /* regenerate below */
    }
  }
  const kp = await cs.signature.keygen();
  await echoSignalPersistenceSet(
    sigKeyStoreKey(userId),
    JSON.stringify({
      pub: bytesToBase64(kp.publicKey),
      sk: bytesToBase64(kp.signKey),
    }),
  );
  return kp;
}

// --- TOFU identity pinning for peers ---

function pinKey(viewerUserId: string, peer: EchoCredentialIdentity): string {
  return `echo_mls_v1:${viewerUserId.trim()}:pin:${peer.userId}:${peer.deviceId}`;
}

/**
 * Result of validating a peer credential. `changed` means the device's signature
 * key differs from a previously-pinned value — a potential MITM / key-injection
 * attempt that the UI should surface.
 */
export type CredentialValidation =
  | { ok: true; pinned: boolean }
  | { ok: false; reason: 'unauthorized_user' | 'identity_changed' };

export type EchoMlsAuthOptions = {
  viewerUserId: string;
  /** Set of user ids currently authorized in the voice channel (server roster). */
  isAuthorizedUser: (userId: string) => boolean;
  /** Invoked when a peer's pinned identity changes (possible attack). */
  onIdentityChanged?: (peer: EchoCredentialIdentity) => void;
};

/**
 * Build the MLS {@link AuthenticationService} that gates group membership:
 *  1. The credential's claimed user id must be an authorized channel member
 *     (closes server-injected-device MITM).
 *  2. The signature key is TOFU-pinned per (user, device); a changed key for a
 *     known device is rejected and surfaced (closes silent key-swap MITM).
 */
export function createEchoMlsAuthService(
  opts: EchoMlsAuthOptions,
): AuthenticationService {
  return {
    async validateCredential(
      credential: Credential,
      signaturePublicKey: Uint8Array,
    ): Promise<boolean> {
      const id = parseEchoCredentialIdentity(credential);
      if (!id) return false;
      if (!opts.isAuthorizedUser(id.userId)) return false;
      const key = pinKey(opts.viewerUserId, id);
      const pinnedB64 = await echoSignalPersistenceGet(key);
      const presentedB64 = bytesToBase64(signaturePublicKey);
      if (pinnedB64 === undefined) {
        await echoSignalPersistenceSet(key, presentedB64);
        return true;
      }
      if (pinnedB64 !== presentedB64) {
        opts.onIdentityChanged?.(id);
        return false;
      }
      return true;
    },
  };
}

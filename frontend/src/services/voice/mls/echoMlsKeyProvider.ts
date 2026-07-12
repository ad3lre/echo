import {
  BaseKeyProvider,
  createKeyMaterialFromBuffer,
  type KeyProviderOptions,
} from 'livekit-client';

/**
 * LiveKit key provider for voice E2EE v2 (MLS).
 *
 * Uses per-sender keys (DAVE-style): each participant encrypts with a key derived
 * from the MLS exporter and their user id. Receivers install remote sender keys
 * under the matching LiveKit participant identity.
 *
 * {@link setEpochKeys} installs all roster keys at a keyring index so in-flight
 * frames under the previous index still decrypt during epoch rotation.
 */
/** Keyring slots for in-band epoch rotation; epoch keyIndex = epoch % this. */
export const ECHO_MLS_KEYRING_SIZE = 16;

export class EchoMlsKeyProvider extends BaseKeyProvider {
  constructor(options?: Partial<Omit<KeyProviderOptions, 'sharedKey'>>) {
    super({
      sharedKey: false,
      ratchetWindowSize: 0,
      failureTolerance: -1,
      ...options,
    });
  }

  /** Number of distinct keyring slots; epoch keyIndex is `epoch % keyringSize`. */
  get keyringSize(): number {
    return this.getOptions().keyringSize;
  }

  /** Map an MLS epoch (bigint) to its keyring index. */
  keyIndexForEpoch(epoch: bigint): number {
    const size = BigInt(this.keyringSize);
    return Number(((epoch % size) + size) % size);
  }

  /** Install one sender's media key at the given keyring index. */
  async setSenderEpochKey(
    participantIdentity: string,
    raw: ArrayBuffer,
    keyIndex: number,
  ): Promise<void> {
    const identity = participantIdentity.trim();
    if (!identity) return;
    const material = await createKeyMaterialFromBuffer(raw);
    this.onSetEncryptionKey(material, identity, keyIndex);
  }

  /** Install all sender keys for an epoch rotation or initial connect. */
  async setEpochKeys(
    senderKeys: ReadonlyMap<string, ArrayBuffer>,
    keyIndex: number,
  ): Promise<void> {
    for (const [identity, raw] of senderKeys) {
      await this.setSenderEpochKey(identity, raw, keyIndex);
    }
  }
}

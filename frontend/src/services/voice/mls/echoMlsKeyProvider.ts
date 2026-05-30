import {
  BaseKeyProvider,
  createKeyMaterialFromBuffer,
  type KeyProviderOptions,
} from 'livekit-client';

/**
 * LiveKit key provider for voice E2EE v2 (MLS).
 *
 * `ExternalE2EEKeyProvider` only exposes `setKey()` with no key-index control, so
 * it cannot rotate keys in-band. We subclass {@link BaseKeyProvider} directly
 * (mirroring `ExternalE2EEKeyProvider`'s shared-key options) and expose
 * {@link setEpochKey} so each MLS epoch installs its derived media key at a
 * specific keyring index. The keyring (size 16) lets in-flight frames decrypt
 * under the previous index during the transition, so rotation never drops the
 * LiveKit connection.
 *
 * The raw key is the MLS-derived material; every participant derives identical
 * material from the MLS `exporter_secret`, so all clients install the same key at
 * the same index for a given epoch with zero key transport.
 */
/** Keyring slots for in-band epoch rotation; epoch keyIndex = epoch % this. */
export const ECHO_MLS_KEYRING_SIZE = 16;

export class EchoMlsKeyProvider extends BaseKeyProvider {
  constructor(options?: Partial<Omit<KeyProviderOptions, 'sharedKey'>>) {
    super({
      sharedKey: true,
      // Match ExternalE2EEKeyProvider: no auto-ratchet window, no failure-driven
      // ratcheting — epoch rotation is driven explicitly by MLS.
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

  /**
   * Install the media key for an epoch at the given keyring index without
   * reconnecting. `raw` is imported as HKDF key material exactly as
   * `ExternalE2EEKeyProvider.setKey(ArrayBuffer)` does, so the worker derives the
   * same encryption key across SDKs.
   */
  async setEpochKey(raw: ArrayBuffer, keyIndex: number): Promise<void> {
    const material = await createKeyMaterialFromBuffer(raw);
    this.onSetEncryptionKey(material, undefined, keyIndex);
  }
}

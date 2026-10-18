import {
  BaseKeyProvider,
  createKeyMaterialFromBuffer,
  type KeyProviderOptions,
} from 'livekit-client';

/**
 * LiveKit key provider for Element Call–style per-participant voice E2EE.
 *
 * Each participant encrypts with their own random sender key. Receivers install
 * remote sender keys under the matching LiveKit participant identity. Keyring
 * slots hold recent rotations so in-flight frames decrypt during rekey.
 */
export const ECHO_VOICE_KEYRING_SIZE = 16;

export class EchoParticipantKeyProvider extends BaseKeyProvider {
  constructor(options?: Partial<Omit<KeyProviderOptions, 'sharedKey'>>) {
    super({
      sharedKey: false,
      ratchetWindowSize: 0,
      failureTolerance: -1,
      keyringSize: ECHO_VOICE_KEYRING_SIZE,
      ...options,
    });
  }

  get keyringSize(): number {
    return this.getOptions().keyringSize;
  }

  /** Map a monotonic rotation counter to its keyring index. */
  keyIndexForRotation(rotation: number): number {
    const size = this.keyringSize;
    return ((rotation % size) + size) % size;
  }

  async setSenderKey(
    participantIdentity: string,
    raw: ArrayBuffer,
    keyIndex: number,
  ): Promise<void> {
    const identity = participantIdentity.trim();
    if (!identity) return;
    const material = await createKeyMaterialFromBuffer(raw);
    this.onSetEncryptionKey(material, identity, keyIndex);
  }

  async setSenderKeys(
    senderKeys: ReadonlyMap<string, ArrayBuffer>,
    keyIndex: number,
  ): Promise<void> {
    for (const [identity, raw] of senderKeys) {
      await this.setSenderKey(identity, raw, keyIndex);
    }
  }
}

/** @deprecated Alias kept for a short transition while callers rename imports. */
export const EchoMlsKeyProvider = EchoParticipantKeyProvider;
export const ECHO_MLS_KEYRING_SIZE = ECHO_VOICE_KEYRING_SIZE;

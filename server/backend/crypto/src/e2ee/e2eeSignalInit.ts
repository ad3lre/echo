import libsignalInit, {
  setWebCrypto,
} from '@privacyresearch/libsignal-protocol-typescript';

let initPromise: Promise<void> | null = null;

/**
 * Initializes libsignal curve/crypto and wires browser WebCrypto (required in browsers).
 */
export function ensureLibsignalWeb(): Promise<void> {
  if (typeof globalThis.crypto?.subtle === 'undefined') {
    return Promise.reject(
      new Error('WebCrypto (SubtleCrypto) is required for E2EE'),
    );
  }
  if (!initPromise) {
    initPromise = (async () => {
      await libsignalInit();
      setWebCrypto(globalThis.crypto);
    })();
  }
  return initPromise;
}

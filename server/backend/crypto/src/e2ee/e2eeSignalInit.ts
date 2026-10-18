import * as LibSignal from '@privacyresearch/libsignal-protocol-typescript';

let initPromise: Promise<void> | null = null;

/**
 * esbuild CJS→ESM interop sometimes puts the real init on `.default` of an
 * object (Apple MlsBridge IIFE: `(0, mod.default)()` then throws “default is
 * not a function / is an instance of Object”). Unwrap either shape.
 */
function resolveLibsignalInit(): () => Promise<unknown> | unknown {
  const mod = LibSignal as unknown as {
    default?: unknown;
    setWebCrypto?: (crypto: Crypto) => void;
  };
  const candidate = mod.default;
  if (typeof candidate === 'function') {
    return candidate as () => Promise<unknown> | unknown;
  }
  if (
    candidate &&
    typeof candidate === 'object' &&
    typeof (candidate as { default?: unknown }).default === 'function'
  ) {
    return (candidate as { default: () => Promise<unknown> | unknown }).default;
  }
  throw new TypeError(
    'libsignal init export is not a function (CJS/ESM interop)',
  );
}

function resolveSetWebCrypto(): (crypto: Crypto) => void {
  const mod = LibSignal as unknown as {
    default?: { setWebCrypto?: (crypto: Crypto) => void };
    setWebCrypto?: (crypto: Crypto) => void;
  };
  if (typeof mod.setWebCrypto === 'function') return mod.setWebCrypto;
  if (typeof mod.default?.setWebCrypto === 'function') {
    return mod.default.setWebCrypto;
  }
  throw new TypeError('libsignal setWebCrypto export is missing');
}

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
      await resolveLibsignalInit()();
      resolveSetWebCrypto()(globalThis.crypto);
    })();
  }
  return initPromise;
}

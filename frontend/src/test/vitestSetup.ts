import { beforeEach, vi } from 'vitest';
import { ensurePdfEnvironmentPolyfills } from '@/features/pdf/ensurePdfEnvironment';
import { registerAuthSessionApiBridge } from '@/api/authSessionBridge';

ensurePdfEnvironmentPolyfills();

/**
 * `authClient` calls into the session store via this bridge (avoids a store↔client import cycle).
 * Unit tests do not run `main.ts`, so register no-op handlers before each test file.
 */
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});

  registerAuthSessionApiBridge({
    invalidateSessionForReauth: () => {},
    clearLocalTokens: () => {},
  });
});

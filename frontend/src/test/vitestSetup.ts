import { beforeEach } from 'vitest';
import { registerAuthSessionApiBridge } from '@/api/authSessionBridge';

/**
 * `authClient` calls into the session store via this bridge (avoids a store↔client import cycle).
 * Unit tests do not run `main.ts`, so register no-op handlers before each test file.
 */
beforeEach(() => {
  registerAuthSessionApiBridge({
    invalidateSessionForReauth: () => {},
    clearLocalTokens: () => {},
  });
});

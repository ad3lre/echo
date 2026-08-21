import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { globalHttpRateLimitKey } from '../../api/globalRateLimitKey';
import {
  SESSION_COOKIE,
  createCsrfSecret,
  createSessionId,
  saveServerSession,
} from '../../auth/serverSession';

describe('globalHttpRateLimitKey', () => {
  it('falls back to IP for forged or unknown session cookies', async () => {
    const forged = await globalHttpRateLimitKey({
      headers: {},
      cookies: { [SESSION_COOKIE]: 'sid-abc' },
      ip: '1.2.3.4',
    } as Parameters<typeof globalHttpRateLimitKey>[0]);
    assert.equal(forged, 'ip:1.2.3.4');

    const unknownFormat = createSessionId();
    const unknown = await globalHttpRateLimitKey({
      headers: {},
      cookies: { [SESSION_COOKIE]: unknownFormat },
      ip: '1.2.3.4',
    } as Parameters<typeof globalHttpRateLimitKey>[0]);
    assert.equal(unknown, 'ip:1.2.3.4');
  });

  it('uses verified session cookie before IP for browser clients', async () => {
    const sessionId = createSessionId();
    await saveServerSession(sessionId, {
      userId: 'user-1',
      refreshTokenId: 'rt-1',
      csrfSecret: createCsrfSecret(),
    });

    const key = await globalHttpRateLimitKey({
      headers: {},
      cookies: { [SESSION_COOKIE]: sessionId },
      ip: '1.2.3.4',
    } as Parameters<typeof globalHttpRateLimitKey>[0]);
    assert.equal(key, `sid:${sessionId}`);
  });
});

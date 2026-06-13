import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { createAppLayoutReactionSocketFallback } from './useAppLayoutReactionSocketFallback';

describe('createAppLayoutReactionSocketFallback', () => {
  it('uses socket submitter when live socket is ready', async () => {
    const submitReactionToggleViaSocket = vi
      .fn()
      .mockResolvedValue({ ok: true });
    const { submitReactionToggle } = createAppLayoutReactionSocketFallback({
      authSession: { isAuthenticated: true, accessToken: 'tok' } as never,
      isLiveSocketReady: () => true,
      submitReactionToggleViaSocket,
      updateChannelMessageInBucket: vi.fn(),
      uiTransactions: {
        commitPendingReactionTogglesForMessage: vi.fn(),
      },
    });

    await submitReactionToggle('ch', 'msg', '👍');
    expect(submitReactionToggleViaSocket).toHaveBeenCalledWith(
      'ch',
      'msg',
      '👍',
      undefined,
    );
  });

  it('requires removing flag for HTTP fallback when socket is down', async () => {
    const { submitReactionToggle } = createAppLayoutReactionSocketFallback({
      authSession: { isAuthenticated: true, accessToken: 'tok' } as never,
      isLiveSocketReady: () => false,
      submitReactionToggleViaSocket: vi.fn(),
      updateChannelMessageInBucket: vi.fn(),
      uiTransactions: {
        commitPendingReactionTogglesForMessage: vi.fn(),
      },
    });

    const result = await submitReactionToggle('ch', 'msg', '👍');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error?.code).toBe('SOCKET_DISCONNECTED');
    }
  });
});

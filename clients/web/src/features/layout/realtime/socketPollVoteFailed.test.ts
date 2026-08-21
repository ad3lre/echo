import { describe, expect, it, vi } from 'vitest';
import { handleEchoPollVoteFailed } from '@/features/layout/realtime/socketPollVoteFailed';
import * as actionFailure from '@/features/layout/failures/actionFailurePropagation';

describe('handleEchoPollVoteFailed', () => {
  it('propagates action failure with trimmed detail', () => {
    const spy = vi
      .spyOn(actionFailure, 'propagateActionFailure')
      .mockImplementation(() => {});
    handleEchoPollVoteFailed({
      code: 'POLL_VOTE_ERR',
      channelId: 'c1',
      messageId: 'm1',
      detail: '  nope  ',
    });
    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0]![0];
    expect(arg.ok).toBe(false);
    expect(arg.error?.userMessage).toContain('nope');
    spy.mockRestore();
  });

  it('uses default detail when empty', () => {
    const spy = vi
      .spyOn(actionFailure, 'propagateActionFailure')
      .mockImplementation(() => {});
    handleEchoPollVoteFailed({ code: 'X' });
    const arg = spy.mock.calls[0]![0];
    expect(arg.error?.userMessage).toMatch(/poll vote/i);
    spy.mockRestore();
  });
});

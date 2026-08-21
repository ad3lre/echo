import { describe, expect, it, vi } from 'vitest';
import { ingestEchoMessageFailed } from '@/features/chat/ingest/socketMessageFailedIngest';
import * as primaryFlow from '@/features/layout/failures/primaryFlowFailure';
import * as actionFailure from '@/features/layout/failures/actionFailurePropagation';

describe('ingestEchoMessageFailed', () => {
  it('rolls back correlation id then optimistic message; dispatches window detail', () => {
    const rollback = vi.fn();
    const optimistic = vi.fn(() => 'draft');
    const prune = vi.fn();
    const dispatch = vi.fn();
    const reportSpy = vi
      .spyOn(primaryFlow, 'reportPrimaryFlowFailure')
      .mockImplementation(() => {});
    const actionSpy = vi
      .spyOn(actionFailure, 'propagateActionFailure')
      .mockImplementation(() => {});

    ingestEchoMessageFailed(
      {
        code: 'VALIDATION',
        channelId: 'c1',
        clientMessageId: 'cli1',
        correlationId: ' corr ',
        detail: 'oops',
      },
      {
        rollbackTransaction: rollback,
        rollbackOptimisticClientMessage: optimistic,
        prunePendingClientMessages: prune,
        dispatchEchoMessageFailed: dispatch,
      },
    );

    expect(rollback).toHaveBeenCalledWith('corr');
    expect(optimistic).toHaveBeenCalledWith('c1', 'cli1');
    expect(prune).toHaveBeenCalled();
    expect(reportSpy).toHaveBeenCalledTimes(1);
    expect(actionSpy).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'VALIDATION',
        draftContent: 'draft',
      }),
    );

    reportSpy.mockRestore();
    actionSpy.mockRestore();
  });

  it('uses propagateActionFailure when no clientMessageId', () => {
    const reportSpy = vi
      .spyOn(primaryFlow, 'reportPrimaryFlowFailure')
      .mockImplementation(() => {});
    const actionSpy = vi
      .spyOn(actionFailure, 'propagateActionFailure')
      .mockImplementation(() => {});

    ingestEchoMessageFailed(
      { code: 'FORBIDDEN', channelId: 'c1' },
      {
        rollbackTransaction: vi.fn(),
        rollbackOptimisticClientMessage: vi.fn(),
        prunePendingClientMessages: vi.fn(),
        dispatchEchoMessageFailed: vi.fn(),
      },
    );

    expect(reportSpy).not.toHaveBeenCalled();
    expect(actionSpy).toHaveBeenCalledTimes(1);

    reportSpy.mockRestore();
    actionSpy.mockRestore();
  });
});

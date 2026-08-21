import { describe, expect, it, vi } from 'vitest';
import { sendOutboundPollMessage } from '@/features/chat/send/socketOutboundPollSend';
import type { PollData, ReplyTo } from '@shared/types';
import type { SocketAdapterInstance } from '@/features/layout/realtime/socketOutbound';

function makePoll(): PollData {
  return {
    question: 'Q?',
    options: [{ id: 'a1', text: 'A1', votes: 0, voterIds: [] }],
  };
}

describe('sendOutboundPollMessage', () => {
  it('when connected with adapter and author: optimistic tx, local append, pending, adapter send', () => {
    const poll = makePoll();
    const replyTo: ReplyTo = {
      messageId: 'm0',
      authorName: 'x',
      content: 'c',
    };
    const sendMessage = vi.fn();
    const adapter = { sendMessage } as unknown as SocketAdapterInstance;
    const beginTransaction = vi.fn();
    const rollbackTransaction = vi.fn();
    const addLocal = vi.fn();
    const rememberPendingSentMessage = vi.fn();
    const reportPrimaryFlowFailure = vi.fn();
    const socketDiagInfo = vi.fn();
    let id = 0;
    const newClientMessageId = () => `cid_${++id}`;
    const newCorrelationId = () => `corr_${++id}`;

    sendOutboundPollMessage({
      channelId: 'ch1',
      content: '  hi ',
      mentions: undefined,
      replyTo,
      poll,
      authorId: 'u1',
      isSocketConnected: true,
      adapter,
      newClientMessageId,
      newCorrelationId,
      rememberPendingSentMessage,
      addLocal,
      uiTx: { beginTransaction, rollbackTransaction },
      reportPrimaryFlowFailure,
      socketDiagInfo,
    });

    expect(reportPrimaryFlowFailure).not.toHaveBeenCalled();
    expect(beginTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message-send',
        state: 'pending',
        channelId: 'ch1',
        clientMessageId: 'cid_1',
      }),
    );
    expect(addLocal).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'cid_1',
        authorId: 'u1',
        content: 'hi',
        poll,
        replyTo,
      }),
    );
    expect(rememberPendingSentMessage).toHaveBeenCalledWith(
      'ch1',
      'cid_1',
      'u1',
      replyTo,
    );
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 'ch1',
        content: 'hi',
        authorId: 'u1',
        replyTo,
        id: 'cid_1',
        correlationId: 'corr_2',
        poll,
      }),
    );
    expect(rollbackTransaction).not.toHaveBeenCalled();
  });

  it('when connected without adapter: reports failure and throws', () => {
    const reportPrimaryFlowFailure = vi.fn();
    expect(() =>
      sendOutboundPollMessage({
        channelId: 'ch1',
        content: 'x',
        poll: makePoll(),
        authorId: 'u1',
        isSocketConnected: true,
        adapter: null,
        newClientMessageId: () => 'cid',
        newCorrelationId: () => 'corr',
        rememberPendingSentMessage: vi.fn(),
        addLocal: vi.fn(),
        uiTx: { beginTransaction: vi.fn(), rollbackTransaction: vi.fn() },
        reportPrimaryFlowFailure,
        socketDiagInfo: vi.fn(),
      }),
    ).toThrow(/Realtime connection is not ready/);
    expect(reportPrimaryFlowFailure).toHaveBeenCalledWith(
      'socket.sendMessage.missingAdapter',
      expect.any(Error),
      { channelId: 'ch1' },
    );
  });

  it('when connected without authorId: sends adapter payload without optimistic id', () => {
    const sendMessage = vi.fn();
    const adapter = { sendMessage } as unknown as SocketAdapterInstance;
    sendOutboundPollMessage({
      channelId: 'ch1',
      content: 'body',
      poll: makePoll(),
      authorId: undefined,
      isSocketConnected: true,
      adapter,
      newClientMessageId: vi.fn(() => 'should-not-use'),
      newCorrelationId: () => 'c1',
      rememberPendingSentMessage: vi.fn(),
      addLocal: vi.fn(),
      uiTx: { beginTransaction: vi.fn(), rollbackTransaction: vi.fn() },
      reportPrimaryFlowFailure: vi.fn(),
      socketDiagInfo: vi.fn(),
    });
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 'ch1',
        content: 'body',
        correlationId: 'c1',
      }),
    );
    expect(sendMessage.mock.calls[0]![0]).not.toHaveProperty('id');
  });

  it('when offline with author: only addLocal with new client id', () => {
    const addLocal = vi.fn();
    const newClientMessageId = vi.fn(() => 'local_only');
    sendOutboundPollMessage({
      channelId: 'ch1',
      content: 'z',
      poll: makePoll(),
      authorId: 'u9',
      isSocketConnected: false,
      adapter: null,
      newClientMessageId,
      newCorrelationId: vi.fn(),
      rememberPendingSentMessage: vi.fn(),
      addLocal,
      uiTx: { beginTransaction: vi.fn(), rollbackTransaction: vi.fn() },
      reportPrimaryFlowFailure: vi.fn(),
      socketDiagInfo: vi.fn(),
    });
    expect(addLocal).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'local_only', authorId: 'u9' }),
    );
    expect(newClientMessageId).toHaveBeenCalledTimes(1);
  });

  it('rolls back optimistic tx when adapter.sendMessage throws', () => {
    const sendMessage = vi.fn(() => {
      throw new Error('wire');
    });
    const adapter = { sendMessage } as unknown as SocketAdapterInstance;
    const rollbackTransaction = vi.fn();
    expect(() =>
      sendOutboundPollMessage({
        channelId: 'ch1',
        content: 'x',
        poll: makePoll(),
        authorId: 'u1',
        isSocketConnected: true,
        adapter,
        newClientMessageId: () => 'cid_rb',
        newCorrelationId: () => 'corr',
        rememberPendingSentMessage: vi.fn(),
        addLocal: vi.fn(),
        uiTx: { beginTransaction: vi.fn(), rollbackTransaction },
        reportPrimaryFlowFailure: vi.fn(),
        socketDiagInfo: vi.fn(),
      }),
    ).toThrow('wire');
    expect(rollbackTransaction).toHaveBeenCalledWith('cid_rb');
  });
});

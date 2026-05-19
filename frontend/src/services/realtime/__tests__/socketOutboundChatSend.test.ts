import { describe, expect, it, vi } from 'vitest';
import { sendOneOutboundChatMessage } from '../socketOutboundChatSend';
import type { ForwardedFrom, MentionEntity, ReplyTo } from '@shared/types';
import type { SocketAdapterInstance } from '../socketOutbound';

describe('sendOneOutboundChatMessage', () => {
  it('connected + adapter + author: optimistic, adapter payload, correlation id', () => {
    const sendMessage = vi.fn();
    const adapter = { sendMessage } as unknown as SocketAdapterInstance;
    const beginTransaction = vi.fn();
    const rollbackTransaction = vi.fn();
    const addLocal = vi.fn();
    const rememberPendingSentMessage = vi.fn();
    let n = 0;
    const newClientMessageId = () => `cid_${++n}`;
    const newCorrelationId = () => `corr_${++n}`;
    const replyTo: ReplyTo = {
      messageId: 'm0',
      authorName: 'a',
      content: 'c',
    };

    sendOneOutboundChatMessage({
      channelId: 'ch1',
      authorId: 'u1',
      wireContent: 'hello',
      wireMentions: [
        { id: 'x', kind: 'user', label: '@u', start: 0, end: 2, userId: 'u2' },
      ],
      wireReplyTo: replyTo,
      isSocketConnected: true,
      adapter,
      newClientMessageId,
      newCorrelationId,
      rememberPendingSentMessage,
      addLocal,
      uiTx: { beginTransaction, rollbackTransaction },
      reportPrimaryFlowFailure: vi.fn(),
      socketDiagInfo: vi.fn(),
      socketDiagError: vi.fn(),
    });

    expect(beginTransaction).toHaveBeenCalled();
    expect(rememberPendingSentMessage).toHaveBeenCalledWith(
      'ch1',
      'cid_1',
      'u1',
      replyTo,
    );
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 'ch1',
        content: 'hello',
        authorId: 'u1',
        id: 'cid_1',
        correlationId: 'corr_2',
        replyTo,
      }),
    );
  });

  it('connected without adapter: socketDiagError, reportPrimaryFlowFailure, throws', () => {
    const socketDiagError = vi.fn();
    const reportPrimaryFlowFailure = vi.fn();
    expect(() =>
      sendOneOutboundChatMessage({
        channelId: 'ch1',
        authorId: 'u1',
        wireContent: 'x',
        isSocketConnected: true,
        adapter: null,
        newClientMessageId: () => 'cid',
        newCorrelationId: () => 'c',
        rememberPendingSentMessage: vi.fn(),
        addLocal: vi.fn(),
        uiTx: { beginTransaction: vi.fn(), rollbackTransaction: vi.fn() },
        reportPrimaryFlowFailure,
        socketDiagInfo: vi.fn(),
        socketDiagError,
      }),
    ).toThrow(/Realtime connection is not ready/);
    expect(socketDiagError).toHaveBeenCalledWith(
      'sendMessage_missing_adapter',
      { channelId: 'ch1' },
    );
    expect(reportPrimaryFlowFailure).toHaveBeenCalledWith(
      'socket.sendMessage.missingAdapter',
      expect.any(Error),
      { channelId: 'ch1' },
    );
  });

  it('includes contentJson on wire when no media and json object', () => {
    const sendMessage = vi.fn();
    const adapter = { sendMessage } as unknown as SocketAdapterInstance;
    const contentJson = { type: 'doc', version: 1 };
    sendOneOutboundChatMessage({
      channelId: 'ch1',
      authorId: 'u1',
      wireContent: 'fallback text',
      wireContentJson: contentJson,
      wireContentSchemaVersion: 7,
      isSocketConnected: true,
      adapter,
      newClientMessageId: () => 'id1',
      newCorrelationId: () => 'co1',
      rememberPendingSentMessage: vi.fn(),
      addLocal: vi.fn(),
      uiTx: { beginTransaction: vi.fn(), rollbackTransaction: vi.fn() },
      reportPrimaryFlowFailure: vi.fn(),
      socketDiagInfo: vi.fn(),
      socketDiagError: vi.fn(),
    });
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        contentJson,
        contentSchemaVersion: 7,
      }),
    );
  });

  it('for media, uses empty string fallback for wire content on adapter when wireContent empty', () => {
    const sendMessage = vi.fn();
    const adapter = { sendMessage } as unknown as SocketAdapterInstance;
    sendOneOutboundChatMessage({
      channelId: 'ch1',
      authorId: 'u1',
      wireContent: '',
      imageUrl: 'https://ex/img.png',
      isSocketConnected: true,
      adapter,
      newClientMessageId: () => 'id1',
      newCorrelationId: () => 'co1',
      rememberPendingSentMessage: vi.fn(),
      addLocal: vi.fn(),
      uiTx: { beginTransaction: vi.fn(), rollbackTransaction: vi.fn() },
      reportPrimaryFlowFailure: vi.fn(),
      socketDiagInfo: vi.fn(),
      socketDiagError: vi.fn(),
    });
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '',
        imageUrl: 'https://ex/img.png',
      }),
    );
  });

  it('forwards forwardMessageId on adapter when set', () => {
    const sendMessage = vi.fn();
    const adapter = { sendMessage } as unknown as SocketAdapterInstance;
    sendOneOutboundChatMessage({
      channelId: 'ch1',
      authorId: 'u1',
      wireContent: 'hi',
      forwardMessageId: 'orig-1',
      isSocketConnected: true,
      adapter,
      newClientMessageId: () => 'id1',
      newCorrelationId: () => 'co1',
      rememberPendingSentMessage: vi.fn(),
      addLocal: vi.fn(),
      uiTx: { beginTransaction: vi.fn(), rollbackTransaction: vi.fn() },
      reportPrimaryFlowFailure: vi.fn(),
      socketDiagInfo: vi.fn(),
      socketDiagError: vi.fn(),
    });
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ forwardMessageId: 'orig-1' }),
    );
  });

  it('offline with author: addLocal only, new client id', () => {
    const addLocal = vi.fn();
    const newClientMessageId = vi.fn(() => 'local1');
    const preview: ForwardedFrom = {
      messageId: 'm99',
      channelId: 'c9',
      authorName: 'Z',
      contentPreview: '…',
    };
    sendOneOutboundChatMessage({
      channelId: 'ch1',
      authorId: 'u9',
      wireContent: 'z',
      forwardPreview: preview,
      isSocketConnected: false,
      adapter: null,
      newClientMessageId,
      newCorrelationId: vi.fn(),
      rememberPendingSentMessage: vi.fn(),
      addLocal,
      uiTx: { beginTransaction: vi.fn(), rollbackTransaction: vi.fn() },
      reportPrimaryFlowFailure: vi.fn(),
      socketDiagInfo: vi.fn(),
      socketDiagError: vi.fn(),
    });
    expect(addLocal).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'local1',
        authorId: 'u9',
        forwardedFrom: preview,
      }),
    );
    expect(newClientMessageId).toHaveBeenCalledTimes(1);
  });

  it('rolls back optimistic tx when adapter.sendMessage throws', () => {
    const sendMessage = vi.fn(() => {
      throw new Error('net');
    });
    const adapter = { sendMessage } as unknown as SocketAdapterInstance;
    const rollbackTransaction = vi.fn();
    expect(() =>
      sendOneOutboundChatMessage({
        channelId: 'ch1',
        authorId: 'u1',
        wireContent: 'x',
        isSocketConnected: true,
        adapter,
        newClientMessageId: () => 'rb',
        newCorrelationId: () => 'c',
        rememberPendingSentMessage: vi.fn(),
        addLocal: vi.fn(),
        uiTx: { beginTransaction: vi.fn(), rollbackTransaction },
        reportPrimaryFlowFailure: vi.fn(),
        socketDiagInfo: vi.fn(),
        socketDiagError: vi.fn(),
      }),
    ).toThrow('net');
    expect(rollbackTransaction).toHaveBeenCalledWith('rb');
  });

  it('connected without authorId: adapter send without optimistic id', () => {
    const sendMessage = vi.fn();
    const adapter = { sendMessage } as unknown as SocketAdapterInstance;
    sendOneOutboundChatMessage({
      channelId: 'ch1',
      authorId: undefined,
      wireContent: 'anon',
      isSocketConnected: true,
      adapter,
      newClientMessageId: vi.fn(() => 'unused'),
      newCorrelationId: () => 'c1',
      rememberPendingSentMessage: vi.fn(),
      addLocal: vi.fn(),
      uiTx: { beginTransaction: vi.fn(), rollbackTransaction: vi.fn() },
      reportPrimaryFlowFailure: vi.fn(),
      socketDiagInfo: vi.fn(),
      socketDiagError: vi.fn(),
    });
    const payload = sendMessage.mock.calls[0]![0];
    expect(payload).not.toHaveProperty('id');
    expect(payload).toMatchObject({ content: 'anon', correlationId: 'c1' });
  });
});

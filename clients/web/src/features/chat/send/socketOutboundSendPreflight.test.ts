import { describe, expect, it, vi } from 'vitest';
import { assertOutboundSendSocketReady } from '@/features/chat/send/socketOutboundSendPreflight';

describe('assertOutboundSendSocketReady', () => {
  it('logs start and returns when live socket not expected (even if disconnected)', () => {
    const socketDiagInfo = vi.fn();
    const socketDiagWarn = vi.fn();
    const reportPrimaryFlowFailure = vi.fn();
    assertOutboundSendSocketReady({
      channelId: 'c1',
      contentPreviewSource: 'hello',
      liveSocketExpected: false,
      isSocketConnected: false,
      reportPrimaryFlowFailure,
      socketDiagInfo,
      socketDiagWarn,
    });
    expect(socketDiagInfo).toHaveBeenCalledWith('sendMessage_start', {
      liveSocketExpected: false,
      connected: false,
      contentPreview: 'hello',
    });
    expect(socketDiagWarn).not.toHaveBeenCalled();
    expect(reportPrimaryFlowFailure).not.toHaveBeenCalled();
  });

  it('returns when live socket expected and connected', () => {
    const socketDiagInfo = vi.fn();
    assertOutboundSendSocketReady({
      channelId: 'c1',
      contentPreviewSource: 'x',
      liveSocketExpected: true,
      isSocketConnected: true,
      reportPrimaryFlowFailure: vi.fn(),
      socketDiagInfo,
      socketDiagWarn: vi.fn(),
    });
    expect(socketDiagInfo).toHaveBeenCalled();
  });

  it('warns, reports primary flow failure, and throws when live expected but disconnected', () => {
    const socketDiagWarn = vi.fn();
    const reportPrimaryFlowFailure = vi.fn();
    expect(() =>
      assertOutboundSendSocketReady({
        channelId: 'ch9',
        contentPreviewSource: 'body',
        liveSocketExpected: true,
        isSocketConnected: false,
        reportPrimaryFlowFailure,
        socketDiagInfo: vi.fn(),
        socketDiagWarn,
      }),
    ).toThrow(/Wait for Echo to reconnect/);
    expect(socketDiagWarn).toHaveBeenCalledWith(
      'sendMessage_socket_disconnected',
      { liveSocketExpected: true },
    );
    expect(reportPrimaryFlowFailure).toHaveBeenCalledWith(
      'socket.sendMessage.notConnected',
      expect.any(Error),
      { channelId: 'ch9' },
    );
  });

  it('truncates content preview to 120 chars', () => {
    const socketDiagInfo = vi.fn();
    const long = 'a'.repeat(200);
    assertOutboundSendSocketReady({
      channelId: 'c1',
      contentPreviewSource: long,
      liveSocketExpected: true,
      isSocketConnected: true,
      reportPrimaryFlowFailure: vi.fn(),
      socketDiagInfo,
      socketDiagWarn: vi.fn(),
    });
    expect(socketDiagInfo.mock.calls[0]![1]!.contentPreview).toHaveLength(120);
  });
});

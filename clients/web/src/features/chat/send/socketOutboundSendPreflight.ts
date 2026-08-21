/**
 * Opening step for `useSocket` `sendMessage`: diagnostics + hard guard when a live socket is expected.
 */
export function assertOutboundSendSocketReady(opts: {
  channelId: string;
  /** Plain-text body (or first line) for truncated preview in diagnostics. */
  contentPreviewSource: string;
  /** `false` when `VITE_DISABLE_SOCKET` / transport is off — offline local paths are allowed. */
  liveSocketExpected: boolean;
  isSocketConnected: boolean;
  reportPrimaryFlowFailure: (
    code: string,
    err: Error,
    extras?: Record<string, unknown>,
  ) => void;
  socketDiagInfo: (event: string, fields: Record<string, unknown>) => void;
  socketDiagWarn: (event: string, fields: Record<string, unknown>) => void;
}): void {
  opts.socketDiagInfo('sendMessage_start', {
    liveSocketExpected: opts.liveSocketExpected,
    connected: opts.isSocketConnected,
    contentPreview: opts.contentPreviewSource.slice(0, 120),
  });
  if (opts.liveSocketExpected && !opts.isSocketConnected) {
    opts.socketDiagWarn('sendMessage_socket_disconnected', {
      liveSocketExpected: true,
    });
    opts.reportPrimaryFlowFailure(
      'socket.sendMessage.notConnected',
      new Error('Realtime connection is not ready'),
      { channelId: opts.channelId },
    );
    throw new Error(
      'Realtime connection is not ready. Wait for Echo to reconnect, then try again.',
    );
  }
}

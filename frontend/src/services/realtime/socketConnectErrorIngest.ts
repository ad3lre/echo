import { socketDiagWarn } from '@/observability/socketDiagnostics';
import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';

export type EchoSocketConnectErrorIngestCtx = {
  devPortHint: string;
  restoreSessionFromApi: () => void | Promise<void>;
  tryReloadForXhrPollError?: () => boolean;
  /** Optional caller-side throttle for noisy reconnect cycles. */
  shouldReportPrimaryFlow?: () => boolean;
};

/**
 * First `connect_error` after connect: optional XHR-poll reload escape hatch, then
 * primary-flow + dev diagnostics; refresh session on 401/403 in message.
 */
export function ingestEchoSocketConnectError(
  err: Error,
  ctx: EchoSocketConnectErrorIngestCtx,
): void {
  const msg = (err?.message ?? '').toLowerCase();
  if (
    msg.includes('xhr poll error') &&
    ctx.tryReloadForXhrPollError?.() === true
  ) {
    return;
  }

  if (ctx.shouldReportPrimaryFlow?.() !== false) {
    reportPrimaryFlowFailure(
      'socket.connect_error',
      err,
      {
        devPortHint: ctx.devPortHint,
      },
      {
        userMessage:
          'Could not connect to realtime chat. Check your network, ensure the app is online, then refresh if needed.',
      },
    );
  }
  socketDiagWarn('connect_error', {
    devPort: ctx.devPortHint,
    detail: err.message,
    hint: 'In dev the client uses http://<host>:<port> (VITE_DEV_ECHO_PORT / VITE_SOCKET_IO_URL). Ensure Echo is listening and CORS_ORIGIN allows your UI origin.',
  });

  if (err.message.includes('401') || err.message.includes('403')) {
    void ctx.restoreSessionFromApi();
  }
}

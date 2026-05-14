import { emitDiagnostic } from '@/observability/sessionDiagnostics';

/** Session diagnostics: channel switch (nav domain). No-op if id empty or unchanged. */
export function emitActiveChannelNavDiagnostic(opts: {
  traceId: string;
  next: string;
  prev: string | undefined;
}): void {
  if (!opts.next || opts.next === opts.prev) return;
  emitDiagnostic({
    level: 'info',
    domain: 'nav',
    event: 'active_channel_changed',
    stage: 'success',
    traceId: opts.traceId,
    context: {
      path: 'app_layout',
      action: 'channel_switch',
      channelId: opts.next,
    },
  });
}

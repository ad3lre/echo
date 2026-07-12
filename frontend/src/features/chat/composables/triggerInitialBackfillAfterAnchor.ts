import { emitDiagnostic } from '@/observability/sessionDiagnostics';

export function triggerInitialBackfillAfterAnchor(input: {
  anchor: string;
  outcomeOk: boolean;
  pending: boolean;
  loading: boolean;
  channelId: string | null;
  messageCount: number;
  settledMs?: number;
  run: () => void;
}): void {
  if (
    input.anchor !== 'bottom' ||
    !input.outcomeOk ||
    !input.pending ||
    input.loading
  ) {
    return;
  }
  emitDiagnostic({
    level: 'info',
    domain: 'perf',
    event: 'fast_tail_reveal',
    stage: 'success',
    durationMs: input.settledMs,
    context: {
      channelId: input.channelId,
      messageCount: input.messageCount,
    },
  });
  input.run();
}

import { describe, expect, it, vi } from 'vitest';
import { triggerInitialBackfillAfterAnchor } from './triggerInitialBackfillAfterAnchor';

vi.mock('@/observability/sessionDiagnostics', () => ({
  emitDiagnostic: vi.fn(),
}));

describe('triggerInitialBackfillAfterAnchor', () => {
  it('runs only after a successful bottom anchor with pending work', () => {
    const run = vi.fn();
    const base = {
      outcomeOk: true,
      pending: true,
      loading: false,
      channelId: 'c1',
      messageCount: 15,
      run,
    };
    triggerInitialBackfillAfterAnchor({ ...base, anchor: 'restored_memory' });
    triggerInitialBackfillAfterAnchor({
      ...base,
      anchor: 'bottom',
      pending: false,
    });
    triggerInitialBackfillAfterAnchor({ ...base, anchor: 'bottom' });
    expect(run).toHaveBeenCalledTimes(1);
  });
});

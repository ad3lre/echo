import { describe, expect, it, vi } from 'vitest';
import { emitActiveChannelNavDiagnostic } from './emitActiveChannelNavDiagnostic';

const emitDiagnostic = vi.fn();

vi.mock('@/observability/sessionDiagnostics', () => ({
  emitDiagnostic: (...args: unknown[]) => emitDiagnostic(...args),
}));

describe('emitActiveChannelNavDiagnostic', () => {
  it('emits on distinct non-empty channel id', () => {
    emitDiagnostic.mockClear();
    emitActiveChannelNavDiagnostic({
      traceId: 'trace-1',
      next: 'ch-a',
      prev: '',
    });
    expect(emitDiagnostic).toHaveBeenCalledTimes(1);
    expect(emitDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: 'trace-1',
        context: expect.objectContaining({ channelId: 'ch-a' }),
      }),
    );
  });

  it('skips empty or unchanged channel id', () => {
    emitDiagnostic.mockClear();
    emitActiveChannelNavDiagnostic({
      traceId: 't',
      next: 'same',
      prev: 'same',
    });
    emitActiveChannelNavDiagnostic({ traceId: 't', next: '', prev: 'x' });
    expect(emitDiagnostic).not.toHaveBeenCalled();
  });
});

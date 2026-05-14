import { describe, expect, it, vi } from 'vitest';
import { createEchoDmActivityHandler } from './createEchoDmActivityHandler';

describe('createEchoDmActivityHandler', () => {
  it('merges thread with message id as activity', () => {
    const merge = vi.fn();
    const h = createEchoDmActivityHandler({
      mergeEchoDmThreadFromRealtime: merge,
    });
    const thread = { channelId: 'c1' } as any;
    h({
      thread,
      message: { id: 'm99' },
    } as any);
    expect(merge).toHaveBeenCalledWith(thread, 'm99');
  });
});

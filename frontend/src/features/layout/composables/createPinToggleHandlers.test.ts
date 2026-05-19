import { describe, expect, it, vi } from 'vitest';
import { createPinToggleHandlers } from './createPinToggleHandlers';

describe('createPinToggleHandlers', () => {
  it('routes to submitPinToggle', () => {
    const submit = vi.fn();
    const h = createPinToggleHandlers(submit);
    h.handlePinMessage('m1');
    expect(submit).toHaveBeenCalledWith('pin', 'm1');
    h.handleUnpinMessage('m2');
    expect(submit).toHaveBeenCalledWith('unpin', 'm2');
    h.unpinMessage('m3');
    expect(submit).toHaveBeenLastCalledWith('unpin', 'm3');
  });
});

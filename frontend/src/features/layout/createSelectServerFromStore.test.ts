import { describe, it, expect, vi } from 'vitest';
import { createSelectServerFromStore } from './createSelectServerFromStore';

describe('createSelectServerFromStore', () => {
  it('delegates to the store', () => {
    const selectServer = vi.fn();
    const select = createSelectServerFromStore({ selectServer } as never);
    select('srv-1');
    expect(selectServer).toHaveBeenCalledWith('srv-1');
    select(null);
    expect(selectServer).toHaveBeenLastCalledWith(null);
  });
});

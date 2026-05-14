import { describe, expect, it, vi } from 'vitest';
import { createUpdateCurrentUserStatusCaster } from './createUpdateCurrentUserStatusCaster';

describe('createUpdateCurrentUserStatusCaster', () => {
  it('casts string to status union', () => {
    const inner = vi.fn();
    const cast = createUpdateCurrentUserStatusCaster(inner);
    cast('idle');
    expect(inner).toHaveBeenCalledWith('idle');
  });
});

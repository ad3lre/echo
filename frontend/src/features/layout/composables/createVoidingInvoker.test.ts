import { describe, expect, it, vi } from 'vitest';
import { createVoidingInvoker } from './createVoidingInvoker';

describe('createVoidingInvoker', () => {
  it('invokes sync fn', () => {
    const fn = vi.fn();
    createVoidingInvoker(fn)();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('discards promise return', async () => {
    const fn = vi.fn(() => Promise.resolve('x'));
    createVoidingInvoker(fn)();
    expect(fn).toHaveBeenCalled();
  });
});

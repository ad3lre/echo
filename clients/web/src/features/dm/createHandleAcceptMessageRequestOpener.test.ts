import { describe, expect, it, vi } from 'vitest';
import { createHandleAcceptMessageRequestOpener } from './createHandleAcceptMessageRequestOpener';

describe('createHandleAcceptMessageRequestOpener', () => {
  it('reports a rejected accept operation without leaking a rejection', async () => {
    const error = new Error('request failed');
    const onError = vi.fn();
    const handle = createHandleAcceptMessageRequestOpener({
      acceptMessageRequest: vi.fn().mockRejectedValue(error),
      selectDmUser: vi.fn(),
      onError,
    });

    expect(() => handle('request-1')).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith(error);
  });
});

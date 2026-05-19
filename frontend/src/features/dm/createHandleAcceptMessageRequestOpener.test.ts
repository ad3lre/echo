import { describe, expect, it, vi } from 'vitest';
import { createHandleAcceptMessageRequestOpener } from './createHandleAcceptMessageRequestOpener';

describe('createHandleAcceptMessageRequestOpener', () => {
  it('opens DM when accept returns request', async () => {
    const acceptMessageRequest = vi
      .fn()
      .mockResolvedValue({ fromUserId: 'u9', id: 'r1' });
    const selectDmUser = vi.fn().mockResolvedValue('ch1');
    const handle = createHandleAcceptMessageRequestOpener({
      acceptMessageRequest,
      selectDmUser,
    });
    handle('r1');
    await vi.waitFor(() => {
      expect(acceptMessageRequest).toHaveBeenCalledWith('r1');
      expect(selectDmUser).toHaveBeenCalledWith('u9');
    });
  });

  it('does not open DM when accept returns null', async () => {
    const acceptMessageRequest = vi.fn().mockResolvedValue(null);
    const selectDmUser = vi.fn();
    const handle = createHandleAcceptMessageRequestOpener({
      acceptMessageRequest,
      selectDmUser,
    });
    handle('r2');
    await vi.waitFor(() => expect(acceptMessageRequest).toHaveBeenCalled());
    expect(selectDmUser).not.toHaveBeenCalled();
  });
});

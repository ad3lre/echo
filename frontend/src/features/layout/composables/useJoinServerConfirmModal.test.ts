import { describe, it, expect } from 'vitest';
import { useJoinServerConfirmModal } from './useJoinServerConfirmModal';

describe('useJoinServerConfirmModal', () => {
  it('resolves false when the modal is dismissed', async () => {
    const modal = useJoinServerConfirmModal();
    const pending = modal.requestJoinServerConfirm({
      serverName: 'Test Guild',
    });
    modal.onJoinServerConfirmModalUpdate(false);
    await expect(pending).resolves.toBe(false);
    expect(modal.isJoinServerConfirmModalOpen.value).toBe(false);
  });

  it('resolves true when the user confirms join', async () => {
    const modal = useJoinServerConfirmModal();
    const pending = modal.requestJoinServerConfirm({
      serverName: 'Test Guild',
      memberCount: 42,
    });
    modal.confirmJoinServerFromModal();
    await expect(pending).resolves.toBe(true);
    expect(modal.joinServerConfirmBusy.value).toBe(true);
    modal.finishJoinServerConfirmModal();
    expect(modal.isJoinServerConfirmModalOpen.value).toBe(false);
    expect(modal.joinServerConfirmBusy.value).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { useJoinServerConfirmModal } from '@/features/layout/useJoinServerConfirmModal';

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

  it('resolves false for a superseded confirm request', async () => {
    const modal = useJoinServerConfirmModal();
    const first = modal.requestJoinServerConfirm({ serverName: 'First' });
    const second = modal.requestJoinServerConfirm({ serverName: 'Second' });
    await expect(first).resolves.toBe(false);
    modal.onJoinServerConfirmModalUpdate(false);
    await expect(second).resolves.toBe(false);
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

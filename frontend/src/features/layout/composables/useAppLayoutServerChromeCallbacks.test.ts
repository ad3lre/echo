import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useAppLayoutServerChromeCallbacks } from './useAppLayoutServerChromeCallbacks';
import { dispatchAppToast } from '@/utils/controllerMissingAction';

vi.mock('@/utils/controllerMissingAction', () => ({
  dispatchAppToast: vi.fn(),
}));

describe('useAppLayoutServerChromeCallbacks', () => {
  it('opens server settings and clears initial section on close', () => {
    const isOpen = ref(false);
    const initial = ref<'Overview' | null>('Overview');
    const active = ref<'Overview' | 'Roles'>('Overview');
    const inviteOpen = ref(false);
    const clearVoice = vi.fn();
    const c = useAppLayoutServerChromeCallbacks({
      isServerSettingsModalOpen: isOpen,
      serverSettingsModalInitialSection: initial,
      serverSettingsModalActiveSection: active,
      isInviteModalOpen: inviteOpen,
      clearInviteVoiceContext: clearVoice,
      canOpenServerSettingsForServer: () => true,
    });
    c.openServerSettings('s1');
    expect(isOpen.value).toBe(true);
    c.onServerSettingsModalUpdate(false);
    expect(isOpen.value).toBe(false);
    expect(initial.value).toBeNull();
    c.onServerSettingsModalActiveSectionUpdate('Roles');
    expect(active.value).toBe('Roles');
    c.openInviteModal('s1');
    expect(inviteOpen.value).toBe(true);
    expect(clearVoice).toHaveBeenCalledTimes(1);
  });

  it('does not open invite modal when canOpenInviteForServer denies', () => {
    const inviteOpen = ref(false);
    const c = useAppLayoutServerChromeCallbacks({
      isServerSettingsModalOpen: ref(false),
      serverSettingsModalInitialSection: ref(null),
      serverSettingsModalActiveSection: ref('Overview'),
      isInviteModalOpen: inviteOpen,
      canOpenInviteForServer: () => false,
    });
    c.openInviteModal('s1');
    expect(inviteOpen.value).toBe(false);
    expect(dispatchAppToast).toHaveBeenCalledWith(
      "You don't have permission to invite people to this server.",
      'warning',
    );
  });

  it('does not open server settings when canOpenServerSettingsForServer denies', () => {
    const isOpen = ref(false);
    const c = useAppLayoutServerChromeCallbacks({
      isServerSettingsModalOpen: isOpen,
      serverSettingsModalInitialSection: ref(null),
      serverSettingsModalActiveSection: ref('Overview'),
      isInviteModalOpen: ref(false),
      canOpenServerSettingsForServer: () => false,
    });
    c.openServerSettingsIfAllowed('s1');
    expect(isOpen.value).toBe(false);
    expect(dispatchAppToast).toHaveBeenCalledWith(
      "You don't have permission to open server settings.",
      'warning',
    );
  });
});

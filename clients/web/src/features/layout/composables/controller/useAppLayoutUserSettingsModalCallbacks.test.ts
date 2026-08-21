import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import type { SettingsSection } from '@/features/settings/types';
import { useAppLayoutUserSettingsModalCallbacks } from './useAppLayoutUserSettingsModalCallbacks';

describe('useAppLayoutUserSettingsModalCallbacks', () => {
  it('opens modal and sets initial section', () => {
    const isSettingsModalOpen = ref(false);
    const settingsModalInitialSection = ref<SettingsSection | null>(null);
    const settingsModalActiveSection = ref<SettingsSection>('Account');
    const c = useAppLayoutUserSettingsModalCallbacks({
      isSettingsModalOpen,
      settingsModalInitialSection,
      settingsModalActiveSection,
    });
    c.openUserSettingsModal('Profile');
    expect(isSettingsModalOpen.value).toBe(true);
    expect(settingsModalInitialSection.value).toBe('Profile');
  });

  it('clears initial section when modal closes', () => {
    const isSettingsModalOpen = ref(true);
    const settingsModalInitialSection = ref<SettingsSection | null>('Account');
    const settingsModalActiveSection = ref<SettingsSection>('Account');
    const c = useAppLayoutUserSettingsModalCallbacks({
      isSettingsModalOpen,
      settingsModalInitialSection,
      settingsModalActiveSection,
    });
    c.onUserSettingsModalUpdate(false);
    expect(isSettingsModalOpen.value).toBe(false);
    expect(settingsModalInitialSection.value).toBeNull();
  });

  it('updates active section', () => {
    const settingsModalActiveSection = ref<SettingsSection>('Account');
    const c = useAppLayoutUserSettingsModalCallbacks({
      isSettingsModalOpen: ref(false),
      settingsModalInitialSection: ref(null),
      settingsModalActiveSection,
    });
    c.onSettingsModalActiveSectionUpdate('Friends');
    expect(settingsModalActiveSection.value).toBe('Friends');
  });
});

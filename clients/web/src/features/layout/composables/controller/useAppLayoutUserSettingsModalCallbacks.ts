import type { Ref } from 'vue';
import type { SettingsSection } from '@/features/settings/types';

export function useAppLayoutUserSettingsModalCallbacks(deps: {
  isSettingsModalOpen: Ref<boolean>;
  settingsModalInitialSection: Ref<SettingsSection | null>;
  settingsModalActiveSection: Ref<SettingsSection>;
}) {
  return {
    onUserSettingsModalUpdate: (open: boolean) => {
      deps.isSettingsModalOpen.value = open;
      if (!open) deps.settingsModalInitialSection.value = null;
    },
    onSettingsModalActiveSectionUpdate: (section: SettingsSection) => {
      deps.settingsModalActiveSection.value = section;
    },
    openUserSettingsModal: (section?: SettingsSection) => {
      if (section) deps.settingsModalInitialSection.value = section;
      deps.isSettingsModalOpen.value = true;
    },
  };
}

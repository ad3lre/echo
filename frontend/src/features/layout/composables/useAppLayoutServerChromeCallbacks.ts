import type { Ref } from 'vue';
import type { ServerSettingsSection } from '@/features/server-settings/types';

/** Imperative open/update handlers for server settings + invite modals from layout chrome refs. */
export function useAppLayoutServerChromeCallbacks(opts: {
  isServerSettingsModalOpen: Ref<boolean>;
  serverSettingsModalInitialSection: Ref<ServerSettingsSection | null>;
  serverSettingsModalActiveSection: Ref<ServerSettingsSection>;
  isInviteModalOpen: Ref<boolean>;
  clearInviteVoiceContext?: () => void;
  canOpenInviteForServer?: (serverId: string) => boolean;
}) {
  return {
    openServerSettings: (_sid: string, _section?: unknown) => {
      opts.isServerSettingsModalOpen.value = true;
    },
    openServerSettingsIfAllowed: (_sid: string) => {
      opts.isServerSettingsModalOpen.value = true;
    },
    openInviteModal: (sid: string) => {
      if (
        opts.canOpenInviteForServer &&
        !opts.canOpenInviteForServer(sid.trim())
      ) {
        return;
      }
      opts.clearInviteVoiceContext?.();
      opts.isInviteModalOpen.value = true;
    },
    onServerSettingsModalUpdate: (open: boolean) => {
      opts.isServerSettingsModalOpen.value = open;
      if (!open) opts.serverSettingsModalInitialSection.value = null;
    },
    onServerSettingsModalActiveSectionUpdate: (
      section: ServerSettingsSection,
    ) => {
      opts.serverSettingsModalActiveSection.value = section;
    },
  };
}

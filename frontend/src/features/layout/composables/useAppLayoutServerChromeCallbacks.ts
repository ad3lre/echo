import type { Ref } from 'vue';
import type { ServerSettingsSection } from '@/features/server-settings/types';
import { dispatchAppToast } from '@/utils/controllerMissingAction';

/** Imperative open/update handlers for server settings + invite modals from layout chrome refs. */
export function useAppLayoutServerChromeCallbacks(opts: {
  isServerSettingsModalOpen: Ref<boolean>;
  serverSettingsModalInitialSection: Ref<ServerSettingsSection | null>;
  serverSettingsModalActiveSection: Ref<ServerSettingsSection>;
  isInviteModalOpen: Ref<boolean>;
  clearInviteVoiceContext?: () => void;
  canOpenInviteForServer?: (serverId: string) => boolean;
  canOpenServerSettingsForServer?: (serverId: string) => boolean;
}) {
  function openServerSettingsIfAllowedForServer(sid: string) {
    const serverId = sid.trim();
    if (!serverId) {
      dispatchAppToast(
        'Select a server before opening server settings.',
        'warning',
      );
      return;
    }
    if (
      opts.canOpenServerSettingsForServer &&
      !opts.canOpenServerSettingsForServer(serverId)
    ) {
      dispatchAppToast(
        "You don't have permission to open server settings.",
        'warning',
      );
      return;
    }
    opts.isServerSettingsModalOpen.value = true;
  }

  return {
    openServerSettings: (sid: string, _section?: unknown) => {
      openServerSettingsIfAllowedForServer(sid);
    },
    openServerSettingsIfAllowed: openServerSettingsIfAllowedForServer,
    openInviteModal: (sid: string) => {
      const serverId = sid.trim();
      if (!serverId) {
        dispatchAppToast('Select a server before inviting people.', 'warning');
        return;
      }
      if (
        opts.canOpenInviteForServer &&
        !opts.canOpenInviteForServer(serverId)
      ) {
        dispatchAppToast(
          "You don't have permission to invite people to this server.",
          'warning',
        );
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

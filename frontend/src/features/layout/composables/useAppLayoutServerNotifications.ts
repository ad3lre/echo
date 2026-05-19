import { ref, computed, type ComputedRef } from 'vue';
import type { WorkspaceStateApi } from '@/composables/useEchoWorkspace';
import type { Server } from '@shared/types/server';
import type { ServerNotificationLevel } from '@/features/server-notifications/types';

export function useAppLayoutServerNotifications(
  workspace: WorkspaceStateApi,
  selectedServer: ComputedRef<Server | undefined>,
) {
  const isServerNotificationSettingsOpen = ref(false);

  const currentServerNotificationLevel = computed(
    (): ServerNotificationLevel => {
      const id = selectedServer.value?.id;
      if (!id || id === 'echo') return 'all';
      return workspace.getServerNotificationLevel(id);
    },
  );

  function openServerNotificationSettings() {
    if (!selectedServer.value || selectedServer.value.id === 'echo') return;
    isServerNotificationSettingsOpen.value = true;
  }

  function handleServerNotificationSave(level: ServerNotificationLevel) {
    const id = selectedServer.value?.id;
    if (!id || id === 'echo') return;
    workspace.setServerNotificationLevel(id, level);
  }

  const serverNotificationLevelsMap = computed<
    Record<string, ServerNotificationLevel>
  >(() => {
    const map: Record<string, ServerNotificationLevel> = {};
    for (const server of workspace.servers.value) {
      map[server.id] = workspace.getServerNotificationLevel(server.id);
    }
    return map;
  });

  return {
    isServerNotificationSettingsOpen,
    currentServerNotificationLevel,
    openServerNotificationSettings,
    handleServerNotificationSave,
    serverNotificationLevelsMap,
  };
}

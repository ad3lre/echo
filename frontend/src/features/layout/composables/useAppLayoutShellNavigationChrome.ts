import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import type { ChannelSummary } from '@shared/types';

/** Screen-reader navigation announcer + top-rail overflow panel behavior. */
export function useAppLayoutShellNavigationChrome(opts: {
  activeChannelId: Ref<string>;
  selectedServer: ComputedRef<{ id: string; name: string } | null | undefined>;
  activeChannel: ComputedRef<ChannelSummary | null>;
  isMoreServersPanelOpen: Ref<boolean>;
  actionRailTopLayout: ComputedRef<boolean>;
  serverStore: {
    selectedServerId: string | null;
    visibleServers: Array<{ id: string }>;
    servers: Array<{ id: string }>;
  };
}) {
  const navAnnouncerText = ref('');
  watch(
    [opts.activeChannelId, opts.selectedServer] as const,
    ([chanId, server]) => {
      const ch = opts.activeChannel.value;
      const chanName = ch?.name ?? '';
      const serverName = server?.name ?? '';
      if (!chanId || !chanName) return;
      navAnnouncerText.value = serverName
        ? `${serverName}, ${chanName}`
        : chanName;
    },
    { flush: 'post' },
  );

  const topRailSelectedOverflowServer = computed(() => {
    if (!opts.actionRailTopLayout.value) return false;
    const selectedId = opts.serverStore.selectedServerId?.trim() ?? '';
    if (!selectedId || selectedId === 'echo') return false;
    const visible = opts.serverStore.visibleServers;
    return (
      !visible.some((s) => s.id === selectedId) &&
      opts.serverStore.servers.some((s) => s.id === selectedId)
    );
  });

  watch(
    topRailSelectedOverflowServer,
    (isOverflowSelected) => {
      if (!isOverflowSelected) return;
      opts.isMoreServersPanelOpen.value = true;
    },
    { immediate: true },
  );

  return {
    navAnnouncerText,
    topRailSelectedOverflowServer,
  };
}

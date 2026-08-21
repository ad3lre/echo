import { ref, computed, type ComputedRef, type Ref } from 'vue';
import type { ChannelSummary } from '@shared/types';
import type { useServerStore } from '@/features/layout/server';
import type { WorkspaceStateApi } from '@/features/layout/echoWorkspace/useEchoWorkspace';

export function useAppLayoutNsfwGate(deps: {
  serverStore: ReturnType<typeof useServerStore>;
  workspace: WorkspaceStateApi;
  effectiveActiveChannel: ComputedRef<ChannelSummary | null>;
  handleGoToChannel: (channelId: string) => void;
  getFirstTextChannelId: (
    cats: { name: string; channels: { id: string; type: string }[] }[],
  ) => string;
  isDmUiContext: ComputedRef<boolean>;
  isExploreView: ComputedRef<boolean>;
  isServerEmptyOnboarding: ComputedRef<boolean>;
  mainContentColumns: ComputedRef<string>;
  memberPanelCollapsed: Ref<boolean>;
}) {
  const {
    serverStore,
    workspace,
    effectiveActiveChannel,
    handleGoToChannel,
    getFirstTextChannelId,
    isDmUiContext,
    isExploreView,
    isServerEmptyOnboarding,
    mainContentColumns,
    memberPanelCollapsed,
  } = deps;

  /** Session: user acknowledged NSFW gate per channel id (in-chat overlay, not a global modal). */
  const nsfwAcknowledgedChannelIds = ref(new Set<string>());

  const showNsfwChatGate = computed(() => {
    const ch = effectiveActiveChannel.value;
    if (!ch?.nsfw || !ch.id) return false;
    return !nsfwAcknowledgedChannelIds.value.has(ch.id);
  });

  function acknowledgeNsfwChannel() {
    const id = effectiveActiveChannel.value?.id;
    if (!id) return;
    const next = new Set(nsfwAcknowledgedChannelIds.value);
    next.add(id);
    nsfwAcknowledgedChannelIds.value = next;
  }

  function declineNsfwGate() {
    const sid = serverStore.selectedServerId;
    if (!sid || sid === 'echo') return;
    const cats = workspace.categoriesByServer.value[sid] ?? [];
    for (const cat of cats) {
      for (const ch of cat.channels) {
        if (ch.type === 'text' && !ch.nsfw) {
          handleGoToChannel(ch.id);
          return;
        }
      }
    }
    const first = getFirstTextChannelId(cats);
    if (first) handleGoToChannel(first);
  }

  const mainContentColumnsEffective = computed(() => {
    const singleCol =
      isDmUiContext.value ||
      isExploreView.value ||
      isServerEmptyOnboarding.value ||
      showNsfwChatGate.value;
    return singleCol ? 'minmax(0, 1fr)' : mainContentColumns.value;
  });

  /** Treat member panel as collapsed while NSFW gate is up (without mutating user preference). */
  const memberPanelCollapsedEffective = computed(
    () => memberPanelCollapsed.value || showNsfwChatGate.value,
  );

  return {
    nsfwAcknowledgedChannelIds,
    showNsfwChatGate,
    acknowledgeNsfwChannel,
    declineNsfwGate,
    mainContentColumnsEffective,
    memberPanelCollapsedEffective,
  };
}

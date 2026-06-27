import { computed, onScopeDispose, watch, type Ref } from 'vue';
import { usePinnedMessages } from '@/features/chat/composables/usePinnedMessages';
import type { useAuthSessionStore } from '@/stores/authSession';
import { isDmThreadId } from '@/features/layout/mainSurface';
import { resolveEchoDmWireChannelId } from '@/features/layout/resolveEchoDmWireChannelId';
import { fetchEchoChannelPins } from '@/api/echoClient';
import {
  isBenignPrimaryFlowError,
  reportPrimaryFlowFailure,
} from '@/utils/primaryFlowFailure';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { scheduleDeferredTask } from '@/utils/scheduleDeferredTask';

export function useAppLayoutPinsIntegration(deps: {
  pinsEnabled: Ref<boolean>;
  activeChannelId: Ref<string>;
  echoDmPeerByChannelId: Ref<Map<string, string>>;
  echoDmThreadIds: Ref<Set<string>>;
  messages: Ref<Record<string, RawMessage[]>>;
  users: Ref<Array<{ id: string; name: string; pfp: string; status: string }>>;
  handleGoToMessage: (channelId: string, messageId: string) => void;
  authSession: ReturnType<typeof useAuthSessionStore>;
}) {
  const {
    pinsEnabled,
    activeChannelId,
    echoDmPeerByChannelId,
    echoDmThreadIds,
    messages,
    users,
    handleGoToMessage,
    authSession,
  } = deps;

  const pinChannelId = computed(() => {
    if (!pinsEnabled.value) return '';
    return resolveEchoDmWireChannelId(
      activeChannelId.value,
      echoDmPeerByChannelId.value,
    );
  });

  const {
    isPinsDropdownOpen,
    pinsButtonRefDm,
    pinsButtonRefServer,
    pinsDropdownRect,
    pinnedMessageIdsForCurrentChannel,
    pinnedMessagesForDropdown,
    pinMessage,
    unpinMessage,
    setPinnedMessageIdsForChannel,
    getPinnedIdsSnapshot,
    togglePinsDropdown: togglePinsDropdownCore,
    closePinsDropdown,
    goToPinnedMessage,
    pinPreview,
  } = usePinnedMessages(pinChannelId, messages, users, handleGoToMessage);

  const loadedPinChannelIds = new Set<string>();
  let deferredPinsRefresh: ReturnType<typeof scheduleDeferredTask> | null =
    null;

  const setChannelPinsFromEcho = (channelId: string, messageIds: string[]) => {
    loadedPinChannelIds.add(channelId);
    setPinnedMessageIdsForChannel(channelId, messageIds);
  };

  /**
   * Pins GET can fail while nav/DM list is stale or mid-reconcile (left group, blocked, etc.).
   * Treat like empty pins — `reportPrimaryFlowFailure` suppresses benign channel fetch noise.
   */
  async function refreshChannelPins(cid: string): Promise<void> {
    if (!pinsEnabled.value) return;
    if (!cid || echoSyncCapabilities.isMockDataMode) return;
    /** Cookie sessions omit `accessToken`; pins fetch uses session cookies. */
    const token = authSession.accessToken?.trim() ?? '';
    if (!authSession.isAuthenticated) return;
    /**
     * Only skip when the active selection is still a shell id with no persisted Echo thread mapping.
     * Persisted thread ids (direct/group) should always fetch server-authoritative pins.
     */
    const unresolvedDmShell =
      isDmThreadId(activeChannelId.value) && !echoDmThreadIds.value.has(cid);
    if (unresolvedDmShell) {
      loadedPinChannelIds.add(cid);
      setPinnedMessageIdsForChannel(cid, []);
      return;
    }
    try {
      const r = await fetchEchoChannelPins(token, cid);
      loadedPinChannelIds.add(cid);
      setPinnedMessageIdsForChannel(cid, r.messageIds);
    } catch (e) {
      if (
        isBenignPrimaryFlowError(e, 'fetchEchoChannelPins', { channelId: cid })
      ) {
        loadedPinChannelIds.add(cid);
        setPinnedMessageIdsForChannel(cid, []);
        return;
      }
      reportPrimaryFlowFailure('fetchEchoChannelPins', e, { channelId: cid });
    }
  }

  function ensureChannelPinsLoaded(cid: string): void {
    if (!cid || loadedPinChannelIds.has(cid)) return;
    void refreshChannelPins(cid);
  }

  function scheduleChannelPinsRefresh(cid: string): void {
    deferredPinsRefresh?.cancel();
    deferredPinsRefresh = null;
    if (!cid || loadedPinChannelIds.has(cid)) return;
    deferredPinsRefresh = scheduleDeferredTask(
      () => {
        deferredPinsRefresh = null;
        ensureChannelPinsLoaded(cid);
      },
      {
        timeoutMs: 1500,
        fallbackDelayMs: 500,
      },
    );
  }

  function togglePinsDropdown(): void {
    const cid = pinChannelId.value;
    const willOpen = !isPinsDropdownOpen.value;
    if (willOpen && cid) {
      deferredPinsRefresh?.cancel();
      deferredPinsRefresh = null;
      ensureChannelPinsLoaded(cid);
    }
    void togglePinsDropdownCore();
  }

  watch(pinChannelId, (cid) => {
    deferredPinsRefresh?.cancel();
    deferredPinsRefresh = null;
    if (!cid) return;
    if (isPinsDropdownOpen.value) {
      ensureChannelPinsLoaded(cid);
      return;
    }
    scheduleChannelPinsRefresh(cid);
  });

  watch(isPinsDropdownOpen, (open) => {
    if (!open) return;
    const cid = pinChannelId.value;
    if (!cid) return;
    deferredPinsRefresh?.cancel();
    deferredPinsRefresh = null;
    ensureChannelPinsLoaded(cid);
  });

  onScopeDispose(() => {
    deferredPinsRefresh?.cancel();
  });

  return {
    pinChannelId,
    isPinsDropdownOpen,
    pinsButtonRefDm,
    pinsButtonRefServer,
    pinsDropdownRect,
    pinnedMessageIdsForCurrentChannel,
    pinnedMessagesForDropdown,
    pinMessage,
    unpinMessage,
    setPinnedMessageIdsForChannel,
    getPinnedIdsSnapshot,
    togglePinsDropdown,
    closePinsDropdown,
    goToPinnedMessage,
    pinPreview,
    setChannelPinsFromEcho,
  };
}

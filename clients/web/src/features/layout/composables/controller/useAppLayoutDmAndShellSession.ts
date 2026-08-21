import { computed, inject, ref, shallowRef, watch, type Ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useServerStore } from '@/features/layout/server';
import { useThemeStore } from '@/features/settings/themeStore';
import { useEchoSessionStore } from '@/features/layout/echoSession';
import { useEchoAttentionStore } from '@/features/layout/echoAttention';
import { useEchoWorkspace } from '@/features/layout/echoWorkspace/useEchoWorkspace';
import { useAuthSessionStore } from '@/features/auth/authSession';
import { useDevSettingsStore } from '@/features/dev/devSettings';
import { PLATFORM_KEY } from '@/platform/keys';
import { useLayout } from '@/features/layout/composables/shell/useLayout';
import { bindPaperEditorChannelPanelWidth } from '@/features/paper/paperEditorPanelBridge';
import { useCompactShell } from '@/features/layout/useCompactShell';
import { useCompactGuildSplitShell } from '@/features/layout/composables/shell/useCompactGuildSplitShell';
import { deriveCompactPhoneShell } from '@/features/layout/composables/shell/useCompactPhoneShell';
import { useAppLayoutUiState } from './useAppLayoutUiState';
import { useAppLayoutLinkedDiscord } from './useAppLayoutLinkedDiscord';
import { useAppLayoutBanners } from '../moderation/useAppLayoutBanners';
import { useAppLayoutActionRegistryPipeline } from './useAppLayoutActionRegistryPipeline';
import { useAppLayoutWorkspaceFriendshipQueries } from '../workspace/useAppLayoutWorkspaceFriendshipQueries';
import { useAppLayoutServerLayoutPrefs } from '../server/useAppLayoutServerLayoutPrefs';
import { useAppLayoutDmUiContext } from '../dm/useAppLayoutDmUiContext';
import { createSelectServerFromStore } from '@/features/layout/createSelectServerFromStore';
import { createChatMessageNavBridge } from '@/features/navigation/createChatMessageNavBridge';
import { useChannelIconResolver } from '@/features/layout/channels/useChannelIconResolver';
import { newTraceId } from '@/observability/sessionDiagnostics';

function wireSessionStores() {
  const platform = inject(PLATFORM_KEY, null);
  const navTraceId = newTraceId();
  const serverStore = useServerStore();
  const {
    selectedServer: selectedServerRef,
    selectedServerId: selectedServerIdRef,
    servers: serverRowsRef,
  } = storeToRefs(serverStore);
  const echoSession = useEchoSessionStore();
  const echoAttention = useEchoAttentionStore();
  const workspace = useEchoWorkspace();
  const authSession = useAuthSessionStore();
  const { sessionEndedMessage, authStateGeneration } = storeToRefs(authSession);
  const devSettings = useDevSettingsStore();
  const { devModeIdsEnabled } = storeToRefs(devSettings);
  return {
    platform,
    navTraceId,
    serverStore,
    selectedServerRef,
    selectedServerIdRef,
    serverRowsRef,
    selectServerViaStore: createSelectServerFromStore(serverStore),
    channelIconResolver: useChannelIconResolver(selectedServerIdRef),
    echoSession,
    echoAttention,
    ...storeToRefs(echoAttention),
    ...storeToRefs(echoSession),
    workspace,
    authSession,
    openGuestUpgradeForDmRef: shallowRef<null | (() => void)>(null),
    sessionEndedMessage,
    authStateGeneration,
    devSettings,
    devModeIdsEnabled,
    ...useAppLayoutLinkedDiscord({ authSession }),
    showApiFetchErrorBanner:
      useAppLayoutBanners(workspace).showApiFetchErrorBanner,
    friendshipQueries: useAppLayoutWorkspaceFriendshipQueries(workspace),
    ...useAppLayoutActionRegistryPipeline(),
    chatMessageNavBridge: createChatMessageNavBridge(),
  };
}

function wireCompactMobileChrome() {
  const { isCompactShell } = useCompactShell();
  const { isCompactGuildSplitShell } = useCompactGuildSplitShell();
  const compactPagerPane = ref<0 | 1 | 2>(1);
  const compactGuildTriPaneChannelPanelOpen = ref(false);
  const mobileBottomTab = ref<'home' | 'servers' | 'explore'>('home');
  const mobileHomeStack = ref<'hub' | 'thread'>('hub');
  const mobileServersStack = ref<'list' | 'guild'>('list');
  const mobileChannelSheetOpen = ref(false);
  const mobileMembersOverlayOpen = ref(false);
  const guildMobileVcLobby = shallowRef<{
    channelId: string;
    channelName: string;
  } | null>(null);
  watch(isCompactShell, (on) => {
    if (!on) {
      compactPagerPane.value = 1;
      compactGuildTriPaneChannelPanelOpen.value = false;
      guildMobileVcLobby.value = null;
    }
  });
  return {
    isCompactShell,
    isCompactGuildSplitShell,
    isCompactPhoneShell: deriveCompactPhoneShell(
      isCompactShell,
      isCompactGuildSplitShell,
    ),
    compactPagerPane,
    compactGuildTriPaneChannelPanelOpen,
    mobileBottomTab,
    mobileHomeStack,
    mobileServersStack,
    mobileChannelSheetOpen,
    mobileMembersOverlayOpen,
    guildMobileVcLobby,
  };
}

function wireSessionUiWatches(
  uiState: ReturnType<typeof useAppLayoutUiState>,
  layoutDims: ReturnType<typeof useLayout>,
  compact: ReturnType<typeof wireCompactMobileChrome>,
  selectedServerIdRef: Ref<string | null | undefined>,
) {
  watch(
    () => uiState.vcActivityUi.value.phase,
    (phase) => {
      if (phase === 'closed') {
        layoutDims.endVcActivitySessionChannelLayout();
      } else {
        layoutDims.beginVcActivitySessionChannelLayout();
      }
    },
    { immediate: true },
  );
  useAppLayoutServerLayoutPrefs({
    channelPanelCollapsed: layoutDims.channelPanelCollapsed,
    channelPanelBubbleMode: layoutDims.channelPanelBubbleMode,
    memberPanelCollapsed: layoutDims.memberPanelCollapsed,
    voiceSideChatCollapsed: layoutDims.voiceSideChatCollapsed,
    compactGuildTriPaneChannelPanelOpen:
      compact.compactGuildTriPaneChannelPanelOpen,
    isMoreServersPinned: uiState.isMoreServersPinned,
    markMemberPanelExpandedByUser: layoutDims.markMemberPanelExpandedByUser,
    markMemberPanelCollapsedByUser: layoutDims.markMemberPanelCollapsedByUser,
    selectedServerId: selectedServerIdRef,
  });
  watch(
    () => uiState.dmActiveTab.value,
    (sub) => {
      if (sub !== 'messages' && uiState.selectedMessageRequestId.value) {
        uiState.selectedMessageRequestId.value = null;
      }
    },
  );
}

/**
 * Stores, UI chrome, compact/phone shell, and layout-pref watches.
 * Call first in phase-1 wiring.
 */
export function useAppLayoutDmAndShellSession() {
  const stores = wireSessionStores();
  const uiState = useAppLayoutUiState();
  const layoutDims = useLayout();
  bindPaperEditorChannelPanelWidth(layoutDims.channelPanelWidth);
  const compact = wireCompactMobileChrome();
  const themeStore = useThemeStore();
  const inviteLandingActiveRef = ref(false);
  wireSessionUiWatches(
    uiState,
    layoutDims,
    compact,
    stores.selectedServerIdRef,
  );
  return {
    ...stores,
    uiState,
    layoutDims,
    ...compact,
    themeStore,
    actionRailTopLayout: computed(
      () =>
        themeStore.actionRailPlacement === 'top' &&
        !compact.isCompactShell.value,
    ),
    inviteLandingActiveRef,
    inviteLandingActiveComputed: computed(() => inviteLandingActiveRef.value),
    isDmUiContext: useAppLayoutDmUiContext(uiState.activeRailTab),
  };
}

export type AppLayoutDmAndShellSession = ReturnType<
  typeof useAppLayoutDmAndShellSession
>;

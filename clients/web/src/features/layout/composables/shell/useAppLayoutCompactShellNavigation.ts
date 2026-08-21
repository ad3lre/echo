import { provide, unref, watch, type ComputedRef, type Ref } from 'vue';
import type { ChannelSummary } from '@shared/types';
import type { ChannelCategory } from '@/features/layout/channels/useChannels';
import { echoChatBottomChromeInsetPx } from '@/features/layout/echoChatBottomChromeInset';
import { LAYOUT_MOBILE_SHELL_NAV_KEY } from '@/features/layout/layoutInjectionKeys';
import type { AppToastLayoutContext } from '@/features/layout/composables/controller/useAppToastController';
import { useMobileShellNavigation } from '@/features/layout/composables/shell/useMobileShellNavigation';
import { resolveEchoServerIdContainingChannel } from '@/features/voice/resolveEchoServerIdForGuildChannel';
import { channelPanelDiag } from '@/features/channel-panel/channelPanelDiag';
import type { MobileBottomTabId } from '@/features/layout/mobileBottomTab';

type RV<T> = Ref<T> | ComputedRef<T>;

export type AppLayoutCompactShellNavigationDeps = {
  useCompactTriPaneShell: RV<boolean>;
  useCompactGuildSplitShell: RV<boolean>;
  useCompactDmShell: RV<boolean>;
  useCompactExploreShell: RV<boolean>;
  useCompactStackShell: RV<boolean>;
  useCompactPhoneTabShell: RV<boolean>;
  hasGuildChannelChrome: RV<boolean>;
  isDmUiContext: RV<boolean>;
  isCompactShell: RV<boolean>;
  isExploreView: RV<boolean>;
  isServerEmptyOnboarding: RV<boolean>;
  activeChannelId: RV<string>;
  isDmThreadSurface: RV<boolean>;
  findChannelContextById: (
    id: string | null | undefined,
  ) => { channel: ChannelSummary } | null | undefined;
  declineDmCall: () => void | Promise<void>;
  mobileBottomTab: Ref<MobileBottomTabId>;
  mobileChannelSheetOpen: Ref<boolean>;
  compactDmPane: Ref<0 | 1>;
  expandChannels: () => void;
  currentVoiceChannelId: RV<string | null | undefined>;
  categoriesByServer: RV<Readonly<Record<string, ChannelCategory[]>>>;
  openServerSurface: (serverId: string, channelId?: string) => void;
  memberPanelCollapsed: Ref<boolean>;
  compactPagerPane: Ref<0 | 1 | 2>;
  compactExplorePane: Ref<0 | 1>;
  compactGuildTriPaneChannelPanelOpen: Ref<boolean>;
  mobileHomeStack: Ref<'hub' | 'thread'>;
  mobileServersStack: Ref<'list' | 'guild'>;
  mobileMembersOverlayOpen: Ref<boolean>;
  selectServersRailOnly: () => void;
  closeDMPanel: () => void;
  clearPhoneHomeDmThread: () => void;
  rawCategoriesForServer: RV<unknown>;
  explorePageUnifiedScroll: RV<boolean>;
  channelPanelCollapsed: RV<boolean>;
};

function createAppToastLayoutContext(
  deps: AppLayoutCompactShellNavigationDeps,
): AppToastLayoutContext {
  return {
    echoChatBottomChromeInsetPx,
    useCompactTriPaneShell: deps.useCompactTriPaneShell,
    useCompactGuildSplitShell: deps.useCompactGuildSplitShell,
    useCompactDmShell: deps.useCompactDmShell,
    hasGuildChannelChrome: deps.hasGuildChannelChrome,
    isDmUiContext: deps.isDmUiContext,
    activeChannelId: deps.activeChannelId,
    isDmThreadSurface: deps.isDmThreadSurface,
    findChannelFormat: (channelId) => {
      const ctx = deps.findChannelContextById(channelId);
      const ch = ctx?.channel;
      if (!ch) return null;
      return {
        messageFormatTemplate: ch.messageFormatTemplate,
        messageFormatHard: ch.messageFormatHard === true,
      };
    },
    declineIncomingCall: deps.declineDmCall,
  };
}

function createOpenChannelPaneFromHeader(
  deps: AppLayoutCompactShellNavigationDeps,
) {
  return function openChannelPaneFromHeader() {
    if (
      unref(deps.useCompactPhoneTabShell) &&
      deps.mobileBottomTab.value === 'servers'
    ) {
      deps.mobileChannelSheetOpen.value = true;
      return;
    }
    if (unref(deps.useCompactDmShell)) {
      deps.compactDmPane.value = 1;
      return;
    }
    deps.expandChannels();
  };
}

function createFocusGuildVoiceChannelInSidebar(
  deps: AppLayoutCompactShellNavigationDeps,
  openChannelPaneFromHeader: () => void,
) {
  return function focusGuildVoiceChannelInSidebar() {
    const cid = unref(deps.currentVoiceChannelId)?.trim();
    if (!cid) return;
    const sid = resolveEchoServerIdContainingChannel(
      cid,
      unref(deps.categoriesByServer),
    );
    if (sid && sid !== 'echo') {
      deps.openServerSurface(sid, cid);
      openChannelPaneFromHeader();
    }
  };
}

function watchCompactShellChannelPanelDiag(
  deps: AppLayoutCompactShellNavigationDeps,
) {
  watch(
    () => {
      const cats = unref(deps.rawCategoriesForServer) as
        | { channels?: unknown[] }[]
        | undefined;
      let rawChannelCount = 0;
      if (Array.isArray(cats)) {
        for (const c of cats) {
          rawChannelCount += Array.isArray(c?.channels) ? c.channels.length : 0;
        }
      }
      const pane = unref(deps.compactPagerPane);
      return {
        isCompactShell: unref(deps.isCompactShell),
        useCompactTriPaneShell: unref(deps.useCompactTriPaneShell),
        useCompactExploreShell: unref(deps.useCompactExploreShell),
        useCompactDmShell: unref(deps.useCompactDmShell),
        useCompactStackShell: unref(deps.useCompactStackShell),
        compactPagerPane: pane,
        compactPagerSurface:
          pane === 0 ? 'left_channels' : pane === 1 ? 'chat' : 'members',
        categoriesLen: cats?.length ?? 0,
        rawChannelCount,
        exploreUnifiedScroll: unref(deps.explorePageUnifiedScroll),
        isExploreView: unref(deps.isExploreView),
        isDmUiContext: unref(deps.isDmUiContext),
        isServerEmptyOnboarding: unref(deps.isServerEmptyOnboarding),
        channelPanelCollapsed: unref(deps.channelPanelCollapsed),
      };
    },
    (v) => {
      channelPanelDiag('AppLayout:compactShell', v as Record<string, unknown>);
    },
    { flush: 'post' },
  );
}

/**
 * Compact/mobile shell navigation: toast layout, channel-pane jumps, and back.
 */
export function useAppLayoutCompactShellNavigation(
  deps: AppLayoutCompactShellNavigationDeps,
) {
  const appToastLayoutContext = createAppToastLayoutContext(deps);
  const openChannelPaneFromHeader = createOpenChannelPaneFromHeader(deps);
  const focusGuildVoiceChannelInSidebar = createFocusGuildVoiceChannelInSidebar(
    deps,
    openChannelPaneFromHeader,
  );
  const { mobileShellGoBack } = useMobileShellNavigation({
    isCompactShell: deps.isCompactShell,
    useCompactTriPaneShell: deps.useCompactTriPaneShell,
    useCompactGuildSplitShell: deps.useCompactGuildSplitShell,
    useCompactPhoneTabShell: deps.useCompactPhoneTabShell,
    memberPanelCollapsed: deps.memberPanelCollapsed,
    useCompactExploreShell: deps.useCompactExploreShell,
    useCompactDmShell: deps.useCompactDmShell,
    useCompactStackShell: deps.useCompactStackShell,
    isExploreView: deps.isExploreView,
    compactPagerPane: deps.compactPagerPane,
    compactExplorePane: deps.compactExplorePane,
    compactDmPane: deps.compactDmPane,
    compactGuildTriPaneChannelPanelOpen:
      deps.compactGuildTriPaneChannelPanelOpen,
    mobileBottomTab: deps.mobileBottomTab,
    mobileHomeStack: deps.mobileHomeStack,
    mobileServersStack: deps.mobileServersStack,
    mobileChannelSheetOpen: deps.mobileChannelSheetOpen,
    mobileMembersOverlayOpen: deps.mobileMembersOverlayOpen,
    selectServersRailOnly: deps.selectServersRailOnly,
    closeDMPanel: deps.closeDMPanel,
    clearPhoneHomeDmThread: deps.clearPhoneHomeDmThread,
  });
  provide(LAYOUT_MOBILE_SHELL_NAV_KEY, { mobileShellGoBack });
  watchCompactShellChannelPanelDiag(deps);
  return {
    appToastLayoutContext,
    openChannelPaneFromHeader,
    focusGuildVoiceChannelInSidebar,
    mobileShellGoBack,
  };
}

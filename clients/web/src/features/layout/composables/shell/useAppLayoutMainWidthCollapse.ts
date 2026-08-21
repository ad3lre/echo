import {
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  unref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue';
import { memberPanelDiag } from '@/features/layout/composables/members/memberPanelDiag';
import { layoutHyperLog } from '@/features/layout/layoutHyperLog';

type RV<T> = Ref<T> | ComputedRef<T>;

type CallOverlayLike = { type: string };

/** Collapse members when the main grid cannot fit chat + member list. */
const MEMBER_PANEL_MIN_CHAT_BODY_PX = 520;
/** Keep DM chat comfortable; profile panel is secondary. */
const DM_PROFILE_PANEL_WIDTH_PX = 360;
const DM_PROFILE_MIN_CHAT_BODY_PX = 760;

export type AppLayoutMainWidthCollapseDeps = {
  isCompactShell: RV<boolean>;
  isExploreView: RV<boolean>;
  isDmUiContext: RV<boolean>;
  isServerEmptyOnboarding: RV<boolean>;
  isViewingVoiceChannel: RV<boolean>;
  callOverlay: RV<CallOverlayLike>;
  memberPanelCollapsed: Ref<boolean>;
  memberPanelWidth: RV<number>;
  memberPanelAutoCollapseUserOverride: Ref<boolean>;
  isInDMChat: RV<boolean>;
  isExpandedProfileModalOpen: Ref<boolean>;
  isExpandedProfileSidePanel: Ref<boolean>;
  isGroupOverviewOpen: Ref<boolean>;
  expandedProfile: Ref<unknown | null>;
  expandDmProfileToFullModal: () => void;
  dmCallFullscreen: RV<boolean>;
  useCompactTriPaneShell: RV<boolean>;
  useCompactStackShell: RV<boolean>;
  compactPagerPane: RV<number>;
  appGridTemplateColumns: RV<string>;
  mainContentAreaGridColumns: RV<string>;
  mainContentGridTemplateRows: RV<string>;
  membersColumnVisible: RV<boolean>;
  memberPanelCollapsedEffective: RV<boolean>;
  isEchoServerRoleHierarchyPending: RV<boolean>;
  memberListUsersResolved: RV<unknown[]>;
  memberListUsers: RV<unknown[]>;
  channelPanelCollapsed: RV<boolean>;
  channelPanelWidth: RV<number>;
};

function snapshotMainContentAreaLayout(
  el: HTMLElement | null,
): Record<string, unknown> {
  if (!el) return { mainContent: null };
  const r = el.getBoundingClientRect();
  let gridCols = '';
  let gridRows = '';
  try {
    const cs = window.getComputedStyle(el);
    gridCols = cs.gridTemplateColumns;
    gridRows = cs.gridTemplateRows;
  } catch {
    /* ignore */
  }
  return {
    mainContent: {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      clientW: el.clientWidth,
      clientH: el.clientHeight,
      gridTemplateColumns: gridCols,
      gridTemplateRows: gridRows,
    },
  };
}

function createMemberPanelWidthCollapse(
  deps: AppLayoutMainWidthCollapseDeps,
  mainContentAreaEl: Ref<HTMLElement | null>,
) {
  function maybeAutoCollapseMemberPanelForMainWidth() {
    if (unref(deps.isCompactShell)) return;
    if (
      unref(deps.isExploreView) ||
      unref(deps.isDmUiContext) ||
      unref(deps.isServerEmptyOnboarding)
    ) {
      return;
    }
    if (unref(deps.isViewingVoiceChannel)) return;
    if (unref(deps.callOverlay).type === 'dmCall') return;
    if (deps.memberPanelCollapsed.value) return;
    const el = mainContentAreaEl.value;
    if (!el) return;
    const w = el.clientWidth;
    if (w <= 0) return;
    const minTotal =
      unref(deps.memberPanelWidth) + MEMBER_PANEL_MIN_CHAT_BODY_PX;
    if (w < minTotal) {
      memberPanelDiag('autoCollapseWidth', {
        mainContentWidth: w,
        minTotal,
        memberPanelWidth: unref(deps.memberPanelWidth),
        MEMBER_PANEL_MIN_CHAT_BODY_PX,
      });
      deps.memberPanelCollapsed.value = true;
      deps.memberPanelAutoCollapseUserOverride.value = false;
    }
  }

  return { maybeAutoCollapseMemberPanelForMainWidth };
}

function createDmProfileWidthCollapse(
  deps: AppLayoutMainWidthCollapseDeps,
  mainContentAreaEl: Ref<HTMLElement | null>,
) {
  function canShowDmProfilePanelForWidth() {
    const width =
      mainContentAreaEl.value?.clientWidth ??
      (typeof window !== 'undefined' ? window.innerWidth : 0);
    if (width <= 0) return false;
    return width >= DM_PROFILE_PANEL_WIDTH_PX + DM_PROFILE_MIN_CHAT_BODY_PX;
  }

  function maybeAutoCollapseDmProfilePanelForMainWidth() {
    if (!unref(deps.isInDMChat)) return;
    const profilePanelOpen =
      deps.isExpandedProfileModalOpen.value &&
      (deps.isExpandedProfileSidePanel.value || deps.isGroupOverviewOpen.value);
    if (!profilePanelOpen) return;
    if (canShowDmProfilePanelForWidth()) return;
    if (
      deps.expandedProfile.value &&
      deps.isExpandedProfileSidePanel.value &&
      !deps.isGroupOverviewOpen.value
    ) {
      deps.expandDmProfileToFullModal();
      return;
    }
    deps.isExpandedProfileModalOpen.value = false;
    deps.isExpandedProfileSidePanel.value = false;
    deps.isGroupOverviewOpen.value = false;
    deps.expandedProfile.value = null;
  }

  function collapseDmProfileOverviewForDmCallFullscreen() {
    if (
      !deps.isExpandedProfileModalOpen.value &&
      !deps.isGroupOverviewOpen.value
    ) {
      return;
    }
    deps.isExpandedProfileModalOpen.value = false;
    deps.isExpandedProfileSidePanel.value = false;
    deps.isGroupOverviewOpen.value = false;
    deps.expandedProfile.value = null;
  }

  return {
    maybeAutoCollapseDmProfilePanelForMainWidth,
    collapseDmProfileOverviewForDmCallFullscreen,
  };
}

function wireLayoutSnapshotWatch(
  deps: AppLayoutMainWidthCollapseDeps,
  mainContentAreaEl: Ref<HTMLElement | null>,
) {
  watch(
    () => ({
      compactShell: unref(deps.isCompactShell),
      triPane: unref(deps.useCompactTriPaneShell),
      stackShell: unref(deps.useCompactStackShell),
      pager: unref(deps.compactPagerPane),
      pagerSurface:
        unref(deps.compactPagerPane) === 0
          ? 'left_channels'
          : unref(deps.compactPagerPane) === 1
            ? 'chat'
            : 'members',
      appGridCols: unref(deps.appGridTemplateColumns),
      mainAreaCols: unref(deps.mainContentAreaGridColumns),
      mainAreaRows: unref(deps.mainContentGridTemplateRows),
      membersGate: unref(deps.membersColumnVisible),
      memberPanelW: unref(deps.memberPanelWidth),
      channelPanelW: unref(deps.channelPanelWidth),
      memberCollapsedEff: unref(deps.memberPanelCollapsedEffective),
      roleHierarchyPending: unref(deps.isEchoServerRoleHierarchyPending),
      resolvedMembersLen: unref(deps.memberListUsersResolved).length,
      rawMembersLen: unref(deps.memberListUsers).length,
    }),
    () => {
      void nextTick(() => {
        layoutHyperLog('AppLayout:layoutSnapshot', {
          ...snapshotMainContentAreaLayout(mainContentAreaEl.value),
          vvW: typeof window !== 'undefined' ? window.innerWidth : null,
          vvH: typeof window !== 'undefined' ? window.innerHeight : null,
          dpr: typeof window !== 'undefined' ? window.devicePixelRatio : null,
        });
      });
    },
    { flush: 'post' },
  );
}

function wireMainWidthCollapseWatches(
  deps: AppLayoutMainWidthCollapseDeps,
  mainContentAreaEl: Ref<HTMLElement | null>,
  bindObserver: () => void,
  maybeAutoCollapseMemberPanelForMainWidth: () => void,
  maybeAutoCollapseDmProfilePanelForMainWidth: () => void,
  collapseDmProfileOverviewForDmCallFullscreen: () => void,
) {
  wireLayoutSnapshotWatch(deps, mainContentAreaEl);

  watch(deps.dmCallFullscreen, (fullscreen) => {
    if (!fullscreen) return;
    collapseDmProfileOverviewForDmCallFullscreen();
  });

  watch(mainContentAreaEl, () => {
    void nextTick(bindObserver);
  });

  watch([deps.memberPanelCollapsed, deps.memberPanelWidth], () => {
    if (deps.memberPanelCollapsed.value) return;
    void nextTick(maybeAutoCollapseMemberPanelForMainWidth);
  });

  watch(
    [
      deps.channelPanelCollapsed,
      deps.channelPanelWidth,
      deps.appGridTemplateColumns,
      deps.membersColumnVisible,
    ],
    () => {
      void nextTick(maybeAutoCollapseMemberPanelForMainWidth);
    },
  );

  watch(
    () =>
      [
        unref(deps.isInDMChat),
        deps.isExpandedProfileModalOpen.value,
        deps.isExpandedProfileSidePanel.value,
        deps.isGroupOverviewOpen.value,
      ] as const,
    () => {
      void nextTick(maybeAutoCollapseDmProfilePanelForMainWidth);
    },
    { flush: 'post' },
  );
}

/**
 * Main-column resize observer: auto-collapse the members list and DM profile
 * panel when the chat body would be squeezed, plus layout snapshot logging.
 */
export function useAppLayoutMainWidthCollapse(
  deps: AppLayoutMainWidthCollapseDeps,
) {
  const mainContentAreaEl = ref<HTMLElement | null>(null);
  let memberPanelMainWidthObserver: ResizeObserver | null = null;

  const member = createMemberPanelWidthCollapse(deps, mainContentAreaEl);
  const dm = createDmProfileWidthCollapse(deps, mainContentAreaEl);

  function disposeAppLayoutSideEffects() {
    memberPanelMainWidthObserver?.disconnect();
    memberPanelMainWidthObserver = null;
  }

  function bindMemberPanelMainWidthObserver() {
    memberPanelMainWidthObserver?.disconnect();
    memberPanelMainWidthObserver = null;
    if (typeof ResizeObserver === 'undefined') return;
    const el = mainContentAreaEl.value;
    if (!el) return;
    memberPanelMainWidthObserver = new ResizeObserver(() => {
      member.maybeAutoCollapseMemberPanelForMainWidth();
      dm.maybeAutoCollapseDmProfilePanelForMainWidth();
    });
    memberPanelMainWidthObserver.observe(el);
    member.maybeAutoCollapseMemberPanelForMainWidth();
    dm.maybeAutoCollapseDmProfilePanelForMainWidth();
  }

  wireMainWidthCollapseWatches(
    deps,
    mainContentAreaEl,
    bindMemberPanelMainWidthObserver,
    member.maybeAutoCollapseMemberPanelForMainWidth,
    dm.maybeAutoCollapseDmProfilePanelForMainWidth,
    dm.collapseDmProfileOverviewForDmCallFullscreen,
  );

  onMounted(() => {
    void nextTick(bindMemberPanelMainWidthObserver);
  });
  onUnmounted(() => {
    disposeAppLayoutSideEffects();
  });

  return { mainContentAreaEl };
}

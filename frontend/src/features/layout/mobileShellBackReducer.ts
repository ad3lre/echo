/**
 * Pure mobile compact-shell “back” resolution for tests and a single authority.
 * Mutations are applied by the caller (Vue refs).
 */

export type MobileShellBackSnapshot = {
  useCompactTriPaneShell: boolean;
  useCompactGuildSplitShell: boolean;
  useCompactPhoneTabShell: boolean;
  memberPanelCollapsed: boolean;
  useCompactExploreShell: boolean;
  useCompactDmShell: boolean;
  useCompactStackShell: boolean;
  isExploreView: boolean;
  compactPagerPane: 0 | 1 | 2;
  compactExplorePane: 0 | 1;
  compactDmPane: 0 | 1;
  compactGuildTriPaneChannelPanelOpen: boolean;
  mobileBottomTab: 'home' | 'servers' | 'explore';
  mobileHomeStack: 'hub' | 'thread';
  mobileServersStack: 'list' | 'guild';
  mobileChannelSheetOpen: boolean;
  mobileMembersOverlayOpen: boolean;
};

export type MobileShellBackResult =
  | { kind: 'tri_pane_pager'; next: 0 | 1 | 2 }
  | { kind: 'tri_pane_collapse_channel_stack' }
  | { kind: 'split_collapse_members' }
  | { kind: 'explore_pane'; next: 0 | 1 }
  | { kind: 'dm_pane'; next: 0 | 1 }
  | { kind: 'phone_home_thread' }
  | { kind: 'phone_members_overlay' }
  | { kind: 'phone_channel_sheet' }
  | { kind: 'phone_servers_guild' }
  | { kind: 'history_back' }
  | { kind: 'servers_rail_only' }
  | { kind: 'close_dm_panel' }
  | { kind: 'noop_desktop'; action: 'servers_rail_only' };

/** @param historyLength — `window.history.length` when available; pass 1 to force non-history fallbacks in tests */
export function planMobileShellBack(
  snapshot: MobileShellBackSnapshot,
  opts: { isCompactShell: boolean; historyLength: number },
): MobileShellBackResult {
  if (!opts.isCompactShell) {
    return { kind: 'noop_desktop', action: 'servers_rail_only' };
  }

  if (snapshot.useCompactPhoneTabShell) {
    if (snapshot.mobileBottomTab === 'home') {
      if (snapshot.mobileHomeStack === 'thread') {
        return { kind: 'phone_home_thread' };
      }
    }
    if (snapshot.mobileBottomTab === 'servers') {
      if (snapshot.mobileMembersOverlayOpen) {
        return { kind: 'phone_members_overlay' };
      }
      if (snapshot.mobileChannelSheetOpen) {
        return { kind: 'phone_channel_sheet' };
      }
      if (snapshot.mobileServersStack === 'guild') {
        return { kind: 'phone_servers_guild' };
      }
    }
    if (opts.historyLength > 1) {
      return { kind: 'history_back' };
    }
    return { kind: 'servers_rail_only' };
  }

  if (snapshot.useCompactGuildSplitShell) {
    if (!snapshot.memberPanelCollapsed) {
      return { kind: 'split_collapse_members' };
    }
    if (opts.historyLength > 1) {
      return { kind: 'history_back' };
    }
    return { kind: 'servers_rail_only' };
  }

  if (snapshot.useCompactTriPaneShell) {
    if (snapshot.compactPagerPane === 2) {
      return { kind: 'tri_pane_pager', next: 1 };
    }
    if (snapshot.compactPagerPane === 1) {
      return { kind: 'tri_pane_pager', next: 0 };
    }
    if (snapshot.compactGuildTriPaneChannelPanelOpen) {
      return { kind: 'tri_pane_collapse_channel_stack' };
    }
    if (opts.historyLength > 1) {
      return { kind: 'history_back' };
    }
    return { kind: 'servers_rail_only' };
  }

  if (snapshot.useCompactExploreShell) {
    if (snapshot.compactExplorePane === 0) {
      return { kind: 'explore_pane', next: 1 };
    }
    if (opts.historyLength > 1) {
      return { kind: 'history_back' };
    }
    return { kind: 'servers_rail_only' };
  }

  if (snapshot.useCompactDmShell) {
    if (snapshot.compactDmPane === 0) {
      return { kind: 'dm_pane', next: 1 };
    }
    return { kind: 'close_dm_panel' };
  }

  if (snapshot.useCompactStackShell) {
    if (snapshot.isExploreView && opts.historyLength > 1) {
      return { kind: 'history_back' };
    }
    return { kind: 'servers_rail_only' };
  }

  return { kind: 'servers_rail_only' };
}

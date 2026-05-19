/**
 * Pure mobile compact-shell “back” resolution for tests and a single authority.
 * Mutations are applied by the caller (Vue refs).
 */

export type MobileShellBackSnapshot = {
  useCompactTriPaneShell: boolean;
  useCompactExploreShell: boolean;
  useCompactDmShell: boolean;
  useCompactStackShell: boolean;
  isExploreView: boolean;
  compactPagerPane: 0 | 1 | 2;
  compactExplorePane: 0 | 1;
  compactDmPane: 0 | 1;
  compactGuildTriPaneChannelPanelOpen: boolean;
};

export type MobileShellBackResult =
  | { kind: 'tri_pane_pager'; next: 0 | 1 | 2 }
  | { kind: 'tri_pane_collapse_channel_stack' }
  | { kind: 'explore_pane'; next: 0 | 1 }
  | { kind: 'dm_pane'; next: 0 | 1 }
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

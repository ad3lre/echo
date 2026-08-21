/**
 * Single derived decision for what the main content column should show.
 * Navigation-only inputs — layout chrome (panel open, widths, collapsed) must NOT affect this.
 */

export type RailTab = 'servers' | 'explore' | 'dm';
export type DmSubView = 'messages' | 'friends' | 'notifications';

export type NavState = {
  rail: RailTab;
  dmSubView: DmSubView;
  activeChannelId: string;
  selectedServerId: string | null;
};

export type DeriveContext = {
  /** Full-width empty server onboarding (from workspace + channel list heuristics). */
  isServerEmptyOnboarding: boolean;
  /** Server-scoped channel only; returns null for unknown / DM ids. */
  getServerChannelInfo: (channelId: string) => {
    type: 'text' | 'voice' | 'forum' | 'paper';
    parentChannelId?: string;
  } | null;
  /** Persisted Echo 1:1 DM (snowflake channel id), not the legacy `dm-{userId}` shell id. */
  isPersistedEchoDmThread?: (channelId: string) => boolean;
  /**
   * When set with DM rail + Messages tab, main column shows pending DM message-request
   * conversation UI (opened from the inbox “Message requests” control).
   */
  selectedMessageRequestId?: string | null;
};

export type MainSurface =
  | { type: 'explore' }
  | { type: 'dmFriends' }
  | { type: 'dmRequests' }
  | { type: 'dmNotifications' }
  | { type: 'dmThread'; threadId: string }
  /** DM rail + Messages tab but no dm-* / dm-group-* channel selected — never server chat. */
  | { type: 'dmMessagesIdle' }
  | { type: 'serverText'; channelId: string }
  | { type: 'serverVoice'; channelId: string }
  | { type: 'serverForum'; forumChannelId: string; postChannelId?: string }
  | { type: 'serverPaper'; channelId: string }
  | { type: 'serverEmptyOnboarding' }
  | { type: 'unknown'; reason: string; channelId: string };

export function isDmThreadId(channelId: string): boolean {
  return channelId.startsWith('dm-') || channelId.startsWith('dm-group-');
}

export function deriveMainSurface(
  nav: NavState,
  ctx: DeriveContext,
): MainSurface {
  if (nav.rail === 'explore') {
    return { type: 'explore' };
  }

  if (nav.rail === 'dm') {
    if (nav.dmSubView === 'friends') return { type: 'dmFriends' };
    if (nav.dmSubView === 'notifications') return { type: 'dmNotifications' };
    const pendingReq = ctx.selectedMessageRequestId?.trim();
    if (nav.dmSubView === 'messages' && pendingReq) {
      return { type: 'dmRequests' };
    }
    if (isDmThreadId(nav.activeChannelId)) {
      return { type: 'dmThread', threadId: nav.activeChannelId };
    }
    if (ctx.isPersistedEchoDmThread?.(nav.activeChannelId)) {
      return { type: 'dmThread', threadId: nav.activeChannelId };
    }
    return { type: 'dmMessagesIdle' };
  }

  /**
   * Servers rail but a DM thread id is still selected (stale nav). Prefer clearing DM ids in
   * `reduceNavigation` when switching rails; this branch remains so a bad state cannot show guild UI for a DM id.
   */
  if (
    nav.rail === 'servers' &&
    nav.dmSubView === 'messages' &&
    (isDmThreadId(nav.activeChannelId) ||
      ctx.isPersistedEchoDmThread?.(nav.activeChannelId))
  ) {
    return { type: 'dmThread', threadId: nav.activeChannelId };
  }

  if (ctx.isServerEmptyOnboarding) {
    return { type: 'serverEmptyOnboarding' };
  }

  const info = ctx.getServerChannelInfo(nav.activeChannelId);
  if (info?.type === 'voice') {
    return { type: 'serverVoice', channelId: nav.activeChannelId };
  }
  if (info?.type === 'forum') {
    return { type: 'serverForum', forumChannelId: nav.activeChannelId };
  }
  if (info?.type === 'paper') {
    return { type: 'serverPaper', channelId: nav.activeChannelId };
  }
  if (info?.type === 'text') {
    if (info.parentChannelId) {
      return {
        type: 'serverForum',
        forumChannelId: info.parentChannelId,
        postChannelId: nav.activeChannelId,
      };
    }
    return { type: 'serverText', channelId: nav.activeChannelId };
  }
  if (!nav.activeChannelId.trim()) {
    // Selected server with no resolvable channel yet (e.g. last category/channel deleted).
    // Keep the server surface mounted so empty/create affordances render instead of an error state.
    return { type: 'serverText', channelId: '' };
  }

  return {
    type: 'unknown',
    reason: 'unresolved_server_channel',
    channelId: nav.activeChannelId,
  };
}

/** Guild channel header / chrome (text, voice, forum), not paper or explore/DM. */
export function deriveHasGuildChannelChrome(surface: MainSurface): boolean {
  return (
    surface.type === 'serverText' ||
    surface.type === 'serverVoice' ||
    surface.type === 'serverForum'
  );
}

/** Paper channel uses document-native chrome instead of chat header. */
export function deriveHasPaperDocumentChrome(surface: MainSurface): boolean {
  return surface.type === 'serverPaper';
}

/** Dev-only exhaustiveness helper for switch (mainSurface.type). */
export function assertNever(x: never, msg?: string): never {
  throw new Error(msg ?? `Unexpected MainSurface branch: ${String(x)}`);
}

export type FriendshipUiKind =
  | 'unknown'
  | 'self'
  | 'discord_shadow'
  | 'guest_locked'
  | 'blocked'
  | 'friend'
  | 'incoming_request'
  | 'outgoing_request'
  | 'none';

export type FriendshipUiState = {
  kind: FriendshipUiKind;
  /**
   * Whether we consider the friendship graph authoritative enough to render
   * action buttons that change state. When false, we must not show "Add friend"
   * (or similar) because it can be wrong.
   */
  known: boolean;
  /** Suggested primary button label for profile headers. */
  primaryLabel:
    | 'Checking…'
    | 'Add friend'
    | 'Pending'
    | 'Friends'
    | 'Accept'
    | 'Blocked'
    | 'Unavailable';
  /** Can click the primary action button. */
  primaryEnabled: boolean;
  /** Primary action intent, if any. */
  primaryIntent: 'send_request' | 'cancel_outgoing' | 'accept_incoming' | null;
  /** Whether to show a secondary "Decline" action (incoming requests). */
  showDecline: boolean;
};

function normalizedIdSet(ids: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const raw of ids) {
    const id = raw.trim();
    if (id) out.add(id);
  }
  return out;
}

export function selectFriendshipUiState(input: {
  /** Signed-in user id (optional for some surfaces). */
  viewerUserId?: string | null | undefined;
  targetUserId: string;
  /** Whether the social graph is ready (Echo) or mock mode. */
  friendshipKnown: boolean;
  /** Echo guests cannot use Friends. */
  guestFriendsLocked: boolean;
  /** Non-actionable placeholder rows. */
  targetIsDiscordShadow: boolean;
  blockedUserIds: readonly string[];
  friendIds: readonly string[];
  /**
   * Optional per-user friend lists (kept in sync for the viewer in workspace).
   * Merged with `friendIds` so UI cannot miss a friendship when one source lags.
   */
  viewerFriendIdsFromMap?: readonly string[] | null | undefined;
  friendRequestsIncoming: readonly { fromUserId: string }[];
  friendRequestsOutgoing: readonly { toUserId: string }[];
}): FriendshipUiState {
  const targetId = input.targetUserId.trim();
  const viewerId = input.viewerUserId?.trim() || '';
  const known = !!input.friendshipKnown;

  if (!targetId) {
    return {
      kind: 'unknown',
      known: false,
      primaryLabel: 'Checking…',
      primaryEnabled: false,
      primaryIntent: null,
      showDecline: false,
    };
  }

  if (viewerId && targetId === viewerId) {
    return {
      kind: 'self',
      known,
      primaryLabel: 'Unavailable',
      primaryEnabled: false,
      primaryIntent: null,
      showDecline: false,
    };
  }

  if (input.targetIsDiscordShadow) {
    return {
      kind: 'discord_shadow',
      known,
      primaryLabel: 'Unavailable',
      primaryEnabled: false,
      primaryIntent: null,
      showDecline: false,
    };
  }

  if (input.guestFriendsLocked) {
    return {
      kind: 'guest_locked',
      known,
      primaryLabel: 'Unavailable',
      primaryEnabled: false,
      primaryIntent: null,
      showDecline: false,
    };
  }

  const blockedSet = normalizedIdSet(input.blockedUserIds);
  const friendSet = normalizedIdSet(input.friendIds);
  if (viewerId && input.viewerFriendIdsFromMap?.length) {
    for (const raw of input.viewerFriendIdsFromMap) {
      const id = raw.trim();
      if (id) friendSet.add(id);
    }
  }

  // Block wins over all other relationship states.
  if (blockedSet.has(targetId)) {
    return {
      kind: 'blocked',
      known,
      primaryLabel: 'Blocked',
      primaryEnabled: false,
      primaryIntent: null,
      showDecline: false,
    };
  }

  if (!known) {
    return {
      kind: 'unknown',
      known: false,
      primaryLabel: 'Checking…',
      primaryEnabled: false,
      primaryIntent: null,
      showDecline: false,
    };
  }

  // Friend wins over pending requests (should not coexist, but if it does, prefer friend).
  if (friendSet.has(targetId)) {
    return {
      kind: 'friend',
      known: true,
      primaryLabel: 'Friends',
      primaryEnabled: false,
      primaryIntent: null,
      showDecline: false,
    };
  }

  // Incoming should take precedence over outgoing for UI correctness.
  if (
    input.friendRequestsIncoming.some((r) => r.fromUserId.trim() === targetId)
  ) {
    return {
      kind: 'incoming_request',
      known: true,
      primaryLabel: 'Accept',
      primaryEnabled: true,
      primaryIntent: 'accept_incoming',
      showDecline: true,
    };
  }

  if (
    input.friendRequestsOutgoing.some((r) => r.toUserId.trim() === targetId)
  ) {
    return {
      kind: 'outgoing_request',
      known: true,
      primaryLabel: 'Pending',
      primaryEnabled: true,
      primaryIntent: 'cancel_outgoing',
      showDecline: false,
    };
  }

  return {
    kind: 'none',
    known: true,
    primaryLabel: 'Add friend',
    primaryEnabled: true,
    primaryIntent: 'send_request',
    showDecline: false,
  };
}

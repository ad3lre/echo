/** Ephemeral paper block lock (line ownership). */
export type PaperBlockLock = {
  blockId: string;
  userId: string;
  displayName: string;
};

/** Remote collaborator cursor within a block. */
export type PaperRemoteCursor = {
  userId: string;
  displayName: string;
  color: string;
  blockId: string;
  anchor: number;
  head: number;
};

export type PaperWatchersPayload = {
  channelId: string;
  watchers: {
    userId: string;
    displayName: string;
    avatarUrl?: string;
    /** User is actively authoring (edit mode) in this paper. */
    authoring?: boolean;
  }[];
  /** Connected users in edit/author mode. Collab activates when >= 2. */
  authorCount: number;
  collabEnabled: boolean;
};

export type PaperLocksPayload = {
  channelId: string;
  locks: PaperBlockLock[];
};

export type PaperCursorsPayload = {
  channelId: string;
  cursors: PaperRemoteCursor[];
};

export type PaperLockRequestedPayload = {
  channelId: string;
  blockId: string;
  fromUserId: string;
  fromDisplayName: string;
  /** Block lock holder who should receive the request. */
  toUserId: string;
};

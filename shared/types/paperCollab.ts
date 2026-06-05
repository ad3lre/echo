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

/** Ephemeral: author is actively editing this block (keystrokes). */
export type PaperBlockDirtyEntry = {
  channelId: string;
  blockId: string;
  userId: string;
  displayName: string;
  color: string;
};

/** Ephemeral: preview text of a block being edited by another author. */
export type PaperBlockPreviewEntry = {
  channelId: string;
  blockId: string;
  userId: string;
  displayName: string;
  color: string;
  /** Plain text preview of the block content (first N chars) */
  previewText: string;
};

export type PaperBlockDirtyPayload = {
  channelId: string;
  dirty: PaperBlockDirtyEntry[];
};

export type PaperBlockPreviewsPayload = {
  channelId: string;
  previews: PaperBlockPreviewEntry[];
};

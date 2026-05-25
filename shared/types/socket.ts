import type {
  Embed,
  Message,
  MentionEntity,
  MessageAttachmentPayload,
  MessageReaction,
  PollData,
  ReplyTo,
} from './message';
import type { EchoServerNotificationLevel } from './server';

/** Server → client when a `poll:vote` is rejected. */
export type PollVoteFailedCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'POLL_ENDED'
  | 'BAD_OPTION';

/** Server → client when a `message` send is rejected (Echo channels + validation). */
export type MessageFailedCode =
  | 'RATE_LIMIT'
  | 'SLOWMODE'
  | 'SPAM_FILTER'
  | 'AUTOMOD_BLOCKED'
  | 'BANNED_WORDS_BLOCKED'
  | 'VALIDATION'
  | 'FORBIDDEN'
  | 'PERSIST_FAILED'
  | 'E2EE_STORAGE_UNAVAILABLE'
  | 'INVALID_ATTACHMENT'
  | 'E2EE_UNKNOWN_DEVICE'
  | 'E2EE_DEVICE_REVOKED'
  | 'E2EE_ENVELOPE_TOO_LARGE'
  | 'UNAUTHENTICATED'
  | 'UNKNOWN_CHANNEL'
  | 'IDEMPOTENCY_EXPIRED'
  | 'GUEST_LIMIT'
  | 'GUEST_ABUSE_COOLDOWN';

import type { PaperCommentPayload, PaperDocumentPayload } from './paper';

export type EchoWorkspaceEventKind =
  | 'workspace_invalidated'
  | 'membership_changed'
  | 'role_graph_changed'
  | 'channel_tree_changed'
  | 'server_updated'
  | 'permission_invalidated'
  /** Friend request created / accepted / declined / cancelled — refresh `/friends/requests` + DM message-requests UI. */
  | 'friend_requests_changed'
  /** Discord export bot finished writing a bundle; client may resume import UI. */
  | 'discord_export_ready'
  /**
   * LiveKit SFU active speaker hints — emitted only when backend sets
   * `LIVEKIT_EMIT_ACTIVE_SPEAKERS_WEBHOOK=true`. Default UI path is client-only
   * (`ActiveSpeakersChanged`).
   */
  | 'voice_active_speakers'
  /** Discord VC roster mirror snapshot for display-only voice channels. */
  | 'discord_voice_mirror_roster'
  /**
   * Voice E2EE media epoch was superseded (guild: participant join/leave; DM/guild: room finished).
   * Clients must obtain new key material before publishing again.
   */
  | 'voice_e2ee_epoch_superseded'
  /**
   * Immediate voice channel roster mutation pushed to all guild members on the
   * persistent socket connection (Discord-Gateway-style VOICE_STATE_UPDATE).
   * Applied as an in-place patch to `voiceParticipantIds` / mute-deaf maps;
   * `workspace_invalidated` + hydrate remain as eventual-correctness fallback.
   */
  | 'voice_roster_delta'
  | 'paper_document_updated'
  | 'paper_comment_updated'
  | 'ticket_created'
  | 'ticket_updated';

export type DiscordVoiceMirrorRosterMemberPayload = {
  discordUserId: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
};

export type EchoWorkspaceEvent = {
  kind: EchoWorkspaceEventKind;
  /** Monotonic server-side version (audit snowflake or equivalent). */
  version: string;
  serverId?: string;
  userId?: string;
  /** Present when kind === 'discord_export_ready'. */
  discordGuildId?: string;
  guildName?: string;
  /** Present when kind === 'voice_active_speakers'. */
  voiceChannelId?: string;
  activeSpeakerIds?: string[];
  /** Present when kind === 'discord_voice_mirror_roster`. */
  discordVoiceMirror?: {
    channels: Array<{
      discordChannelId: string;
      echoChannelId: string;
      members: DiscordVoiceMirrorRosterMemberPayload[];
    }>;
  };
  /**
   * Present when kind === 'voice_roster_delta'.
   * Describes a single voice membership / moderation mutation to apply in-place
   * to the cached workspace `voiceParticipantIds` and mute/deaf maps.
   */
  voiceRosterDelta?: {
    serverId: string;
    channelId: string;
    userId: string;
    action:
      | 'join'
      | 'leave'
      | 'move'
      | 'mute'
      | 'unmute'
      | 'deafen'
      | 'undeafen'
      | 'disconnect'
      | 'promote_speaker'
      | 'demote_speaker'
      | 'stop_camera'
      | 'stop_screen_share';
    /** Hint only for 'move' — frontend removes from all channels, not just this one. */
    fromChannelId?: string;
    /** Current server-muted state after mutation (set for mute/unmute). */
    serverMuted?: boolean;
    /** Current server-deafened state after mutation (set for deafen/undeafen). */
    serverDeafened?: boolean;
    /** Stage channel: mic-publish allowed (set for promote_speaker/demote_speaker/join on stage). */
    stageSpeaker?: boolean;
    /** Audit snowflake — same value as `version`; used for delta version gating. */
    workspaceVersion: string;
    /** ISO timestamp of when the mutation occurred, for ordering and debug. */
    occurredAt: string;
  };
  /** Present when kind === 'paper_document_updated'. */
  paperDocument?: PaperDocumentPayload;
  /** Present when kind === 'paper_comment_updated'. */
  paperComment?: {
    action: 'created' | 'updated' | 'deleted';
    channelId: string;
    comment: PaperCommentPayload | { id: string; channelId: string };
  };
  /** Present when kind === 'ticket_created' | 'ticket_updated'. */
  ticketEvent?: {
    ticketId: string;
    channelId: string;
    authorId: string;
    subject: string;
    status: 'open' | 'in_progress' | 'resolved' | 'closed';
    assignedTo?: string | null;
  };
};

export type EchoDmRealtimeThread =
  | {
      channelId: string;
      kind: 'direct';
      peerUserId: string;
      lastActivityId?: string;
      /**
       * Authoritative DM inbox sort key (ISO 8601 UTC). Set by **any** real activity
       * on the thread: message persisted, DM call signaled, friend accepted between
       * the pair, group event. Drives `/dm/threads` `ORDER BY` and client-side sort.
       */
      lastActivityAt?: string;
    }
  | {
      channelId: string;
      kind: 'group';
      name: string;
      memberUserIds: string[];
      lastActivityId?: string;
      lastActivityAt?: string;
      /** Custom group icon when set (echo_channels.icon_key). */
      pfp?: string;
    };

export type EchoDmActivityEvent = {
  thread: EchoDmRealtimeThread;
  message: Message;
};

/**
 * Lightweight "the inbox sort key for this thread changed" event used when there is no
 * accompanying message/call payload (e.g. friend accepted between the pair).
 */
export type EchoDmThreadActivityEvent = {
  thread: EchoDmRealtimeThread;
  kind: 'friend' | 'group_event' | 'open' | 'call' | 'message';
};

export type EchoDmCallEventKind = 'incoming' | 'accepted' | 'ended';

export type EchoDmCallEndedReason = 'ended' | 'declined';

export type EchoDmCallEvent = {
  kind: EchoDmCallEventKind;
  channelId: string;
  actorUserId: string;
  thread: EchoDmRealtimeThread;
  correlationId?: string;
  reason?: EchoDmCallEndedReason;
};

export type EchoAttentionPingKind = 'personal' | 'role' | 'broadcast';

export type EchoAttentionChannelKind = 'server' | 'dm';

export type EchoAttentionServerSummary = {
  unread: boolean;
  pingKind?: EchoAttentionPingKind;
};

export type EchoAttentionChannelSummary = {
  channelId: string;
  kind: EchoAttentionChannelKind;
  lastReadMessageId: string | null;
  /** Count of messages from others after last read. */
  unreadCount: number;
  firstUnreadMessageId?: string;
  latestUnreadMessageId?: string;
  latestUnreadMessageAt?: string;
  serverId?: string;
  peerUserId?: string;
  pingKind?: EchoAttentionPingKind;
};

export type EchoAttentionDmSummary = {
  channelId: string;
  unread: boolean;
  unreadCount?: number;
  peerUserId?: string;
  lastMessageId?: string;
  lastMessageAt?: string;
  firstUnreadMessageId?: string;
};

export type EchoAttentionSnapshot = {
  channelAttentionByChannelId: Record<string, EchoAttentionChannelSummary>;
  serverAttentionByServerId: Record<string, EchoAttentionServerSummary>;
  serverNotificationLevelByServerId: Record<
    string,
    EchoServerNotificationLevel
  >;
};

/**
 * @fileoverview
 * This file contains all the type definitions for Socket.IO events.
 * By centralizing them here, we can ensure type safety and consistency
 * between the client and the server.
 */

/**
 * Defines the events that the client can send to the server.
 * The key is the event name, and the value is the type of the payload.
 */
export interface ClientToServerEvents {
  /**
   * Emitted when a user sends a message to a specific channel.
   * @param payload - The message details. authorId is optional (for mock/current user identity).
   */
  message: (payload: {
    channelId: string;
    content: string;
    /** Ignored for persistence when `contentJson` is set (server derives mentions). */
    mentions?: MentionEntity[];
    authorId?: string;
    replyTo?: ReplyTo;
    /** Client UUID / Echo public id for idempotent persist + optimistic UI. */
    id?: string;
    imageUrl?: string;
    videoUrl?: string;
    gif?: boolean;
    imageSpoiler?: boolean;
    /** Optional client correlation id for logs (echo.socket.*). */
    correlationId?: string;
    /** Poll definition (votes are ignored server-side; tallies come from `echo_poll_votes`). */
    poll?: PollData;
    /** Multi-file media (mutually exclusive with legacy imageUrl/videoUrl/gif on the server). */
    attachments?: MessageAttachmentPayload[];
    /** TipTap doc JSON — when set, message is stored as format v2. */
    contentJson?: unknown;
    /** Client hint; server rejects unsupported values. */
    contentSchemaVersion?: number;
    /** When set, server copies attribution from this message id (must be readable by sender). */
    forwardMessageId?: string;
    /**
     * Optional end-to-end encrypted envelope for DM/group DM threads that have E2EE enabled.
     * Server persists and routes this payload but does not decrypt it.
     */
    encryption?: {
      kind: 'e2ee';
      version: 1 | 2;
      senderDeviceId: string;
      /** Opaque header/metadata (e.g. session/ratchet info, wrapped attachment keys). */
      envelope: unknown;
      /** Ciphertext for the message body (base64 or similar transport encoding). */
      ciphertext: string;
    };
  }) => void;

  /** Cast or change vote on a persisted poll message (Echo; auth required). */
  'poll:vote': (payload: {
    channelId: string;
    messageId: string;
    optionId: string;
    correlationId?: string;
  }) => void;

  /** Edit own message (Echo persisted channels; auth required). */
  'message:edit': (payload: {
    channelId: string;
    messageId: string;
    /** Legacy v1 body. */
    content?: string;
    contentJson?: unknown;
    contentSchemaVersion?: number;
    correlationId?: string;
  }) => void;

  /** Soft-delete message (author or moderator; Echo persisted). Contract v1. */
  'message:delete': (payload: {
    channelId: string;
    messageId: string;
    correlationId?: string;
  }) => void;

  /** Toggle caller’s reaction on a message (Echo persisted; enforces ADD_REACTIONS). Contract v1. */
  'message:reaction_toggle': (payload: {
    channelId: string;
    messageId: string;
    emoji: string;
    correlationId?: string;
  }) => void;

  /** Pin a message (Echo persisted; enforces PIN_MESSAGES). Contract v1. */
  'message:pin': (payload: {
    channelId: string;
    messageId: string;
    correlationId?: string;
  }) => void;

  /** Unpin a message (Echo persisted; enforces PIN_MESSAGES). Contract v1. */
  'message:unpin': (payload: {
    channelId: string;
    messageId: string;
    correlationId?: string;
  }) => void;

  /**
   * Emitted when a user wants to join a specific channel (room).
   * @param channelId - The ID of the channel to join.
   */
  joinChannel: (channelId: string) => void;

  /**
   * Emitted when a user leaves a channel.
   * @param channelId - The ID of the channel to leave.
   */
  leaveChannel: (channelId: string) => void;

  /** Presence update (persisted in Postgres when Echo domain is enabled). */
  'presence:set': (payload: {
    status: string;
    client?: 'web' | 'mobile';
  }) => void;

  /** Same as `presence:set`; use on an interval to refresh `updated_at` for TTL sweep. */
  'presence:heartbeat': (payload: {
    status: string;
    client?: 'web' | 'mobile';
  }) => void;

  /** Invite the other DM participants into a call for this thread. */
  'dm_call:invite': (payload: {
    channelId: string;
    correlationId?: string;
  }) => void;

  /** Accept an incoming DM call invite for this thread. */
  'dm_call:accept': (payload: {
    channelId: string;
    correlationId?: string;
  }) => void;

  /** End or decline a DM call invite for this thread. */
  'dm_call:end': (payload: {
    channelId: string;
    correlationId?: string;
    reason?: EchoDmCallEndedReason;
  }) => void;

  /**
   * Lightweight “user is composing” pulse for a channel. Server rate-limits and enriches
   * with display name + avatar before fan-out to peers (sender excluded).
   */
  'channel:typing': (payload: { channelId: string }) => void;

  /** Join the paper presence room for a channel (all viewers). Set authoring when in edit mode. */
  'paper:watch': (payload: { channelId: string; authoring?: boolean }) => void;

  /** Toggle authoring without re-joining the watch room. */
  'paper:authoring': (payload: {
    channelId: string;
    authoring: boolean;
  }) => void;

  /** Leave the paper presence room for a channel. */
  'paper:unwatch': (payload: { channelId: string }) => void;

  /** Claim block ownership (line lock) while collab is active. */
  'paper:claim': (payload: {
    channelId: string;
    blockId: string;
    displayName?: string;
  }) => void;

  /** Release block ownership (specific block or all held by this user). */
  'paper:release': (payload: { channelId: string; blockId?: string }) => void;

  /** Remote cursor within a block (collab active only). */
  'paper:cursor': (payload: {
    channelId: string;
    blockId: string;
    anchor: number;
    head: number;
    displayName?: string;
    color?: string;
  }) => void;

  /** Ask the current block owner to release the lock. */
  'paper:lock-request': (payload: {
    channelId: string;
    blockId: string;
    displayName?: string;
  }) => void;
}

/**
 * Defines the events that the server can send to the client.
 */
export interface ServerToClientEvents {
  /**
   * Emitted to broadcast a new message to all clients in a channel.
   * @param payload - The message details.
   */
  message: (payload: Message) => void;

  /** Sender-only: idempotent retry matched an existing row; reconcile optimistic UI. */
  message_ack: (payload: { message: Message }) => void;

  /** Sender-only: send rejected (see `code`). */
  message_failed: (payload: {
    code: MessageFailedCode;
    channelId?: string;
    clientMessageId?: string;
    /** Echo: echoed from client for reaction/edit/pin failures so UI can roll back optimistic state. */
    correlationId?: string;
    detail?: string;
    /** Optional: structured RBAC snapshot when the server attaches it (dev / explicit env). */
    diagnostics?: Record<string, unknown>;
  }) => void;

  'presence:update': (payload: {
    userId: string;
    status: string;
    activeClient?: 'mobile' | 'web';
  }) => void;

  /** Recipient-scoped DM activity for inbox/unread updates even when the thread is not open. */
  'dm:activity': (payload: EchoDmActivityEvent) => void;

  /** Recipient-scoped DM call signaling layered on top of LiveKit transport. */
  'dm:call': (payload: EchoDmCallEvent) => void;

  /**
   * Recipient-scoped "DM inbox sort key changed" event for activity that has no
   * accompanying message/call payload (e.g. friend accepted between the pair).
   * Clients merge the thread (including its `lastActivityAt`) to reorder the inbox.
   */
  'dm:thread:activity': (payload: EchoDmThreadActivityEvent) => void;

  /** User-scoped replicated read cursor update for cross-tab/device convergence. */
  'read_state:update': (payload: {
    channelId: string;
    lastReadMessageId: string | null;
    /** Single-channel attention summary (present after PUT read-state). */
    channelAttention?: EchoAttentionChannelSummary;
  }) => void;

  /** User-scoped replicated attention snapshot (read state, badges, DM unread, notification policy). */
  'attention:update': (payload: EchoAttentionSnapshot) => void;

  /** Channel-wide: message body was edited (persisted Echo). */
  'message:updated': (payload: {
    channelId: string;
    messageId: string;
    content: string;
    /** Same bytes as persisted `search_index_text` (Option A). */
    contentText?: string;
    editedAt: string;
    contentJson?: unknown;
    messageFormatVersion?: number;
    contentSchemaVersion?: number;
    mentions?: MentionEntity[];
  }) => void;

  /** Channel-wide: message soft-deleted. */
  'message:deleted': (payload: {
    channelId: string;
    messageId: string;
  }) => void;

  /** Channel-wide: link preview metadata resolved for a message (may be empty to clear). */
  'message:embeds': (payload: {
    channelId: string;
    messageId: string;
    embeds: Embed[];
  }) => void;

  /** Channel-wide: reaction aggregates updated after add/remove/toggle. */
  'message:reactions': (payload: {
    channelId: string;
    messageId: string;
    reactions: MessageReaction[];
  }) => void;

  /** Channel-wide: ordered pinned message ids (newest pin first). */
  'message:pins': (payload: {
    channelId: string;
    messageIds: string[];
  }) => void;

  /** Versioned workspace/server-state event stream (membership, channel tree, role graph, server updates). */
  'echo:workspace_event': (payload: EchoWorkspaceEvent) => void;

  /** Channel-wide: poll tallies changed after a vote. */
  'poll:updated': (payload: {
    channelId: string;
    messageId: string;
    poll: PollData;
  }) => void;

  'poll:vote_failed': (payload: {
    code: PollVoteFailedCode;
    channelId?: string;
    messageId?: string;
    detail?: string;
  }) => void;

  /** Peer started / refreshed typing in a channel (throttled server-side). */
  'channel:typing': (payload: {
    channelId: string;
    userId: string;
    displayName: string;
    avatarUrl: string;
  }) => void;

  /** Current watchers on a paper channel (socket presence lane). */
  'paper:watchers': (payload: {
    channelId: string;
    watchers: {
      userId: string;
      displayName: string;
      avatarUrl?: string;
      authoring?: boolean;
    }[];
    authorCount: number;
    collabEnabled: boolean;
  }) => void;

  /** Block ownership locks for a paper channel. */
  'paper:locks': (payload: {
    channelId: string;
    locks: {
      blockId: string;
      userId: string;
      displayName: string;
    }[];
  }) => void;

  /** Remote collaborator cursors within blocks. */
  'paper:cursors': (payload: {
    channelId: string;
    cursors: {
      userId: string;
      displayName: string;
      color: string;
      blockId: string;
      anchor: number;
      head: number;
    }[];
  }) => void;

  /** Someone requested access to a block you own. */
  'paper:lock-requested': (payload: {
    channelId: string;
    blockId: string;
    fromUserId: string;
    fromDisplayName: string;
    toUserId: string;
  }) => void;

  /**
   * Broadcast to every connected client: server restart / deploy imminently (e.g. VPS `vps:prod` hook).
   * Clients should show a full-screen countdown until `endsAt` (ms since epoch).
   */
  'app:deploy_countdown': (payload: {
    reason: 'vps_restart';
    message: string;
    endsAt: number;
    secondsTotal: number;
  }) => void;
}

/**
 * Defines the shape of the custom data that can be attached to each socket instance.
 * This is useful for storing session information, like user IDs.
 */
export interface SocketData {
  userId: string;
  /** Bound browser session id when the socket authenticated via `echo_sid`. */
  authSessionId?: string;
  /** Whether the socket passed server-side auth resolution on connect. */
  authenticated?: boolean;
  /** Set on connection when the authenticated user is a guest (Continue as guest). */
  isGuest?: boolean;
  /** Profile status from auth user record, propagated from connect-time identity. */
  profileStatus?: 'online' | 'idle' | 'do_not_disturb' | 'offline';
}

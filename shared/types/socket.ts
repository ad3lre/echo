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
  | 'voice_e2ee_epoch_superseded';

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
};

export type EchoDmRealtimeThread =
  | {
      channelId: string;
      kind: 'direct';
      peerUserId: string;
      lastActivityId?: string;
    }
  | {
      channelId: string;
      kind: 'group';
      name: string;
      memberUserIds: string[];
      lastActivityId?: string;
      /** Custom group icon when set (echo_channels.icon_key). */
      pfp?: string;
    };

export type EchoDmActivityEvent = {
  thread: EchoDmRealtimeThread;
  message: Message;
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
}

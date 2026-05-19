import type { ActionResult } from '@/types/actionResult';
import type { UiTransactionManager } from '@/ui/transactions/TransactionManager';
import type {
  EchoAttentionChannelSummary,
  EchoAttentionSnapshot,
  EchoDmActivityEvent,
  EchoDmCallEvent,
  EchoDmThreadActivityEvent,
  EchoWorkspaceEvent,
  ForwardedFrom,
  MentionEntity,
  MessageAttachmentPayload,
  PollData,
  ReplyTo,
} from '@shared/types';
import type { E2eeOutboundEncryption } from '@/services/e2ee/e2eeTypes';

/** Restore local pin list after a failed optimistic `message:pin` / `message:unpin`. */
export type EchoPinRollbackSync = {
  restorePinnedIds: (channelId: string, messageIds: string[]) => void;
};

export type EchoRealtimePresencePort = {
  applyPresenceUpdate: (payload: {
    userId: string;
    status: string;
    activeClient?: 'mobile' | 'web';
  }) => void;
};

export type EchoRealtimeDmPort = {
  applyDmActivity: (payload: EchoDmActivityEvent) => void;
  applyDmCall: (payload: EchoDmCallEvent) => void;
  /** Inbox sort key changed for a thread (no accompanying message/call payload). */
  applyDmThreadActivity: (payload: EchoDmThreadActivityEvent) => void;
};

export type EchoRealtimeAttentionPort = {
  applyReadStateUpdate: (payload: {
    channelId: string;
    lastReadMessageId: string | null;
    channelAttention?: EchoAttentionChannelSummary;
  }) => void;
  applyAttentionSnapshot: (payload: EchoAttentionSnapshot) => void;
};

export type EchoRealtimeWorkspacePort = {
  applyWorkspaceEvent: (payload: EchoWorkspaceEvent) => void;
};

export type EchoRealtimePinsPort = {
  applyChannelPinsUpdate: (payload: {
    channelId: string;
    messageIds: string[];
  }) => void;
  pinRollbackSync: EchoPinRollbackSync;
};

export type EchoRealtimeClientCapsPort = {
  applyEchoChannelClientCap: (channelId: string) => void;
};

export type EchoRealtimeSocketLifecyclePort = {
  /** Called after transport connect + inbound attach. Owns join/presence/bootstrap behavior. */
  onSocketConnected: (ctx: {
    activeChannelId: string | undefined;
    /** Direct raw emit for server join (not adapter). */
    emitJoinChannel: (channelId: string) => void;
  }) => void;
  /** Called during teardown (after adapter/socket cleared). */
  onSocketDisconnected: () => void;
};

export type EchoRealtimeErrorRecoveryPort = {
  onConnectError: (err: Error) => void;
  onUnexpectedDisconnect: (reason: string) => void;
  onMessageFailed: (detail: unknown) => void;
};

export type EchoRealtimeTypingPort = {
  applyChannelTyping: (payload: {
    channelId: string;
    userId: string;
    displayName: string;
    avatarUrl: string;
  }) => void;
};

export type EchoRealtimeAuthorHintsPort = {
  /**
   * Best-effort identity hint from realtime chat payloads (for users not yet in roster snapshots).
   */
  applyAuthorHint: (payload: {
    userId: string;
    displayName?: string;
    avatarUrl?: string;
  }) => void;
};

/** Host wiring: per-concern ports (app shell owns implementations). */
export type EchoRealtimeHostPorts = {
  presence: EchoRealtimePresencePort;
  dm: EchoRealtimeDmPort;
  attention: EchoRealtimeAttentionPort;
  workspace: EchoRealtimeWorkspacePort;
  pins: EchoRealtimePinsPort;
  clientCaps: EchoRealtimeClientCapsPort;
  lifecycle: EchoRealtimeSocketLifecyclePort;
  errors: EchoRealtimeErrorRecoveryPort;
  typing: EchoRealtimeTypingPort;
  authorHints: EchoRealtimeAuthorHintsPort;
};

/** Outbound + transaction surface returned by `useSocket` (realtime port). */
export interface EchoRealtimePort {
  sendMessage: (
    channelId: string,
    content: string,
    mentions?: MentionEntity[],
    imageUrl?: string,
    poll?: PollData,
    gif?: boolean,
    replyTo?: ReplyTo,
    imageSpoiler?: boolean,
    videoUrl?: string,
    attachments?: MessageAttachmentPayload[],
    contentJson?: unknown,
    contentSchemaVersion?: number,
    forwardMessageId?: string,
    forwardPreview?: ForwardedFrom,
    preEncryptedE2ee?: E2eeOutboundEncryption,
  ) => void;
  submitPollVote: (
    channelId: string,
    messageId: string,
    optionId: string,
  ) => Promise<ActionResult>;
  submitReactionToggle: (
    channelId: string,
    messageId: string,
    emoji: string,
    correlationId?: string,
    ctx?: { removing: boolean },
  ) => Promise<ActionResult>;
  isLiveReactionReady: () => boolean;
  /** Same gate as reactions: connected socket + adapter (Echo mutations). */
  isLiveSocketReady: () => boolean;
  uiTransactions: UiTransactionManager;
  submitPin: (
    channelId: string,
    messageId: string,
    correlationId?: string,
  ) => Promise<ActionResult>;
  submitUnpin: (
    channelId: string,
    messageId: string,
    correlationId?: string,
  ) => Promise<ActionResult>;
  submitMessageDelete: (
    channelId: string,
    messageId: string,
    correlationId?: string,
  ) => Promise<ActionResult>;
  submitMessageEdit: (
    channelId: string,
    messageId: string,
    body: {
      content: string;
      contentJson?: unknown;
      contentSchemaVersion?: number;
    },
    correlationId?: string,
  ) => Promise<ActionResult>;
  submitDmCallInvite: (channelId: string) => Promise<ActionResult>;
  submitDmCallAccept: (channelId: string) => Promise<ActionResult>;
  submitDmCallEnd: (
    channelId: string,
    reason?: 'ended' | 'declined',
  ) => Promise<ActionResult>;
  /**
   * Re-emit `presence:set` and restart heartbeat (e.g. after `backendUser.status` loads post-connect).
   */
  syncOutboundPresence: () => void;
}

/** Reference to the message being replied to */
export interface ReplyTo {
  messageId: string;
  /** Author of the quoted message — used for reply-to-self ping/highlight. */
  authorId?: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
}

/**
 * Snapshot of the original message when this post is a forward (separate from reply).
 * Populated server-side from the source row; clients may send only `forwardMessageId`.
 */
export interface ForwardedFrom {
  messageId: string;
  channelId: string;
  authorName: string;
  authorAvatar?: string;
  contentPreview: string;
}

/** Aggregated reaction for display: emoji + count + who reacted */
export interface MessageReaction {
  emoji: string;
  count: number;
  userIds: string[];
  /** ISO time of the latest reaction row for this emoji (server); used to order ties after count. */
  lastReactionAt?: string;
}

export type MentionKind = 'user' | 'everyone' | 'active' | 'channel' | 'role';

/**
 * Stable mention entity carried alongside plain-text content.
 * `start`/`end` are offsets into `content` for the visible mention label.
 */
export interface MentionEntity {
  id: string;
  kind: MentionKind;
  label: string;
  start: number;
  end: number;
  userId?: string;
  channelId?: string;
  /** Present when `kind === 'role'` (server role ping). */
  roleId?: string;
}

/** Persisted / socket attachment list (single message, multiple files). */
export interface MessageAttachmentPayload {
  url: string;
  /** Echo storage key when uploaded via presign/dedupe (chat media retention). */
  storageKey?: string;
  kind: 'image' | 'video' | 'gif' | 'audio' | 'document';
  filename?: string;
  mimeType?: string;
  /** Original byte length (documents); optional for other kinds. */
  fileSize?: number;
  spoiler?: boolean;
  width?: number;
  height?: number;
}

export type MessageStickerFormat = 'png' | 'apng' | 'gif' | 'lottie';

/** First-class sticker payload carried with a message. */
export interface MessageStickerPayload {
  id: string;
  name: string;
  format: MessageStickerFormat;
  url: string;
}

export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  /** Client/server system event row (render without normal author bubble chrome). */
  systemMessage?: boolean;
  /** Snapshot for receivers who do not have this user in workspace roster (e.g. guests). */
  authorDisplayName?: string;
  authorAvatar?: string;
  authorIsDiscordShadow?: boolean;
  /** Present for Discord-import shadow authors — same Discord account as linked user = twin ownership. */
  authorDiscordUserId?: string;
  /** Message was mirrored from Discord inbound bridge (not authored natively in Echo). */
  bridgeFromDiscord?: boolean;
  /** When set (e.g. `echo_webhook`), used for server-side routing; clients may ignore. */
  bridgeSource?: string;
  content: string;
  /** Same bytes as `search_index_text` / canonical plain (Option A). */
  contentText?: string;
  /** TipTap JSON when `messageFormatVersion === 2`. */
  contentJson?: unknown;
  /** 1 = legacy string body; 2 = JSON body. */
  messageFormatVersion?: number;
  /** TipTap doc schema revision stored for this message. */
  contentSchemaVersion?: number;
  mentions?: MentionEntity[];
  timestamp: string; // ISO 8601 string
  updatedAt?: string; // ISO 8601 string
  editedAt?: string; // ISO 8601 - when last edited
  imageUrl?: string;
  gif?: boolean;
  imageSpoiler?: boolean;
  videoUrl?: string;
  audioUrl?: string;
  attachments?: MessageAttachmentPayload[];
  stickers?: MessageStickerPayload[];
  poll?: PollData;
  replyTo?: ReplyTo;
  reactions?: MessageReaction[];
  /** Rich link previews (Open Graph); may be filled shortly after send. */
  embeds?: Embed[];
  /** Text-to-speech hint (Discord-compatible). */
  tts?: boolean;
  /** Bitfield (Discord message flags subset Echo persists). */
  messageFlags?: number;
  /** Discord-style message components JSON (non-interactive display only in Echo UI). */
  components?: unknown;
  /** Present when this message forwards another (see `ForwardedFrom`). */
  forwardedFrom?: ForwardedFrom;
  /**
   * Optional end-to-end encrypted payload for DM/group threads with E2EE enabled.
   * Server does not decrypt; clients may decrypt and render plaintext locally.
   */
  encryption?: {
    kind: 'e2ee';
    version: 1 | 2;
    senderDeviceId: string;
    envelope: unknown;
    ciphertext: string;
  };
}

export interface PollOption {
  id: string;
  text: string;
  emoji?: string;
  votes: number;
  voterIds: string[];
}

export interface PollData {
  question: string;
  options: PollOption[];
  /** ISO 8601 - when poll closes. Omit for no time limit. */
  endsAt?: string;
  /**
   * When true, voter identities are hidden from other clients (counts still visible).
   * Omit or false = names visible via "View who voted".
   */
  anonymous?: boolean;
}

/**
 * Display shape for message author in chat UI.
 * Map from User: { id, name: user.username, avatar: user.avatar ?? '', status }
 * or UserProfile: { id, name: user.username, avatar: user.avatar ?? '', status }
 */
export interface MessageAuthor {
  id: string;
  name: string;
  avatar: string;
  status?: 'online' | 'offline' | 'idle' | 'do_not_disturb';
  isDiscordShadow?: boolean;
  /** IANA zone from the sender’s account (for Magic Time). */
  timeZone?: string | null;
}

/**
 * Message with author populated for chat display.
 * Transform: Message + resolved User/UserProfile -> MessageWithAuthor
 * e.g. { ...msg, author: { id: user.id, name: user.username, avatar: user.avatar ?? '', status: user.status } }
 */
export interface MessageWithAuthor extends Pick<
  Message,
  | 'authorId'
  | 'systemMessage'
  | 'content'
  | 'mentions'
  | 'timestamp'
  | 'embeds'
  | 'tts'
  | 'messageFlags'
  | 'components'
  | 'contentText'
  | 'contentJson'
  | 'messageFormatVersion'
  | 'contentSchemaVersion'
  | 'authorIsDiscordShadow'
  | 'authorDiscordUserId'
  | 'bridgeFromDiscord'
> {
  id?: string;
  channelId?: string;
  author: MessageAuthor;
  editedAt?: string;
  gif?: boolean;
  imageUrl?: string;
  imageSpoiler?: boolean;
  videoUrl?: string;
  audioUrl?: string;
  attachments?: MessageAttachmentPayload[];
  stickers?: MessageStickerPayload[];
  poll?: PollData;
  replyTo?: ReplyTo;
  reactions?: MessageReaction[];
  forwardedFrom?: ForwardedFrom;
}

export interface Attachment {
  id: string;
  url: string;
  filename: string;
  size: number;
  mimeType: string;
}

export interface Embed {
  title?: string;
  description?: string;
  url?: string;
  /** Source label in preview chrome (e.g. oEmbed `provider_name`). */
  provider?: string;
  color?: number; // RGB integer
  timestamp?: string; // ISO 8601 string
  footer?: {
    text: string;
    icon_url?: string;
  };
  image?: {
    url: string;
    width?: number;
    height?: number;
  };
  thumbnail?: {
    url: string;
    width?: number;
    height?: number;
  };
  author?: {
    name: string;
    url?: string;
    icon_url?: string;
  };
  fields?: {
    name: string;
    value: string;
    inline?: boolean;
  }[];
  /** In-chat iframe player (YouTube / Vimeo); optional for older stored embeds — client may derive from `url`. */
  video?: {
    kind: 'youtube' | 'vimeo';
    embedUrl: string;
    width?: number;
    height?: number;
  };
  /**
   * In-app jump target for pasted message links (`/channels/:channelId/:messageId`).
   * When set, clients render a compact inline preview and navigate in-app on click.
   */
  echoJump?: {
    channelId: string;
    messageId: string;
  };
}

export interface Reaction {
  emoji: string;
  userId: string;
}

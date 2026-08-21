import type {
  Embed,
  ForwardedFrom,
  MentionEntity,
  MessageAttachmentPayload,
  MessageReaction,
  MessageStickerPayload,
  PollData,
  ReplyTo,
} from '@shared/types';
import type { Message } from '@shared/types';

export interface RawMessage {
  id?: string;
  authorId: string;
  /** Client/system event row shown as system UI in chat. */
  systemMessage?: boolean;
  /** From server when author is not in workspace roster (guests, etc.). */
  authorDisplayName?: string;
  authorAvatar?: string;
  authorIsDiscordShadow?: boolean;
  authorDiscordUserId?: string;
  bridgeFromDiscord?: boolean;
  /** ISO 8601 — use `formatTimestamp` in UI for display. */
  timestamp: string;
  content: string;
  /** Canonical plain mirror (same as server `search_index_text` when present). */
  contentText?: string;
  contentJson?: unknown;
  messageFormatVersion?: number;
  contentSchemaVersion?: number;
  mentions?: MentionEntity[];
  gif?: boolean;
  imageUrl?: string;
  imageSpoiler?: boolean;
  videoUrl?: string;
  audioUrl?: string;
  attachments?: MessageAttachmentPayload[];
  stickers?: MessageStickerPayload[];
  poll?: PollData;
  replyTo?: ReplyTo;
  forwardedFrom?: ForwardedFrom;
  /** Set when message was edited */
  editedAt?: string;
  reactions?: MessageReaction[];
  embeds?: Embed[];
  tts?: boolean;
  messageFlags?: number;
  components?: unknown;
  encryption?: Message['encryption'];
}

export interface UserForAuthor {
  id: string;
  name: string;
  pfp: string;
  status: string;
  timeZone?: string | null;
}

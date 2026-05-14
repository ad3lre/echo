import type { MentionEntity } from '@shared/types';

/** Payload for `ECHO_INCOMING_CHAT_MESSAGE_EVENT` (sound + optional toast). */
export type IncomingChatMessageNotifyDetail = {
  channelId: string;
  authorId: string;
  mentions?: MentionEntity[];
  authorDisplayName?: string;
  authorAvatar?: string;
  /** Plaintext preview for toast body. */
  contentPreview?: string;
};

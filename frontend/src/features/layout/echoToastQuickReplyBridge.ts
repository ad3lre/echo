/**
 * Lets `AppLayout` toast UI send a reply without threading `sendMessage`
 * through `CustomEvent` payloads (non-serializable).
 */
import type { MentionEntity } from '@shared/types';

export type EchoToastQuickReplyPayload = {
  text: string;
  mentions?: MentionEntity[];
  contentJson?: unknown;
  contentSchemaVersion?: number;
};

export type EchoToastQuickReplySender = (
  channelId: string,
  payload: EchoToastQuickReplyPayload,
) => void;

let sender: EchoToastQuickReplySender | null = null;

export function registerEchoToastQuickReplySender(
  fn: EchoToastQuickReplySender | null,
): void {
  sender = fn;
}

export function sendEchoToastQuickReply(
  channelId: string,
  payload: EchoToastQuickReplyPayload,
): boolean {
  const cid = channelId?.trim() ?? '';
  const body = payload.text?.trim() ?? '';
  if (!cid || !body || !sender) return false;
  sender(cid, {
    text: body,
    mentions: payload.mentions,
    contentJson: payload.contentJson,
    contentSchemaVersion: payload.contentSchemaVersion,
  });
  return true;
}

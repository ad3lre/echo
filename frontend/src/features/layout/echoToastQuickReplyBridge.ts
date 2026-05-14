/**
 * Lets `AppLayout` toast UI send a plain-text reply without threading `sendMessage`
 * through `CustomEvent` payloads (non-serializable).
 */
export type EchoToastQuickReplySender = (
  channelId: string,
  text: string,
) => void;

let sender: EchoToastQuickReplySender | null = null;

export function registerEchoToastQuickReplySender(
  fn: EchoToastQuickReplySender | null,
): void {
  sender = fn;
}

export function sendEchoToastQuickReply(
  channelId: string,
  text: string,
): boolean {
  const cid = channelId?.trim() ?? '';
  const body = text?.trim() ?? '';
  if (!cid || !body || !sender) return false;
  sender(cid, body);
  return true;
}

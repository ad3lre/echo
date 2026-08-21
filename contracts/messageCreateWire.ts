import type { Message } from './types/message';

/**
 * Optional flag when TipTap JSON was omitted from a socket create fan-out.
 * Clients paint from `content` / `contentText` and may hydrate via GET-by-id.
 */
export type MessageCreateFanoutPayload = Message & {
  hasContentJson?: boolean;
};

/**
 * Slim channel-wide `message` / `dm:activity` fan-out payloads.
 * Omits TipTap `contentJson` (+ schema version) which list paint does not need.
 * REST history, `message_ack`, push, and bot events should keep the full row.
 */
export function toMessageCreateFanoutPayload(
  message: Message,
): MessageCreateFanoutPayload {
  const hasJson =
    message.contentJson !== undefined && message.contentJson !== null;
  if (!hasJson && message.contentSchemaVersion === undefined) {
    return message;
  }
  const {
    contentJson: _omitJson,
    contentSchemaVersion: _omitSchema,
    ...rest
  } = message;
  return {
    ...rest,
    ...(hasJson ? { hasContentJson: true as const } : {}),
  };
}

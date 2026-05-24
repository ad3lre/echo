import type { EchoApiMessage } from '@/api/echo/messages';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { plainTextFromEchoContentJson } from '@/features/chat/editor/echoContentJsonPlainText';
import { normalizeEchoMessageFormatLineEndings } from '@shared/messageChunkLimits';

export type MessagePlainFields = {
  content?: string;
  contentText?: string;
  contentJson?: unknown;
  messageFormatVersion?: number;
};

function pickLongestPlain(candidates: readonly string[]): string {
  let best = '';
  for (const raw of candidates) {
    const normalized = normalizeEchoMessageFormatLineEndings(raw);
    if (normalized.length > best.length) {
      best = normalized;
    }
  }
  return best;
}

/**
 * Canonical plain body for display, search, and history refresh.
 * Prefer TipTap JSON (v2) when present — matches what the server stores and Discord mirrors.
 */
export function plainTextForMessageFields(fields: MessagePlainFields): string {
  const mf = fields.messageFormatVersion ?? 1;
  const candidates: string[] = [];
  if (typeof fields.contentText === 'string') {
    candidates.push(fields.contentText);
  }
  if (typeof fields.content === 'string') {
    candidates.push(fields.content);
  }
  if (mf >= 2 && fields.contentJson !== undefined) {
    const fromJson = plainTextFromEchoContentJson(fields.contentJson);
    if (fromJson.trim()) candidates.push(fromJson);
  }
  return pickLongestPlain(candidates);
}

export function plainTextForRawMessage(msg: MessagePlainFields): string {
  return plainTextForMessageFields(msg);
}

export function plainTextForEchoApiMessage(m: EchoApiMessage): string {
  const api = m as EchoApiMessage & { searchIndexText?: string };
  return plainTextForMessageFields({
    content: m.content,
    contentText: m.contentText ?? api.searchIndexText,
    contentJson: m.contentJson,
    messageFormatVersion: m.messageFormatVersion,
  });
}

export function rawMessageBodyPatchFromApi(
  api: RawMessage,
): Partial<RawMessage> {
  const plain = plainTextForRawMessage(api);
  const patch: Partial<RawMessage> = {
    content: plain,
    contentText: plain,
  };
  if (api.contentJson !== undefined) {
    patch.contentJson = api.contentJson;
  }
  if (api.messageFormatVersion !== undefined) {
    patch.messageFormatVersion = api.messageFormatVersion;
  }
  if (api.contentSchemaVersion !== undefined) {
    patch.contentSchemaVersion = api.contentSchemaVersion;
  }
  if (api.mentions !== undefined) {
    patch.mentions = api.mentions;
  }
  if (api.embeds !== undefined) {
    patch.embeds = api.embeds;
  }
  if (api.editedAt !== undefined) {
    patch.editedAt = api.editedAt;
  }
  return patch;
}

export function shouldRefreshRawMessageBodyFromApi(
  local: RawMessage,
  api: RawMessage,
): boolean {
  return plainTextForRawMessage(local) !== plainTextForRawMessage(api);
}

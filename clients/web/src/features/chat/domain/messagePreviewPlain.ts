import {
  plainTextForMessageFields,
  type MessagePlainFields,
} from '@/features/chat/domain/messageDisplayPlain';
import { plainTextWithDisplayShortcodes } from '@/features/chat/emoji/customEmojiDisplay';

export function truncatePreviewText(text: string, maxLen: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (maxLen <= 0 || t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

/**
 * Canonical plain preview for pins, notifications, replies, forwards, etc.
 * Uses stored body projection then Discord-style `:name:` shortcodes (not wire tokens).
 */
export function messagePreviewPlainText(
  fields: MessagePlainFields,
  maxLen?: number,
): string {
  const plain = plainTextForMessageFields(fields);
  const display = plainTextWithDisplayShortcodes(plain);
  if (maxLen === undefined) return display.trim();
  return truncatePreviewText(display, maxLen);
}

/** Preview from a raw content string (reactions-only / legacy call sites). */
export function messageContentPreviewPlainText(
  content: string | undefined,
  maxLen?: number,
): string {
  return messagePreviewPlainText({ content }, maxLen);
}

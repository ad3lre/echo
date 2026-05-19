import type { InsertUserMentionPayload } from '@/features/chat/chatComposerContext';

type MentionComposerAdapter = {
  focus: () => void;
  getSelectionStart: () => number;
  getSelectionEnd: () => number;
  insertText: (text: string) => void;
  insertMention: (
    start: number,
    end: number,
    mention: { kind: 'user'; label: string; userId: string },
  ) => void;
  getContent: () => string;
};

type InsertUserMentionAtCursorOptions = {
  canInsert?: () => boolean;
  schedule?: (fn: () => void) => void;
  onInserted?: () => void;
};

/**
 * Shared "quick mention" insertion flow used by right-click menus.
 * Keeps mention token insertion consistent with composer autocomplete.
 */
export function insertUserMentionAtCursor(
  composer: MentionComposerAdapter,
  payload: InsertUserMentionPayload,
  options: InsertUserMentionAtCursorOptions = {},
): boolean {
  const canInsert = options.canInsert ?? (() => true);
  const schedule = options.schedule ?? ((fn: () => void) => queueMicrotask(fn));
  const onInserted = options.onInserted ?? (() => undefined);
  const userId = payload.userId.trim();
  if (!userId || !canInsert()) return false;
  const label = payload.displayName.trim() || 'user';
  composer.focus();
  schedule(() => {
    if (!canInsert()) return;
    const start = composer.getSelectionStart();
    const end = composer.getSelectionEnd();
    const text = composer.getContent();
    const needsLeadingSpace = start > 0 && !/\s/.test(text[start - 1] ?? '');
    if (needsLeadingSpace) {
      composer.insertText(' ');
      const pos = start + 1;
      composer.insertMention(pos, pos, { kind: 'user', label, userId });
    } else {
      composer.insertMention(start, end, { kind: 'user', label, userId });
    }
    schedule(() => {
      onInserted();
      composer.focus();
    });
  });
  return true;
}

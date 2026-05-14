import { describe, expect, it, vi } from 'vitest';
import { insertUserMentionAtCursor } from '@/features/chat/composables/insertUserMentionAtCursor';

function createComposer(content: string, start: number, end = start) {
  let current = content;
  let selectionStart = start;
  let selectionEnd = end;
  const insertText = vi.fn((text: string) => {
    current =
      current.slice(0, selectionStart) + text + current.slice(selectionEnd);
    selectionStart += text.length;
    selectionEnd = selectionStart;
  });
  const insertMention = vi.fn(
    (
      s: number,
      e: number,
      mention: { kind: 'user'; label: string; userId: string },
    ) => {
      current =
        current.slice(0, s) +
        `@${mention.label}` +
        current.slice(Math.max(s, e));
      selectionStart = s + mention.label.length + 1;
      selectionEnd = selectionStart;
    },
  );
  return {
    focus: vi.fn(),
    getSelectionStart: () => selectionStart,
    getSelectionEnd: () => selectionEnd,
    insertText,
    insertMention,
    getContent: () => current,
  };
}

describe('insertUserMentionAtCursor', () => {
  it('inserts a leading space when cursor is mid-word', () => {
    const composer = createComposer('hello', 5);
    const schedule = (fn: () => void) => fn();
    const onInserted = vi.fn();
    const ok = insertUserMentionAtCursor(
      composer,
      { userId: 'u1', displayName: 'Ada' },
      { schedule, onInserted },
    );
    expect(ok).toBe(true);
    expect(composer.insertText).toHaveBeenCalledWith(' ');
    expect(composer.insertMention).toHaveBeenCalledWith(6, 6, {
      kind: 'user',
      label: 'Ada',
      userId: 'u1',
    });
    expect(onInserted).toHaveBeenCalledTimes(1);
  });

  it('replaces selection directly when already on whitespace', () => {
    const composer = createComposer('hello world', 6, 11);
    const schedule = (fn: () => void) => fn();
    insertUserMentionAtCursor(
      composer,
      { userId: 'u2', displayName: 'Lin' },
      { schedule },
    );
    expect(composer.insertText).not.toHaveBeenCalled();
    expect(composer.insertMention).toHaveBeenCalledWith(6, 11, {
      kind: 'user',
      label: 'Lin',
      userId: 'u2',
    });
  });

  it('blocks insertion when guard disallows mentioning', () => {
    const composer = createComposer('hello', 5);
    const ok = insertUserMentionAtCursor(
      composer,
      { userId: 'u3', displayName: 'Rae' },
      { canInsert: () => false },
    );
    expect(ok).toBe(false);
    expect(composer.insertText).not.toHaveBeenCalled();
    expect(composer.insertMention).not.toHaveBeenCalled();
  });
});

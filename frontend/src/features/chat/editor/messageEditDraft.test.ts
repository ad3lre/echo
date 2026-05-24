import { describe, expect, it } from 'vitest';
import {
  editableTextFromMessage,
  relocateMentionsInEditableText,
} from './messageEditDraft';

describe('editableTextFromMessage', () => {
  it('derives plain text from v2 contentJson when content is empty', () => {
    const text = editableTextFromMessage({
      content: '',
      messageFormatVersion: 2,
      contentJson: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'hello from json' }],
          },
        ],
      },
    });
    expect(text).toBe('hello from json');
  });

  it('prefers contentText over legacy content', () => {
    expect(
      editableTextFromMessage({
        content: 'legacy',
        contentText: 'plain',
        messageFormatVersion: 1,
      }),
    ).toBe('plain');
  });
});

describe('relocateMentionsInEditableText', () => {
  it('reindexes mentions when labels are still present', () => {
    const mentions = relocateMentionsInEditableText('hey @Ada ping', [
      {
        id: 'm1',
        kind: 'user',
        label: 'Ada',
        start: 99,
        end: 103,
        userId: 'u1',
      },
    ]);
    expect(mentions).toHaveLength(1);
    expect(mentions[0]!.start).toBe(4);
    expect(mentions[0]!.end).toBe(8);
    expect(mentions[0]!.userId).toBe('u1');
  });
});

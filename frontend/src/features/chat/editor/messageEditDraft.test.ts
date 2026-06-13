import { describe, expect, it } from 'vitest';
import {
  buildEditingMessageFromRow,
  editableTextFromMessage,
  isMessageEditableInComposer,
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

describe('isMessageEditableInComposer', () => {
  it('returns true for text content', () => {
    expect(isMessageEditableInComposer({ content: 'hello' })).toBe(true);
  });

  it('returns true for attachment-only messages', () => {
    expect(
      isMessageEditableInComposer({
        content: '',
        attachments: [{ url: 'https://x.test/a.png', kind: 'image' }],
      }),
    ).toBe(true);
  });

  it('returns false for empty rows', () => {
    expect(isMessageEditableInComposer({ content: '' })).toBe(false);
  });
});

describe('buildEditingMessageFromRow', () => {
  it('returns null without message id', () => {
    expect(buildEditingMessageFromRow({ content: 'hi' })).toBeNull();
  });

  it('builds composer preload from v2 contentJson', () => {
    const contentJson = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'hello from json' }],
        },
      ],
    };
    const row = buildEditingMessageFromRow({
      id: 'm1',
      messageFormatVersion: 2,
      contentJson,
      mentions: [
        {
          id: 'x',
          kind: 'user',
          label: 'Ada',
          start: 0,
          end: 4,
          userId: 'u1',
        },
      ],
      attachments: [{ url: 'https://x.test/a.png', kind: 'image' as const }],
    });
    expect(row).toMatchObject({
      messageId: 'm1',
      previewContent: 'hello from json',
      content: 'hello from json',
      contentJson,
    });
    expect(row!.mentions).toHaveLength(1);
    expect(row!.attachments).toHaveLength(1);
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

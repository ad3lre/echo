import { describe, expect, it } from 'vitest';
import { buildMessageRowRevisionKey } from './messageRowRevisionKey';

describe('buildMessageRowRevisionKey', () => {
  it('changes when layout-affecting fields change', () => {
    const row = {
      layout: { groupedWithPrevious: false },
      showDaySeparatorBefore: false,
      showUnreadSeparatorBefore: false,
      isCompact: false,
    };
    const message = {
      contentText: 'hello',
      attachments: [],
      embeds: [],
      reactions: [],
    };
    const base = buildMessageRowRevisionKey(row as never, message);
    const grouped = buildMessageRowRevisionKey(
      {
        ...row,
        layout: { groupedWithPrevious: true },
      } as never,
      message,
    );
    const longer = buildMessageRowRevisionKey(row as never, {
      ...message,
      contentText: 'hello world with more text',
    });
    expect(grouped).not.toBe(base);
    expect(longer).not.toBe(base);
  });

  it('changes when same-length body text has different line geometry', () => {
    const row = {
      layout: { groupedWithPrevious: false },
      showDaySeparatorBefore: false,
      showUnreadSeparatorBefore: false,
      isCompact: false,
    };
    const singleLine = buildMessageRowRevisionKey(row as never, {
      contentText: 'abcd',
    });
    const multiline = buildMessageRowRevisionKey(row as never, {
      contentText: 'a\ncd',
    });

    expect(multiline).not.toBe(singleLine);
  });

  it('changes when poll geometry changes', () => {
    const row = {
      layout: { groupedWithPrevious: false },
      showDaySeparatorBefore: false,
      showUnreadSeparatorBefore: false,
      isCompact: false,
    };
    const message = {
      contentText: 'poll',
      poll: {
        question: 'Favorite?',
        options: [
          { id: 'a', text: 'Yes', votes: 4, voterIds: ['u1', 'u2'] },
          { id: 'b', text: 'No', votes: 3, voterIds: ['u3'] },
        ],
      },
    };
    const base = buildMessageRowRevisionKey(row as never, message);
    const moreOptions = buildMessageRowRevisionKey(row as never, {
      ...message,
      poll: {
        ...message.poll,
        options: [
          ...message.poll.options,
          {
            id: 'c',
            text: 'Maybe, but only after a much longer answer label',
            votes: 0,
            voterIds: [],
            emoji: { name: 'thinking' },
          },
        ],
      },
    });
    const changedTallies = buildMessageRowRevisionKey(row as never, {
      ...message,
      poll: {
        ...message.poll,
        options: [
          { id: 'a', text: 'Yes', votes: 7, voterIds: ['u1', 'u2', 'u4'] },
          { id: 'b', text: 'No', votes: 0, voterIds: [] },
        ],
      },
    });

    expect(moreOptions).not.toBe(base);
    expect(changedTallies).not.toBe(base);
  });

  it('changes when an embed grows without changing the embed count', () => {
    const row = {
      layout: { groupedWithPrevious: false },
      showDaySeparatorBefore: false,
      showUnreadSeparatorBefore: false,
      isCompact: false,
    };
    const compact = buildMessageRowRevisionKey(row as never, {
      contentText: 'link',
      embeds: [{ title: 'Preview', description: 'Short' }],
    });
    const rich = buildMessageRowRevisionKey(row as never, {
      contentText: 'link',
      embeds: [
        {
          title: 'Preview',
          description:
            'A much longer description that takes more vertical space',
          image: {
            url: 'https://example.com/image.png',
            width: 1200,
            height: 900,
          },
        },
      ],
    });

    expect(rich).not.toBe(compact);
  });

  it('changes when emoji-only body geometry changes', () => {
    const row = {
      layout: { groupedWithPrevious: false },
      showDaySeparatorBefore: false,
      showUnreadSeparatorBefore: false,
      isCompact: false,
    };
    const emojiOnly = buildMessageRowRevisionKey(row as never, {
      contentText: '<:a:1>',
    });
    const mixed = buildMessageRowRevisionKey(row as never, {
      contentText: 'hi <:a:1>',
    });
    expect(mixed).not.toBe(emojiOnly);
  });
});

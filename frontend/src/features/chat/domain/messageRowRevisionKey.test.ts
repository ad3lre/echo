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
});

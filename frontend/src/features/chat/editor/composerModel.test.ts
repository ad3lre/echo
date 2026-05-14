import { describe, expect, it } from 'vitest';
import type { MentionEntity } from '@shared/types';
import {
  buildComposerDoc,
  shiftMentionsForReplacement,
} from '@/features/chat/editor/composerModel';

describe('composerModel', () => {
  it('builds inline nodes for mentions, custom emoji, and channel mentions', () => {
    const content = '@Alice <:wave:123> #general';
    const mentions: MentionEntity[] = [
      {
        id: 'm_user',
        kind: 'user',
        label: 'Alice',
        start: 0,
        end: 6,
        userId: 'u1',
      },
      {
        id: 'm_channel',
        kind: 'channel',
        label: 'general',
        start: 19,
        end: 27,
        channelId: 'c1',
      },
    ];

    const doc = buildComposerDoc(content, mentions, {
      customEmojiImageUrl: () => 'https://cdn.test/emoji.png',
    });
    const inline = doc.content?.[0]?.content ?? [];

    expect(inline).toHaveLength(5);
    expect(inline[0]).toMatchObject({
      type: 'mentionEntity',
      attrs: {
        mentionId: 'm_user',
        kind: 'user',
        label: 'Alice',
        userId: 'u1',
      },
    });
    expect(inline[1]).toMatchObject({ type: 'text', text: ' ' });
    expect(inline[2]).toMatchObject({
      type: 'customEmoji',
      attrs: {
        emojiId: '123',
        name: 'wave',
        animated: false,
        imageUrl: 'https://cdn.test/emoji.png',
      },
    });
    expect(inline[3]).toMatchObject({ type: 'text', text: ' ' });
    expect(inline[4]).toMatchObject({
      type: 'channelMention',
      attrs: { mentionId: 'm_channel', label: 'general', channelId: 'c1' },
    });
  });

  it('builds app icon inline nodes for <icon:…> tokens', () => {
    const content = '<icon:echo.svg>';
    const doc = buildComposerDoc(content, [], {
      appIconImageUrl: () => 'https://cdn.test/echo.svg',
    });
    const inline = doc.content?.[0]?.content ?? [];
    expect(inline).toHaveLength(1);
    expect(inline[0]).toMatchObject({
      type: 'appIcon',
      attrs: {
        filename: 'echo.svg',
        imageUrl: 'https://cdn.test/echo.svg',
      },
    });
  });

  it('converts embedded newlines into hard break nodes', () => {
    const doc = buildComposerDoc('hello\nworld', []);
    expect(doc.content?.[0]?.content).toEqual([
      { type: 'text', text: 'hello' },
      { type: 'hardBreak' },
      { type: 'text', text: 'world' },
    ]);
  });

  it('shifts later mentions when text is inserted before them', () => {
    const previous = '@Alice hi';
    const mentions: MentionEntity[] = [
      {
        id: 'm_user',
        kind: 'user',
        label: 'Alice',
        start: 0,
        end: 6,
        userId: 'u1',
      },
    ];

    const next = 'hey ' + previous;
    const shifted = shiftMentionsForReplacement(next, mentions, 0, 0, 4);

    expect(shifted).toEqual([
      {
        id: 'm_user',
        kind: 'user',
        label: 'Alice',
        start: 4,
        end: 10,
        userId: 'u1',
      },
    ]);
  });
});

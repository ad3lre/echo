import { describe, expect, it } from 'vitest';
import {
  buildComposerDoc,
  makeMentionEntity,
  serializeComposerDoc,
  rawOffsetToEditorPos,
  MentionEntityNode,
  ChannelMentionNode,
  CustomEmojiNode,
} from './composerModel';

describe('composerModel additional', () => {
  // Basic docs and entity helpers

  it('buildComposerDoc returns doc structure', () => {
    const doc = buildComposerDoc('hello', [], undefined);
    expect(doc.type).toBe('doc');
    expect(doc.content?.[0]?.type).toBe('paragraph');
  });

  it('makeMentionEntity returns entity with length', () => {
    const m = makeMentionEntity(
      { kind: 'user', label: 'Sam', userId: 'u2' },
      5,
    );
    expect(m.label).toBe('Sam');
    expect(m.start).toBe(5);
    expect(m.end).toBeGreaterThan(5);
  });

  it('serializeComposerDoc handles text and customEmoji nodes from a mock node', () => {
    const mockParagraph: unknown = {
      type: { name: 'paragraph' },
      forEach(fn: (child: unknown, fragOffset: number) => void) {
        fn({ isText: true, text: 'hello' }, 0);
        fn(
          {
            type: { name: 'customEmoji' },
            attrs: { name: 'x', emojiId: '9', animated: false },
          },
          5,
        );
      },
    };
    const mockNode: unknown = {
      forEach(fn: (block: unknown, _off: number, index: number) => void) {
        fn(mockParagraph, 0, 0);
      },
    };
    const out = serializeComposerDoc(mockNode as never, { from: 1, to: 2 });
    expect(out.content).toContain('hello');
    expect(out.content).toContain('<:x:9>');
    expect(Array.isArray(out.mentions)).toBe(true);
  });
  it('rawOffsetToEditorPos maps raw offsets into editor positions for mixed content', () => {
    const mockParagraph: unknown = {
      type: { name: 'paragraph' },
      forEach(fn: (child: unknown, fragOffset: number) => void) {
        fn({ isText: true, text: 'hello' }, 0);
        fn(
          {
            type: { name: 'customEmoji' },
            attrs: { name: 'x', emojiId: '9', animated: false },
            nodeSize: 1,
          },
          5,
        );
        fn(
          {
            type: { name: 'mentionEntity' },
            attrs: { label: 'Bob' },
            nodeSize: 1,
          },
          6,
        );
      },
    };
    const mockDoc: unknown = {
      nodeSize: 11,
      forEach(fn: (block: unknown, _off: number, index: number) => void) {
        fn(mockParagraph, 0, 0);
      },
    };
    expect(rawOffsetToEditorPos(mockDoc as never, 0)).toBe(1);
    expect(rawOffsetToEditorPos(mockDoc as never, 4)).toBe(5);
    expect(rawOffsetToEditorPos(mockDoc as never, 5)).toBe(6);
    expect(rawOffsetToEditorPos(mockDoc as never, 6)).toBe(7);
  });

  // Node render tests: ensure Tiptap Node definitions exist and have render helpers
  it('node definitions expose names', () => {
    expect(MentionEntityNode.name).toBe('mentionEntity');
    expect(ChannelMentionNode.name).toBe('channelMention');
    expect(CustomEmojiNode.name).toBe('customEmoji');
  });
});

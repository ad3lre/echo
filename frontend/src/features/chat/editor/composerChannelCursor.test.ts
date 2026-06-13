import { describe, expect, it } from 'vitest';
import { Editor, type Extensions, type JSONContent } from '@tiptap/core';
import HardBreak from '@tiptap/extension-hard-break';
import StarterKit from '@tiptap/starter-kit';
import type { MentionEntity } from '@shared/types';
import {
  buildComposerDoc,
  ChannelMentionNode,
  CustomEmojiNode,
  MentionEntityNode,
  rawOffsetToEditorPos,
  serializeComposerDoc,
} from '@/features/chat/editor/composerModel';
import { findChannelTrigger } from '@/composables/useChannelAutocomplete';

function makeEditor(content: string, mentions: MentionEntity[]): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bold: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        dropcursor: false,
        gapcursor: false,
        heading: false,
        horizontalRule: false,
        italic: false,
        orderedList: false,
        listItem: false,
        strike: false,
      }),
      HardBreak,
      MentionEntityNode,
      ChannelMentionNode,
      CustomEmojiNode,
    ] satisfies Extensions,
    content: buildComposerDoc(content, mentions, {}) as JSONContent,
    editable: false,
  });
}

describe('channel mention cursor mapping', () => {
  it('round-trips caret after a second #query following a channel mention', () => {
    const content = '#info #reports';
    const mentions: MentionEntity[] = [
      {
        id: 'm1',
        kind: 'channel',
        label: 'info',
        start: 0,
        end: 5,
        channelId: 'c1',
      },
    ];
    const ed = makeEditor(content, mentions);
    const doc = ed.state.doc;

    const endRaw = content.length;
    const endPos = rawOffsetToEditorPos(doc, endRaw);
    const serialized = serializeComposerDoc(doc, { from: endPos, to: endPos });

    expect(serialized.selectionStart).toBe(endRaw);
    expect(
      findChannelTrigger(
        serialized.content,
        serialized.selectionStart,
        serialized.mentions,
      ),
    ).toEqual({ start: 6, query: 'reports' });

    ed.destroy();
  });
});

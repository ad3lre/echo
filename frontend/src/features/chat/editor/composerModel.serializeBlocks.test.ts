import { describe, expect, it } from 'vitest';
import { Editor, type Extensions, type JSONContent } from '@tiptap/core';
import HardBreak from '@tiptap/extension-hard-break';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import {
  ComposerBold,
  ComposerCode,
  ComposerItalic,
  ComposerStrike,
} from '@/features/chat/editor/composerTextualMarks';
import {
  CustomEmojiNode,
  ChannelMentionNode,
  MentionEntityNode,
  ImageSlotNode,
  ButtonRowNode,
  serializeComposerDoc,
  rawOffsetToEditorPos,
} from '@/features/chat/editor/composerModel';
import { ComposerMarkdownDecorations } from '@/features/chat/editor/composerMarkdownDecorations';

function makeEditor(content: JSONContent): Editor {
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
      ComposerBold,
      ComposerItalic,
      ComposerStrike,
      ComposerCode,
      HardBreak,
      Placeholder.configure({ placeholder: '' }),
      MentionEntityNode,
      ChannelMentionNode,
      CustomEmojiNode,
      ImageSlotNode,
      ButtonRowNode,
      ComposerMarkdownDecorations,
    ] satisfies Extensions,
    content,
    editable: false,
  });
}

describe('serializeComposerDoc multi-paragraph', () => {
  it('serializes imageSlot blocks as canonical tokens', () => {
    const ed = makeEditor({
      type: 'doc',
      content: [
        {
          type: 'imageSlot',
          attrs: {
            slotId: 'slot-abc',
            aspectW: 16,
            aspectH: 9,
            imageUrl: null,
            storageKey: null,
            width: null,
            height: null,
          },
        },
      ],
    });
    const out = serializeComposerDoc(ed.state.doc);
    ed.destroy();
    expect(out.content).toBe('![image: ratio=16:9, slotId=slot-abc]');
  });

  it('serializes buttonRow blocks as canonical tokens', () => {
    const ed = makeEditor({
      type: 'doc',
      content: [
        {
          type: 'buttonRow',
          attrs: {
            rowId: 'row-abc',
            buttons: [
              {
                label: 'Go',
                style: 5,
                url: 'https://example.com',
              },
            ],
          },
        },
      ],
    });
    const out = serializeComposerDoc(ed.state.doc);
    ed.destroy();
    expect(out.content).toBe('![button: rowId=row-abc]');
  });

  it('inserts newlines between pasted paragraphs', () => {
    const ed = makeEditor({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '# a' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '## a' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '### a' }] },
      ],
    });
    const out = serializeComposerDoc(ed.state.doc);
    ed.destroy();
    expect(out.content).toBe('# a\n## a\n### a');
  });

  it('rawOffsetToEditorPos round-trips newline boundary', () => {
    const ed = makeEditor({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
      ],
    });
    const doc = ed.state.doc;
    const s = serializeComposerDoc(doc);
    ed.destroy();
    expect(s.content).toBe('a\nb');
    // Raw offset 0 is mapped to document start (pos 1); first text char is raw 0 at pos 2.
    expect(rawOffsetToEditorPos(doc, 0)).toBe(1);
    expect(rawOffsetToEditorPos(doc, 1)).toBe(3);
    expect(rawOffsetToEditorPos(doc, 2)).toBe(4);
  });
});

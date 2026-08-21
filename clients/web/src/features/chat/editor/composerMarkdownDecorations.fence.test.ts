// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { Editor, type Extensions, type JSONContent } from '@tiptap/core';
import HardBreak from '@tiptap/extension-hard-break';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { composerMarkdownDecoKey } from '@/features/chat/editor/composerMarkdownDecorations';
import {
  ComposerBold,
  ComposerCode,
  ComposerItalic,
  ComposerStrike,
} from '@/features/chat/editor/composerTextualMarks';
import {
  ChannelMentionNode,
  CustomEmojiNode,
  MentionEntityNode,
  ImageSlotNode,
  ButtonRowNode,
  buildComposerDoc,
  serializeComposerDoc,
} from '@/features/chat/editor/composerModel';
import { ComposerMarkdownDecorations } from '@/features/chat/editor/composerMarkdownDecorations';

function makeEditableEditor(content: JSONContent): Editor {
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
  });
}

function enableMarkdownDecorations(editor: Editor) {
  editor.view.dispatch(
    editor.state.tr.setMeta(composerMarkdownDecoKey, { enabled: true }),
  );
}

describe('composer markdown decorations with unclosed fence', () => {
  it('does not throw when fence spans hard breaks in one paragraph', () => {
    const ed = makeEditableEditor(
      buildComposerDoc('line1\nline2\nline3', [], undefined),
    );
    enableMarkdownDecorations(ed);
    expect(() => {
      ed.commands.insertContentAt(1, '```\n');
      enableMarkdownDecorations(ed);
      ed.commands.focus('end');
      ed.view.dispatch(ed.state.tr.insertText('x'));
    }).not.toThrow();
    const out = serializeComposerDoc(ed.state.doc);
    ed.destroy();
    expect(out.content.startsWith('```')).toBe(true);
  });

  it('does not throw when fence spans multiple paragraph blocks (paste)', () => {
    const ed = makeEditableEditor({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'para a' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'para b' }] },
      ],
    });
    enableMarkdownDecorations(ed);
    let threw = false;
    try {
      ed.commands.insertContentAt(1, '```\n');
      enableMarkdownDecorations(ed);
      for (let i = 0; i < 20; i++) {
        ed.view.dispatch(ed.state.tr.insertText('z'));
      }
    } catch {
      threw = true;
    }
    const out = serializeComposerDoc(ed.state.doc);
    ed.destroy();
    expect(threw).toBe(false);
    expect(out.content).toContain('```');
  });
});

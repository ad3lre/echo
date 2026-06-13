import { beforeEach, describe, expect, it } from 'vitest';
import { Editor, type Extensions } from '@tiptap/core';
import { Selection } from '@tiptap/pm/state';
import HardBreak from '@tiptap/extension-hard-break';
import StarterKit from '@tiptap/starter-kit';
import {
  AppIconNode,
  buildComposerDoc,
  ChannelMentionNode,
  CustomEmojiNode,
  MentionEntityNode,
  rawOffsetToEditorPos,
  serializeComposerDoc,
} from '@/features/chat/editor/composerModel';

function makeEditor(content = '', mentions: [] = []) {
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
        hardBreak: false,
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
      AppIconNode,
    ] satisfies Extensions,
    content: buildComposerDoc(content, mentions, {
      customEmojiImageUrl: () => 'https://cdn.test/emoji.png',
      appIconImageUrl: () => 'https://cdn.test/icon.svg',
    }),
    editable: true,
  });
}

let selectionRawOverride: { start: number; end: number } | null = null;

beforeEach(() => {
  selectionRawOverride = null;
});

function readComposerState(ed: Editor) {
  const serialized = serializeComposerDoc(ed.state.doc, ed.state.selection);
  if (selectionRawOverride) {
    return {
      ...serialized,
      selectionStart: selectionRawOverride.start,
      selectionEnd: selectionRawOverride.end,
    };
  }
  return serialized;
}

/** Mirrors useComposerState.replaceRange + setSerializedState for picker inserts. */
function insertTextLikeComposer(ed: Editor, text: string) {
  const live = readComposerState(ed);
  const start = live.selectionStart;
  const end = live.selectionEnd;
  const nextContent =
    live.content.slice(0, start) + text + live.content.slice(end);
  const nextSelectionStart = start + text.length;
  const doc = buildComposerDoc(nextContent, live.mentions, {
    customEmojiImageUrl: () => 'https://cdn.test/emoji.png',
    appIconImageUrl: () => 'https://cdn.test/icon.svg',
  });
  selectionRawOverride = null;
  ed.commands.setContent(doc, { emitUpdate: false });
  if (nextSelectionStart === nextContent.length) {
    ed.view.dispatch(ed.state.tr.setSelection(Selection.atEnd(ed.state.doc)));
  } else {
    const from = rawOffsetToEditorPos(ed.state.doc, nextSelectionStart);
    ed.commands.setTextSelection({ from, to: from });
  }
  const serialized = serializeComposerDoc(ed.state.doc, ed.state.selection);
  if (
    nextSelectionStart === nextContent.length &&
    serialized.selectionStart !== nextContent.length
  ) {
    selectionRawOverride = {
      start: nextContent.length,
      end: nextContent.length,
    };
    return {
      ...serialized,
      selectionStart: nextContent.length,
      selectionEnd: nextContent.length,
    };
  }
  return serialized;
}

describe('composer emoji picker inserts', () => {
  it('places caret after first surrogate emoji insert', () => {
    const ed = makeEditor();
    const out = insertTextLikeComposer(ed, '🩶');
    ed.destroy();
    expect(out.content).toBe('🩶');
    expect(out.selectionStart).toBe(2);
  });

  it('keeps sequential unicode + custom emoji + icon order', () => {
    const ed = makeEditor();
    const s1 = insertTextLikeComposer(ed, '🩶');
    const s2 = insertTextLikeComposer(ed, '<:Adel:123>');
    const s3 = insertTextLikeComposer(ed, '🩵');
    const s4 = insertTextLikeComposer(ed, '<:cheese:456>');
    const out = insertTextLikeComposer(ed, '<icon:FSC.svg>');
    ed.destroy();

    expect(s1.content).toBe('🩶');
    expect(s2.content).toBe('🩶<:Adel:123>');
    expect(s3.content).toBe('🩶<:Adel:123>🩵');
    expect(s4.content).toBe('🩶<:Adel:123>🩵<:cheese:456>');
    expect(out.content).toBe('🩶<:Adel:123>🩵<:cheese:456><icon:FSC.svg>');
    expect(out.selectionStart).toBe(out.content.length);
    expect(out.content).not.toContain('\n');
  });

  it('does not insert newlines when inserting only custom emoji', () => {
    const ed = makeEditor('hello ');
    ed.view.dispatch(ed.state.tr.setSelection(Selection.atEnd(ed.state.doc)));
    const live = readComposerState(ed);
    if (live.selectionStart !== live.content.length) {
      selectionRawOverride = {
        start: live.content.length,
        end: live.content.length,
      };
    }
    const out = insertTextLikeComposer(ed, '<:Adel:123>');
    ed.destroy();

    expect(out.content).toBe('hello <:Adel:123>');
    expect(out.content).not.toContain('\n');
  });
});

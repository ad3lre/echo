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
import { replaceRangeTransform } from '@/features/chat/domain/composer';

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

/** Mirrors useComposerState.setSerializedState + insertHardBreak. */
function insertHardBreakLikeComposer(ed: Editor) {
  const live = readComposerState(ed);
  const { nextContent, nextMentions, nextSelectionStart } =
    replaceRangeTransform(
      live.content,
      live.mentions,
      live.selectionStart,
      live.selectionEnd,
      '\n',
    );
  selectionRawOverride = null;
  const doc = buildComposerDoc(nextContent, nextMentions, {
    customEmojiImageUrl: () => 'https://cdn.test/emoji.png',
    appIconImageUrl: () => 'https://cdn.test/icon.svg',
  });
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
      content: nextContent,
      selectionStart: nextContent.length,
      selectionEnd: nextContent.length,
    };
  }
  return { ...serialized, content: nextContent };
}

describe('composer shift+enter hard break', () => {
  it('maps Selection.atEnd for plain ascii', () => {
    const ed = makeEditor('hello');
    ed.view.dispatch(ed.state.tr.setSelection(Selection.atEnd(ed.state.doc)));
    const sel = ed.state.selection;
    const ser = serializeComposerDoc(ed.state.doc, {
      from: sel.from,
      to: sel.to,
    });
    ed.destroy();
    expect(sel.from).toBe(6);
    expect(ser.selectionStart).toBe(5);
  });

  it('insertText newline at end does not steal the last letter', () => {
    const ed = makeEditor('hello');
    ed.view.dispatch(ed.state.tr.setSelection(Selection.atEnd(ed.state.doc)));
    const out = insertHardBreakLikeComposer(ed);
    ed.destroy();
    expect(out.content).toBe('hello\n');
    expect(out.selectionStart).toBe(6);
  });

  it('setHardBreak at pm end keeps last ascii letter', () => {
    const ed = makeEditor('hello');
    ed.view.dispatch(ed.state.tr.setSelection(Selection.atEnd(ed.state.doc)));
    const from = ed.state.selection.from;
    ed.commands.setHardBreak();
    const after = serializeComposerDoc(ed.state.doc, ed.state.selection);
    ed.destroy();
    expect(from).toBe(6);
    expect(after.content).toBe('hello\n');
  });

  it('setHardBreak after focus() keeps last ascii letter', () => {
    const ed = makeEditor('hello');
    ed.view.dispatch(ed.state.tr.setSelection(Selection.atEnd(ed.state.doc)));
    ed.chain().focus().setHardBreak().run();
    const after = serializeComposerDoc(ed.state.doc, ed.state.selection);
    ed.destroy();
    expect(after.content).toBe('hello\n');
  });
});

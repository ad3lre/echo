import { Extension, InputRule } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import {
  nextTypedDoubleQuote,
  nextTypedSingleQuote,
  PAPER_EM_DASH,
} from '@/features/paper/editor/paperSmartTypography';

function isInCodeContext(state: EditorState, pos: number): boolean {
  const $pos = state.doc.resolve(pos);
  if ($pos.parent.type.spec.code) return true;
  return $pos.marks().some((mark) => mark.type.name === 'code');
}

function textBeforeCursor(state: EditorState, pos: number, max = 120): string {
  const $pos = state.doc.resolve(pos);
  const blockStart = $pos.start();
  const from = Math.max(blockStart, pos - max);
  return state.doc.textBetween(from, pos, '\n', '\ufffc');
}

function replaceSmartText(
  state: EditorState,
  range: { from: number; to: number },
  insert: string,
): void {
  if (isInCodeContext(state, range.from)) return;
  state.tr.insertText(insert, range.from, range.to);
}

/** Paper typing shortcuts for smart punctuation (em dash, curly quotes). */
export const PaperSmartTypography = Extension.create({
  name: 'paperSmartTypography',

  addInputRules() {
    return [
      new InputRule({
        find: /(?<![-])-- $/,
        handler: ({ state, range }) => {
          replaceSmartText(state, range, `${PAPER_EM_DASH} `);
        },
      }),
      new InputRule({
        find: /(?<![-])--\n$/,
        handler: ({ state, range }) => {
          replaceSmartText(state, range, `${PAPER_EM_DASH}\n`);
        },
      }),
      new InputRule({
        find: /"$/,
        handler: ({ state, range }) => {
          const before = textBeforeCursor(state, range.from);
          replaceSmartText(state, range, nextTypedDoubleQuote(before));
        },
      }),
      new InputRule({
        find: /'$/,
        handler: ({ state, range }) => {
          const before = textBeforeCursor(state, range.from);
          replaceSmartText(state, range, nextTypedSingleQuote(before));
        },
      }),
    ];
  },
});

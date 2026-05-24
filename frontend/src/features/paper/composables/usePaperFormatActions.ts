import type { Ref } from 'vue';
import type { Editor } from '@tiptap/core';
import {
  PAPER_FONT_CATALOG,
  paperFontIdFromFamily,
} from '@/features/paper/editor/paperTypography';
import { ensurePaperFontLoaded } from '@/features/paper/editor/paperFontLoader';
import {
  runPaperFormatCommand,
  snapshotPaperEditorSelection,
} from '@/features/paper/editor/paperFormatSelection';
import { usePaperSelectionFormat } from '@/features/paper/composables/usePaperSelectionFormat';

export function usePaperFormatActions(editor: Ref<Editor | null | undefined>) {
  const { format: fmt, colors: fmtColors } = usePaperSelectionFormat(editor);

  const selectionFontId = () => paperFontIdFromFamily(fmt.value.fontFamily);

  const hasTextSelection = () => {
    const ed = editor.value;
    if (!ed) return false;
    const { from, to } = ed.state.selection;
    return from < to;
  };

  function setHeading(level: 0 | 1 | 2 | 3) {
    const ed = editor.value;
    if (!ed) return;
    if (level === 0) {
      runPaperFormatCommand(ed, (chain) => chain.setParagraph());
      return;
    }
    runPaperFormatCommand(ed, (chain) =>
      chain.toggleHeading({ level: level as 1 | 2 | 3 }),
    );
  }

  async function setSelectionFont(fontId: string) {
    const font = PAPER_FONT_CATALOG.find((f) => f.id === fontId);
    const ed = editor.value;
    if (!font || !ed) return;
    snapshotPaperEditorSelection(ed);
    await ensurePaperFontLoaded(font.id);
    runPaperFormatCommand(ed, (chain) =>
      chain.extendMarkRange('textStyle').setFontFamily(font.family),
    );
  }

  function clearSelectionFont() {
    const ed = editor.value;
    if (!ed) return;
    runPaperFormatCommand(ed, (chain) =>
      chain.extendMarkRange('textStyle').unsetFontFamily(),
    );
  }

  function setFontSizePx(px: number | null) {
    const ed = editor.value;
    if (!ed) return;
    if (px == null) {
      runPaperFormatCommand(ed, (chain) =>
        chain.extendMarkRange('textStyle').unsetFontSize(),
      );
      return;
    }
    runPaperFormatCommand(ed, (chain) =>
      chain.extendMarkRange('textStyle').setFontSize(`${px}px`),
    );
  }

  function setTextColor(color: string) {
    const ed = editor.value;
    if (!ed) return;
    if (!color) {
      runPaperFormatCommand(ed, (chain) =>
        chain.extendMarkRange('textStyle').unsetColor(),
      );
    } else {
      runPaperFormatCommand(ed, (chain) =>
        chain.extendMarkRange('textStyle').setColor(color),
      );
    }
  }

  function setHighlight(color: string | null) {
    const ed = editor.value;
    if (!ed) return;
    if (!color) {
      runPaperFormatCommand(ed, (chain) =>
        chain.extendMarkRange('highlight').unsetHighlight(),
      );
    } else {
      runPaperFormatCommand(ed, (chain) =>
        chain.extendMarkRange('highlight').setHighlight({ color }),
      );
    }
  }

  function setAlign(align: 'left' | 'center' | 'right' | 'justify') {
    runPaperFormatCommand(editor.value, (chain) => chain.setTextAlign(align));
  }

  function toggleMark(cmd: 'toggleBold' | 'toggleItalic' | 'toggleStrike') {
    runPaperFormatCommand(editor.value, (chain) => chain[cmd]());
  }

  function toggleList(cmd: 'toggleBulletList' | 'toggleOrderedList') {
    runPaperFormatCommand(editor.value, (chain) => chain[cmd]());
  }

  function insertHorizontalRule() {
    runPaperFormatCommand(editor.value, (chain) => chain.setHorizontalRule());
  }

  function setLink(href: string) {
    const ed = editor.value;
    if (!ed) return;
    if (!href) {
      runPaperFormatCommand(ed, (chain) =>
        chain.extendMarkRange('link').unsetLink(),
      );
      return;
    }
    runPaperFormatCommand(ed, (chain) =>
      chain.extendMarkRange('link').setLink({ href }),
    );
  }

  return {
    fmt,
    fmtColors,
    selectionFontId,
    hasTextSelection,
    setHeading,
    setSelectionFont,
    clearSelectionFont,
    setFontSizePx,
    setTextColor,
    setHighlight,
    setAlign,
    toggleMark,
    toggleList,
    insertHorizontalRule,
    setLink,
  };
}

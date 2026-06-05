import type { Editor } from '@tiptap/core';
import { analyzePaperSelectionFormat } from '@/features/paper/editor/paperSelectionFormat';
import { analyzePaperSelectionColors } from '@/features/paper/editor/paperSelectionColors';
import { runPaperFormatCommand } from '@/features/paper/editor/paperFormatSelection';
import {
  cycleFontInCatalog,
  cycleHighlightColor,
  stepFontSizePx,
} from '@/features/paper/editor/paperKeyboardHelpers';
import { PAPER_FONT_SIZE_PRESETS } from '@/features/paper/editor/paperTypography';
import { ensurePaperFontLoaded } from '@/features/paper/editor/paperFontLoader';

export {
  cycleFontInCatalog,
  cycleHighlightColor,
  stepFontSizePx,
} from '@/features/paper/editor/paperKeyboardHelpers';

function resolveFontSizePx(editor: Editor): number {
  const fmt = analyzePaperSelectionFormat(editor);
  if (fmt.fontSizePx != null) return fmt.fontSizePx;
  return PAPER_FONT_SIZE_PRESETS.find((p) => p >= 15) ?? 15;
}

function resolveFontFamily(editor: Editor): string {
  const fmt = analyzePaperSelectionFormat(editor);
  return fmt.fontFamily;
}

export function paperStepFontSize(
  editor: Editor,
  direction: 'up' | 'down',
): boolean {
  if (!editor.isEditable) return false;
  const px = stepFontSizePx(resolveFontSizePx(editor), direction);
  return runPaperFormatCommand(editor, (chain) => chain.setFontSize(`${px}px`));
}

export function paperCycleFontFamily(
  editor: Editor,
  direction: 'prev' | 'next',
): boolean {
  if (!editor.isEditable) return false;
  const font = cycleFontInCatalog(resolveFontFamily(editor), direction);
  void ensurePaperFontLoaded(font.id);
  return runPaperFormatCommand(editor, (chain) =>
    chain.setFontFamily(font.family),
  );
}

export function paperSetHeadingLevel(
  editor: Editor,
  level: 0 | 1 | 2 | 3,
): boolean {
  if (!editor.isEditable) return false;
  if (level === 0) {
    return runPaperFormatCommand(editor, (chain) => chain.setParagraph());
  }
  return runPaperFormatCommand(editor, (chain) => chain.setHeading({ level }));
}

export function paperSetTextAlign(
  editor: Editor,
  align: 'left' | 'center' | 'right' | 'justify',
): boolean {
  if (!editor.isEditable) return false;
  return runPaperFormatCommand(editor, (chain) => chain.setTextAlign(align));
}

export function paperToggleBulletList(editor: Editor): boolean {
  if (!editor.isEditable) return false;
  return runPaperFormatCommand(editor, (chain) => chain.toggleBulletList());
}

export function paperToggleMark(
  editor: Editor,
  cmd: 'toggleBold' | 'toggleItalic' | 'toggleStrike' | 'toggleCode',
): boolean {
  if (!editor.isEditable) return false;
  return runPaperFormatCommand(editor, (chain) => chain[cmd]());
}

export function paperCycleHighlight(editor: Editor): boolean {
  if (!editor.isEditable) return false;
  const colors = analyzePaperSelectionColors(editor);
  const next = cycleHighlightColor(colors.highlightColor);
  if (!next) {
    return runPaperFormatCommand(editor, (chain) => chain.unsetHighlight());
  }
  return runPaperFormatCommand(editor, (chain) =>
    chain.setHighlight({ color: next }),
  );
}

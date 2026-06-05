import type { ChainedCommands, Editor } from '@tiptap/core';

export type PaperEditorTextRange = { from: number; to: number };

let storedRange: PaperEditorTextRange | null = null;
/** Caret position snapshotted before file pickers (selection is lost when the dialog opens). */
let storedCaretPos: number | null = null;

const FORMAT_CHROME_SELECTOR =
  '.paper-floating-format-bar, .paper-font-picker-panel, .paper-color-picker-shell, #paper-format-more-menu-panel, .paper-format-preset-menu, #paper-canvas-color-picker-pageLight, #paper-canvas-color-picker-pageDark, #paper-canvas-color-picker-text, #paper-canvas-color-picker-highlight, #paper-canvas-color-picker-object, .paper-editor-panel';

/** Remember the current non-empty editor selection for toolbar commands. */
export function snapshotPaperEditorSelection(
  editor: Editor | null | undefined,
): void {
  if (!editor) return;
  const { from, to } = editor.state.selection;
  if (from < to) storedRange = { from, to };
}

export function clearStoredPaperEditorSelection(): void {
  storedRange = null;
}

/** Remember the editor caret for the next block insert (image upload file picker). */
export function snapshotPaperEditorCaret(
  editor: Editor | null | undefined,
): void {
  if (!editor) return;
  const { to } = editor.state.selection;
  const max = editor.state.doc.content.size;
  storedCaretPos = Math.min(Math.max(0, to), max);
}

export function snapshotPaperEditorCaretAt(pos: number): void {
  storedCaretPos = Math.max(0, pos);
}

export function consumeStoredPaperEditorCaret(): number | null {
  const pos = storedCaretPos;
  storedCaretPos = null;
  return pos;
}

export function getStoredPaperEditorSelection(): PaperEditorTextRange | null {
  return storedRange;
}

export function restorePaperEditorSelection(
  range: PaperEditorTextRange | null,
): void {
  storedRange = range;
}

/** Keep the last stored range while awaiting async toolbar work (e.g. font loading). */
export async function preservePaperEditorSelectionDuring<T>(
  editor: Editor | null | undefined,
  work: () => Promise<T>,
): Promise<T | undefined> {
  if (!editor) return undefined;
  snapshotPaperEditorSelection(editor);
  const saved = getStoredPaperEditorSelection();
  const { from, to } = editor.state.selection;
  const savedCaret = from === to ? from : null;
  try {
    return await work();
  } finally {
    if (saved) {
      restorePaperEditorSelection(saved);
    } else if (savedCaret != null) {
      editor.commands.setTextSelection(savedCaret);
    }
  }
}

function activeInFormatChrome(): boolean {
  return !!document.activeElement?.closest(FORMAT_CHROME_SELECTOR);
}

/**
 * Keep stored range in sync with editor selection.
 * Collapsed selections inside the format chrome keep the last stored range.
 */
export function syncStoredPaperEditorSelection(editor: Editor): void {
  const { from, to } = editor.state.selection;
  if (from < to) {
    storedRange = { from, to };
    return;
  }
  if (!activeInFormatChrome()) {
    storedRange = null;
  }
}

/**
 * Run a TipTap chain after restoring a stored range (if any).
 * Returns whether the command ran successfully.
 */
export function runPaperFormatCommand(
  editor: Editor | null | undefined,
  build: (chain: ChainedCommands) => ChainedCommands,
): boolean {
  if (!editor) return false;

  const range =
    storedRange ??
    (editor.state.selection.from < editor.state.selection.to
      ? {
          from: editor.state.selection.from,
          to: editor.state.selection.to,
        }
      : null);

  const { from, to } = editor.state.selection;
  const caretOnly = !range && from === to;

  let chain = editor.chain().focus();
  if (range) {
    chain = chain.setTextSelection(range);
  }
  const ok = build(chain).run();
  if (ok && range) {
    storedRange = range;
  } else if (ok && caretOnly) {
    editor.commands.setTextSelection(from);
  }
  return ok;
}

/** Prevent toolbar mousedown from blurring the editor; snapshot selection first. */
export function onPaperFormatBarMouseDown(
  editor: Editor | null | undefined,
  ev: MouseEvent,
): void {
  snapshotPaperEditorSelection(editor);
  const target = ev.target as HTMLElement | null;
  if (target?.closest('input, select, textarea')) return;
  ev.preventDefault();
}

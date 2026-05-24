import type { ChainedCommands, Editor } from '@tiptap/core';

export type PaperEditorTextRange = { from: number; to: number };

let storedRange: PaperEditorTextRange | null = null;

const FORMAT_CHROME_SELECTOR =
  '.paper-floating-format-bar, .paper-font-picker-panel, .paper-color-picker-shell, #paper-format-more-menu-panel, .paper-editor-panel';

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

export function getStoredPaperEditorSelection(): PaperEditorTextRange | null {
  return storedRange;
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

  let chain = editor.chain().focus();
  if (range) {
    chain = chain.setTextSelection(range);
  }
  const ok = build(chain).run();
  if (ok && range) {
    storedRange = range;
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

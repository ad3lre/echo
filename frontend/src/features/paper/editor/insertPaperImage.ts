import type { Editor } from '@tiptap/core';
import { consumeStoredPaperEditorCaret } from '@/features/paper/editor/paperFormatSelection';
import type {
  PaperImageAlign,
  PaperImageWrap,
} from '@/features/paper/editor/paperImageExtension';

export type InsertPaperImageOpts = {
  /** Restore a caret snapshotted before a file picker opened (not for paste). */
  restoreCaret?: boolean;
};

/** Insert a block image at the current selection (works inside paragraphs). */
export function insertPaperImage(
  editor: Editor,
  src: string,
  opts: InsertPaperImageOpts = {},
): boolean {
  const attrs = {
    src,
    align: 'center' as PaperImageAlign,
    wrap: 'none' as PaperImageWrap,
  };

  const caret = opts.restoreCaret ? consumeStoredPaperEditorCaret() : null;
  let chain = editor.chain().focus();
  if (caret != null) {
    const max = editor.state.doc.content.size;
    chain = chain.setTextSelection(Math.min(Math.max(0, caret), max));
  }

  const inserted = chain.setImage({ src }).run();
  if (!inserted) return false;
  editor
    .chain()
    .updateAttributes('image', {
      align: attrs.align,
      wrap: attrs.wrap,
    })
    .run();
  return true;
}

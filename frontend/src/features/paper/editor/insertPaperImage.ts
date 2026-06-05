import type { Editor } from '@tiptap/core';

/** Insert a block image at the current selection (works inside paragraphs). */
export function insertPaperImage(editor: Editor, src: string): void {
  editor.chain().focus().setImage({ src }).run();
  editor
    .chain()
    .updateAttributes('image', { align: 'center', wrap: 'none' })
    .run();
}

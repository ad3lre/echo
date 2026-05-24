import type { Editor } from '@tiptap/core';

/** Insert a block image at the current selection (works inside paragraphs). */
export function insertPaperImage(editor: Editor, src: string): void {
  const inserted = editor
    .chain()
    .focus()
    .insertContent({ type: 'image', attrs: { src } })
    .run();
  if (inserted) return;

  editor.chain().focus().setImage({ src }).run();
}

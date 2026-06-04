import type { Editor } from '@tiptap/core';
import { paperMarkdownToHtml } from '@/features/paper/editor/paperMarkdownToHtml';

export function applyPaperMarkdownToEditor(
  editor: Editor,
  markdown: string,
  opts?: { emitUpdate?: boolean },
): void {
  const html = paperMarkdownToHtml(markdown);
  editor.commands.setContent(html, {
    emitUpdate: opts?.emitUpdate ?? true,
  });
}

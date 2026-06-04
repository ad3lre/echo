import type { Editor } from '@tiptap/core';
import {
  getPaperMarkdownRenderInline,
  setPaperMarkdownRenderInlineValue,
} from '@/features/paper/editor/paperMarkdownRenderState';

/** Toggle live markdown styling and KaTeX widgets in the Paper editor. */
export function setPaperMarkdownRenderInline(
  editor: Editor,
  renderInline: boolean,
): void {
  if (getPaperMarkdownRenderInline() === renderInline) return;
  setPaperMarkdownRenderInlineValue(renderInline);
  editor.view.dispatch(editor.view.state.tr);
}

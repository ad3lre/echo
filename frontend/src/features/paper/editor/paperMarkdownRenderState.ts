/** Shared flag read by the Paper markdown/math decoration plugin (see paperMarkdownMathDecorations). */
let renderInline = true;

export function getPaperMarkdownRenderInline(): boolean {
  return renderInline;
}

export function setPaperMarkdownRenderInlineValue(next: boolean): void {
  renderInline = next;
}

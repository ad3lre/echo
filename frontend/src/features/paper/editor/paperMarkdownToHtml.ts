import { Marked } from 'marked';
import markedFootnote from 'marked-footnote';

const marked = new Marked()
  .setOptions({ gfm: true, breaks: true })
  .use(
    markedFootnote({ refMarkers: true }) as import('marked').MarkedExtension<
      string,
      string
    >,
  );

/** Parse Paper markdown source into HTML for TipTap `setContent`. */
export function paperMarkdownToHtml(markdown: string): string {
  const trimmed = markdown.trim();
  if (!trimmed) return '<p></p>';
  const html = marked.parse(trimmed, { async: false }) as string;
  return html.trim() || '<p></p>';
}

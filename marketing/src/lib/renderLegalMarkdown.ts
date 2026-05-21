import { Marked } from 'marked';

const marked = new Marked().setOptions({ gfm: true, breaks: false });

/**
 * Drop in-document title and date lines; the Astro page supplies its own header.
 */
export function stripLegalPagePreamble(markdown: string): string {
  return markdown.replace(
    /^##[^\n]+\n+\*\*Last updated:\*\*[^\n]*\n+\*\*Effective date:\*\*[^\n]*\n+/,
    '',
  );
}

/**
 * Parse repo legal markdown to HTML for static marketing pages.
 * Source files live in /terms and are trusted build-time content.
 */
export function renderLegalMarkdown(markdown: string): string {
  const body = stripLegalPagePreamble(markdown.trim());
  return marked.parse(body, { async: false }) as string;
}

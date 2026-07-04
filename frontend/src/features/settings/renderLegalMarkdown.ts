import { Marked } from 'marked';
import { domPurifyHtmlFragment } from '@/utils/domPurifyHtmlFragment';

const marked = new Marked().setOptions({ gfm: true, breaks: false });

const SANITIZE = {
  ALLOWED_TAGS: [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'br',
    'hr',
    'ul',
    'ol',
    'li',
    'strong',
    'em',
    'a',
    'blockquote',
    'code',
    'pre',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
  ],
  ALLOWED_ATTR: ['href', 'rel', 'target', 'start'],
  ALLOW_DATA_ATTR: false,
};

/**
 * Parse repo legal markdown and return sanitized HTML for v-html in settings.
 */
export function renderLegalMarkdown(markdown: string): string {
  const raw = marked.parse(markdown.trim(), { async: false }) as string;
  return domPurifyHtmlFragment(raw, SANITIZE, 'echo-legal-md-root');
}

import katex from 'katex';
import DOMPurify from 'dompurify';
import { normalizeKatexInput } from '@/composables/normalizeKatexInput';

const PAPER_KATEX_SANITIZE_OPTS = {
  ALLOWED_TAGS: [
    'span',
    'div',
    'svg',
    'path',
    'line',
    'math',
    'semantics',
    'annotation',
    'mrow',
    'mi',
    'mn',
    'mo',
    'mtext',
    'ms',
    'mspace',
    'mfrac',
    'msqrt',
    'mroot',
    'msub',
    'msup',
    'msubsup',
    'munder',
    'mover',
    'munderover',
    'mtable',
    'mtr',
    'mtd',
    'mstyle',
    'mpadded',
    'mphantom',
    'menclose',
    'mglyph',
  ],
  ALLOWED_ATTR: [
    'class',
    'style',
    'aria-hidden',
    'xmlns',
    'display',
    'encoding',
    'viewBox',
    'preserveAspectRatio',
    'd',
    'x1',
    'y1',
    'x2',
    'y2',
    'stroke',
    'stroke-width',
    'stroke-linecap',
    'fill',
    'focusable',
    'width',
    'height',
  ],
  ALLOW_UNKNOWN_PROTOCOLS: false,
};

const MAX_ENTRIES = 512;
const cache = new Map<string, string>();

export function renderPaperKatexHtml(
  latex: string,
  displayMode: boolean,
): string {
  const key = `${displayMode ? 'd' : 'i'}:${latex}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let html: string;
  try {
    html = katex.renderToString(normalizeKatexInput(latex), {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
    });
  } catch {
    html = latex.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  html = DOMPurify.sanitize(html, PAPER_KATEX_SANITIZE_OPTS);

  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(key, html);
  return html;
}

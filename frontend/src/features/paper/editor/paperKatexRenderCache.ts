import katex from 'katex';
import { normalizeKatexInput } from '@/composables/normalizeKatexInput';

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

  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(key, html);
  return html;
}

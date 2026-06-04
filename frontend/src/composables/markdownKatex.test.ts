/* @vitest-environment happy-dom */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ensureMarkdownKatexReady,
  renderMarkdownKatexSafeHtml,
} from './markdownKatex';

describe('markdownKatex', () => {
  beforeAll(async () => {
    await ensureMarkdownKatexReady();
  });

  it('renders subscript and superscript through the shared KaTeX path', () => {
    const html = renderMarkdownKatexSafeHtml('x_i^2 + y^{n+1}', false);
    expect(html).toContain('class="katex"');
    expect(html).toContain('class="msupsub"');
    expect(html).not.toContain('katex-error');
  });

  it('keeps KaTeX layout styles needed for fractions and tall glyphs', () => {
    const html = renderMarkdownKatexSafeHtml(String.raw`\frac{1}{2}`, false);
    expect(html).toContain('style=');
  });
});

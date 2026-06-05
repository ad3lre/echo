import { describe, expect, it } from 'vitest';
import { paperMarkdownToHtml } from '@/features/paper/editor/paperMarkdownToHtml';

describe('paperMarkdownToHtml', () => {
  it('parses headings and emphasis', () => {
    const html = paperMarkdownToHtml('## Title\n\n**bold** and $x$');
    expect(html).toContain('<h2');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('$x$');
  });

  it('returns empty paragraph for blank input', () => {
    expect(paperMarkdownToHtml('')).toBe('<p></p>');
  });

  it('converts double hyphens to an em dash in prose', () => {
    const html = paperMarkdownToHtml('Hello -- world');
    expect(html).toContain('—');
    expect(html).not.toContain('--');
  });

  it('curlies straight quotes in prose', () => {
    const html = paperMarkdownToHtml('He said "hello" there.');
    expect(html).toContain('“hello”');
    expect(html).not.toContain('"hello"');
  });
});

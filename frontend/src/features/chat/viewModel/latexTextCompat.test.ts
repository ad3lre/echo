/* @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { parseMessageContent } from '@/composables/useMarkdown';
import { preprocessLatexTextCompat } from './latexTextCompat';

describe('preprocessLatexTextCompat url/href', () => {
  it('turns \\url{https://...} into an anchor', () => {
    const out = preprocessLatexTextCompat(
      'See \\url{https://example.com/path}.',
    );
    expect(out).toBe(
      'See <a href="https://example.com/path">https://example.com/path</a>.',
    );
  });

  it('renders \\url through the message pipeline', () => {
    const out = parseMessageContent('See \\url{https://example.com/path}.');
    expect(out).toContain('href="https://example.com/path"');
    expect(out).toContain('example.com');
  });

  it('turns \\href{url}{text} into an anchor with custom label', () => {
    const out = preprocessLatexTextCompat(
      'Read \\href{https://example.com/docs}{the docs}.',
    );
    expect(out).toBe('Read <a href="https://example.com/docs">the docs</a>.');
  });

  it('renders \\href through the message pipeline', () => {
    const out = parseMessageContent(
      'Read \\href{https://example.com/docs}{the docs}.',
    );
    expect(out).toContain('href="https://example.com/docs"');
    expect(out).toContain('the docs');
    expect(out).not.toContain('\\href');
  });
});

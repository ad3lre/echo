import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('dompurify', () => ({
  default: {
    sanitize: (html: string) =>
      html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/\sonerror\s*=\s*[^>\s]*/gi, ''),
  },
}));

vi.mock('mammoth', () => ({
  default: {
    convertToHtml: vi.fn(),
  },
}));

vi.mock('@/features/pdf/withTimeout', () => ({
  withTimeout: <T>(promise: Promise<T>) => promise,
}));

import mammoth from 'mammoth';
import { loadDocxHtmlFromUrl } from '@/features/docx/loadDocxFromUrl';

describe('loadDocxHtmlFromUrl', () => {
  beforeEach(() => {
    vi.mocked(mammoth.convertToHtml).mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      }),
    );
  });

  it('sanitizes script tags from converted HTML', async () => {
    vi.mocked(mammoth.convertToHtml).mockResolvedValue({
      value:
        '<p>Hello</p><script>alert(1)</script><img src=x onerror=alert(1)>',
      messages: [],
    });

    const html = await loadDocxHtmlFromUrl('https://example.com/doc.docx');

    expect(html).toContain('Hello');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror=');
  });

  it('rejects empty documents', async () => {
    vi.mocked(mammoth.convertToHtml).mockResolvedValue({
      value: '   ',
      messages: [],
    });

    await expect(
      loadDocxHtmlFromUrl('https://example.com/empty.docx'),
    ).rejects.toThrow(/empty/i);
  });
});

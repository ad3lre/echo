/* @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { parseMessageContent } from '@/composables/useMarkdown';
import { validateRegistrationUsername } from '@shared/usernamePolicy';

const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)></svg>',
  '<style>* { color: white !important; background: white !important }</style>',
  '[clickme](javascript:alert(1))',
  '<input type="checkbox" onclick="alert(1)" checked>',
  '||<img src=x onerror=1>||',
];

function assertNoExecutableHtml(html: string): void {
  const lower = html.toLowerCase();
  expect(lower).not.toMatch(/<script\b/);
  expect(lower).not.toMatch(/\bonerror\s*=/);
  expect(lower).not.toMatch(/\bonclick\s*=/);
  expect(lower).not.toMatch(/\bonload\s*=/);
  expect(lower).not.toMatch(/<style\b/);
  expect(lower).not.toMatch(/javascript:/);
}

describe('messageBodyMarkdown XSS corpus', () => {
  for (const payload of XSS_PAYLOADS) {
    it(`sanitizes payload: ${payload.slice(0, 48)}`, () => {
      const out = parseMessageContent(payload);
      assertNoExecutableHtml(out);
    });
  }

  it('rejects script tags in username policy', () => {
    expect(validateRegistrationUsername('<script></script>').ok).toBe(false);
  });

  it('strips arbitrary inline style from user HTML', () => {
    const payload =
      '<a href="https://example.com" style="position:fixed;inset:0;z-index:2147483647">overlay</a>';
    const out = parseMessageContent(payload);
    expect(out.toLowerCase()).not.toMatch(/\bstyle\s*=/);
    expect(out).toContain('href="https://example.com"');
  });
});

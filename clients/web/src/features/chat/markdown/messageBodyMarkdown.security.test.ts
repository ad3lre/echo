/* @vitest-environment happy-dom */
import { describe, expect, it, vi } from 'vitest';

vi.mock('twemoji', async (importOriginal) => {
  const mod = await importOriginal<typeof import('twemoji')>();
  return {
    default: {
      ...mod.default,
      parse: () =>
        '<img class="emoji" src="x" alt="😀" onerror="alert(1)" loading="lazy" />',
    },
  };
});

import { parseMessageContent } from '@/features/chat/markdown/useMarkdown';

describe('messageBodyMarkdown XSS hardening', () => {
  it('re-sanitizes after Twemoji conversion', () => {
    const out = parseMessageContent('hello 😀');
    expect(out).toMatch(/<img\b/i);
    expect(out).not.toMatch(/onerror\s*=/i);
  });
});

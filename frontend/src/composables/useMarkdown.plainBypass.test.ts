/* @vitest-environment happy-dom */
import type { MentionEntity } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { parseMessageContent } from './useMarkdown';

describe('useMarkdown marked bypass (plain chat hot path)', () => {
  it('renders simple text like marked + breaks', () => {
    expect(parseMessageContent('Hello')).toContain('Hello');
    expect(parseMessageContent('line one\nline two')).toMatch(
      /line one.*line two/s,
    );
    expect(parseMessageContent('line one\nline two')).toContain('<br');
  });

  it('still autolinks when a URL is present (no bypass)', () => {
    const out = parseMessageContent('see https://example.com/path');
    expect(out).toMatch(/<a\b[^>]*href=/i);
    expect(out).toContain('example.com');
    expect(out).toContain('message-md-external-link');
    expect(out).toMatch(/s2\/favicons/i);
    expect(out).toContain('example.com/path');
    expect(out).not.toMatch(/https:\/\/example\.com\/path</);
  });

  it('does not restyle markdown links with custom anchor text', () => {
    const out = parseMessageContent('[click here](https://example.com/z)');
    expect(out).toContain('click here');
    expect(out).not.toContain('message-md-external-link');
  });

  it('still styles @Everyone when present (no bypass)', () => {
    const out = parseMessageContent('hey @Everyone');
    expect(out).toContain('mention');
    expect(out).toContain('Everyone');
  });

  it('does not bypass when raw angle brackets appear', () => {
    const out = parseMessageContent('compare a < b ok');
    expect(out).toContain('&lt;');
  });

  it('renders user mention entities with profile-open hooks when userId is set', () => {
    const mentions: MentionEntity[] = [
      {
        id: 'me1',
        kind: 'user',
        label: 'Alice',
        start: 0,
        end: 6,
        userId: 'user-profile-id-1',
      },
    ];
    const out = parseMessageContent('@Alice', mentions);
    expect(out).toContain('data-mention-user');
    expect(out).toContain('data-user-id');
    expect(out).toContain('user-profile-id-1');
  });
});

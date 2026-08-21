import { describe, expect, it } from 'vitest';
import { channelMentionRefLabel } from './channelMentionLabel';

describe('channelMentionRefLabel', () => {
  it('replaces runs of spaces with single dashes', () => {
    expect(channelMentionRefLabel('My Channel')).toBe('My-Channel');
    expect(channelMentionRefLabel('a  b')).toBe('a-b');
  });

  it('trims outer whitespace', () => {
    expect(channelMentionRefLabel('  gen  ')).toBe('gen');
  });
});

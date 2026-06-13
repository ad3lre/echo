import { describe, expect, it } from 'vitest';
import { extractChatImageSearchSeeds } from '@/utils/imageSearchSeedKeywords';

describe('extractChatImageSearchSeeds', () => {
  it('strips markdown formatting from chat content', () => {
    const seeds = extractChatImageSearchSeeds([
      { content: '**bold** _italic_ `code` #heading' },
    ]);
    expect(seeds).toContain('bold');
    expect(seeds).toContain('italic');
    expect(seeds).toContain('code');
    expect(seeds).toContain('heading');
    expect(seeds.some((s) => s.includes('*'))).toBe(false);
  });
});

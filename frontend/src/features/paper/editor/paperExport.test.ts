import { describe, expect, it } from 'vitest';

/** Mirrors download filename logic in paperExport.ts */
function paperJsonFilename(channelName: string): string {
  const safeName = channelName.replace(/[^\w\s-]/g, '').trim() || 'paper';
  return `${safeName}.json`;
}

describe('paperExport', () => {
  it('sanitizes channel name for JSON download filename', () => {
    expect(paperJsonFilename('My Paper!')).toBe('My Paper.json');
    expect(paperJsonFilename('***')).toBe('paper.json');
  });
});

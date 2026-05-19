import { describe, it, expect } from 'vitest';
import { contentTypesForShellPayload, buildSendIntent } from '../sendIntent';

describe('sendIntent domain', () => {
  it('computes content types for text', () => {
    const p = { content: 'hi' };
    expect(contentTypesForShellPayload(p as any)).toEqual(['text']);
  });

  it('includes poll and media correctly', () => {
    const p = { content: '', poll: { question: 'q', options: ['a'] } as any };
    expect(contentTypesForShellPayload(p as any)).toContain('poll');
    const m = { content: '', imageUrl: 'data:,x' };
    expect(contentTypesForShellPayload(m as any)).toContain('media');
  });

  it('builds intent with inferred content types', () => {
    const intent = buildSendIntent('c1', { content: 'x' } as any);
    expect(intent.channelId).toBe('c1');
    expect(intent.contentTypes).toEqual(['text']);
  });
});

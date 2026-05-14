import type { Embed } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { applyEmbedTitlesToMessageContent } from './embedLinkLabels';

describe('applyEmbedTitlesToMessageContent', () => {
  it('returns content unchanged when empty or no embeds', () => {
    expect(
      applyEmbedTitlesToMessageContent('', [{ url: 'x', title: 't' } as Embed]),
    ).toBe('');
    expect(applyEmbedTitlesToMessageContent('hi', undefined)).toBe('hi');
  });

  it('replaces raw URL with markdown link using title', () => {
    const url = 'https://ex.test/page';
    const embeds: Embed[] = [{ url, title: 'Nice [Title]' }];
    expect(applyEmbedTitlesToMessageContent(`see ${url} here`, embeds)).toBe(
      `see [Nice Title](${url}) here`,
    );
  });

  it('skips echoJump embeds', () => {
    const url = 'https://ex.test/j';
    const embeds: Embed[] = [
      { url, title: 'T', echoJump: { channelId: 'c', messageId: 'm' } },
    ];
    expect(applyEmbedTitlesToMessageContent(url, embeds)).toBe(url);
  });

  it('replaces multiple disjoint URLs with titles', () => {
    const embeds: Embed[] = [
      { url: 'https://a.test/one', title: 'Alpha' },
      { url: 'https://b.test/two', title: 'Beta' },
    ];
    const out = applyEmbedTitlesToMessageContent(
      'https://a.test/one and https://b.test/two',
      embeds,
    );
    expect(out).toContain('[Alpha](https://a.test/one)');
    expect(out).toContain('[Beta](https://b.test/two)');
  });
});

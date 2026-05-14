import type { Embed } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { splitContentByEchoJumpEmbeds } from './messageJumpContentParse';

function jumpEmbed(url: string): Embed {
  return {
    url,
    echoJump: { channelId: 'ch1', messageId: 'm1' },
  } as Embed;
}

describe('splitContentByEchoJumpEmbeds', () => {
  it('returns single empty text segment for empty content', () => {
    expect(splitContentByEchoJumpEmbeds('', undefined)).toEqual([
      { type: 'text', text: '' },
    ]);
  });

  it('returns whole content as text when no jump embeds', () => {
    expect(splitContentByEchoJumpEmbeds('hello', undefined)).toEqual([
      { type: 'text', text: 'hello' },
    ]);
  });

  it('returns whole content when embeds lack echoJump', () => {
    const embeds = [{ url: 'https://x.test/j', title: 't' }] as Embed[];
    expect(
      splitContentByEchoJumpEmbeds('see https://x.test/j', embeds),
    ).toEqual([{ type: 'text', text: 'see https://x.test/j' }]);
  });

  it('splits on verbatim jump URL', () => {
    const url = 'https://echo.test/jump/1';
    const embeds = [jumpEmbed(url)];
    const parts = splitContentByEchoJumpEmbeds(`before ${url} after`, embeds);
    expect(parts).toEqual([
      { type: 'text', text: 'before ' },
      { type: 'jump', url, embed: embeds[0] },
      { type: 'text', text: ' after' },
    ]);
  });

  it('drops overlapping jump ranges (keeps earlier non-overlap)', () => {
    const url = 'https://same';
    const e1 = jumpEmbed(url);
    const e2 = { ...jumpEmbed(url), title: 'second' } as Embed;
    const content = url;
    const parts = splitContentByEchoJumpEmbeds(content, [e1, e2]);
    expect(parts.filter((p) => p.type === 'jump')).toHaveLength(1);
  });
});

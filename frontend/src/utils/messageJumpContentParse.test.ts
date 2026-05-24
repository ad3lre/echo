import type { Embed } from '@shared/types';
import { describe, expect, it } from 'vitest';
import {
  isEchoMessageJumpEmbedUrl,
  mergeEchoJumpEmbedsForMessage,
  splitContentByEchoJumpEmbeds,
} from './messageJumpContentParse';

const BASE = 'https://chat-echo.com';

function jumpEmbed(url: string): Embed {
  return {
    url,
    echoJump: { channelId: 'ch1', messageId: 'm1' },
    description: 'from server',
  } as Embed;
}

describe('isEchoMessageJumpEmbedUrl', () => {
  it('accepts message jump path on configured origin', () => {
    expect(
      isEchoMessageJumpEmbedUrl(`${BASE}/channels/ch-1/msg-2`, [BASE]),
    ).toBe(true);
  });

  it('rejects @me routes', () => {
    expect(
      isEchoMessageJumpEmbedUrl(`${BASE}/channels/@me/friends`, [BASE]),
    ).toBe(false);
  });

  it('rejects foreign origin', () => {
    expect(
      isEchoMessageJumpEmbedUrl('https://evil.test/channels/a/b', [BASE]),
    ).toBe(false);
  });
});

describe('mergeEchoJumpEmbedsForMessage', () => {
  it('adds client stub when URL is in content but not stored', () => {
    const url = `${BASE}/channels/ch1/m1`;
    const merged = mergeEchoJumpEmbedsForMessage(`see ${url}`, undefined, []);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.echoJump).toEqual({
      channelId: 'ch1',
      messageId: 'm1',
    });
  });

  it('does not duplicate server embed for same URL', () => {
    const url = `${BASE}/channels/ch1/m1`;
    const stored = [jumpEmbed(url)];
    const merged = mergeEchoJumpEmbedsForMessage(url, undefined, stored);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.description).toBe('from server');
  });
});

describe('splitContentByEchoJumpEmbeds', () => {
  it('returns single empty text segment for empty content', () => {
    expect(splitContentByEchoJumpEmbeds('', undefined)).toEqual([
      { type: 'text', text: '' },
    ]);
  });

  it('returns whole content as text when no jump URLs', () => {
    expect(splitContentByEchoJumpEmbeds('hello', undefined)).toEqual([
      { type: 'text', text: 'hello' },
    ]);
  });

  it('splits client-detected jump URL without stored embeds', () => {
    const url = `${BASE}/channels/ch1/m1`;
    const parts = splitContentByEchoJumpEmbeds(
      `before ${url} after`,
      undefined,
    );
    expect(parts).toEqual([
      { type: 'text', text: 'before ' },
      {
        type: 'jump',
        url,
        embed: expect.objectContaining({
          echoJump: { channelId: 'ch1', messageId: 'm1' },
        }),
      },
      { type: 'text', text: ' after' },
    ]);
  });

  it('splits on verbatim jump URL with server embed', () => {
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

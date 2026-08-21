import { describe, expect, it } from 'vitest';
import {
  channelIconKeyUsesSvgInvertFilter,
  isEchoChannelIconImageUrlKey,
  makeCustomEmojiChannelIconKey,
  parseCustomEmojiChannelIconKey,
  resolveChannelIconRasterUrl,
} from './channelIconKeys';

describe('channelIconKeys', () => {
  it('round-trips custom-emoji id keys', () => {
    const key = makeCustomEmojiChannelIconKey('123456789012345678');
    expect(parseCustomEmojiChannelIconKey(key)).toBe('123456789012345678');
    expect(isEchoChannelIconImageUrlKey(key)).toBe(false);
    expect(channelIconKeyUsesSvgInvertFilter(key)).toBe(false);
  });

  it('resolves custom-emoji id keys via lookup', () => {
    const key = makeCustomEmojiChannelIconKey('99');
    expect(
      resolveChannelIconRasterUrl(key, (id) =>
        id === '99' ? 'https://cdn.test/emoji.webp' : null,
      ),
    ).toBe('https://cdn.test/emoji.webp');
  });

  it('accepts raster data URLs as image icon keys', () => {
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    expect(isEchoChannelIconImageUrlKey(png)).toBe(true);
    expect(channelIconKeyUsesSvgInvertFilter(png)).toBe(false);
    expect(resolveChannelIconRasterUrl(png)).toBe(png);
  });

  it('treats catalog svg keys as invert icons', () => {
    expect(channelIconKeyUsesSvgInvertFilter('message')).toBe(true);
    expect(channelIconKeyUsesSvgInvertFilter('sparkle.svg')).toBe(true);
  });
});

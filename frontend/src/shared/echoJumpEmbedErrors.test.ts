import { describe, expect, it } from 'vitest';
import {
  buildEchoJumpErrorEmbed,
  buildEchoJumpErrorEmbedFromUrl,
  echoJumpErrorMessage,
  isEchoJumpEmbedResolved,
  normalizeEchoJumpUrl,
} from '@shared/echoJumpEmbedErrors';

describe('echoJumpEmbedErrors', () => {
  it('normalizes trailing slashes on jump URLs', () => {
    expect(normalizeEchoJumpUrl('https://echo.test/channels/ch1/m1/')).toBe(
      'https://echo.test/channels/ch1/m1',
    );
  });

  it('builds descriptive error embeds', () => {
    const embed = buildEchoJumpErrorEmbedFromUrl(
      'https://echo.test/channels/ch1/m1',
      'not_found',
    );
    expect(embed?.echoJumpError).toBe('not_found');
    expect(embed?.description).toBe(echoJumpErrorMessage('not_found'));
    expect(embed?.echoJump).toEqual({ channelId: 'ch1', messageId: 'm1' });
  });

  it('treats error embeds as resolved', () => {
    const embed = buildEchoJumpErrorEmbed(
      'https://echo.test/channels/a/b',
      { channelId: 'a', messageId: 'b' },
      'forbidden',
    );
    expect(isEchoJumpEmbedResolved(embed)).toBe(true);
  });

  it('treats description-bearing embeds as resolved', () => {
    expect(
      isEchoJumpEmbedResolved({
        echoJump: { channelId: 'a', messageId: 'b' },
        description: 'hello',
      }),
    ).toBe(true);
  });
});

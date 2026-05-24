import { describe, expect, it } from 'vitest';
import {
  collectLinkEmbedCandidateUrls,
  extractHttpUrlsFromContentJson,
  stubEchoJumpEmbedsFromMessage,
  stubVideoEmbedsFromMessage,
} from '@shared/linkEmbedCandidates';
import {
  tryParseYoutubeVideoId,
  videoEmbedPosterUrl,
} from '@shared/videoEmbedIds';

describe('tryParseYoutubeVideoId', () => {
  it('parses watch, shorts, live, nocookie embed, and youtu.be', () => {
    expect(
      tryParseYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).toBe('dQw4w9WgXcQ');
    expect(
      tryParseYoutubeVideoId('https://www.youtube.com/live/dQw4w9WgXcQ'),
    ).toBe('dQw4w9WgXcQ');
    expect(
      tryParseYoutubeVideoId(
        'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      ),
    ).toBe('dQw4w9WgXcQ');
  });
});

describe('extractHttpUrlsFromContentJson', () => {
  it('collects href from link marks when plain text has no URL', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'clip',
              marks: [
                {
                  type: 'link',
                  attrs: {
                    href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    expect(extractHttpUrlsFromContentJson(doc, 4)).toEqual([
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    ]);
    expect(collectLinkEmbedCandidateUrls('clip', doc, 4)).toContain(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });
});

describe('stubEchoJumpEmbedsFromMessage', () => {
  it('builds echoJump stub from Echo message URL', () => {
    const embeds = stubEchoJumpEmbedsFromMessage(
      'https://chat-echo.com/channels/ch-1/msg-2',
      undefined,
    );
    expect(embeds).toHaveLength(1);
    expect(embeds[0]?.echoJump).toEqual({
      channelId: 'ch-1',
      messageId: 'msg-2',
    });
  });
});

describe('stubVideoEmbedsFromMessage', () => {
  it('builds a playable YouTube stub from plain URL', () => {
    const embeds = stubVideoEmbedsFromMessage(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      undefined,
    );
    expect(embeds).toHaveLength(1);
    expect(embeds[0]?.video?.kind).toBe('youtube');
    expect(videoEmbedPosterUrl(embeds[0]!)).toContain('i.ytimg.com');
  });
});

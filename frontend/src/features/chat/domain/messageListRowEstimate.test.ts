import { describe, expect, it } from 'vitest';
import {
  MESSAGE_LIST_ROW_ESTIMATE_GROUPED_MIN_PX,
  MESSAGE_LIST_ROW_ESTIMATE_MIN_PX,
  estimateMessageListRowSizePx,
} from '@/features/chat/domain/messageListRowEstimate';

describe('estimateMessageListRowSizePx', () => {
  it('uses a lower floor for grouped continuation rows than headers', () => {
    const grouped = estimateMessageListRowSizePx({
      groupedWithPrevious: true,
      showDaySeparatorBefore: false,
      message: { content: 'hi' },
    });
    const header = estimateMessageListRowSizePx({
      groupedWithPrevious: false,
      showDaySeparatorBefore: false,
      message: { content: 'hi' },
    });
    expect(grouped).toBeLessThan(MESSAGE_LIST_ROW_ESTIMATE_MIN_PX);
    expect(grouped).toBeGreaterThanOrEqual(
      MESSAGE_LIST_ROW_ESTIMATE_GROUPED_MIN_PX,
    );
    expect(header).toBeGreaterThanOrEqual(MESSAGE_LIST_ROW_ESTIMATE_MIN_PX);
    expect(grouped).toBeLessThan(header);
  });

  it('keeps grouped short single-line estimates near measured continuation height', () => {
    const grouped = estimateMessageListRowSizePx({
      groupedWithPrevious: true,
      showDaySeparatorBefore: false,
      message: { content: 'hello' },
    });
    expect(grouped).toBeLessThanOrEqual(58);
  });

  it('reserves full-width 16:9 image slot height before live measure', () => {
    const withSlot = estimateMessageListRowSizePx({
      groupedWithPrevious: false,
      showDaySeparatorBefore: false,
      message: {
        content: '',
        contentJson: {
          type: 'doc',
          content: [
            {
              type: 'imageSlot',
              attrs: {
                slotId: 'slot-1',
                aspectW: 16,
                aspectH: 9,
                imageUrl: null,
              },
            },
          ],
        },
      },
    });
    const baseline = estimateMessageListRowSizePx({
      groupedWithPrevious: false,
      showDaySeparatorBefore: false,
      message: { content: '' },
    });
    expect(withSlot - baseline).toBe(340);
  });

  it('reserves one fixed 16:9 collage box for still images, regardless of count or stored dimensions', () => {
    const baseline = estimateMessageListRowSizePx({
      groupedWithPrevious: true,
      showDaySeparatorBefore: false,
      message: { content: 'photo' },
    });
    const oneImage = estimateMessageListRowSizePx({
      groupedWithPrevious: true,
      showDaySeparatorBefore: false,
      message: {
        content: 'photo',
        attachments: [
          {
            url: 'https://x.test/a.png',
            kind: 'image',
            width: 2000,
            height: 100,
          },
        ],
      },
    });
    // Fixed 16:9 box (CHAT_MEDIA_BOX_HEIGHT_PX 360 + 8px margin), not derived from image dims.
    expect(oneImage - baseline).toBe(368);

    const threeImages = estimateMessageListRowSizePx({
      groupedWithPrevious: true,
      showDaySeparatorBefore: false,
      message: {
        content: 'photo',
        attachments: [
          { url: 'https://x.test/a.png', kind: 'image' },
          { url: 'https://x.test/b.png', kind: 'image' },
          { url: 'https://x.test/c.png', kind: 'image' },
        ],
      },
    });
    // Grouped into one collage box -> same reserved height as a single image.
    expect(threeImages).toBe(oneImage);
  });

  it('reserves the same fixed 16:9 box for GIF attachments (no fluid probe height)', () => {
    const baseline = estimateMessageListRowSizePx({
      groupedWithPrevious: true,
      showDaySeparatorBefore: false,
      message: { content: 'photo' },
    });
    const oneGif = estimateMessageListRowSizePx({
      groupedWithPrevious: true,
      showDaySeparatorBefore: false,
      message: {
        content: 'photo',
        attachments: [
          { url: 'https://x.test/a.gif', kind: 'gif', width: 480, height: 270 },
        ],
      },
    });
    expect(oneGif - baseline).toBe(368);
  });

  it('folds mixed images + GIFs into one collage box (single reserved height)', () => {
    const oneImage = estimateMessageListRowSizePx({
      groupedWithPrevious: true,
      showDaySeparatorBefore: false,
      message: {
        content: 'photo',
        attachments: [{ url: 'https://x.test/a.png', kind: 'image' }],
      },
    });
    const imageAndGif = estimateMessageListRowSizePx({
      groupedWithPrevious: true,
      showDaySeparatorBefore: false,
      message: {
        content: 'photo',
        attachments: [
          { url: 'https://x.test/a.png', kind: 'image' },
          { url: 'https://x.test/b.gif', kind: 'gif' },
        ],
      },
    });
    expect(imageAndGif).toBe(oneImage);
  });

  it('routes legacy single imageUrl through the same fixed 16:9 box', () => {
    const baseline = estimateMessageListRowSizePx({
      groupedWithPrevious: true,
      showDaySeparatorBefore: false,
      message: { content: 'photo' },
    });
    const legacyImage = estimateMessageListRowSizePx({
      groupedWithPrevious: true,
      showDaySeparatorBefore: false,
      message: { content: 'photo', imageUrl: 'https://x.test/legacy.png' },
    });
    expect(legacyImage - baseline).toBe(368);
  });

  it('reserves rich video embed height (header + 16:9 player)', () => {
    const baseline = estimateMessageListRowSizePx({
      groupedWithPrevious: false,
      showDaySeparatorBefore: false,
      message: { content: 'watch this' },
    });
    const withVideo = estimateMessageListRowSizePx({
      groupedWithPrevious: false,
      showDaySeparatorBefore: false,
      message: {
        content: 'watch this',
        embeds: [
          {
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            title: 'Example stream',
            provider: 'YouTube',
            video: {
              kind: 'youtube',
              embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
            },
          },
        ],
      },
    });
    expect(withVideo - baseline).toBeGreaterThanOrEqual(320);
  });

  it('reserves stub video embed height from plain URLs before server unfurl', () => {
    const baseline = estimateMessageListRowSizePx({
      groupedWithPrevious: false,
      showDaySeparatorBefore: false,
      message: { content: 'check this out' },
    });
    const withStub = estimateMessageListRowSizePx({
      groupedWithPrevious: false,
      showDaySeparatorBefore: false,
      message: {
        content: 'https://vimeo.com/123456789',
        embeds: [],
      },
    });
    expect(withStub - baseline).toBeGreaterThanOrEqual(320);
  });

  it('reserves emoji-only body height before live measure', () => {
    const baseline = estimateMessageListRowSizePx({
      groupedWithPrevious: false,
      showDaySeparatorBefore: false,
      message: { content: 'hello' },
    });
    const emojiOnly = estimateMessageListRowSizePx({
      groupedWithPrevious: false,
      showDaySeparatorBefore: false,
      message: { content: '<:pepe:1486467212268142592>' },
    });
    expect(emojiOnly - baseline).toBeGreaterThanOrEqual(26);
  });
});

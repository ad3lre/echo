import { describe, expect, it } from 'vitest';
import {
  collectCustomEmojiIdsFromText,
  collectCustomEmojiIdsFromTexts,
} from './collectCustomEmojiIdsFromText';

describe('collectCustomEmojiIdsFromText', () => {
  it('collects ids from static and animated tokens', () => {
    expect(
      collectCustomEmojiIdsFromText('wave <:party:304238867010606080> ok'),
    ).toEqual(['304238867010606080']);
    expect(
      collectCustomEmojiIdsFromText(
        'b <a:spin:111111111111111111> c <:party:304238867010606080>',
      ),
    ).toEqual(['111111111111111111', '304238867010606080']);
  });

  it('dedupes across multiple strings', () => {
    expect(
      collectCustomEmojiIdsFromTexts([
        '<:a:111111111111111111>',
        '<:b:111111111111111111>',
      ]),
    ).toEqual(['111111111111111111']);
  });
});

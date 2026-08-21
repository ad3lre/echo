import { describe, expect, it } from 'vitest';
import {
  findAllImageSlotTokens,
  formatImageSlotComposerShortcut,
  formatImageSlotToken,
  isAllowedImageSlotAspect,
  parseImageSlotShortcut,
  parseImageSlotToken,
} from './imageSlot';

describe('imageSlot tokens', () => {
  it('allows whitelisted aspect ratios', () => {
    expect(isAllowedImageSlotAspect(16, 9)).toBe(true);
    expect(isAllowedImageSlotAspect(7, 3)).toBe(false);
  });

  it('formats composer shortcut without slot id', () => {
    expect(formatImageSlotComposerShortcut(16, 9)).toBe('![image: ratio=16:9]');
    expect(parseImageSlotShortcut('![image: ratio=16:9]')).toEqual({
      aspectW: 16,
      aspectH: 9,
    });
  });

  it('formats and parses canonical tokens', () => {
    const token = formatImageSlotToken({
      slotId: 'abc-123',
      aspectW: 16,
      aspectH: 9,
    });
    expect(token).toBe('![image: ratio=16:9, slotId=abc-123]');
    expect(parseImageSlotToken(token)).toEqual({
      aspectW: 16,
      aspectH: 9,
      slotId: 'abc-123',
    });
  });

  it('parses shortcut without slot id', () => {
    expect(parseImageSlotShortcut('![image: ratio=4:3]')).toEqual({
      aspectW: 4,
      aspectH: 3,
    });
    expect(
      parseImageSlotShortcut('![image: ratio=16:9, slotId=abc]'),
    ).toBeNull();
  });

  it('finds tokens with offsets', () => {
    const plain = 'hi ![image: ratio=1:1, slotId=id1] there';
    const found = findAllImageSlotTokens(plain);
    expect(found).toHaveLength(1);
    expect(found[0].slotId).toBe('id1');
    expect(found[0].start).toBe(3);
  });
});

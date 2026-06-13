import { describe, expect, it } from 'vitest';
import {
  findAllRichBlockTokens,
  formatRichBlockToken,
  parseRichBlockAttrs,
  parseRichBlockToken,
} from './richBlockToken';

describe('richBlockToken', () => {
  it('formats and parses attribute pairs', () => {
    const raw = formatRichBlockToken('image', {
      ratio: '16:9',
      slotId: 'abc-123',
    });
    expect(raw).toBe('![image: ratio=16:9, slotId=abc-123]');
    const parsed = parseRichBlockToken(raw);
    expect(parsed?.type).toBe('image');
    expect(parsed?.attrs).toEqual({ ratio: '16:9', slotId: 'abc-123' });
  });

  it('quotes values with spaces', () => {
    const raw = formatRichBlockToken('button', { label: 'Click me' });
    expect(raw).toBe('![button: label="Click me"]');
    expect(parseRichBlockToken(raw)?.attrs.label).toBe('Click me');
  });

  it('finds tokens with offsets', () => {
    const plain = 'hi ![image: ratio=1:1, slotId=id1] there';
    const found = findAllRichBlockTokens(plain, 'image');
    expect(found).toHaveLength(1);
    expect(found[0].attrs.slotId).toBe('id1');
    expect(found[0].start).toBe(3);
  });

  it('parseRichBlockAttrs handles ratio colons', () => {
    expect(parseRichBlockAttrs('ratio=16:9, slotId=x')).toEqual({
      ratio: '16:9',
      slotId: 'x',
    });
  });
});

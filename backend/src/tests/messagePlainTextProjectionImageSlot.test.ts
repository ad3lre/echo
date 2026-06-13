import { describe, expect, it } from 'vitest';
import { deriveMessagePlainText } from '../domain/messagePlainTextProjection';

describe('messagePlainTextProjection imageSlot', () => {
  it('projects imageSlot as canonical token', () => {
    const plain = deriveMessagePlainText({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] },
        {
          type: 'imageSlot',
          attrs: {
            slotId: 'slot-1',
            aspectW: 16,
            aspectH: 9,
            imageUrl: null,
            storageKey: null,
            width: null,
            height: null,
          },
        },
      ],
    });
    expect(plain).toContain('Hi');
    expect(plain).toContain('![image: ratio=16:9, slotId=slot-1]');
  });
});

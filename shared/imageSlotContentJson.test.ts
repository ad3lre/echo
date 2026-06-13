import { describe, expect, it } from 'vitest';
import {
  countImageSlots,
  patchImageSlotFill,
  walkImageSlots,
} from './imageSlotContentJson';
import {
  rebuildContentJsonPreservingRichBlocks,
  rebuildContentJsonPreservingSlots,
} from './richBlockContentJson';
import { DISCORD_BUTTON_STYLE } from './discordMessageComponents';
import { walkButtonRows } from './buttonRowContentJson';

describe('imageSlotContentJson', () => {
  const docWithSlot = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
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
  };

  it('walks and counts slots', () => {
    expect(countImageSlots(docWithSlot)).toBe(1);
    expect(walkImageSlots(docWithSlot)[0].slotId).toBe('slot-1');
  });

  it('patches empty slot fill', () => {
    const res = patchImageSlotFill(docWithSlot, 'slot-1', {
      imageUrl: 'https://cdn.example.com/a.png',
      storageKey: 'echo/channels/x/y/a.png',
      width: 1600,
      height: 900,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const filled = walkImageSlots(res.doc)[0];
    expect(filled.imageUrl).toBe('https://cdn.example.com/a.png');
  });

  it('rejects double fill', () => {
    const filled = patchImageSlotFill(docWithSlot, 'slot-1', {
      imageUrl: 'https://cdn.example.com/a.png',
    });
    if (!filled.ok) throw new Error('expected fill ok');
    const again = patchImageSlotFill(filled.doc, 'slot-1', {
      imageUrl: 'https://cdn.example.com/b.png',
    });
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error).toBe('slot_already_filled');
  });

  it('rebuild preserves filled attrs from original doc', () => {
    const filled = patchImageSlotFill(docWithSlot, 'slot-1', {
      imageUrl: 'https://cdn.example.com/a.png',
    });
    if (!filled.ok) throw new Error('fill failed');
    const plain = 'Hello\n![image: ratio=16:9, slotId=slot-1]\nAfter';
    const rebuilt = rebuildContentJsonPreservingSlots(filled.doc, plain);
    const slot = walkImageSlots(rebuilt)[0];
    expect(slot.imageUrl).toBe('https://cdn.example.com/a.png');
  });

  it('rebuild preserves button rows and image slots together', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] },
        {
          type: 'buttonRow',
          attrs: {
            rowId: 'row-1',
            buttons: [
              {
                label: 'Go',
                style: DISCORD_BUTTON_STYLE.LINK,
                url: 'https://example.com',
              },
            ],
          },
        },
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
    };
    const plain =
      'Intro\n![button: rowId=row-1]\n![image: ratio=16:9, slotId=slot-1]';
    const rebuilt = rebuildContentJsonPreservingRichBlocks(doc, plain);
    expect(walkButtonRows(rebuilt)).toHaveLength(1);
    expect(walkButtonRows(rebuilt)[0].buttons[0].label).toBe('Go');
    expect(walkImageSlots(rebuilt)).toHaveLength(1);
  });
});

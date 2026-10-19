import { describe, expect, it } from 'vitest';
import {
  mergeCustomEmojiNameLayers,
  mergeCustomEmojiUrlLayers,
} from './useChatCustomEmojiResolvers';

describe('mergeCustomEmojiUrlLayers', () => {
  it('prefers server, then user library, then global resolve (DM parity with inspect)', () => {
    const m = mergeCustomEmojiUrlLayers({
      serverRows: [{ id: '1', imageUrl: 'https://cdn.example/server.webp' }],
      userRows: [
        { id: '1', imageUrl: 'https://cdn.example/user-ignored.webp' },
        { id: '2', imageUrl: 'https://cdn.example/user.webp' },
      ],
      globalById: new Map([
        ['2', 'https://cdn.example/global-ignored.webp'],
        ['3', 'https://cdn.example/global.webp'],
      ]),
    });
    expect(m.get('1')).toBe('https://cdn.example/server.webp');
    expect(m.get('2')).toBe('https://cdn.example/user.webp');
    expect(m.get('3')).toBe('https://cdn.example/global.webp');
  });
});

describe('mergeCustomEmojiNameLayers', () => {
  it('keeps the first shortcode hit across server → user → global', () => {
    const m = mergeCustomEmojiNameLayers([
      [{ id: '1', name: 'Wave', animated: false }],
      [
        { id: '9', name: 'wave', animated: true },
        { id: '2', name: 'Cool', animated: false },
      ],
      [{ id: '3', name: 'cool', animated: true }],
    ]);
    expect(m.get('wave')).toEqual({
      id: '1',
      name: 'Wave',
      animated: false,
    });
    expect(m.get('cool')).toEqual({
      id: '2',
      name: 'Cool',
      animated: false,
    });
  });
});

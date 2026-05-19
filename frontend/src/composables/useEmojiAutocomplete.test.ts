import { describe, expect, it, vi } from 'vitest';

vi.mock('@/assets/iconCatalog', () => ({
  ensureIconCatalogLoaded: () => Promise.resolve(),
}));

const unicodeEntries = [
  {
    emoji: '🦇',
    skin_tone_support: false,
    name: 'bat',
    slug: 'bat',
    html: '',
  },
  {
    emoji: '🦇🦇',
    skin_tone_support: false,
    name: 'bat man',
    slug: 'bat_man',
    html: '',
  },
  {
    emoji: '🔋',
    skin_tone_support: false,
    name: 'battery',
    slug: 'battery',
    html: '',
  },
];

vi.mock('@/composables/useEmojiSearchIndex', () => ({
  ensureEmojiSearchPrebuildLoaded: () => Promise.resolve(),
  getEmojiBySlug: (slug: string) =>
    unicodeEntries.find((e) => e.slug === slug) ?? null,
  searchEmojisBySlugPrefix: (query: string) => {
    const q = query.toLowerCase();
    return unicodeEntries.filter((e) => e.slug.startsWith(q));
  },
}));

vi.mock('@/composables/useAppIconSearch', () => ({
  appIconEntriesForAutocompleteQuery: (query: string) => {
    const q = query.toLowerCase();
    if (!'battery'.startsWith(q)) return [];
    return [
      {
        emoji: '<icon:battery.svg>',
        skin_tone_support: false,
        name: 'Battery',
        slug: 'battery',
        html: '',
        kind: 'appIcon' as const,
        iconFilename: 'battery.svg',
      },
    ];
  },
}));

import { useEmojiAutocomplete } from './useEmojiAutocomplete';

describe('useEmojiAutocomplete', () => {
  it('ranks unicode and app icons together (best match first)', () => {
    const text = ':bat';
    const cursor = text.length;
    const replaceRange = vi.fn();

    const ac = useEmojiAutocomplete(
      () => text,
      () => cursor,
      replaceRange,
    );

    ac.updateFromInput();
    expect(ac.suggestions.value.map((e) => e.slug).slice(0, 2)).toEqual([
      'bat',
      'battery',
    ]);
  });

  it('ranks app icons lower than emoji for identical matches', () => {
    const text = ':battery';
    const cursor = text.length;
    const replaceRange = vi.fn();

    const ac = useEmojiAutocomplete(
      () => text,
      () => cursor,
      replaceRange,
    );

    ac.updateFromInput();
    expect(ac.suggestions.value.map((e) => e.emoji).slice(0, 2)).toEqual([
      '🔋',
      '<icon:battery.svg>',
    ]);
  });

  it('uses the current trigger range when replacing (not stale triggerStart)', () => {
    let text = 'hello :bat';
    let cursor = text.length;
    const replaceRange = vi.fn(
      (start: number, end: number, replacement: string) => {
        text = text.slice(0, start) + replacement + text.slice(end);
        cursor = start + replacement.length;
      },
    );

    const ac = useEmojiAutocomplete(
      () => text,
      () => cursor,
      replaceRange,
    );

    ac.updateFromInput();
    ac.triggerStart.value = 0;
    ac.selectCurrent();

    expect(replaceRange).toHaveBeenCalledTimes(1);
    expect(text).toBe('hello 🦇');
  });

  it('replaces full shortcode when cursor offset is stale by one', () => {
    let text = 'hello :bat';
    let cursor = text.length - 1;
    const replaceRange = vi.fn(
      (start: number, end: number, replacement: string) => {
        text = text.slice(0, start) + replacement + text.slice(end);
        cursor = start + replacement.length;
      },
    );

    const ac = useEmojiAutocomplete(
      () => text,
      () => cursor,
      replaceRange,
    );
    ac.triggerStart.value = 6;
    ac.query.value = 'bat';

    ac.select('🦇');

    expect(replaceRange).toHaveBeenCalledWith(6, 10, '🦇');
    expect(text).toBe('hello 🦇');
  });

  it('suggests global custom emojis regardless source server', () => {
    const text = ':party';
    const cursor = text.length;
    const replaceRange = vi.fn();
    const ac = useEmojiAutocomplete(
      () => text,
      () => cursor,
      replaceRange,
      {
        getCustomEmojiEntries: () => [
          {
            kind: 'custom' as const,
            id: '111',
            serverId: 'server-a',
            animated: false,
            imageUrl: 'https://cdn.test/a.png',
            emoji: '<:party_blob:111>',
            name: 'party_blob',
            slug: 'party_blob',
            html: '',
            skin_tone_support: false,
          },
          {
            kind: 'custom' as const,
            id: '222',
            serverId: 'server-b',
            animated: false,
            imageUrl: 'https://cdn.test/b.png',
            emoji: '<:party_parrot:222>',
            name: 'party_parrot',
            slug: 'party_parrot',
            html: '',
            skin_tone_support: false,
          },
        ],
      },
    );

    ac.updateFromInput();
    expect(ac.suggestions.value.map((e) => e.emoji)).toContain(
      '<:party_blob:111>',
    );
    expect(ac.suggestions.value.map((e) => e.emoji)).toContain(
      '<:party_parrot:222>',
    );
  });
});

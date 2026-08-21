import { afterEach, describe, expect, it, vi } from 'vitest';

const categories = [
  {
    name: 'Smileys & Emotion',
    slug: 'smileys-and-emotion',
    navIconHtml: '<img class="emoji" alt="😀" src="/twemoji/1f600.webp" />',
    emojis: [
      {
        emoji: '😀',
        name: 'grinning face',
        slug: 'grinning_face',
        html: '<img class="emoji" alt="😀" src="/twemoji/1f600.webp" />',
      },
      {
        emoji: '😁',
        name: 'grin',
        slug: 'grin',
        html: '<img class="emoji" alt="😁" src="/twemoji/1f601.webp" />',
      },
      {
        emoji: '😃',
        name: 'smiling face',
        slug: 'smiling_face',
        html: '<img class="emoji" alt="😃" src="/twemoji/1f603.webp" />',
      },
      {
        emoji: '😭',
        name: 'loudly crying face',
        slug: 'loudly_crying_face',
        html: '<img class="emoji" alt="😭" src="/twemoji/1f62d.webp" />',
      },
      {
        emoji: '💩',
        name: 'pile of poo',
        slug: 'pile_of_poo',
        html: '<img class="emoji" alt="💩" src="/twemoji/1f4a9.webp" />',
      },
      {
        emoji: '☃️',
        name: 'snowman',
        slug: 'snowman',
        html: '<img class="emoji" alt="☃️" src="/twemoji/26c4.webp" />',
      },
      {
        emoji: '☃️',
        name: 'sno wman',
        slug: 'sno_wman',
        html: '<img class="emoji" alt="☃️" src="/twemoji/26c4.webp" />',
      },
      {
        emoji: '✈️',
        name: 'Airplane',
        slug: 'airplane',
        skin_tone_support: false,
        html: '<img class="emoji" alt="✈️" src="/twemoji/2708.webp" />',
      },
      {
        emoji: '🤣',
        name: 'rolling on the floor laughing',
        slug: 'rolling_on_the_floor_laughing',
        html: '<img class="emoji" alt="🤣" src="/twemoji/1f923.webp" />',
      },
      {
        emoji: '❤️',
        name: 'red heart',
        slug: 'red_heart',
        html: '<img class="emoji" alt="❤️" src="/twemoji/2764.webp" />',
      },
      {
        emoji: '💘',
        name: 'heart with arrow',
        slug: 'heart_with_arrow',
        html: '<img class="emoji" alt="💘" src="/twemoji/1f498.webp" />',
      },
    ],
  },
];

vi.mock('@/features/chat/emoji/useEmojiData', () => ({
  getEmojiCategories: () => categories,
}));

import {
  getEmojiBySlug,
  invalidateEmojiSearchIndex,
  searchEmojis,
  searchEmojisBySlugPrefix,
  setPrebuiltSearchIndex,
} from './useEmojiSearchIndex';

afterEach(() => {
  setPrebuiltSearchIndex(null);
  invalidateEmojiSearchIndex();
});

describe('searchEmojis', () => {
  it('matches substrings and ranks exact slug first', () => {
    expect(searchEmojis('grin').map((e) => e.slug)).toEqual([
      'grin',
      'grinning_face',
    ]);
    expect(searchEmojis('grinning face').map((e) => e.slug)).toEqual([
      'grinning_face',
    ]);
  });

  it('matches short prefixes in slug or name (not full-token-only)', () => {
    expect(searchEmojis('gri').map((e) => e.slug)).toEqual([
      'grin',
      'grinning_face',
    ]);
    expect(searchEmojis('smil').map((e) => e.slug)).toEqual([
      'smiling_face',
      'grinning_face',
    ]);
  });

  it('supports common aliases in search and exact slug lookup', () => {
    expect(searchEmojis('sob').map((e) => e.slug)[0]).toBe(
      'loudly_crying_face',
    );
    expect(getEmojiBySlug('sob')?.slug).toBe('loudly_crying_face');
    expect(getEmojiBySlug('poop')?.slug).toBe('pile_of_poo');

    expect(searchEmojisBySlugPrefix('sob').map((e) => e.slug)[0]).toBe(
      'loudly_crying_face',
    );
  });

  it('prefers fewer-word slugs when relevance ties', () => {
    expect(
      searchEmojis('sno')
        .map((e) => e.slug)
        .slice(0, 2),
    ).toEqual(['snowman', 'sno_wman']);
  });

  it('matches partial tokens so plane finds airplane', () => {
    expect(searchEmojis('plane').map((e) => e.slug)).toContain('airplane');
  });

  it('allows one typo vs a slug token (airplne → airplane)', () => {
    expect(searchEmojis('airplne').map((e) => e.slug)).toContain('airplane');
  });

  it('matches secondary association terms (e.g. haha → ROFL)', () => {
    expect(searchEmojis('haha').map((e) => e.slug)).toContain(
      'rolling_on_the_floor_laughing',
    );
  });

  it('ranks plain heart before compound heart slugs for query heart', () => {
    expect(searchEmojis('heart').map((e) => e.slug)[0]).toBe('red_heart');
  });

  it('prebuilt token JSON does not shrink the searchable catalog', () => {
    setPrebuiltSearchIndex({
      byToken: { grinning: ['😀'] },
    });
    invalidateEmojiSearchIndex();
    expect(searchEmojis('poo').map((e) => e.slug)).toContain('pile_of_poo');
  });
});

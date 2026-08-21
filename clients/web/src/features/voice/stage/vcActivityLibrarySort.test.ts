import { describe, expect, it } from 'vitest';
import type { EchoVcActivityKey } from '@shared/vcActivityCatalog';
import { compareVcActivityLibraryCards } from '@/features/voice/stage/vcActivityLibrarySort';

type Card = {
  key: EchoVcActivityKey;
  title: string;
};

function sortCards(
  cards: readonly Card[],
  popularityByKey: Partial<Record<EchoVcActivityKey, number>>,
): Card[] {
  return [...cards].sort((a, b) =>
    compareVcActivityLibraryCards(a, b, popularityByKey),
  );
}

describe('vcActivityLibrarySort', () => {
  it('prioritizes Echo-native activities over non-native activities', () => {
    const cards: Card[] = [
      { key: 'skribbl_io', title: 'skribbl.io' },
      { key: 'wordle', title: 'Wordline' },
      { key: 'openguessr', title: 'OpenGuessr' },
      { key: 'youtube', title: 'YouTube' },
    ];
    const popularityByKey = {
      skribbl_io: 999,
      openguessr: 500,
      wordle: 1,
      youtube: 0,
    } satisfies Partial<Record<EchoVcActivityKey, number>>;

    const sorted = sortCards(cards, popularityByKey);
    expect(sorted.map((c) => c.key)).toEqual([
      'wordle',
      'youtube',
      'skribbl_io',
      'openguessr',
    ]);
  });

  it('keeps popularity/title/key ordering within the native group', () => {
    const cards: Card[] = [
      { key: 'hangman', title: 'Hangman' },
      { key: 'youtube', title: 'YouTube' },
      { key: 'wordle', title: 'Wordline' },
      { key: 'tic_tac_toe', title: 'Arcade' },
      { key: 'codenames', title: 'Arcade' },
    ];
    const popularityByKey = {
      hangman: 2,
      youtube: 2,
      wordle: 3,
      tic_tac_toe: 2,
      codenames: 2,
    } satisfies Partial<Record<EchoVcActivityKey, number>>;

    const sorted = sortCards(cards, popularityByKey);
    expect(sorted.map((c) => c.key)).toEqual([
      'wordle',
      'codenames',
      'tic_tac_toe',
      'hangman',
      'youtube',
    ]);
  });

  it('keeps popularity/title/key ordering within the non-native group', () => {
    const cards: Card[] = [
      { key: 'smash_karts', title: 'Smash Karts' },
      { key: 'openguessr', title: 'OpenGuessr' },
      { key: 'krunker', title: 'Krunker' },
      { key: 'richup', title: 'OpenGuessr' },
    ];
    const popularityByKey = {
      smash_karts: 1,
      openguessr: 5,
      krunker: 5,
      richup: 5,
    } satisfies Partial<Record<EchoVcActivityKey, number>>;

    const sorted = sortCards(cards, popularityByKey);
    expect(sorted.map((c) => c.key)).toEqual([
      'krunker',
      'openguessr',
      'richup',
      'smash_karts',
    ]);
  });
});

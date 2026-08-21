import type { SkrigglesSettings } from './types';

/**
 * Original English drawing-game word bank (not copied from any commercial game).
 * Organized by approximate difficulty tier.
 */
export const SKRIGGLES_WORD_BANK_EASY: readonly string[] = [
  'CAT',
  'DOG',
  'SUN',
  'MOON',
  'TREE',
  'FISH',
  'BIRD',
  'CAKE',
  'BOOK',
  'DOOR',
  'HAND',
  'FOOT',
  'STAR',
  'RAIN',
  'SNOW',
  'FIRE',
  'LAKE',
  'BOAT',
  'CAR',
  'HAT',
  'CUP',
  'EGG',
  'BED',
  'KEY',
  'MAP',
];

export const SKRIGGLES_WORD_BANK_MEDIUM: readonly string[] = [
  'GUITAR',
  'CASTLE',
  'DRAGON',
  'PIRATE',
  'ROCKET',
  'PENCIL',
  'CAMERA',
  'BRIDGE',
  'TEMPLE',
  'WIZARD',
  'TIGER',
  'PUMPKIN',
  'CIRCUS',
  'ROBOT',
  'PLANET',
  'FOREST',
  'COOKIE',
  'BALLOON',
  'RAINBOW',
  'DOLPHIN',
  'KITTEN',
  'MIRROR',
  'CANDLE',
  'POCKET',
  'WINDOW',
];

export const SKRIGGLES_WORD_BANK_HARD: readonly string[] = [
  'TELESCOPE',
  'ASTRONAUT',
  'LIGHTHOUSE',
  'WATERFALL',
  'SKATEBOARD',
  'CHOCOLATE',
  'VOLCANO',
  'PARACHUTE',
  'MICROPHONE',
  'SANDWICH',
  'ELEPHANT',
  'HURRICANE',
  'BACKPACK',
  'CACTUS',
  'PENGUIN',
  'TREASURE',
  'UNICORN',
  'JELLYFISH',
  'CHAMPION',
  'MOUNTAIN',
  'PAINTBRUSH',
  'SKELETON',
  'TORNADO',
  'CARNIVAL',
  'HAMBURGER',
];

function allWordsForLanguage(language: string): readonly string[] {
  if (language !== 'english') return SKRIGGLES_WORD_BANK_MEDIUM;
  return [
    ...SKRIGGLES_WORD_BANK_EASY,
    ...SKRIGGLES_WORD_BANK_MEDIUM,
    ...SKRIGGLES_WORD_BANK_HARD,
  ];
}

function parseCustomWords(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\n]+/)
    .map((w) => w.trim().replace(/\s+/g, ' ').toUpperCase())
    .filter((w) => w.length >= 2 && w.length <= 32 && /^[A-Z ]+$/.test(w));
}

function filterByMinLen(
  words: readonly string[],
  minWordLen: number,
): string[] {
  if (minWordLen <= 0) return [...words];
  return words.filter((w) => w.replace(/ /g, '').length >= minWordLen);
}

function cryptoRandomIndex(len: number): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0]! % len;
}

function pickRandom<T>(arr: readonly T[]): T | null {
  if (!arr.length) return null;
  return arr[cryptoRandomIndex(arr.length)] ?? null;
}

function pickUniqueWords(pool: string[], count: number): string[] {
  const copy = [...pool];
  const out: string[] = [];
  while (out.length < count && copy.length) {
    const idx = cryptoRandomIndex(copy.length);
    const word = copy.splice(idx, 1)[0];
    if (word) out.push(word);
  }
  return out;
}

export function pickWordChoices(settings: SkrigglesSettings): string[] {
  const custom = parseCustomWords(settings.customWords);
  const useCustom = custom.length >= 10;
  let pool = useCustom
    ? custom
    : filterByMinLen(
        allWordsForLanguage(settings.language),
        settings.minWordLen,
      );
  if (!pool.length) {
    pool = filterByMinLen(
      [...SKRIGGLES_WORD_BANK_EASY, ...SKRIGGLES_WORD_BANK_MEDIUM],
      0,
    );
  }
  const choices = pickUniqueWords(pool, 3);
  while (choices.length < 3 && pool.length) {
    const extra = pickRandom(pool);
    if (extra && !choices.includes(extra)) choices.push(extra);
    else break;
  }
  return choices.slice(0, 3);
}

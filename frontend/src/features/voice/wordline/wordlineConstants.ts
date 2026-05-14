/** Wordline (merged from `origin/wordle`) — 5-letter game constants. */

export const MAX_GUESSES = 6;
export const WORD_LENGTH = 5;

export const KEYBOARD_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['Enter', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'Backspace'],
] as const;

/** Daily pool (lowercase). */
export const ANSWERS = [
  'crane',
  'slate',
  'brisk',
  'flame',
  'proud',
  'shiny',
  'mirth',
  'grace',
  'brave',
  'clasp',
  'dwell',
  'frost',
  'glint',
  'honey',
  'ivory',
  'jaunt',
  'knead',
  'lunar',
  'mango',
  'noble',
  'ocean',
  'piano',
  'quilt',
  'raven',
  'savor',
  'tempo',
  'union',
  'vivid',
  'waltz',
  'xenon',
  'yield',
  'zesty',
  'adore',
  'bloom',
  'cider',
  'daisy',
  'ember',
  'forge',
  'grove',
  'haste',
  'inlet',
  'jolly',
  'knoll',
  'linen',
  'medal',
  'nerve',
  'orbit',
  'pearl',
  'quiet',
  'rider',
  'solar',
  'toast',
  'ultra',
  'valor',
  'woven',
  'yearn',
] as const;

const LEVEL_SEED = [
  'ramen',
  'cocoa',
  'basil',
  'fable',
  'quark',
  'vivid',
  'crown',
  'lemon',
  'spice',
  'worry',
  'flint',
  'marsh',
  'plaza',
  'rhyme',
  'swoop',
  'truce',
  'whisk',
  'blush',
  'cabin',
  'drift',
  'eagle',
  'fjord',
  'gloom',
  'hazel',
  'irony',
  'joker',
  'karma',
  'latte',
  'mochi',
  'nylon',
  'olive',
  'pixel',
  'quail',
  'ranch',
  'salsa',
  'tulip',
  'umbra',
  'vapor',
  'waltz',
  'yeast',
] as const;

function hashWord(word: string): number {
  let hash = 2166136261;
  for (const char of word) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function shuffleWordlineLevels(words: readonly string[]): string[] {
  return [...words].sort((left, right) => hashWord(left) - hashWord(right));
}

export const LEVEL_WORDS = shuffleWordlineLevels([...LEVEL_SEED]);

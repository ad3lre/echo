/** Wordline (merged from `origin/wordle`) — 5-letter game constants. */

export {
  MAX_GUESSES,
  WORD_LENGTH,
  ANSWERS,
  LEVEL_WORDS,
} from '@shared/games/wordline/constants';

export const KEYBOARD_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['Enter', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'Backspace'],
] as const;

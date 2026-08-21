/**
 * :slug: emoji autocomplete for chat input.
 * Detects :query pattern, shows suggestions, replaces on select or : completion.
 *
 * Implemented via {@link useEmojiSuggestable} (suggestables foundation).
 */

import { useEmojiSuggestable } from '@/suggestables/adapters/emojiSuggestable';
import type { EmojiSuggestableOptions } from '@/suggestables/adapters/emojiSuggestable';

export type UseEmojiAutocompleteOptions = EmojiSuggestableOptions;

export function useEmojiAutocomplete(
  getText: () => string,
  getCursorOffset: () => number,
  replaceRange: (start: number, end: number, text: string) => void,
  options?: UseEmojiAutocompleteOptions,
) {
  return useEmojiSuggestable(getText, getCursorOffset, replaceRange, options);
}

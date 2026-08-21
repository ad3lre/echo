/**
 * `/command` autocomplete for the chat composer.
 * Implemented via {@link useSlashCommandSuggestable}.
 */

import { useSlashCommandSuggestable } from '@/suggestables/adapters/slashCommandSuggestable';
import type { SlashCommandSuggestableOptions } from '@/suggestables/adapters/slashCommandSuggestable';

export type UseSlashCommandAutocompleteOptions = SlashCommandSuggestableOptions;

export function useSlashCommandAutocomplete(
  getText: () => string,
  getCursorOffset: () => number,
  replaceRange: (start: number, end: number, text: string) => void,
  onCommand: (
    command: import('@/features/chat/chatSlashCommands').ChatSlashCommand,
  ) => void,
  options: UseSlashCommandAutocompleteOptions,
) {
  return useSlashCommandSuggestable(
    getText,
    getCursorOffset,
    replaceRange,
    onCommand,
    options,
  );
}

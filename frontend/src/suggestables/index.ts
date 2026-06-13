export type {
  SuggestableConfig,
  SuggestableInputContext,
  SuggestableKeydownContext,
  SuggestableProvider,
  SuggestableSelectionRange,
  SuggestableSession,
  SuggestableTrigger,
} from '@/suggestables/types';

export { useSuggestable } from '@/suggestables/useSuggestable';
export {
  useSuggestableRegistry,
  type SuggestableRegistry,
  type SuggestableRegistryEntry,
} from '@/suggestables/useSuggestableRegistry';

export {
  createEmojiSuggestableConfig,
  useEmojiSuggestable,
  type EmojiSuggestableOptions,
} from '@/suggestables/adapters/emojiSuggestable';

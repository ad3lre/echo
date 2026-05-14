/**
 * Message search with :notation filters — thin binder over
 * `createMessageSearchController` (messaging search controller).
 */

import type { Ref } from 'vue';
import type { MessageWithAuthor } from '@shared/types';
import type {
  RawMessage,
  UserForAuthor,
} from '@/features/chat/chatMessageTypes';
import type { UseSearchApiModeOptions } from '@/features/chat/messageSearchTypes';
import { createMessageSearchController } from '@/services/orchestration/messageSearchController';
import type { ChannelCategory } from './useChannels';

export type {
  FilterChip,
  FilterKey,
  HasType,
  SearchFilters,
  UseSearchApiModeOptions,
} from '@/features/chat/messageSearchTypes';

export function useSearch(
  categories: Ref<ChannelCategory[]>,
  activeChannelId: Ref<string>,
  users: Ref<UserForAuthor[]>,
  activeChannelMessages: Ref<MessageWithAuthor[]>,
  apiMode?: UseSearchApiModeOptions,
) {
  return createMessageSearchController(
    categories,
    activeChannelId,
    users,
    activeChannelMessages,
    apiMode,
  );
}

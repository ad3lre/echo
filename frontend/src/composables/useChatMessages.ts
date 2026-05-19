import type { Ref } from 'vue';
import type {
  RawMessage,
  UserForAuthor,
} from '@/features/chat/chatMessageTypes';
import {
  createActiveChannelMessagesViewModel,
  type ActiveChannelMessagesViewModel,
} from '@/features/chat/viewModel/activeChannelMessages';

export type {
  RawMessage,
  UserForAuthor,
} from '@/features/chat/chatMessageTypes';

export function useChatMessages(
  activeChannelId: Ref<string>,
  users: Ref<UserForAuthor[]>,
  /** From `echoSession.presenceByUserId` — applies to authors not yet in `users` or with blank row status. */
  presenceByUserId?: Ref<Record<string, string>>,
) {
  return createActiveChannelMessagesViewModel(
    activeChannelId,
    users,
    presenceByUserId,
  );
}

export type { ActiveChannelMessagesViewModel };

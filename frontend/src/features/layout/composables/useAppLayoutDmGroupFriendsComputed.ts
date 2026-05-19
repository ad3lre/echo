import type { Ref } from 'vue';
import { computed } from 'vue';
import { buildSortedDmGroupFriendsList } from '@/features/dm/buildSortedDmGroupFriendsList';

export function useAppLayoutDmGroupFriendsComputed(opts: {
  currentUserId: { readonly value: string | undefined };
  users: Ref<Array<{ id: string; name: string; pfp: string; status: string }>>;
  friendIds: Ref<readonly string[]>;
}) {
  return computed(() =>
    buildSortedDmGroupFriendsList({
      currentUserId: opts.currentUserId.value,
      users: opts.users.value,
      friendIds: opts.friendIds.value,
    }),
  );
}

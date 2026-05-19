import { defineStore } from 'pinia';
import { ref } from 'vue';

const STORAGE_KEY = 'echo_favorite_dm_inbox_v1';

type Persisted = {
  users: Record<string, true>;
  groups: Record<string, true>;
};

function loadPersisted(): Persisted {
  if (typeof localStorage === 'undefined') {
    return { users: {}, groups: {} };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)?.trim();
    if (!raw) return { users: {}, groups: {} };
    const j = JSON.parse(raw) as Partial<Persisted>;
    return {
      users:
        typeof j.users === 'object' && j.users && !Array.isArray(j.users)
          ? j.users
          : {},
      groups:
        typeof j.groups === 'object' && j.groups && !Array.isArray(j.groups)
          ? j.groups
          : {},
    };
  } catch {
    return { users: {}, groups: {} };
  }
}

/**
 * Client-only: pin 1:1 / group DMs to the top of the Messages list (persisted locally).
 */
export const useFavoriteDmInboxStore = defineStore('favoriteDmInbox', () => {
  const users = ref<Record<string, true>>(loadPersisted().users);
  const groups = ref<Record<string, true>>(loadPersisted().groups);

  function persist() {
    if (typeof localStorage === 'undefined') return;
    try {
      const payload: Persisted = {
        users: { ...users.value },
        groups: { ...groups.value },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* quota */
    }
  }

  function isUserFavorite(peerId: string): boolean {
    return peerId in users.value;
  }

  function isGroupFavorite(channelId: string): boolean {
    return channelId in groups.value;
  }

  function toggleUser(peerId: string) {
    const next = { ...users.value };
    if (peerId in next) delete next[peerId];
    else next[peerId] = true;
    users.value = next;
    persist();
  }

  function toggleGroup(channelId: string) {
    const next = { ...groups.value };
    if (channelId in next) delete next[channelId];
    else next[channelId] = true;
    groups.value = next;
    persist();
  }

  return {
    users,
    groups,
    isUserFavorite,
    isGroupFavorite,
    toggleUser,
    toggleGroup,
  };
});

import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { maxIncomingPeerMessageMs } from '@/features/dm/hiddenDmInboxUtils';

const STORAGE_KEY = 'echo_hidden_dm_inbox_v1';

type Persisted = {
  /** peer user id → max incoming message time (ms) from them at hide */
  users: Record<string, number>;
  /** group channel id → Echo last activity id at hide */
  groups: Record<string, string>;
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
 * Client-only: hide 1:1 / group threads from the DM list until new activity
 * (incoming DM for 1:1, new message/activity for groups).
 */
export const useHiddenDmInboxStore = defineStore('hiddenDmInbox', () => {
  const users = ref<Record<string, number>>(loadPersisted().users);
  const groups = ref<Record<string, string>>(loadPersisted().groups);

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

  function isUserHidden(peerId: string): boolean {
    return peerId in users.value;
  }

  function isGroupHidden(channelId: string): boolean {
    return channelId in groups.value;
  }

  function hideUser(peerId: string, snapshotIncomingMs: number) {
    users.value = { ...users.value, [peerId]: snapshotIncomingMs };
    persist();
  }

  function hideGroup(channelId: string, activityIdWhenHidden: string) {
    groups.value = { ...groups.value, [channelId]: activityIdWhenHidden };
    persist();
  }

  function unhideUser(peerId: string) {
    if (!(peerId in users.value)) return;
    const next = { ...users.value };
    delete next[peerId];
    users.value = next;
    persist();
  }

  function unhideGroup(channelId: string) {
    if (!(channelId in groups.value)) return;
    const next = { ...groups.value };
    delete next[channelId];
    groups.value = next;
    persist();
  }

  function syncUnhide(opts: {
    selfId: string;
    messages: Record<string, readonly RawMessage[] | undefined>;
    echoPeerByChannelId: ReadonlyMap<string, string>;
    echoDmLastActivityIdByChannelId: ReadonlyMap<string, string>;
  }) {
    const selfId = opts.selfId.trim();
    if (!selfId) return;

    for (const peerId of Object.keys(users.value)) {
      const snap = users.value[peerId];
      const maxIn = maxIncomingPeerMessageMs(
        peerId,
        selfId,
        opts.messages,
        opts.echoPeerByChannelId,
      );
      if (maxIn > snap) {
        unhideUser(peerId);
      }
    }

    for (const channelId of Object.keys(groups.value)) {
      const atHide = groups.value[channelId] ?? '';
      const cur = opts.echoDmLastActivityIdByChannelId.get(channelId) ?? '';
      if (cur && cur !== atHide) {
        unhideGroup(channelId);
      }
    }
  }

  return {
    users,
    groups,
    isUserHidden,
    isGroupHidden,
    hideUser,
    hideGroup,
    unhideUser,
    unhideGroup,
    syncUnhide,
  };
});

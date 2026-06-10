import { computed, type ComputedRef, type Ref } from 'vue';
import type { UserForAuthor } from '@/features/chat/chatMessageTypes';
import { isDmThreadId } from '@/features/layout/mainSurface';
import type { WorkspaceStateApi } from '@/composables/workspace/types';
import type { useAuthSessionStore } from '@/stores/authSession';

type MentionAutocompleteUser = {
  id: string;
  name: string;
  pfp: string;
  status?: string;
  timeZone?: string | null;
};

function toUserForAuthor(user: MentionAutocompleteUser): UserForAuthor {
  return {
    id: user.id,
    name: user.name,
    pfp: user.pfp,
    status: user.status ?? 'offline',
    ...(user.timeZone !== undefined ? { timeZone: user.timeZone } : {}),
  };
}

/**
 * Candidate users for the @mention autocomplete in the active surface: the
 * thread participants in a DM/group thread, or the member list in a guild
 * channel. Empty elsewhere.
 */
export function useAppLayoutMentionAutocompleteUsers(deps: {
  activeChannelId: Ref<string>;
  mainSurface: { readonly value: { type: string } };
  isPersistedEchoDmThread: (channelId: string) => boolean;
  isGroupDM: ComputedRef<boolean>;
  activeGroupDM: ComputedRef<{ memberIds?: string[] } | null | undefined>;
  selectedDMUserId: Ref<string | null>;
  dmPartnerUser: ComputedRef<{ id?: string | null } | null | undefined>;
  echoDmPeerByChannelId: Ref<Map<string, string>>;
  workspace: WorkspaceStateApi;
  authSession: ReturnType<typeof useAuthSessionStore>;
  memberListUsers: ComputedRef<readonly MentionAutocompleteUser[]>;
}): ComputedRef<UserForAuthor[]> {
  const {
    activeChannelId,
    mainSurface,
    isPersistedEchoDmThread,
    isGroupDM,
    activeGroupDM,
    selectedDMUserId,
    dmPartnerUser,
    echoDmPeerByChannelId,
    workspace,
    authSession,
    memberListUsers,
  } = deps;

  return computed(() => {
    const cid = activeChannelId.value?.trim() ?? '';
    const ms = mainSurface.value.type;

    const inDmThread =
      ms === 'dmThread' ||
      (!!cid && isPersistedEchoDmThread(cid)) ||
      (!!cid && isDmThreadId(cid));

    if (inDmThread) {
      const idSet = new Set<string>();
      const me = authSession.backendUser?.id?.trim();
      if (me) idSet.add(me);

      if (isGroupDM.value) {
        const mids = activeGroupDM.value?.memberIds;
        if (Array.isArray(mids)) {
          for (const raw of mids) {
            const id = raw?.trim();
            if (id) idSet.add(id);
          }
        }
      } else {
        const peer = selectedDMUserId.value?.trim();
        if (peer) idSet.add(peer);
        const partner = dmPartnerUser.value?.id?.trim();
        if (partner) idSet.add(partner);
        if (cid) {
          const mapped = echoDmPeerByChannelId.value.get(cid)?.trim();
          if (mapped) idSet.add(mapped);
          if (cid.startsWith('dm-') && !cid.startsWith('dm-group-')) {
            const legacy = cid.slice('dm-'.length).trim();
            if (legacy) idSet.add(legacy);
          }
        }
      }

      const roster = workspace.users.value;
      const byId = new Map<string, (typeof roster)[number]>(
        roster.map((u) => [u.id, u]),
      );
      const out: UserForAuthor[] = [];
      for (const id of idSet) {
        const row = byId.get(id);
        if (row) out.push(toUserForAuthor(row));
      }
      return out;
    }

    if (
      ms === 'serverText' ||
      ms === 'serverVoice' ||
      ms === 'serverForum' ||
      ms === 'serverEmptyOnboarding'
    ) {
      return memberListUsers.value.map(toUserForAuthor);
    }

    return [];
  });
}

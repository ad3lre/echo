<script setup lang="ts">
import { computed, ref } from 'vue';
import { icons } from '@/assets/icons';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { selectPresence } from '@/services/domain/presence';
import { selectFriendshipUiState } from '@/services/domain/friendshipUi';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { echoUserMatchesSearchQuery } from '@/utils/echoUserSearch';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { useDmConversationSubtitle } from '@/features/dm/composables/useDmConversationSubtitle';

type FriendsTab = 'all' | 'online' | 'pending' | 'add';

const props = defineProps<{
  users: {
    id: string;
    name: string;
    username?: string;
    pfp: string;
    status: string;
    customStatus?: string;
    isGuest?: boolean;
    isDiscordShadow?: boolean;
    /** Higher = newer Echo account (`auth_users.signup_ordinal`). */
    signupOrdinal?: number;
  }[];
  currentUserId: string;
  friendIds: string[];
  friendRequestsIncoming: { id: string; fromUserId: string }[];
  friendRequestsOutgoing: { id: string; toUserId: string }[];
  selectedUserId: string | null;
  echoPeerByChannelId?: ReadonlyMap<string, string>;
  messages?: Record<string, RawMessage[]>;
}>();

const emit = defineEmits<{
  'select-dm': [userId: string];
  'accept-friend-request': [requestId: string];
  'decline-friend-request': [requestId: string];
  'cancel-friend-request': [requestId: string];
  'send-friend-request': [toUserId: string];
  /** Opens expanded member profile (same as DM header profile). */
  'open-expanded-profile': [userId: string];
  /** Mobile: return to DM Messages tab (same rail hub). */
  'back-to-messages': [];
}>();

const activeTab = ref<FriendsTab>('all');
const friendSearchQuery = ref('');
const addFriendQuery = ref('');

const echoPeerByChannelId = computed(
  () => props.echoPeerByChannelId ?? new Map<string, string>(),
);
const { peerUserSubtitle } = useDmConversationSubtitle({
  currentUserId: () => props.currentUserId,
  echoPeerByChannelId,
  messages: () => props.messages ?? {},
  resolveAuthorName: (userId) =>
    props.users.find((u) => u.id === userId)?.name ?? 'Someone',
});

function friendRowSubtitleText(user: { id: string }): string {
  return peerUserSubtitle(user.id).text;
}

function friendRowSubtitleIsTyping(user: { id: string }): boolean {
  return peerUserSubtitle(user.id).isTyping;
}

const friendSearchQueryNormalized = computed(() =>
  friendSearchQuery.value.trim().toLowerCase(),
);

const friendUsers = computed(() => {
  const set = new Set(props.friendIds);
  return props.users
    .filter((u) => u.id !== props.currentUserId && set.has(u.id))
    .sort((a, b) => {
      return (
        selectPresence({
          rowStatus: a.status,
          diagnosticsKey: `friends:${a.id}`,
        }).sortOrder -
        selectPresence({
          rowStatus: b.status,
          diagnosticsKey: `friends:${b.id}`,
        }).sortOrder
      );
    });
});

const incomingWithUser = computed(() =>
  props.friendRequestsIncoming
    .map((req) => {
      const user = props.users.find((u) => u.id === req.fromUserId);
      return user ? { ...req, user } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null),
);

const outgoingWithUser = computed(() =>
  props.friendRequestsOutgoing
    .map((req) => {
      const user = props.users.find((u) => u.id === req.toUserId);
      return user ? { ...req, user } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null),
);

const addableUsers = computed(() => {
  const q = addFriendQuery.value.trim().toLowerCase();
  return props.users
    .filter((u) => {
      if (u.id === props.currentUserId) return false;
      if (u.isGuest) return false;
      if (u.isDiscordShadow) return false;
      if (q && !echoUserMatchesSearchQuery(u, q)) return false;
      const ui = selectFriendshipUiState({
        viewerUserId: props.currentUserId,
        targetUserId: u.id,
        friendshipKnown: true,
        guestFriendsLocked: false,
        targetIsDiscordShadow: !!u.isDiscordShadow,
        blockedUserIds: [],
        friendIds: props.friendIds,
        friendRequestsIncoming: props.friendRequestsIncoming,
        friendRequestsOutgoing: props.friendRequestsOutgoing,
      });
      return ui.kind === 'none';
    })
    .sort((a, b) => {
      const aOrd =
        typeof a.signupOrdinal === 'number' && Number.isFinite(a.signupOrdinal)
          ? a.signupOrdinal
          : -1;
      const bOrd =
        typeof b.signupOrdinal === 'number' && Number.isFinite(b.signupOrdinal)
          ? b.signupOrdinal
          : -1;
      if (aOrd !== bOrd) return bOrd - aOrd;

      return a.name.localeCompare(b.name);
    })
    .slice(0, 30);
});

const pendingCount = computed(
  () =>
    props.friendRequestsIncoming.length + props.friendRequestsOutgoing.length,
);

const onlineFriendCount = computed(
  () =>
    friendUsers.value.filter(
      (user) =>
        selectPresence({
          rowStatus: user.status,
          diagnosticsKey: `friends-online:${user.id}`,
        }).status === 'online',
    ).length,
);

const friendUsersFiltered = computed(() => {
  const q = friendSearchQueryNormalized.value;
  if (!q) return friendUsers.value;
  return friendUsers.value.filter((u) => echoUserMatchesSearchQuery(u, q));
});

const incomingFiltered = computed(() => {
  const q = friendSearchQueryNormalized.value;
  if (!q) return incomingWithUser.value;
  return incomingWithUser.value.filter((r) =>
    echoUserMatchesSearchQuery(r.user, q),
  );
});

const outgoingFiltered = computed(() => {
  const q = friendSearchQueryNormalized.value;
  if (!q) return outgoingWithUser.value;
  return outgoingWithUser.value.filter((r) =>
    echoUserMatchesSearchQuery(r.user, q),
  );
});

const onlineFriendsFiltered = computed(() =>
  friendUsersFiltered.value.filter(
    (u) =>
      selectPresence({
        rowStatus: u.status,
        diagnosticsKey: `friends-filter:${u.id}`,
      }).status === 'online',
  ),
);

function hasProfilePicture(pfp: string | undefined): boolean {
  return typeof pfp === 'string' && pfp.trim().length > 0;
}

function setActiveTab(tab: FriendsTab) {
  activeTab.value = tab;
  if (tab !== 'add') addFriendQuery.value = '';
}

function sendFriendRequestTo(userId: string) {
  emit('send-friend-request', userId);
}
</script>

<template>
  <div class="friends-view-root h-full min-h-0">
    <div class="friends-view flex h-full flex-col overflow-hidden">
      <div
        class="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-5 pt-0"
      >
        <div class="flex min-h-0 w-full flex-1 flex-col">
          <header
            class="friends-header sticky top-0 z-10 flex min-h-[3.25rem] w-full items-center px-4 py-2"
          >
            <div class="grid w-full grid-cols-[auto_1fr] items-center gap-3">
              <div class="flex shrink-0 items-center justify-start">
                <button
                  type="button"
                  class="flex h-9 w-9 items-center justify-center rounded-xl text-fg-soft transition-colors hover:bg-glass-2 hover:text-fg lg:hidden"
                  aria-label="Back to messages"
                  @click="emit('back-to-messages')"
                >
                  <img
                    :src="icons.arrowLeft"
                    alt=""
                    class="h-5 w-5 opacity-90 filter invert"
                  />
                </button>
              </div>

              <nav
                class="friends-tabs flex min-w-0 items-center justify-center gap-1 rounded-2xl p-1.5 backdrop-blur lg:gap-1 lg:rounded-xl lg:p-1"
              >
                <button
                  type="button"
                  class="friends-tab rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors lg:rounded-lg lg:px-3 lg:py-1.5 lg:text-[11px]"
                  :class="
                    activeTab === 'all'
                      ? 'friends-tab--active'
                      : 'friends-tab--inactive'
                  "
                  @click="setActiveTab('all')"
                >
                  <span class="inline-flex items-center gap-2">
                    <img
                      :src="icons.usersAvatar"
                      alt=""
                      class="h-4 w-4 shrink-0 filter invert opacity-70 lg:h-3.5 lg:w-3.5"
                    />
                    <span>All</span>
                  </span>
                </button>
                <button
                  type="button"
                  class="friends-tab rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors lg:rounded-lg lg:px-3 lg:py-1.5 lg:text-[11px]"
                  :class="
                    activeTab === 'online'
                      ? 'friends-tab--active'
                      : 'friends-tab--inactive'
                  "
                  @click="setActiveTab('online')"
                >
                  <span class="inline-flex items-center gap-2">
                    <svg
                      class="h-4 w-4 shrink-0 filter invert opacity-70 lg:h-3.5 lg:w-3.5"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        fill="currentColor"
                        d="M12 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm-4.2-3.1-1.4-1.4C8.8 11.2 10.3 10 12 10s3.2 1.2 4.2 2.5L14.8 14c-.7-.8-1.7-1.4-2.8-1.4s-2.1.6-2.8 1.4zM4.9 9.5 3.5 8.1C5.6 6 8.7 4.5 12 4.5s6.4 1.5 8.5 3.6l-1.4 1.4C17.5 7.8 14.9 6.5 12 6.5S6.5 7.8 4.9 9.5zm2.8 2.8-1.4-1.4C8 9.6 9.9 8.5 12 8.5s4 1.1 5.7 2.8l-1.4 1.4C15.1 11.5 13.6 10.5 12 10.5s-3.1 1-4.3 2.3z"
                      />
                    </svg>
                    <span>Online</span>
                  </span>
                  <span
                    v-if="onlineFriendCount > 0"
                    class="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-glass-2 px-1.5 text-[10px] font-bold text-foreground lg:h-4 lg:min-w-4"
                  >
                    {{ onlineFriendCount }}
                  </span>
                </button>
                <button
                  type="button"
                  class="friends-tab rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors lg:rounded-lg lg:px-3 lg:py-1.5 lg:text-[11px]"
                  :class="
                    activeTab === 'pending'
                      ? 'friends-tab--active'
                      : 'friends-tab--inactive'
                  "
                  @click="setActiveTab('pending')"
                >
                  <span class="inline-flex items-center gap-2">
                    <img
                      :src="icons.friendAdd"
                      alt=""
                      class="h-4 w-4 shrink-0 filter invert opacity-70 lg:h-3.5 lg:w-3.5"
                    />
                    <span>Pending</span>
                  </span>
                  <span
                    v-if="pendingCount > 0"
                    class="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-glass-2 px-1.5 text-[10px] font-bold text-foreground lg:h-4 lg:min-w-4"
                  >
                    {{ pendingCount }}
                  </span>
                </button>

                <button
                  type="button"
                  class="friends-tab friends-tab--add inline-flex min-w-0 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors lg:min-w-0 lg:px-3 lg:py-1.5 lg:text-[11px]"
                  :class="
                    activeTab === 'add'
                      ? 'friends-tab--active friends-tab--add-active'
                      : 'friends-tab--inactive friends-tab--add-idle'
                  "
                  title="Add friend"
                  aria-label="Add friend"
                  @click="setActiveTab('add')"
                >
                  <img
                    :src="icons.friendAdd"
                    alt=""
                    class="friend-add-icon--blue h-4 w-4 shrink-0 opacity-90 lg:h-3.5 lg:w-3.5"
                  />
                  <span class="truncate">Add friend</span>
                </button>
              </nav>
            </div>
          </header>

          <div class="flex min-h-0 w-full flex-1 items-stretch">
            <div class="flex min-h-0 min-w-0 flex-1 flex-col space-y-0">
              <section class="space-y-3 pt-0">
                <template v-if="activeTab === 'all'">
                  <div
                    v-if="
                      friendUsersFiltered.length === 0 &&
                      incomingFiltered.length === 0 &&
                      outgoingFiltered.length === 0
                    "
                    class="py-10 text-center text-xs text-fg-soft"
                  >
                    No friends or requests match your search.
                  </div>
                  <template v-else>
                    <div v-if="incomingFiltered.length > 0">
                      <div
                        v-for="req in incomingFiltered"
                        :key="req.id"
                        class="friend-row flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left transition-colors hover:bg-glass-2"
                      >
                        <button
                          type="button"
                          class="flex min-w-0 flex-1 cursor-pointer items-center gap-4 rounded-lg text-left outline-none transition-colors hover:bg-glass-1/80 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
                          :aria-label="`View profile for ${req.user.name}`"
                          @click="emit('open-expanded-profile', req.user.id)"
                        >
                          <div
                            class="relative h-12 w-12 shrink-0 overflow-hidden rounded-full"
                          >
                            <PausedGifAvatar
                              :src="safeImageUrl(req.user.pfp)"
                              :alt="req.user.name"
                              :session-key="req.user.id"
                              img-class="rounded-full object-cover"
                            />
                          </div>
                          <div class="min-w-0">
                            <div class="flex items-center gap-2">
                              <div
                                class="truncate text-sm font-medium text-foreground"
                              >
                                {{ req.user.name }}
                              </div>
                              <span
                                class="rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-medium text-green-300"
                              >
                                Incoming
                              </span>
                            </div>
                            <div class="mt-0.5 text-xs text-fg-soft">
                              Wants to be your friend
                            </div>
                          </div>
                        </button>
                        <div class="flex shrink-0 gap-2">
                          <button
                            type="button"
                            class="rounded-lg bg-green-600/80 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-600"
                            @click.stop="emit('accept-friend-request', req.id)"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            class="rounded-lg bg-glass-2 px-4 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-glass-3"
                            @click.stop="emit('decline-friend-request', req.id)"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    </div>

                    <div v-if="outgoingFiltered.length > 0">
                      <div
                        v-for="req in outgoingFiltered"
                        :key="req.id"
                        class="friend-row flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left transition-colors hover:bg-glass-2"
                      >
                        <button
                          type="button"
                          class="flex min-w-0 flex-1 cursor-pointer items-center gap-4 rounded-lg text-left outline-none transition-colors hover:bg-glass-1/80 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
                          :aria-label="`View profile for ${req.user.name}`"
                          @click="emit('open-expanded-profile', req.user.id)"
                        >
                          <div
                            class="relative h-12 w-12 shrink-0 overflow-hidden rounded-full"
                          >
                            <PausedGifAvatar
                              :src="safeImageUrl(req.user.pfp)"
                              :alt="req.user.name"
                              :session-key="req.user.id"
                              img-class="rounded-full object-cover"
                            />
                          </div>
                          <div class="min-w-0">
                            <div class="flex items-center gap-2">
                              <div
                                class="truncate text-sm font-medium text-foreground"
                              >
                                {{ req.user.name }}
                              </div>
                              <span
                                class="rounded-full bg-glass-2 px-2 py-0.5 text-[11px] font-medium text-fg-soft"
                              >
                                Outgoing
                              </span>
                            </div>
                            <div class="mt-0.5 text-xs text-fg-soft">
                              Awaiting their response
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          class="shrink-0 rounded-lg bg-glass-2 px-4 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-glass-3"
                          @click.stop="emit('cancel-friend-request', req.id)"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>

                    <div
                      v-for="user in friendUsersFiltered"
                      :key="user.id"
                      class="friend-row flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left transition-colors hover:bg-glass-2"
                      :class="selectedUserId === user.id ? 'bg-glass-2' : ''"
                    >
                      <button
                        type="button"
                        class="flex min-w-0 flex-1 cursor-pointer items-center gap-4 rounded-lg text-left outline-none transition-colors hover:bg-glass-1/80 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
                        :aria-label="`View profile for ${user.name}`"
                        @click="emit('open-expanded-profile', user.id)"
                      >
                        <div class="relative h-12 w-12 shrink-0">
                          <div
                            class="h-full w-full overflow-hidden rounded-full"
                          >
                            <PausedGifAvatar
                              :src="safeImageUrl(user.pfp)"
                              :alt="user.name"
                              :session-key="user.id"
                              img-class="rounded-full object-cover"
                            />
                          </div>
                          <span
                            v-if="
                              selectPresence({ rowStatus: user.status })
                                .status === 'online'
                            "
                            class="pointer-events-none absolute bottom-0 right-0 z-[1] h-3 w-3 rounded-full border-2 border-[var(--echo-dm-chrome-bg)] bg-green-500"
                          />
                        </div>
                        <div class="min-w-0 flex-1">
                          <span
                            class="text-sm font-medium"
                            :class="
                              selectPresence({ rowStatus: user.status })
                                .isOffline
                                ? 'text-fg-subtle'
                                : 'text-foreground'
                            "
                            >{{ user.name }}</span
                          >
                          <div
                            v-if="friendRowSubtitleText(user)"
                            class="truncate text-xs text-fg-soft"
                            :class="{
                              'italic text-[color-mix(in_srgb,var(--accent)_72%,var(--fg-soft))]':
                                friendRowSubtitleIsTyping(user),
                            }"
                          >
                            {{ friendRowSubtitleText(user) }}
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        class="shrink-0 rounded-lg p-2 transition-colors hover:bg-glass-3 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
                        :aria-label="`Message ${user.name}`"
                        @click="emit('select-dm', user.id)"
                      >
                        <img
                          :src="icons.message"
                          alt=""
                          class="h-5 w-5 filter invert opacity-50"
                        />
                      </button>
                    </div>
                  </template>
                </template>

                <template v-else-if="activeTab === 'online'">
                  <div
                    v-if="onlineFriendsFiltered.length === 0"
                    class="py-10 text-center text-xs text-fg-soft"
                  >
                    No online friends match your search.
                  </div>
                  <div
                    v-for="user in onlineFriendsFiltered"
                    :key="user.id"
                    class="friend-row flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left transition-colors hover:bg-glass-2"
                    :class="selectedUserId === user.id ? 'bg-glass-2' : ''"
                  >
                    <button
                      type="button"
                      class="flex min-w-0 flex-1 cursor-pointer items-center gap-4 rounded-lg text-left outline-none transition-colors hover:bg-glass-1/80 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
                      :aria-label="`View profile for ${user.name}`"
                      @click="emit('open-expanded-profile', user.id)"
                    >
                      <div class="relative h-12 w-12 shrink-0">
                        <div class="h-full w-full overflow-hidden rounded-full">
                          <PausedGifAvatar
                            :src="safeImageUrl(user.pfp)"
                            :alt="user.name"
                            :session-key="user.id"
                            img-class="rounded-full object-cover"
                          />
                        </div>
                        <span
                          v-if="
                            selectPresence({ rowStatus: user.status })
                              .status === 'online'
                          "
                          class="pointer-events-none absolute bottom-0 right-0 z-[1] h-3 w-3 rounded-full border-2 border-[var(--echo-dm-chrome-bg)] bg-green-500"
                        />
                      </div>
                      <div class="min-w-0 flex-1">
                        <span class="text-sm font-medium text-foreground">{{
                          user.name
                        }}</span>
                        <div
                          v-if="friendRowSubtitleText(user)"
                          class="truncate text-xs text-fg-soft"
                          :class="{
                            'italic text-[color-mix(in_srgb,var(--accent)_72%,var(--fg-soft))]':
                              friendRowSubtitleIsTyping(user),
                          }"
                        >
                          {{ friendRowSubtitleText(user) }}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      class="shrink-0 rounded-lg p-2 transition-colors hover:bg-glass-3 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
                      :aria-label="`Message ${user.name}`"
                      @click="emit('select-dm', user.id)"
                    >
                      <img
                        :src="icons.message"
                        alt=""
                        class="h-5 w-5 filter invert opacity-50"
                      />
                    </button>
                  </div>
                </template>

                <template v-else-if="activeTab === 'pending'">
                  <div
                    v-if="
                      incomingFiltered.length === 0 &&
                      outgoingFiltered.length === 0
                    "
                    class="py-10 text-center text-xs text-fg-soft"
                  >
                    No pending requests match your search.
                  </div>

                  <div v-if="incomingFiltered.length > 0">
                    <div
                      v-for="req in incomingFiltered"
                      :key="req.id"
                      class="friend-row flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left transition-colors hover:bg-glass-2"
                    >
                      <button
                        type="button"
                        class="flex min-w-0 flex-1 cursor-pointer items-center gap-4 rounded-lg text-left outline-none transition-colors hover:bg-glass-1/80 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
                        :aria-label="`View profile for ${req.user.name}`"
                        @click="emit('open-expanded-profile', req.user.id)"
                      >
                        <div
                          class="relative h-12 w-12 shrink-0 overflow-hidden rounded-full"
                        >
                          <PausedGifAvatar
                            :src="safeImageUrl(req.user.pfp)"
                            :alt="req.user.name"
                            :session-key="req.user.id"
                            img-class="rounded-full object-cover"
                          />
                        </div>
                        <div class="min-w-0">
                          <div class="flex items-center gap-2">
                            <div
                              class="truncate text-sm font-medium text-foreground"
                            >
                              {{ req.user.name }}
                            </div>
                            <span
                              class="rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-medium text-green-300"
                            >
                              Incoming
                            </span>
                          </div>
                          <div class="mt-0.5 text-xs text-fg-soft">
                            Wants to be your friend
                          </div>
                        </div>
                      </button>
                      <div class="flex shrink-0 gap-2">
                        <button
                          type="button"
                          class="rounded-lg bg-green-600/80 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-600"
                          @click.stop="emit('accept-friend-request', req.id)"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          class="rounded-lg bg-glass-2 px-4 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-glass-3"
                          @click.stop="emit('decline-friend-request', req.id)"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  </div>

                  <div v-if="outgoingFiltered.length > 0">
                    <div
                      v-for="req in outgoingFiltered"
                      :key="req.id"
                      class="friend-row flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left transition-colors hover:bg-glass-2"
                    >
                      <button
                        type="button"
                        class="flex min-w-0 flex-1 cursor-pointer items-center gap-4 rounded-lg text-left outline-none transition-colors hover:bg-glass-1/80 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
                        :aria-label="`View profile for ${req.user.name}`"
                        @click="emit('open-expanded-profile', req.user.id)"
                      >
                        <div
                          class="relative h-12 w-12 shrink-0 overflow-hidden rounded-full"
                        >
                          <PausedGifAvatar
                            :src="safeImageUrl(req.user.pfp)"
                            :alt="req.user.name"
                            :session-key="req.user.id"
                            img-class="rounded-full object-cover"
                          />
                        </div>
                        <div class="min-w-0">
                          <div class="flex items-center gap-2">
                            <div
                              class="truncate text-sm font-medium text-foreground"
                            >
                              {{ req.user.name }}
                            </div>
                            <span
                              class="rounded-full bg-glass-2 px-2 py-0.5 text-[11px] font-medium text-fg-soft"
                            >
                              Outgoing
                            </span>
                          </div>
                          <div class="mt-0.5 text-xs text-fg-soft">
                            Awaiting their response
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        class="shrink-0 rounded-lg bg-glass-2 px-4 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-glass-3"
                        @click.stop="emit('cancel-friend-request', req.id)"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </template>

                <template v-else-if="activeTab === 'add'">
                  <section
                    class="friends-add-panel rounded-2xl px-3 py-4 sm:px-4"
                  >
                    <div
                      class="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between"
                    >
                      <div class="min-w-0">
                        <h2 class="text-lg font-semibold text-foreground">
                          Add friend
                        </h2>
                        <p class="mt-1 text-sm leading-relaxed text-fg-soft">
                          Suggestions are the newest Echo sign-ups. Search by
                          display name or username to find someone specific.
                        </p>
                      </div>

                      <div
                        class="friends-search relative w-full sm:max-w-[280px]"
                      >
                        <img
                          :src="icons.search"
                          alt=""
                          class="echo-ink-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-55"
                        />
                        <input
                          v-model="addFriendQuery"
                          type="text"
                          placeholder="Search by name or username"
                          class="w-full rounded-lg border border-border bg-glass-1 py-2 pl-9 pr-3 text-sm text-fg placeholder:text-fg-subtle outline-none transition-colors"
                        />
                      </div>
                    </div>

                    <div class="mt-4 flex flex-col gap-2">
                      <div
                        v-if="addableUsers.length === 0"
                        class="py-10 text-center text-xs text-fg-soft"
                      >
                        No Echo users match your search.
                      </div>

                      <div
                        v-for="user in addableUsers"
                        :key="user.id"
                        class="friend-row flex items-center justify-between gap-4 rounded-xl bg-scrim-1 px-4 py-3"
                      >
                        <button
                          type="button"
                          class="flex min-w-0 flex-1 cursor-pointer items-center gap-4 rounded-lg text-left outline-none transition-colors hover:bg-glass-1/80 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
                          :aria-label="`View profile for ${user.name}`"
                          @click="emit('open-expanded-profile', user.id)"
                        >
                          <div
                            class="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-glass-1"
                          >
                            <PausedGifAvatar
                              v-if="hasProfilePicture(user.pfp)"
                              :src="safeImageUrl(user.pfp)"
                              :alt="user.name"
                              :session-key="user.id"
                              img-class="rounded-full object-cover"
                            />
                            <div
                              v-else
                              class="flex h-full w-full items-center justify-center rounded-full border border-dashed border-border bg-glass-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-fg-subtle"
                            >
                              No profile
                            </div>
                          </div>

                          <div class="min-w-0">
                            <div class="flex flex-wrap items-center gap-2">
                              <div
                                class="truncate text-sm font-semibold text-foreground"
                              >
                                {{ user.name }}
                              </div>
                              <span
                                v-if="!hasProfilePicture(user.pfp)"
                                class="rounded-full bg-glass-1 px-2 py-0.5 text-[11px] font-medium text-fg-soft"
                              >
                                No profile
                              </span>
                            </div>
                          </div>
                        </button>

                        <button
                          type="button"
                          class="shrink-0 rounded-md bg-blue-600/90 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
                          @click="sendFriendRequestTo(user.id)"
                        >
                          Send request
                        </button>
                      </div>
                    </div>
                  </section>
                </template>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.friends-view-root,
.friends-view {
  background: var(--echo-chat-view-bg);
}

.friend-row {
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
}

.friends-header {
  position: relative;
  isolation: isolate;
  background: var(--echo-chat-view-bg);
}

.friends-add-panel {
  position: relative;
  isolation: isolate;
  background: var(--echo-chat-view-bg);
}

.friends-tab--active {
  color: var(--vue-auto-025);
  background: var(--vue-auto-003);
}

.friends-tab--inactive {
  color: var(--vue-auto-033);
  background: transparent;
}

.friend-add-icon--blue {
  filter: invert(35%) sepia(92%) saturate(1450%) hue-rotate(195deg)
    brightness(95%) contrast(95%);
}

.friends-tab--inactive:hover {
  color: var(--vue-auto-009);
  background: var(--vue-auto-002);
}

.friends-tab--add-idle {
  color: color-mix(in srgb, var(--vue-auto-009) 88%, #60a5fa);
}

.friends-tab--add-active {
  color: #bfdbfe;
  background: color-mix(in srgb, #3b82f6 22%, transparent);
}

:global([data-theme='light']) .friends-tab--add-active {
  color: #1d4ed8;
  background: color-mix(in srgb, #3b82f6 12%, var(--vue-auto-003));
}
</style>

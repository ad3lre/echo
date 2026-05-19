<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
  inject,
} from 'vue';
import StatusIndicator from '@/components/StatusIndicator.vue';
import { safeImageUrl } from '@/utils/safeImageUrl';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { serverGuildIconDisplayUrl } from '@/utils/serverGuildIconDisplayUrl';
import ProfileBannerMedia from '@/components/ProfileBannerMedia.vue';
import { icons } from '@/assets/icons';
import { profileBannerRefractionBackdropStyle } from '@/utils/profileBannerGradientFromImage';
import UserProfileMoreMenu from '@/components/UserProfileMoreMenu.vue';
import ProfileUserBadges from '@/components/member-profile/ProfileUserBadges.vue';
import ProfileFriendHeartBadge from '@/components/member-profile/ProfileFriendHeartBadge.vue';
import ProfileMemberSinceInline from '@/components/member-profile/ProfileMemberSinceInline.vue';
import ProfileVoiceActivityWidget from '@/components/member-profile/ProfileVoiceActivityWidget.vue';
import ProfileBioText from '@/components/member-profile/ProfileBioText.vue';
import ProfileCustomStatusThoughtBubble from '@/components/ProfileCustomStatusThoughtBubble.vue';
import { useUserVoiceChannelPresenceForProfile } from '@/composables/useUserVoiceChannelPresenceForProfile';
import type { ExpandedProfile } from '@/utils/memberProfiles';
import type { UserVoiceChannelPresence } from '@/utils/userVoiceChannelPresence';
import { selectPresence } from '@/services/domain/presence';
import { selectFriendshipUiState } from '@/services/domain/friendshipUi';
import {
  LAYOUT_LEFT_CHROME_KEY,
  type LayoutLeftChromeContext,
} from '@/features/layout/layoutInjectionKeys';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    profile: ExpandedProfile | null;
    isFriend?: boolean;
    note: string;
    currentUserId?: string;
    isTargetBlocked?: boolean;
    /** Viewer is a guest (Echo): cannot use Friends; hides add/remove friend. */
    guestFriendsLocked?: boolean;
    hasOutgoingFriendRequest?: boolean;
    hasIncomingFriendRequest?: boolean;
    /** When false, friendship state is not yet authoritative (avoid showing wrong actions). */
    friendshipKnown?: boolean;
    presenceByUserId?: Record<string, string | undefined>;
    presenceMobileByUserId?: Record<string, true>;
    friendIds?: string[];
    friendRequestsIncoming?: { fromUserId: string }[];
    friendRequestsOutgoing?: { toUserId: string }[];
    blockedUserIds?: string[];
    /** Echo mutual-friends map; viewer row is merged with `friendIds` for friendship UI. */
    friendIdsByUserId?: Record<string, string[]>;
  }>(),
  {
    isFriend: false,
    isTargetBlocked: false,
    guestFriendsLocked: false,
    hasOutgoingFriendRequest: false,
    hasIncomingFriendRequest: false,
    friendshipKnown: false,
    friendIds: () => [],
    friendRequestsIncoming: () => [],
    friendRequestsOutgoing: () => [],
    blockedUserIds: () => [],
    friendIdsByUserId: () => ({}),
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'update:note': [value: string];
  'open-server': [serverId: string];
  'open-profile': [userId: string];
  /** DM inline overview → large `ExpandedProfileModal` for the same user. */
  'expand-to-full-modal': [];
  'open-dm': [userId: string];
  'send-friend-request': [userId: string];
  'cancel-outgoing-friend-request': [userId: string];
  'accept-incoming-friend-request': [userId: string];
  'decline-incoming-friend-request': [userId: string];
  'remove-friend': [userId: string];
  'block-user': [userId: string];
  'unblock-user': [userId: string];
  'report-user': [payload: { userId: string; reason: string }];
}>();

type TabId = 'mutual-servers' | 'mutual-friends';
const activeTab = ref<TabId>('mutual-servers');

const tabs: { id: TabId; label: string }[] = [
  { id: 'mutual-servers', label: 'Mutual Servers' },
  { id: 'mutual-friends', label: 'Mutual Friends' },
];

const layoutLeft = inject<LayoutLeftChromeContext | null>(
  LAYOUT_LEFT_CHROME_KEY,
  null,
);

function expandedPresenceForPeer(
  userId: string | undefined,
  rowStatus?: string,
) {
  const liveStatus =
    userId && props.presenceByUserId
      ? props.presenceByUserId[userId]
      : undefined;
  return selectPresence({
    authoritativeStatus: liveStatus,
    rowStatus,
    diagnosticsKey: `dm-profile-peer:${userId ?? '?'}`,
    mobileSurface: !!userId && !!props.presenceMobileByUserId?.[userId],
  });
}

const expandedMainPresence = computed(() => {
  const p = props.profile;
  if (!p) {
    return selectPresence({
      rowStatus: undefined,
      diagnosticsKey: 'dm-profile:none',
    });
  }
  return expandedPresenceForPeer(p.id, p.status);
});

const voiceActivities = useUserVoiceChannelPresenceForProfile(
  () => props.profile?.id,
);

const showFriendAction = computed(() => {
  const p = props.profile;
  if (!p) return false;
  if (p.isGuest) return false;
  if (props.guestFriendsLocked) return false;
  if (!props.currentUserId) return true;
  return p.id !== props.currentUserId;
});

const showProfileMoreMenuTrigger = computed(() => {
  const p = props.profile;
  if (!p) return false;
  if (!props.currentUserId) return true;
  return p.id.trim() !== props.currentUserId.trim();
});

const bannerRefractionStyle = computed(() => {
  const p = props.profile;
  if (!p?.bannerRefractionEnabled) return {};
  return profileBannerRefractionBackdropStyle(
    p.bannerColor,
    p.bannerImage,
    p.bannerPositionY,
  );
});

const canJoinVoiceActivity = computed(
  () => !!layoutLeft?.onDmPanelJoinGuildVoiceActivity,
);

const draftNote = ref('');

watch(
  () => props.note,
  (value) => {
    draftNote.value = value ?? '';
  },
  { immediate: true },
);

watch(draftNote, () => nextTick(() => resizeNoteInput()));

let firstTabEl: HTMLElement | null = null;

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return;
    activeTab.value = 'mutual-servers';
    await nextTick();
    firstTabEl?.focus();
  },
);

function setFirstTabRef(el: unknown) {
  firstTabEl = el instanceof HTMLElement ? el : null;
}

function close() {
  commitNote();
  emit('update:modelValue', false);
}

function handleVoiceActivityJoin(activity: UserVoiceChannelPresence) {
  const joinHost = layoutLeft?.onDmPanelJoinGuildVoiceActivity;
  if (!joinHost) return;
  close();
  joinHost({
    serverId: activity.serverId,
    channelId: activity.channelId,
    channelName: activity.channelName,
  });
}

function handleAddFriendClick() {
  if (!props.profile) return;
  const ui = friendshipUi.value;
  if (!ui.primaryEnabled) return;
  if (ui.primaryIntent === 'send_request') {
    emit('send-friend-request', props.profile.id);
    return;
  }
  if (ui.primaryIntent === 'cancel_outgoing') {
    emit('cancel-outgoing-friend-request', props.profile.id);
    return;
  }
  if (ui.primaryIntent === 'accept_incoming') {
    emit('accept-incoming-friend-request', props.profile.id);
    return;
  }
}

function handleDeclineFriendClick() {
  if (!props.profile) return;
  const ui = friendshipUi.value;
  if (ui.kind !== 'incoming_request') return;
  emit('decline-incoming-friend-request', props.profile.id);
}

const friendshipUi = computed(() => {
  const p = props.profile;
  if (!p) {
    return selectFriendshipUiState({
      viewerUserId: props.currentUserId,
      targetUserId: '',
      friendshipKnown: false,
      guestFriendsLocked: true,
      targetIsDiscordShadow: false,
      blockedUserIds: [],
      friendIds: [],
      friendRequestsIncoming: [],
      friendRequestsOutgoing: [],
    });
  }
  const viewer = props.currentUserId?.trim() ?? '';
  const fromMap =
    viewer && props.friendIdsByUserId
      ? (props.friendIdsByUserId[viewer] ?? [])
      : undefined;
  return selectFriendshipUiState({
    viewerUserId: props.currentUserId,
    targetUserId: p.id,
    friendshipKnown: !!props.friendshipKnown,
    guestFriendsLocked: !!props.guestFriendsLocked,
    targetIsDiscordShadow: !!p.isDiscordShadow,
    blockedUserIds: props.blockedUserIds ?? [],
    friendIds: props.friendIds ?? [],
    viewerFriendIdsFromMap: fromMap,
    friendRequestsIncoming: props.friendRequestsIncoming ?? [],
    friendRequestsOutgoing: props.friendRequestsOutgoing ?? [],
  });
});

const noteInputRef = ref<HTMLTextAreaElement | null>(null);

function resizeNoteInput(el?: HTMLTextAreaElement | null) {
  const ta = el ?? noteInputRef.value;
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = `${Math.max(24, Math.min(ta.scrollHeight, 160))}px`;
}

function commitNote() {
  emit('update:note', draftNote.value);
}

function emitProfileBlock() {
  const p = props.profile;
  if (!p) return;
  emit('block-user', p.id);
}

function emitProfileUnblock() {
  const p = props.profile;
  if (!p) return;
  emit('unblock-user', p.id);
}

function emitProfileReport(payload: { reason: string }) {
  const p = props.profile;
  if (!p) return;
  emit('report-user', { userId: p.id, reason: payload.reason });
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    close();
    return;
  }
  if (!props.profile) return;
  const idx = tabs.findIndex((t) => t.id === activeTab.value);
  if (e.key === 'ArrowLeft' && idx > 0) {
    activeTab.value = tabs[idx - 1]!.id;
    e.preventDefault();
  }
  if (e.key === 'ArrowRight' && idx < tabs.length - 1) {
    activeTab.value = tabs[idx + 1]!.id;
    e.preventDefault();
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <!-- Inline side panel (DMs) -->
  <article
    v-if="modelValue && profile"
    class="ep-modal ep-modal--panel"
    @click.stop
  >
    <!-- LEFT COLUMN: banner + profile overview -->
    <div class="ep-left">
      <!-- Banner -->
      <div class="ep-banner-stack">
        <div class="ep-banner">
          <ProfileBannerMedia
            v-if="profile.bannerImage"
            :banner-image="profile.bannerImage"
            :session-key="`${profile.id}-dm-banner`"
            :position-y="profile.bannerPositionY ?? 50"
            wrapper-class="absolute inset-0 z-0 overflow-hidden"
          />
          <div
            v-else
            class="ep-banner__bg absolute inset-0 z-0"
            :style="{ '--banner-bg': profile.bannerColor }"
          />
          <div
            v-if="profile.bannerBlurEnabled"
            class="pointer-events-none absolute inset-0 z-[1] echo-user-banner-blur"
            aria-hidden="true"
          />
          <div
            v-if="profile.bannerBlackoutEnabled"
            class="pointer-events-none absolute inset-0 z-[2] bg-scrim-2"
            aria-hidden="true"
          />
        </div>
      </div>

      <div class="ep-top-band ep-top-band--dm">
        <div
          class="ep-top-band__avatar ep-avatar-wrap--dm ep-avatar-wrap--static-pfp"
        >
          <button
            type="button"
            class="chat-focus-ring relative block h-full w-full shrink-0 overflow-hidden rounded-full outline-none"
            :aria-label="`Open full profile for ${profile.displayName}`"
            @click="emit('expand-to-full-modal')"
          >
            <PausedGifAvatar
              :src="safeImageUrl(profile.pfp)"
              :alt="profile.displayName"
              :session-key="profile.id"
              :static-only="false"
            />
          </button>
          <StatusIndicator
            :status="expandedMainPresence.indicatorStatus ?? 'offline'"
            :mobile-surface="expandedMainPresence.indicatorMobileSurface"
            size="lg"
            class="ep-avatar-status"
          />
        </div>
        <div v-if="profile.customStatus" class="ep-top-band__custom-status">
          <ProfileCustomStatusThoughtBubble :text="profile.customStatus" />
        </div>
      </div>

      <div class="ep-left-main">
        <div
          v-if="profile.bannerRefractionEnabled"
          class="ep-refraction"
          :style="bannerRefractionStyle"
        />
        <div class="ep-left-body custom-scrollbar">
          <div class="ep-name-block">
            <div class="ep-profile-head-row">
              <div class="ep-profile-head-row__primary">
                <div class="ep-name-heading flex min-w-0 items-center gap-2">
                  <h2 id="ep-title" class="ep-name min-w-0 flex-1 truncate">
                    {{ profile.displayName }}
                  </h2>
                  <div
                    v-if="
                      profile.badges?.length || friendshipUi.kind === 'friend'
                    "
                    class="flex shrink-0 items-center gap-1.5"
                  >
                    <ProfileUserBadges
                      v-if="profile.badges?.length"
                      :badges="profile.badges"
                      size="sm"
                      class="shrink-0"
                    />
                    <ProfileFriendHeartBadge
                      v-if="friendshipUi.kind === 'friend'"
                    />
                  </div>
                </div>
                <div class="ep-username-row">
                  <p class="ep-username">@{{ profile.username }}</p>
                </div>
              </div>
              <div
                v-if="
                  profile && (showFriendAction || showProfileMoreMenuTrigger)
                "
                class="ep-profile-head-row__actions"
              >
                <button
                  v-if="
                    showFriendAction &&
                    friendshipUi.kind !== 'friend' &&
                    !profile.isDiscordShadow
                  "
                  type="button"
                  class="ep-header-btn ep-header-btn-friend"
                  :class="[
                    friendshipUi.kind === 'unknown'
                      ? 'ep-header-btn-friend--unknown'
                      : friendshipUi.kind === 'outgoing_request'
                        ? 'ep-header-btn-friend--sent'
                        : 'ep-header-btn-friend--add',
                  ]"
                  :title="
                    friendshipUi.kind === 'unknown'
                      ? 'Checking friendship...'
                      : friendshipUi.kind === 'incoming_request'
                        ? 'Accept friend request'
                        : friendshipUi.kind === 'outgoing_request'
                          ? 'Pending friend request'
                          : 'Add friend'
                  "
                  :disabled="!friendshipUi.primaryEnabled"
                  @click="handleAddFriendClick"
                >
                  <img
                    :src="
                      friendshipUi.kind === 'unknown' ||
                      friendshipUi.kind === 'outgoing_request'
                        ? icons.stopwatch
                        : icons.friendAdd
                    "
                    alt=""
                    class="h-4 w-4 invert"
                  />
                  <span
                    v-if="friendshipUi.primaryLabel !== 'Add friend'"
                    class="text-[11px] font-semibold text-fg-subtle"
                  >
                    {{ friendshipUi.primaryLabel }}
                  </span>
                </button>
                <button
                  v-if="
                    showFriendAction &&
                    friendshipUi.showDecline &&
                    !profile.isDiscordShadow
                  "
                  type="button"
                  class="ep-header-btn ep-header-btn-decline"
                  title="Decline request"
                  @click="handleDeclineFriendClick"
                >
                  <span class="text-[11px] font-semibold text-fg-soft">
                    Decline
                  </span>
                </button>
                <UserProfileMoreMenu
                  v-if="showProfileMoreMenuTrigger"
                  :user-id="profile.id"
                  :mention-display-name="profile.displayName"
                  :is-blocked="!!isTargetBlocked"
                  :is-friend="friendshipUi.kind === 'friend'"
                  :can-send-friend-request="false"
                  :show-message-menu-item="false"
                  :show-quick-mention-in-menu="false"
                  :message-menu-item-disabled="true"
                  trigger-class="ep-header-btn ep-header-btn-icon-only ep-header-btn-more"
                  @block="emitProfileBlock"
                  @unblock="emitProfileUnblock"
                  @remove-friend="emit('remove-friend', profile.id)"
                  @send-friend-request="emit('send-friend-request', profile.id)"
                  @report="emitProfileReport"
                />
              </div>
            </div>
          </div>

          <ProfileVoiceActivityWidget
            v-if="voiceActivities.length"
            class="mt-3 w-full"
            :activities="voiceActivities"
            :joinable="canJoinVoiceActivity"
            @join="handleVoiceActivityJoin"
          />

          <!-- About + tabs -->
          <div class="mt-5 space-y-5">
            <div
              v-if="
                profile.bio?.trim() ||
                (profile.accountCreatedAt ?? profile.joinedAt)
              "
            >
              <template v-if="profile.bio?.trim()">
                <div class="ep-about-label">ABOUT ME</div>
                <ProfileBioText :text="profile.bio" body-class="ep-card-body" />
              </template>
              <ProfileMemberSinceInline
                v-if="profile.accountCreatedAt ?? profile.joinedAt"
                :class="profile.bio?.trim() ? 'mt-3' : ''"
                :date="profile.accountCreatedAt ?? profile.joinedAt ?? ''"
                :server-name="profile.serverName"
                :server-image-url="profile.serverImageUrl"
              />
            </div>

            <div>
              <div class="ep-about-label">NOTE</div>
              <textarea
                ref="noteInputRef"
                v-model="draftNote"
                class="ep-note-input custom-scrollbar"
                rows="1"
                maxlength="512"
                placeholder="+"
                @blur="commitNote"
                @input="resizeNoteInput($event.target as HTMLTextAreaElement)"
              />
            </div>

            <!-- Mutual tabs inline with overview -->
            <div>
              <div class="ep-tab-bar ep-tab-bar--inline">
                <button
                  v-for="(t, idx) in tabs"
                  :key="t.id"
                  :ref="idx === 0 ? setFirstTabRef : undefined"
                  type="button"
                  class="ep-tab"
                  :class="activeTab === t.id ? 'ep-tab--active' : ''"
                  :aria-selected="activeTab === t.id"
                  role="tab"
                  @click="activeTab = t.id"
                >
                  {{ t.label }}
                </button>
                <button
                  type="button"
                  class="ep-close"
                  aria-label="Close"
                  @click="close"
                >
                  <svg viewBox="0 0 24 24" class="h-4 w-4" aria-hidden="true">
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                    />
                  </svg>
                </button>
              </div>

              <div
                class="ep-tab-content ep-tab-content--inline custom-scrollbar"
              >
                <!-- Mutual Servers -->
                <div v-show="activeTab === 'mutual-servers'" role="tabpanel">
                  <p v-if="profile.mutualServers.length === 0" class="ep-empty">
                    No mutual servers
                  </p>
                  <ul v-else class="ep-server-list">
                    <li
                      v-for="server in profile.mutualServers"
                      :key="server.id"
                      class="ep-server-row"
                      @click="emit('open-server', server.id)"
                    >
                      <div class="ep-server-icon">
                        <PausedGifAvatar
                          :src="serverGuildIconDisplayUrl(server.imageUrl)"
                          :alt="server.name"
                          :session-key="`dm-srv-${server.id}`"
                          :static-only="false"
                          img-class="h-full w-full object-cover"
                        />
                      </div>
                      <span class="ep-server-name">{{ server.name }}</span>
                    </li>
                  </ul>
                </div>

                <!-- Mutual Friends -->
                <div v-show="activeTab === 'mutual-friends'" role="tabpanel">
                  <p v-if="profile.mutualFriends.length === 0" class="ep-empty">
                    No mutual friends
                  </p>
                  <ul v-else class="ep-friend-list">
                    <li
                      v-for="friend in profile.mutualFriends"
                      :key="friend.id"
                      class="ep-friend-row"
                      @click="emit('open-profile', friend.id)"
                    >
                      <div class="relative h-9 w-9 shrink-0">
                        <div class="h-full w-full overflow-hidden rounded-full">
                          <PausedGifAvatar
                            :src="safeImageUrl(friend.pfp)"
                            :alt="friend.displayName"
                            :session-key="friend.id"
                            :static-only="false"
                            img-class="rounded-full object-cover"
                          />
                        </div>
                        <StatusIndicator
                          :status="
                            expandedPresenceForPeer(friend.id, friend.status)
                              .indicatorStatus ?? 'offline'
                          "
                          :mobile-surface="
                            expandedPresenceForPeer(friend.id, friend.status)
                              .indicatorMobileSurface
                          "
                          size="sm"
                          class="absolute -right-0.5 -bottom-0.5 z-[1]"
                        />
                      </div>
                      <div class="min-w-0 flex-1">
                        <p
                          class="truncate text-[13px] font-semibold text-foreground"
                        >
                          {{ friend.displayName }}
                        </p>
                        <p class="text-[11px] text-fg-subtle">
                          @{{ friend.username }}
                        </p>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </article>
</template>

<style lang="scss">
@use './expandedProfileShared.scss';
</style>

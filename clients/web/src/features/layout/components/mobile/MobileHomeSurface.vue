<script setup lang="ts">
import { computed, defineAsyncComponent, inject, unref, watch } from 'vue';
import type { PopoutAnchorRect } from '@/features/member-profile/memberProfiles';
import { LAYOUT_LEFT_CHROME_KEY } from '@/features/layout/layoutInjectionKeys';
import MobileHomeProfileHeader from '@/features/layout/components/mobile/MobileHomeProfileHeader.vue';

const DMPanel = defineAsyncComponent(
  () => import('@/features/dm/components/DMPanel.vue'),
);

const props = defineProps<{
  stack: 'hub' | 'thread';
}>();

const emit = defineEmits<{
  'update:stack': [value: 'hub' | 'thread'];
}>();

const layoutLeft = inject(LAYOUT_LEFT_CHROME_KEY, null);
const lc = computed(() => layoutLeft ?? null);

const dmPanelOpen = computed(() => unref(lc.value?.dmPanelOpen) ?? true);
const dmActiveTab = computed(() => unref(lc.value?.dmActiveTab) ?? 'messages');

watch(
  () =>
    [
      unref(lc.value?.isDmUiContext) && unref(lc.value?.selectedDmUserId),
      unref(lc.value?.selectedGroupDmChannelId),
      unref(lc.value?.dmActiveTab),
      unref(lc.value?.selectedMessageRequestId),
    ] as const,
  ([inUserThread, groupChannelId, activeTab, messageRequestId]) => {
    if (
      inUserThread ||
      groupChannelId ||
      activeTab === 'friends' ||
      activeTab === 'notifications' ||
      messageRequestId
    ) {
      emit('update:stack', 'thread');
    }
  },
);

function onSelectDm(userId: string) {
  lc.value?.onDmSelectDm?.(userId);
  emit('update:stack', 'thread');
}

function onSelectGroup(groupId: string) {
  lc.value?.onDmSelectGroup?.(groupId);
  emit('update:stack', 'thread');
}

function onOpenProfile(userId: string, anchorRect: PopoutAnchorRect | null) {
  unref(lc.value?.openMemberProfile)?.(userId, anchorRect);
}

function onUpdateActiveTab(tab: 'messages' | 'friends' | 'notifications') {
  lc.value?.onDmUpdateActiveTab?.(tab);
  if (tab === 'friends' || tab === 'notifications') {
    emit('update:stack', 'thread');
  }
}
</script>

<template>
  <div
    class="mobile-home-surface flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
  >
    <template v-if="stack === 'hub'">
      <MobileHomeProfileHeader />
      <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        <section class="mobile-home-surface__messages pb-2">
          <DMPanel
            v-if="lc"
            class="min-h-0"
            :open="dmPanelOpen"
            phone-combined-hub
            :guest-friends-locked="unref(lc.guestFriendsLocked) ?? false"
            :active-tab="dmActiveTab"
            :users="unref(lc.usersForChannelPanel) ?? []"
            :dm-inbox-entries="unref(lc.dmInboxEntries) ?? []"
            :is-dm-inbox-user-favorite="unref(lc.isDmInboxUserFavorite)"
            :is-dm-inbox-group-favorite="unref(lc.isDmInboxGroupFavorite)"
            :current-user-id="unref(lc.currentUserId) ?? ''"
            :selected-user-id="unref(lc.selectedDmUserId) ?? null"
            :selected-group-dm-channel-id="
              unref(lc.selectedGroupDmChannelId) ?? null
            "
            :selected-message-request-id="
              unref(lc.selectedMessageRequestId) ?? null
            "
            :friend-ids="unref(lc.friendIds) ?? []"
            :message-requests="unref(lc.messageRequests) ?? []"
            :friend-requests-incoming="unref(lc.friendRequestsIncoming) ?? []"
            :friend-requests-outgoing="unref(lc.friendRequestsOutgoing) ?? []"
            :dm-mention-notifications="unref(lc.dmMentionNotifications) ?? []"
            :dm-notification-read-state-by-channel-id="
              unref(lc.dmNotificationReadStateByChannelId) ?? {}
            "
            :mention-notification-categories-by-server="
              unref(lc.mentionNotificationCategoriesByServer) ?? {}
            "
            :mention-notification-servers="
              unref(lc.mentionNotificationServers) ?? []
            "
            :is-persisted-echo-dm-thread="unref(lc.isPersistedEchoDmThread)"
            :dm-notifications-read-preset="unref(lc.dmNotificationsReadPreset)"
            :dm-notifications-source-key="unref(lc.dmNotificationsSourceKey)"
            :dm-call-with-user-id="unref(lc.dmCallWithUserId) ?? null"
            :dm-call-ringing="unref(lc.dmCallRinging) ?? false"
            :dm-call-ring-remote-vanishing="
              unref(lc.dmCallRingRemoteVanishing) ?? false
            "
            :phone-call-icon="unref(lc.phoneCallIcon)"
            :presence-by-user-id="unref(lc.presenceByUserId)"
            :presence-mobile-by-user-id="unref(lc.presenceMobileByUserId)"
            :guild-voice-activity-cards="
              unref(lc.guildVoiceActivityCards) ?? []
            "
            :guild-event-activity-cards="
              unref(lc.guildEventActivityCards) ?? []
            "
            :guild-voice-activity-current-voice-channel-id="
              unref(lc.guildVoiceActivityCurrentVoiceChannelId) ?? null
            "
            :show-guild-voice-connection-strip="false"
            @select-dm="onSelectDm"
            @select-dm-group="onSelectGroup"
            @select-message-request="lc.onDmSelectMessageRequest?.($event)"
            @open-profile="onOpenProfile"
            @mark-read="lc.onDmMarkRead?.($event)"
            @hide-from-dm-list="lc.onDmHideFromInbox?.($event)"
            @toggle-favorite-dm-inbox="lc.onDmToggleFavoriteInbox?.($event)"
            @join-guild-voice-activity="
              lc.onDmPanelJoinGuildVoiceActivity?.($event)
            "
            @open-guild-event-activity="lc.onOpenGuildEventChannel?.($event)"
            @request-upgrade="lc.onDmRequestUpgrade?.()"
            @update:active-tab="onUpdateActiveTab"
            @update:dm-notifications-read-preset="
              lc.onUpdateDmNotificationsReadPreset?.($event)
            "
            @update:dm-notifications-source-key="
              lc.onUpdateDmNotificationsSourceKey?.($event)
            "
          />
        </section>
      </div>
    </template>
    <div
      v-else
      class="main-content-area relative grid min-h-0 min-w-0 flex-1 overflow-hidden"
    >
      <slot name="thread" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.mobile-home-surface__messages {
  padding-inline: max(0.5rem, env(safe-area-inset-left, 0px))
    max(0.5rem, env(safe-area-inset-right, 0px));
}
</style>

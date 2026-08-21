<script setup lang="ts">
import { computed, inject, unref } from 'vue';
import ChannelPanel from '@/features/channel-panel/components/ChannelPanel.vue';
import { LAYOUT_LEFT_CHROME_KEY } from '@/features/layout/layoutInjectionKeys';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  'channel-selected': [];
}>();

const layoutLeft = inject(LAYOUT_LEFT_CHROME_KEY, null);
const lc = computed(() => layoutLeft ?? null);

const canManageThisChannel = computed(() =>
  unref(lc.value?.canManageThisChannel),
);

function callChromeHandler(
  run: (() => void) | undefined,
  unavailableMessage: string,
) {
  if (run) run();
  else dispatchAppToast(unavailableMessage, 'warning');
}

function onActiveChannelChange(id: string) {
  lc.value?.onChannelUpdateActiveId?.(id);
  emit('channel-selected');
  emit('close');
}

function fireChannelDeleteChannel(payload: { channelId: string }) {
  lc.value?.onChannelDeleteChannel?.(payload);
}

function fireChannelDeleteCategory(payload: { categoryId: string }) {
  lc.value?.onChannelDeleteCategory?.(payload);
}

function fireChannelInvite(payload?: {
  voiceChannelId: string;
  voiceChannelName?: string;
}) {
  callChromeHandler(
    lc.value?.onChannelInvite
      ? () => lc.value?.onChannelInvite?.(payload)
      : undefined,
    'Invite is unavailable. Refresh and try again.',
  );
}

function fireChannelOpenServerSettings() {
  callChromeHandler(
    lc.value?.onChannelOpenServerSettings
      ? () => lc.value?.onChannelOpenServerSettings?.()
      : undefined,
    'Server settings are unavailable. Refresh and try again.',
  );
}

function fireChannelOpenNotificationSettings() {
  callChromeHandler(
    lc.value?.onChannelOpenNotificationSettings
      ? () => lc.value?.onChannelOpenNotificationSettings?.()
      : undefined,
    'Notification settings are unavailable. Refresh and try again.',
  );
}

function fireChannelOpenVoiceAudioSettings() {
  callChromeHandler(
    lc.value?.onChannelOpenVoiceAudioSettings
      ? () => lc.value?.onChannelOpenVoiceAudioSettings?.()
      : undefined,
    'Voice settings are unavailable. Refresh and try again.',
  );
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && lc"
      class="mobile-channel-sheet fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label="Channels"
    >
      <button
        type="button"
        class="mobile-channel-sheet__backdrop absolute inset-0 bg-black/50"
        aria-label="Close channels"
        @click="emit('close')"
      />
      <aside
        class="mobile-channel-sheet__panel relative ml-auto flex h-full w-[min(20rem,88vw)] min-w-0 flex-col overflow-hidden border-l border-border bg-[var(--bg)] shadow-xl"
      >
        <div
          class="flex shrink-0 items-center justify-between border-b border-border px-4 py-3"
        >
          <h2 class="truncate text-base font-bold text-foreground">
            {{ unref(lc.selectedServer)?.name ?? 'Channels' }}
          </h2>
          <button
            type="button"
            class="rounded-lg px-2 py-1 text-sm font-semibold text-fg-soft hover:bg-glass-1 hover:text-foreground"
            @click="emit('close')"
          >
            Done
          </button>
        </div>
        <ChannelPanel
          class="min-h-0 flex-1"
          :show-voice-connection-panel="
            unref(lc.hideChannelPanelVoiceChrome) !== true
          "
          :loading="unref(lc.channelPanelLoading) ?? false"
          :channel-tree-loaded="unref(lc.channelTreeLoaded) ?? true"
          :selected-server="unref(lc.selectedServer)"
          :categories="unref(lc.categoriesForServer) ?? []"
          :users="unref(lc.usersForChannelPanel) ?? []"
          :active-channel-id="unref(lc.activeChannelId) ?? ''"
          :collapsed="false"
          :bubble-mode="unref(lc.channelPanelBubbleMode)"
          :current-user-id="unref(lc.currentUser)?.id"
          :current-user="unref(lc.currentUser)"
          :current-voice-channel-id="unref(lc.guildVoiceChannelId)"
          :current-voice-channel-name="unref(lc.guildVoiceChannelName) ?? ''"
          :focus-guild-voice-channel-in-sidebar="
            unref(lc.focusGuildVoiceChannelInSidebar)
          "
          :live-kit-state="unref(lc.liveKitState)"
          :live-kit-network-stats="unref(lc.liveKitNetworkStats)"
          :live-kit-room="unref(lc.liveKitRoom)"
          :get-remote-participant-volume="unref(lc.getRemoteParticipantVolume)"
          :set-remote-participant-volume="unref(lc.setRemoteParticipantVolume)"
          :vc-mic-input-level="unref(lc.vcMicInputLevel)"
          :on-switch-camera="unref(lc.onSwitchCamera)"
          :voice-session-participants="unref(lc.voiceSessionParticipants) ?? []"
          :get-vc-activity-presence="unref(lc.getVcActivityPresence)"
          :vc-activity-king-user-id="unref(lc.vcActivityKingUserId)"
          :on-open-profile="unref(lc.openMemberProfile)"
          :on-open-profile-from-context-menu="
            unref(lc.openProfileFromContextMenu)
          "
          :open-profile-user-id="unref(lc.activeMemberProfileId)"
          :vc-muted="unref(lc.guildVcMuted) ?? false"
          :vc-deafened="unref(lc.guildVcDeafened) ?? false"
          :vc-video="unref(lc.guildVcVideo) ?? false"
          :vc-screenshare="unref(lc.guildVcScreenshare) ?? false"
          :can-use-video="unref(lc.canUseVideo) ?? false"
          :can-join-voice="unref(lc.canJoinPreviewVoiceChannel)"
          :side-chat-collapsed="unref(lc.voiceSideChatCollapsed) ?? true"
          :can-create-channels="unref(lc.canCreateChannels) ?? false"
          :handle-channel-reorder="unref(lc.handleChannelReorder)"
          :handle-category-reorder="unref(lc.handleCategoryReorder)"
          :can-manage-this-channel="canManageThisChannel"
          :delete-channel-handler="fireChannelDeleteChannel"
          :delete-category-handler="fireChannelDeleteCategory"
          :resize-handlers="{
            onResizeStart: unref(lc.startChannelResize),
            onReset: unref(lc.resetChannelWidth),
          }"
          :channel-missed-activity-by-channel-id="
            unref(lc.channelMissedActivityByChannelId) ?? {}
          "
          :mobile-voice-channel-tap-opens-lobby="
            unref(lc.mobileVoiceChannelTapOpensLobby) ?? false
          "
          :voice-lobby-channel-id="unref(lc.voiceLobbyChannelId)"
          :show-server-settings-menu-item="
            unref(lc.showServerSettingsMenuItem) ?? false
          "
          :can-invite="unref(lc.canInviteToCurrentServer) ?? false"
          :can-moderate-user="unref(lc.canModerateMemberInServer)"
          :can-vc-moderate-member="unref(lc.canVcModerateMember)"
          :on-moderate-user="unref(lc.handleModerateUser)"
          :on-vc-moderate="unref(lc.handleVcModerate)"
          :on-message-user="unref(lc.selectDmUser)"
          @update:active-channel-id="onActiveChannelChange"
          @update:collapsed="lc.onChannelUpdateCollapsed?.($event)"
          @update:vc-muted="lc.onChannelUpdateVcMuted?.($event)"
          @update:vc-deafened="lc.onChannelUpdateVcDeafened?.($event)"
          @update:vc-video="lc.onChannelUpdateVcVideo?.($event)"
          @update:vc-screenshare="lc.onChannelUpdateVcScreenshare?.($event)"
          @join-voice="lc.onChannelJoinVoice?.($event)"
          @open-voice-lobby="lc.onChannelOpenVoiceLobby?.($event)"
          @leave-voice="lc.onChannelLeaveVoice?.()"
          @invite="fireChannelInvite"
          @open-server-settings="fireChannelOpenServerSettings"
          @toggle-side-chat="lc.onChannelToggleSideChat?.()"
          @open-create-channel="lc.onChannelOpenCreateChannel?.($event)"
          @open-create-category="lc.onChannelOpenCreateCategory?.()"
          @quick-create-submit="lc.onChannelQuickCreateSubmit?.($event)"
          @open-channel-settings="lc.onChannelOpenChannelSettings?.($event)"
          @open-category-settings="lc.onChannelOpenCategorySettings?.($event)"
          @delete-channel="fireChannelDeleteChannel"
          @delete-category="fireChannelDeleteCategory"
          @open-notification-settings="fireChannelOpenNotificationSettings"
          @open-voice-audio-settings="fireChannelOpenVoiceAudioSettings"
          @leave-server="lc.onChannelLeaveServer?.($event)"
          @mark-read="lc.onChannelMarkRead?.($event)"
          @guild-event-rsvp="lc.onGuildEventRsvp?.($event)"
          @open-guild-event-channel="lc.onOpenGuildEventChannel?.($event)"
          @open-guild-event-detail="lc.onOpenGuildEventDetail?.($event)"
        />
      </aside>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.mobile-channel-sheet__panel {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
</style>

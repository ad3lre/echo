<script setup lang="ts">
import { computed, ref } from 'vue';
import { icons } from '@/assets/icons';
import { serverGuildIconDisplayUrl } from '@/utils/serverGuildIconDisplayUrl';
import ServerBannerLimitedGif from '@/components/ServerBannerLimitedGif.vue';
import { useChannelPanelMenu } from '@/features/channel-panel/composables/useChannelPanelMenu';

const props = defineProps<{
  selectedServer: {
    id: string;
    name: string;
    imageUrl: string;
    bannerImageUrl?: string;
    bannerPositionY?: number;
    bannerBlurEnabled?: boolean;
    bannerBlackoutEnabled?: boolean;
  } | null;
  canInvite: boolean;
  showServerSettingsMenuItem: boolean;
  canCreateChannels: boolean;
  devModeIdsEnabled: boolean;
  canLeaveSelectedServer: boolean;
  serverNotificationBannerText: string;
}>();

const serverMenuRef = ref<HTMLElement | null>(null);
const { isServerMenuOpen, toggleServerMenu, closeServerMenu } =
  useChannelPanelMenu(serverMenuRef);

const emit = defineEmits<{
  invite: [payload?: { voiceChannelId: string; voiceChannelName?: string }];
  'open-server-settings': [];
  'open-create-channel': [categoryId: string | null];
  'open-create-category': [];
  'open-notification-settings': [];
  'copy-server-id': [];
  'leave-server': [serverId: string];
}>();

const isEcho = computed(() => props.selectedServer?.id === 'echo');
</script>

<template>
  <!-- z-index: whole header (incl. absolute menu) must stack above ChannelPanelList sibling -->
  <div v-if="selectedServer" class="relative z-[20] w-full min-w-0 shrink-0">
    <div ref="serverMenuRef" class="relative w-full">
      <div
        class="server-banner echo-dark-chrome relative flex h-32 w-full items-end px-4 pb-3"
      >
        <ServerBannerLimitedGif
          :key="selectedServer.id"
          :session-key="selectedServer.id"
          :image-url="
            selectedServer.bannerImageUrl ??
            serverGuildIconDisplayUrl(selectedServer.imageUrl)
          "
          :position-y="selectedServer.bannerPositionY ?? 50"
        />
        <div
          v-if="selectedServer.bannerBlurEnabled === true"
          class="pointer-events-none absolute inset-0 z-0 server-banner-blur"
        ></div>
        <div
          v-if="selectedServer.bannerBlackoutEnabled"
          class="pointer-events-none absolute inset-0 z-[1] bg-scrim-2"
        ></div>
        <div
          class="pointer-events-none absolute inset-0 z-[1] server-banner-shadow"
        ></div>
        <div
          class="relative z-[2] flex w-full min-w-0 items-center gap-1 pointer-events-auto"
        >
          <div class="server-banner-title min-w-0 flex-1 truncate">
            {{ selectedServer.name }}
          </div>
          <button
            v-if="!isEcho"
            type="button"
            class="server-menu-trigger ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-glass-hover"
            aria-label="Server options"
            title="Server options"
            aria-haspopup="menu"
            :aria-expanded="isServerMenuOpen"
            @click.stop="toggleServerMenu"
          >
            <img
              :src="icons.moreVertical"
              alt=""
              class="h-4 w-4 opacity-90 filter invert"
            />
          </button>
        </div>
      </div>
      <Transition name="server-menu">
        <div
          v-if="!isEcho && isServerMenuOpen"
          class="server-settings-menu mt-1 max-h-[min(70vh,22rem)] overflow-x-hidden overflow-y-auto rounded-xl py-2"
        >
          <button
            v-if="canInvite"
            type="button"
            class="server-menu-item flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-fg transition-colors hover:bg-glass-hover"
            @click="
              emit('invite');
              closeServerMenu();
            "
          >
            <img
              :src="icons.friendAdd"
              alt=""
              class="h-4 w-4 shrink-0 opacity-80 filter invert"
            />
            Invite People
          </button>
          <button
            v-if="showServerSettingsMenuItem"
            type="button"
            class="server-menu-item flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-fg transition-colors hover:bg-glass-hover"
            @click="
              emit('open-server-settings');
              closeServerMenu();
            "
          >
            <img
              :src="icons.settings"
              alt=""
              class="h-4 w-4 shrink-0 opacity-80 filter invert"
            />
            Server Settings
          </button>
          <button
            v-if="canCreateChannels"
            type="button"
            class="server-menu-item flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-fg transition-colors hover:bg-glass-hover"
            @click="
              emit('open-create-channel', null);
              closeServerMenu();
            "
          >
            <img
              :src="icons.plus"
              alt=""
              class="h-4 w-4 shrink-0 opacity-80 filter invert"
            />
            Create Channel
          </button>
          <button
            v-if="canCreateChannels"
            type="button"
            class="server-menu-item flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-fg transition-colors hover:bg-glass-hover"
            @click="
              emit('open-create-category');
              closeServerMenu();
            "
          >
            <img
              :src="icons.list"
              alt=""
              class="h-4 w-4 shrink-0 opacity-80 filter invert"
            />
            Create Category
          </button>
          <button
            type="button"
            class="server-menu-item flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-fg transition-colors hover:bg-glass-hover"
            @click="
              emit('open-notification-settings');
              closeServerMenu();
            "
          >
            <img
              :src="icons.bellSchool"
              alt=""
              class="h-4 w-4 shrink-0 opacity-80 filter invert"
            />
            Notification Settings
          </button>
          <button
            v-if="devModeIdsEnabled"
            type="button"
            class="server-menu-item flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-fg transition-colors hover:bg-glass-hover"
            @click="
              emit('copy-server-id');
              closeServerMenu();
            "
          >
            <svg
              class="h-4 w-4 shrink-0 text-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            Copy server ID
          </button>
          <div class="my-1 mx-3 h-px bg-glass-2" role="separator" />
          <button
            v-if="canLeaveSelectedServer"
            type="button"
            class="server-menu-item flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-red-600 transition-colors hover:bg-red-500/15 dark:text-red-300"
            @click="
              emit('leave-server', selectedServer.id);
              closeServerMenu();
            "
          >
            <img
              :src="icons.logOut"
              alt=""
              class="h-4 w-4 shrink-0 opacity-90 filter invert"
            />
            Leave server
          </button>
          <div
            v-else
            class="px-4 py-2 text-left text-xs leading-snug text-fg-subtle"
            role="note"
          >
            You own this server. Transfer ownership in Server settings (Danger
            Zone) before you can leave.
          </div>
        </div>
      </Transition>
    </div>
    <div
      v-if="!isEcho && serverNotificationBannerText"
      class="channel-notification-banner shrink-0 border-b border-black/25 bg-amber-500/[0.09] px-3 py-2 text-xs leading-snug text-amber-100/95"
      role="status"
    >
      <span class="font-semibold text-amber-200/95">Notifications:</span>
      {{ serverNotificationBannerText }}
    </div>
    <div class="h-px w-full bg-scrim-2"></div>
  </div>
</template>

<style scoped lang="scss">
@use '@/features/channel-panel/styles/channelPanelBanner.scss';
@use '@/features/channel-panel/styles/serverSettingsDropdown.scss';
</style>

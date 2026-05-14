<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { icons } from '@/assets/icons';
import type { ChannelWithParticipants } from '@/features/channel-panel/composables/useChannelPanelVoiceState';

const props = withDefaults(
  defineProps<{
    menuOpen: boolean;
    menuRef?: any;
    panelContext: {
      type: 'channel' | 'category' | 'vc';
      channel?: ChannelWithParticipants;
      categoryId?: string;
      categoryName?: string;
      userId?: string;
    } | null;
    selectedServerId: string | null;
    menuPosition: { left: number; top: number };
    devModeIdsEnabled: boolean;
    rowCanManageChannel: (channel: any) => boolean;
    canCreateChannels?: boolean;
    vcContextIsSelf: boolean;
    vcContextShowVoiceMod: boolean;
    showVcMentionInChat: boolean;
    onMessageUser?: (userId: string) => void;
    vcMenuCanMute: boolean;
    vcMenuCanDeafen: boolean;
    vcMenuCanDisconnect: boolean;
    vcMenuCanMove?: boolean;
    vcMoveTargets?: Array<{ id: string; name: string; disabled?: boolean }>;
    vcMenuServerMuted?: boolean;
    vcMenuServerDeafened?: boolean;
    canModerateUser?: boolean;
    vcContextTargetTimedOut?: boolean;
    getRemoteParticipantVolume?: (userId: string) => number;
    setRemoteParticipantVolume?: (
      userId: string,
      volumePercent: number,
    ) => void;
  }>(),
  {
    canCreateChannels: false,
    vcMenuCanMove: false,
    vcMoveTargets: () => [],
  },
);

const moveVcSubmenuOpen = ref(false);

watch(
  () => props.menuOpen,
  (open) => {
    if (!open) moveVcSubmenuOpen.value = false;
  },
);

const vcVolDraft = ref(100);

const vcParticipantVolumeControlVisible = computed(
  () =>
    props.menuOpen &&
    props.panelContext?.type === 'vc' &&
    !props.vcContextIsSelf &&
    typeof props.setRemoteParticipantVolume === 'function',
);

const vcVolTargetId = computed(() =>
  props.panelContext?.type === 'vc' ? props.panelContext.userId : null,
);

watch(
  () =>
    [
      props.menuOpen,
      vcVolTargetId.value,
      props.vcContextIsSelf,
      props.getRemoteParticipantVolume,
    ] as const,
  () => {
    const uid = vcVolTargetId.value;
    if (
      !props.menuOpen ||
      !uid ||
      props.vcContextIsSelf ||
      typeof props.setRemoteParticipantVolume !== 'function'
    ) {
      return;
    }
    const v = props.getRemoteParticipantVolume?.(uid) ?? 100;
    vcVolDraft.value = v;
  },
  { immediate: true },
);

function onVcParticipantVolumeInput(e: Event) {
  const uid = vcVolTargetId.value;
  const fn = props.setRemoteParticipantVolume;
  if (!uid || !fn) return;
  const raw = Number((e.target as HTMLInputElement).value);
  if (!Number.isFinite(raw)) return;
  const v = Math.max(0, Math.min(200, Math.round(raw)));
  vcVolDraft.value = v;
  fn(uid, v);
}

const emit = defineEmits<{
  'channel-menu-open': [];
  'channel-menu-invite': [];
  'channel-menu-settings': [];
  'channel-menu-delete': [];
  'channel-menu-copy-id': [];
  'channel-menu-copy-link': [];
  'category-menu-create-channel': [];
  'category-menu-settings': [];
  'category-menu-delete': [];
  'category-menu-copy-name': [];
  'category-menu-copy-server-id': [];
  'vc-menu-profile': [];
  'vc-menu-mention': [];
  'vc-menu-message': [];
  'vc-menu-copy-user-id': [];
  'vc-moderate': ['serverMute' | 'serverDeafen' | 'disconnect'];
  'vc-menu-move-pick': [targetChannelId: string];
  'vc-moderate-server': ['kick' | 'ban' | 'timeout'];
}>();
</script>

<template>
  <Teleport to="body">
    <div
      v-if="
        menuOpen &&
        panelContext &&
        selectedServerId &&
        selectedServerId !== 'echo'
      "
      :ref="menuRef"
      class="ellipsis-menu fixed z-[100] min-w-[200px] py-1"
      :style="{ left: `${menuPosition.left}px`, top: `${menuPosition.top}px` }"
      role="menu"
      @mousedown.stop
      @contextmenu.prevent
    >
      <!-- Channel row -->
      <template v-if="panelContext.type === 'channel' && panelContext.channel">
        <button
          type="button"
          class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="emit('channel-menu-open')"
        >
          <img
            :src="icons.message"
            alt=""
            class="echo-menu-item-icon echo-menu-item-icon--img h-4 w-4 shrink-0 filter invert"
          />
          {{
            panelContext.channel.type === 'voice'
              ? 'Join voice channel'
              : 'Open channel'
          }}
        </button>
        <button
          type="button"
          class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="emit('channel-menu-invite')"
        >
          <img
            :src="icons.usersAvatar"
            alt=""
            class="echo-menu-item-icon echo-menu-item-icon--img h-4 w-4 shrink-0 filter invert"
          />
          Invite people
        </button>
        <button
          v-if="rowCanManageChannel(panelContext.channel)"
          type="button"
          class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="emit('channel-menu-settings')"
        >
          <img
            :src="icons.settings"
            alt=""
            class="echo-menu-item-icon echo-menu-item-icon--img h-4 w-4 shrink-0 filter invert"
          />
          Channel settings
        </button>
        <button
          v-if="rowCanManageChannel(panelContext.channel)"
          type="button"
          class="echo-menu-item echo-menu-item--destructive flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="emit('channel-menu-delete')"
        >
          <img
            :src="icons.trash"
            alt=""
            class="echo-menu-item-icon echo-menu-item-icon--img h-4 w-4 shrink-0 filter invert"
          />
          Delete channel
        </button>
        <div class="my-1 h-px bg-glass-2" role="separator" />
        <button
          v-if="devModeIdsEnabled"
          type="button"
          class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="emit('channel-menu-copy-id')"
        >
          <svg
            class="echo-menu-item-icon h-4 w-4 shrink-0"
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
          Copy channel ID
        </button>
        <button
          type="button"
          class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="emit('channel-menu-copy-link')"
        >
          <svg
            class="echo-menu-item-icon h-4 w-4 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
          Copy link
        </button>
      </template>

      <!-- Category header -->
      <template v-else-if="panelContext.type === 'category'">
        <button
          v-if="canCreateChannels"
          type="button"
          class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="emit('category-menu-create-channel')"
        >
          <img
            :src="icons.plus"
            alt=""
            class="echo-menu-item-icon echo-menu-item-icon--img h-4 w-4 shrink-0 filter invert"
          />
          Create channel
        </button>
        <button
          v-if="canCreateChannels"
          type="button"
          class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="emit('category-menu-settings')"
        >
          <img
            :src="icons.settings"
            alt=""
            class="echo-menu-item-icon echo-menu-item-icon--img h-4 w-4 shrink-0 filter invert"
          />
          Category settings
        </button>
        <button
          v-if="canCreateChannels"
          type="button"
          class="echo-menu-item echo-menu-item--destructive flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="emit('category-menu-delete')"
        >
          <img
            :src="icons.trash"
            alt=""
            class="echo-menu-item-icon echo-menu-item-icon--img h-4 w-4 shrink-0 filter invert"
          />
          Delete category
        </button>
        <div
          v-if="canCreateChannels"
          class="my-1 h-px bg-glass-2"
          role="separator"
        />
        <button
          type="button"
          class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="emit('category-menu-copy-name')"
        >
          <svg
            class="echo-menu-item-icon h-4 w-4 shrink-0"
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
          Copy category name
        </button>
        <button
          v-if="devModeIdsEnabled"
          type="button"
          class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="emit('category-menu-copy-server-id')"
        >
          <svg
            class="echo-menu-item-icon h-4 w-4 shrink-0"
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
      </template>

      <!-- VC participant -->
      <template v-else-if="panelContext.type === 'vc'">
        <button
          type="button"
          class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="emit('vc-menu-profile')"
        >
          <img
            :src="icons.profileView"
            alt=""
            class="echo-menu-item-icon echo-menu-item-icon--img h-4 w-4 shrink-0 filter invert"
          />
          Profile
        </button>
        <button
          v-if="showVcMentionInChat && !vcContextIsSelf"
          type="button"
          class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="emit('vc-menu-mention')"
        >
          <span
            class="flex h-4 w-4 shrink-0 items-center justify-center text-[11px] font-bold text-fg-soft"
            aria-hidden="true"
            >@</span
          >
          Direct mention
        </button>
        <button
          v-if="!vcContextIsSelf && onMessageUser"
          type="button"
          class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="emit('vc-menu-message')"
        >
          <img
            :src="icons.message"
            alt=""
            class="echo-menu-item-icon echo-menu-item-icon--img h-4 w-4 shrink-0 filter invert"
          />
          Message
        </button>
        <div v-if="vcMenuCanMove && !vcContextIsSelf">
          <button
            type="button"
            class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
            role="menuitem"
            :aria-expanded="moveVcSubmenuOpen ? 'true' : 'false'"
            @click="moveVcSubmenuOpen = !moveVcSubmenuOpen"
          >
            <span class="flex-1">Move to…</span>
            <span class="text-fg-subtle text-xs" aria-hidden="true">{{
              moveVcSubmenuOpen ? '▾' : '▸'
            }}</span>
          </button>
          <div
            v-if="moveVcSubmenuOpen && (vcMoveTargets?.length ?? 0) > 0"
            class="max-h-52 overflow-y-auto border-t border-border py-1"
            @mousedown.stop
          >
            <button
              v-for="t in vcMoveTargets"
              :key="t.id"
              type="button"
              class="echo-menu-item flex w-full items-center gap-2 pl-6 pr-3 py-1.5 text-left text-xs"
              :class="t.disabled ? 'opacity-40 cursor-not-allowed' : ''"
              :disabled="t.disabled"
              role="menuitem"
              @click="
                () => {
                  if (!t.disabled) {
                    emit('vc-menu-move-pick', t.id);
                    moveVcSubmenuOpen = false;
                  }
                }
              "
            >
              <span class="truncate">{{ t.name }}</span>
            </button>
          </div>
          <div
            v-else-if="moveVcSubmenuOpen && !(vcMoveTargets?.length ?? 0)"
            class="px-3 py-2 text-xs text-fg-subtle"
          >
            No other voice channels
          </div>
        </div>
        <div
          v-if="vcParticipantVolumeControlVisible"
          class="border-t border-border px-3 py-2"
          @pointerdown.stop
        >
          <div
            class="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle"
          >
            <img
              :src="icons.volumeUp"
              alt=""
              class="echo-menu-item-icon echo-menu-item-icon--img h-3.5 w-3.5 opacity-80 filter invert"
            />
            Their volume
          </div>
          <div class="mt-2 flex items-center gap-2">
            <input
              type="range"
              class="h-1.5 min-w-0 flex-1 cursor-pointer accent-[color:var(--accent)]"
              min="0"
              max="200"
              :value="vcVolDraft"
              aria-label="Participant volume"
              @input="onVcParticipantVolumeInput"
            />
            <span
              class="w-9 shrink-0 text-right text-[11px] tabular-nums text-fg-soft"
              >{{ Math.round(vcVolDraft) }}%</span
            >
          </div>
        </div>
        <button
          v-if="devModeIdsEnabled"
          type="button"
          class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="emit('vc-menu-copy-user-id')"
        >
          <svg
            class="echo-menu-item-icon h-4 w-4 shrink-0"
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
          Copy user ID
        </button>
        <div
          v-if="
            vcContextShowVoiceMod &&
            (vcMenuCanMute || vcMenuCanDeafen || vcMenuCanDisconnect)
          "
          class="my-1 h-px bg-glass-2"
          role="separator"
        />
        <div
          v-if="
            vcContextShowVoiceMod &&
            (vcMenuCanMute || vcMenuCanDeafen || vcMenuCanDisconnect)
          "
          class="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--menu-item-destructive-fg)]"
        >
          Voice
        </div>
        <button
          v-if="vcContextShowVoiceMod && vcMenuCanMute"
          type="button"
          class="echo-menu-item echo-menu-item--destructive flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="emit('vc-moderate', 'serverMute')"
        >
          <img
            :src="icons.mic"
            alt=""
            class="echo-menu-item-icon echo-menu-item-icon--img h-4 w-4 shrink-0 filter invert"
          />
          {{ vcMenuServerMuted ? 'Unmute' : 'Mute' }}
        </button>
        <button
          v-if="vcContextShowVoiceMod && vcMenuCanDeafen"
          type="button"
          class="echo-menu-item echo-menu-item--destructive flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="emit('vc-moderate', 'serverDeafen')"
        >
          <img
            :src="icons.headphones"
            alt=""
            class="echo-menu-item-icon echo-menu-item-icon--img h-4 w-4 shrink-0 filter invert"
          />
          {{ vcMenuServerDeafened ? 'Undeafen' : 'Deafen' }}
        </button>
        <button
          v-if="vcContextShowVoiceMod && vcMenuCanDisconnect"
          type="button"
          class="echo-menu-item echo-menu-item--destructive flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="emit('vc-moderate', 'disconnect')"
        >
          <svg
            class="echo-menu-item-icon h-4 w-4 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
            />
          </svg>
          Disconnect
        </button>
        <div
          v-if="vcContextShowVoiceMod && canModerateUser"
          class="my-1 h-px bg-glass-2"
          role="separator"
        />
        <button
          v-if="vcContextShowVoiceMod && canModerateUser"
          type="button"
          class="echo-menu-item echo-menu-item--warning flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="emit('vc-moderate-server', 'kick')"
        >
          <svg
            class="echo-menu-item-icon h-4 w-4 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
            />
          </svg>
          Kick from server
        </button>
        <button
          v-if="vcContextShowVoiceMod && canModerateUser"
          type="button"
          class="echo-menu-item echo-menu-item--destructive flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="emit('vc-moderate-server', 'ban')"
        >
          <svg
            class="echo-menu-item-icon h-4 w-4 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
          Ban from server
        </button>
        <button
          v-if="vcContextShowVoiceMod && canModerateUser"
          type="button"
          class="echo-menu-item echo-menu-item--warning flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="emit('vc-moderate-server', 'timeout')"
        >
          <svg
            class="echo-menu-item-icon h-4 w-4 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {{ vcContextTargetTimedOut ? 'Remove timeout' : 'Timeout (1h)' }}
        </button>
      </template>
    </div>
  </Teleport>
</template>

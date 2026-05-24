<script setup lang="ts">
import { icons } from '@/assets/icons';
import { computed, inject, watch } from 'vue';
import { LAYOUT_CHAT_SURFACE_KEY } from '@/features/layout/layoutInjectionKeys';

const props = defineProps<{
  liveKitState: 'idle' | 'connecting' | 'connected' | 'error';
  vcMuted: boolean;
  vcDeafened: boolean;
  vcVideo: boolean;
  vcScreenshare: boolean;
  canUseVideo: boolean;
  voiceSideChatCollapsed: boolean;
  vcSelfServerMuted?: boolean;
  vcSelfServerDeafened?: boolean;
  onToggleMuted: (next: boolean) => void;
  onToggleDeafened: (next: boolean) => void;
  onToggleVideo: (next: boolean) => void;
  onToggleScreenshare: (next: boolean) => void;
  onOpenVoiceSettings: () => void;
  onToggleVoiceChat: () => void;
  onLeaveVoice: () => void;
}>();

const micOff = computed(() => props.vcMuted || !!props.vcSelfServerMuted);
const deafOff = computed(
  () => props.vcDeafened || !!props.vcSelfServerDeafened,
);
const connecting = computed(() => props.liveKitState === 'connecting');
const serverModActive = computed(
  () => !!(props.vcSelfServerMuted || props.vcSelfServerDeafened),
);

const layoutChat = inject(LAYOUT_CHAT_SURFACE_KEY, null);

function openVoiceActivities() {
  const host = layoutChat as { openVcActivityPicker?: () => void } | null;
  host?.openVcActivityPicker?.();
}

watch(
  () => props.liveKitState,
  (s) => {
    if (s === 'idle') {
      const host = layoutChat as { closeVcActivity?: () => void } | null;
      host?.closeVcActivity?.();
    }
  },
);
</script>

<template>
  <div
    class="pointer-events-auto fixed inset-x-0 bottom-0 z-[90] flex justify-center px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] pt-2"
    role="toolbar"
    aria-label="Voice controls"
  >
    <div
      class="guild-mobile-voice-dock vc-mobile-dock w-full max-w-[min(100%,420px)]"
      :class="{ 'vc-mobile-dock--connecting': connecting }"
    >
      <div class="vc-mobile-dock__surface">
        <!-- Top row: same family as desktop vc-panel header actions -->
        <div
          class="vc-mobile-dock__header flex items-center justify-between gap-2 px-2 py-1.5"
        >
          <button
            type="button"
            class="vc-leave-btn !p-2"
            aria-label="Disconnect from voice"
            title="Leave"
            @click="props.onLeaveVoice"
          >
            <img
              :src="icons.logOut"
              alt=""
              class="vc-icon vc-icon-disconnect h-[20px] w-[20px]"
            />
          </button>
          <div class="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              class="vc-mobile-dock__chat-btn"
              :class="{
                'vc-mobile-dock__chat-btn--on': !voiceSideChatCollapsed,
              }"
              aria-label="Toggle voice chat"
              title="Chat"
              @click="props.onToggleVoiceChat"
            >
              <svg
                class="h-[20px] w-[20px]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path
                  d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                />
              </svg>
            </button>
            <button
              type="button"
              class="vc-activities-btn !p-2"
              aria-label="Voice activities"
              title="Activities"
              @click="openVoiceActivities"
            >
              <img
                :src="icons.puzzle"
                alt=""
                class="vc-icon vc-icon-activities h-[20px] w-[20px]"
              />
            </button>
          </div>
        </div>

        <!-- Bottom row: same controls + order as desktop `vc-panel-controls` -->
        <div
          class="vc-panel-controls vc-panel-controls--below-settings flex items-center justify-evenly gap-1.5 px-2 py-2.5"
        >
          <button
            type="button"
            class="vc-ctrl-btn"
            :class="[
              {
                'vc-ctrl-btn--active': vcVideo,
                'vc-ctrl-btn--video-on': vcVideo,
              },
              canUseVideo === false ? 'pointer-events-none opacity-30' : '',
            ]"
            :title="
              canUseVideo === false
                ? 'Video not allowed for this role'
                : vcVideo
                  ? 'Stop video'
                  : 'Start video'
            "
            :disabled="canUseVideo === false"
            @click="props.onToggleVideo(!props.vcVideo)"
          >
            <img
              :src="icons.cameraOn"
              alt="Video"
              class="vc-icon h-[20px] w-[20px]"
            />
          </button>
          <button
            type="button"
            class="vc-ctrl-btn"
            :class="[
              {
                'vc-ctrl-btn--active': vcScreenshare,
                'vc-ctrl-btn--screenshare-on': vcScreenshare,
              },
              canUseVideo === false ? 'pointer-events-none opacity-30' : '',
            ]"
            :title="
              canUseVideo === false
                ? 'Only speakers on stage can share screen'
                : vcScreenshare
                  ? 'Stop share'
                  : 'Share screen'
            "
            :disabled="canUseVideo === false"
            @click="props.onToggleScreenshare(!props.vcScreenshare)"
          >
            <img
              :src="icons.desktop"
              alt="Screen share"
              class="vc-icon h-[20px] w-[20px]"
            />
          </button>
          <button
            type="button"
            class="vc-ctrl-btn"
            :class="{ 'vc-ctrl-btn--server-mod': serverModActive }"
            :title="micOff ? 'Unmute' : 'Mute'"
            @click="props.onToggleMuted(!props.vcMuted)"
          >
            <span
              class="vc-icon-wrap relative inline-flex items-center justify-center"
            >
              <img
                :src="icons.mic"
                :alt="micOff ? 'Unmute' : 'Mute'"
                class="vc-icon vc-icon-mic h-[17px] w-[17px]"
                :class="{
                  'vc-icon--off': micOff,
                  'vc-icon--server-mod': !!vcSelfServerMuted,
                }"
              />
              <Transition name="strike">
                <span
                  v-if="micOff"
                  class="vc-icon-strike"
                  :class="{ 'vc-icon-strike--server': !!vcSelfServerMuted }"
                  aria-hidden="true"
                />
              </Transition>
            </span>
          </button>
          <button
            type="button"
            class="vc-ctrl-btn"
            :class="{ 'vc-ctrl-btn--server-mod': !!props.vcSelfServerDeafened }"
            :title="deafOff ? 'Undeafen' : 'Deafen'"
            @click="props.onToggleDeafened(!props.vcDeafened)"
          >
            <span
              class="vc-icon-wrap relative inline-flex items-center justify-center"
            >
              <img
                :src="icons.headphones"
                :alt="deafOff ? 'Undeafen' : 'Deafen'"
                class="vc-icon h-[20px] w-[20px]"
                :class="{
                  'vc-icon--off': deafOff,
                  'vc-icon--server-mod': !!vcSelfServerDeafened,
                }"
              />
              <Transition name="strike">
                <span
                  v-if="deafOff"
                  class="vc-icon-strike"
                  :class="{ 'vc-icon-strike--server': !!vcSelfServerDeafened }"
                  aria-hidden="true"
                />
              </Transition>
            </span>
          </button>
          <button
            type="button"
            class="vc-ctrl-btn"
            title="Voice settings"
            aria-label="Voice settings"
            @click="props.onOpenVoiceSettings"
          >
            <img
              :src="icons.settings"
              alt=""
              class="vc-icon h-[20px] w-[20px]"
            />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/features/channel-panel/styles/channelPanel.scss';

/* Floating shell: flat Echo chrome — tokens align with desktop `vc-panel` */
.vc-mobile-dock__header {
  border-bottom: 1px solid color-mix(in srgb, var(--border) 92%, transparent);
}

.vc-mobile-dock__surface {
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  background: var(--vc-panel-bg);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow:
    0 1px 0 color-mix(in srgb, var(--border) 35%, transparent),
    0 10px 36px color-mix(in srgb, var(--text) 7%, transparent);
}

[data-theme='dark'] .vc-mobile-dock__surface {
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.04),
    0 14px 42px rgba(0, 0, 0, 0.45);
}

/* Sunny: warm brown lift instead of grey cast from `var(--text)` in default light */
html[data-theme='light'][data-echo-light-variant='sunny']
  .vc-mobile-dock__surface {
  box-shadow:
    0 1px 0 color-mix(in srgb, var(--border) 45%, transparent),
    0 10px 36px rgba(120, 80, 30, 0.11);
}

.vc-mobile-dock--connecting {
  opacity: 0.78;
}

/* Slightly tighter than desktop 42px so five controls fit small phones */
.guild-mobile-voice-dock .vc-ctrl-btn {
  width: 40px;
  height: 40px;
}

.vc-mobile-dock__chat-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    opacity 0.15s ease;

  &:hover {
    background: var(--ui-glass-1);
    color: var(--text);
    opacity: 0.95;
  }
  &:active {
    opacity: 0.85;
  }
  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
    outline-offset: 2px;
  }
}

.vc-mobile-dock__chat-btn--on {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
}
.vc-mobile-dock__chat-btn--on:hover {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  color: var(--accent);
}
</style>

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
  /** Lift dock above the phone bottom tab bar when set. */
  stackAboveBottomTab?: boolean;
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
    class="vc-mobile-dock-host pointer-events-auto fixed inset-x-0 z-[90]"
    :class="
      stackAboveBottomTab
        ? 'vc-mobile-dock-host--above-tab-bar'
        : 'vc-mobile-dock-host--flush'
    "
    role="toolbar"
    aria-label="Voice controls"
  >
    <div
      class="vc-mobile-dock guild-mobile-voice-dock"
      :class="{ 'vc-mobile-dock--connecting': connecting }"
    >
      <div class="vc-mobile-dock__surface">
        <div class="vc-mobile-dock__row">
          <button
            type="button"
            class="vc-mobile-dock__leave"
            aria-label="Disconnect from voice"
            title="Leave"
            @click="props.onLeaveVoice"
          >
            <img
              :src="icons.logOut"
              alt=""
              class="vc-mobile-dock__leave-icon"
            />
          </button>

          <div class="vc-mobile-dock__controls">
            <button
              type="button"
              class="vc-mobile-dock__ctrl"
              :class="{
                'vc-mobile-dock__ctrl--on': vcVideo,
                'vc-mobile-dock__ctrl--video-on': vcVideo,
                'vc-mobile-dock__ctrl--disabled': canUseVideo === false,
              }"
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
              <img :src="icons.cameraOn" alt="" class="vc-mobile-dock__glyph" />
            </button>
            <button
              type="button"
              class="vc-mobile-dock__ctrl"
              :class="{
                'vc-mobile-dock__ctrl--on': vcScreenshare,
                'vc-mobile-dock__ctrl--share-on': vcScreenshare,
                'vc-mobile-dock__ctrl--disabled': canUseVideo === false,
              }"
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
              <img :src="icons.desktop" alt="" class="vc-mobile-dock__glyph" />
            </button>
            <button
              type="button"
              class="vc-mobile-dock__ctrl"
              :class="{
                'vc-mobile-dock__ctrl--on': micOff,
                'vc-mobile-dock__ctrl--server-mod': serverModActive,
              }"
              :title="micOff ? 'Unmute' : 'Mute'"
              @click="props.onToggleMuted(!props.vcMuted)"
            >
              <span class="vc-mobile-dock__glyph-wrap">
                <img
                  :src="icons.mic"
                  alt=""
                  class="vc-mobile-dock__glyph vc-mobile-dock__glyph--mic"
                  :class="{ 'vc-mobile-dock__glyph--off': micOff }"
                />
                <Transition name="strike">
                  <span
                    v-if="micOff"
                    class="vc-mobile-dock__strike"
                    :class="{
                      'vc-mobile-dock__strike--server': !!vcSelfServerMuted,
                    }"
                    aria-hidden="true"
                  />
                </Transition>
              </span>
            </button>
            <button
              type="button"
              class="vc-mobile-dock__ctrl"
              :class="{
                'vc-mobile-dock__ctrl--on': deafOff,
                'vc-mobile-dock__ctrl--server-mod':
                  !!props.vcSelfServerDeafened,
              }"
              :title="deafOff ? 'Undeafen' : 'Deafen'"
              @click="props.onToggleDeafened(!props.vcDeafened)"
            >
              <span class="vc-mobile-dock__glyph-wrap">
                <img
                  :src="icons.headphones"
                  alt=""
                  class="vc-mobile-dock__glyph"
                  :class="{ 'vc-mobile-dock__glyph--off': deafOff }"
                />
                <Transition name="strike">
                  <span
                    v-if="deafOff"
                    class="vc-mobile-dock__strike"
                    :class="{
                      'vc-mobile-dock__strike--server': !!vcSelfServerDeafened,
                    }"
                    aria-hidden="true"
                  />
                </Transition>
              </span>
            </button>
          </div>

          <div class="vc-mobile-dock__utils">
            <button
              type="button"
              class="vc-mobile-dock__util vc-mobile-dock__util--settings"
              title="Voice settings"
              aria-label="Voice settings"
              @click="props.onOpenVoiceSettings"
            >
              <img
                :src="icons.settings"
                alt=""
                class="vc-mobile-dock__util-icon"
              />
            </button>
            <button
              type="button"
              class="vc-mobile-dock__util"
              :class="{
                'vc-mobile-dock__util--active': !voiceSideChatCollapsed,
              }"
              aria-label="Toggle voice chat"
              title="Chat"
              @click="props.onToggleVoiceChat"
            >
              <svg
                class="vc-mobile-dock__util-svg"
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
              class="vc-mobile-dock__util vc-mobile-dock__util--activities"
              aria-label="Voice activities"
              title="Activities"
              @click="openVoiceActivities"
            >
              <img
                :src="icons.puzzle"
                alt=""
                class="vc-mobile-dock__util-icon vc-mobile-dock__util-icon--activities"
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/features/channel-panel/styles/channelPanel.scss';

.vc-mobile-dock-host {
  display: flex;
  justify-content: stretch;
}

.vc-mobile-dock-host--flush {
  bottom: 0;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.vc-mobile-dock-host--above-tab-bar {
  bottom: calc(
    var(--echo-mobile-bottom-bar-height, 3.25rem) +
      env(safe-area-inset-bottom, 0px)
  );
}

.vc-mobile-dock {
  width: 100%;
}

.vc-mobile-dock__surface {
  border-top: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  background: color-mix(in srgb, var(--vc-panel-bg) 88%, transparent);
  backdrop-filter: blur(20px) saturate(1.35);
  -webkit-backdrop-filter: blur(20px) saturate(1.35);
  box-shadow: 0 -8px 32px color-mix(in srgb, var(--text) 4%, transparent);
}

[data-theme='dark'] .vc-mobile-dock__surface {
  background: color-mix(in srgb, var(--vc-panel-bg) 82%, transparent);
  box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.35);
}

html[data-theme='light'][data-echo-light-variant='sunny']
  .vc-mobile-dock__surface {
  box-shadow: 0 -8px 28px rgba(120, 80, 30, 0.08);
}

.vc-mobile-dock--connecting {
  opacity: 0.72;
}

.vc-mobile-dock__row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.625rem 0.625rem;
}

.vc-mobile-dock__leave {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, firebrick 14%, transparent);
  color: firebrick;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    transform 0.1s ease;

  &:hover {
    background: color-mix(in srgb, firebrick 22%, transparent);
  }
  &:active {
    transform: scale(0.94);
  }
  &:focus-visible {
    outline: 2px solid color-mix(in srgb, firebrick 45%, transparent);
    outline-offset: 2px;
  }
}

.vc-mobile-dock__leave-icon {
  width: 1.125rem;
  height: 1.125rem;
  filter: invert(27%) sepia(93%) saturate(1690%) hue-rotate(337deg)
    brightness(91%) contrast(95%);
}

[data-theme='dark'] .vc-mobile-dock__leave-icon {
  filter: invert(55%) sepia(80%) saturate(800%) hue-rotate(330deg)
    brightness(105%) contrast(95%);
}

.vc-mobile-dock__controls {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  min-width: 0;
  padding: 0.1875rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text) 4%, transparent);
}

.vc-mobile-dock__ctrl {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 2.625rem;
  height: 2.625rem;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    transform 0.1s ease;

  &:hover {
    background: color-mix(in srgb, var(--text) 7%, transparent);
  }
  &:active {
    transform: scale(0.94);
  }
  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
    outline-offset: 1px;
  }
}

.vc-mobile-dock__ctrl--on {
  background: color-mix(in srgb, var(--text) 9%, transparent);
}

.vc-mobile-dock__ctrl--video-on {
  background: color-mix(in srgb, mediumseagreen 32%, transparent);
  &:hover {
    background: color-mix(in srgb, mediumseagreen 42%, transparent);
  }
}

.vc-mobile-dock__ctrl--share-on {
  background: color-mix(in srgb, mediumpurple 32%, transparent);
  &:hover {
    background: color-mix(in srgb, mediumpurple 42%, transparent);
  }
}

.vc-mobile-dock__ctrl--server-mod {
  background: color-mix(in srgb, firebrick 20%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, lightcoral 32%, transparent);
}

.vc-mobile-dock__ctrl--disabled {
  opacity: 0.28;
  pointer-events: none;
}

.vc-mobile-dock__glyph {
  width: 1.25rem;
  height: 1.25rem;
  filter: var(--vc-icon-filter, invert(1));
  opacity: 0.92;
}

.vc-mobile-dock__glyph--mic {
  width: 1.0625rem;
  height: 1.0625rem;
}

.vc-mobile-dock__glyph--off {
  opacity: 0.55;
}

[data-theme='light'] .vc-mobile-dock__glyph {
  filter: none;
  opacity: 0.78;
}

.vc-mobile-dock__glyph-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.vc-mobile-dock__strike {
  position: absolute;
  inset: -2px;
  border-radius: 999px;
  pointer-events: none;
  background: linear-gradient(
    to top right,
    transparent calc(50% - 1px),
    firebrick calc(50% - 1px),
    firebrick calc(50% + 1px),
    transparent calc(50% + 1px)
  );
}

.vc-mobile-dock__strike--server {
  background: linear-gradient(
    to top right,
    transparent calc(50% - 1.5px),
    lightcoral calc(50% - 1.5px),
    lightcoral calc(50% + 1.5px),
    transparent calc(50% + 1.5px)
  );
}

.vc-mobile-dock__utils {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.125rem;
}

.vc-mobile-dock__util {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    transform 0.1s ease;

  &:hover {
    background: color-mix(in srgb, var(--text) 6%, transparent);
    color: var(--text);
  }
  &:active {
    transform: scale(0.94);
  }
  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
    outline-offset: 1px;
  }
}

.vc-mobile-dock__util--settings {
  width: 1.75rem;
  height: 1.75rem;
  opacity: 0.82;
}

.vc-mobile-dock__util--active {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

.vc-mobile-dock__util--active:hover {
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  color: var(--accent);
}

.vc-mobile-dock__util-icon {
  width: 1rem;
  height: 1rem;
  filter: var(--vc-icon-filter, invert(1));
  opacity: 0.78;
}

.vc-mobile-dock__util-icon--activities {
  opacity: 0.88;
  filter: invert(0.35) sepia(1) saturate(6) hue-rotate(225deg) brightness(1.05);
}

[data-theme='light'] .vc-mobile-dock__util-icon {
  filter: none;
  opacity: 0.72;
}

[data-theme='light'] .vc-mobile-dock__util-icon--activities {
  filter: invert(27%) sepia(90%) saturate(1200%) hue-rotate(225deg)
    brightness(0.95) contrast(95%);
}

.vc-mobile-dock__util-svg {
  width: 1.125rem;
  height: 1.125rem;
}
</style>

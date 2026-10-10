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

<style scoped lang="scss" src="./styles/GuildMobileVoiceDock.scss"></style>

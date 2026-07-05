<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, unref } from 'vue';
import {
  LAYOUT_CHAT_SURFACE_KEY,
  type LayoutChatSurfaceContext,
} from '@/features/layout/layoutInjectionKeys';
import { useSpeakingState } from '@/composables/useSpeakingState';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { icons } from '@/assets/icons';
import { resolveCallTileAvatarUrl } from '@/utils/avatarDisplay';

const layout = inject(
  LAYOUT_CHAT_SURFACE_KEY,
  null,
) as LayoutChatSurfaceContext | null;
const { speakingMap, localSpeaking, localUserId } = useSpeakingState();

const narrowViewport = ref(
  typeof window !== 'undefined' ? window.innerWidth < 768 : false,
);
const expanded = ref(false);

function syncNarrowViewport() {
  if (typeof window === 'undefined') return;
  narrowViewport.value = window.innerWidth < 768;
}

onMounted(() => {
  syncNarrowViewport();
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', syncNarrowViewport);
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', syncNarrowViewport);
  }
});

const visible = computed(() => {
  if (!narrowViewport.value) return false;
  if (!layout) return false;
  const vid = String(unref(layout.currentVoiceChannelId) ?? '').trim();
  if (!vid) return false;
  if (unref(layout.isViewingVoiceChannel)) return false;
  return true;
});

const dominant = computed(() => {
  if (!layout) return null;
  const participants = (unref(layout.activeVoiceChannelParticipants) ??
    []) as Array<{ id: string; name: string; pfp: string }>;
  const selfId = String(unref(localUserId) ?? '').trim();
  const sm = { ...unref(speakingMap) };
  let bestId: string | null = null;
  let bestLevel = -1;
  for (const [id, v] of Object.entries(sm)) {
    if (v?.speaking) {
      const lv = v.level ?? 0;
      if (lv > bestLevel) {
        bestLevel = lv;
        bestId = id;
      }
    }
  }
  if (selfId && unref(localSpeaking)) {
    const lv = sm[selfId]?.level ?? 0.05;
    if (bestLevel < 0.02 || lv >= bestLevel) bestId = selfId;
  }
  if (!bestId) return null;
  const p = participants.find((x) => x.id === bestId);
  return p ?? { id: bestId, name: 'Someone', pfp: '' };
});

const isSpeaking = computed(() => !!dominant.value);

const voiceChannelName = computed(() => {
  const ch = unref(layout?.effectiveActiveChannel) as
    | { name?: string }
    | null
    | undefined;
  const getName = unref(layout?.getChannelDisplayName) as
    | ((name?: string) => string)
    | undefined;
  const raw = ch?.name ?? 'Voice';
  return getName?.(raw) ?? raw;
});

function toggleExpanded() {
  expanded.value = !expanded.value;
}

function collapseIfExpanded() {
  expanded.value = false;
}

function goToVoiceChannel() {
  collapseIfExpanded();
  if (!layout) return;
  const vid = String(unref(layout.currentVoiceChannelId) ?? '').trim();
  if (!vid) return;
  const openServerSurfaceForChannel = unref(
    (layout as { openServerSurfaceForChannel?: unknown })
      .openServerSurfaceForChannel,
  ) as ((channelId: string) => void) | undefined;
  const go = unref(layout.handleGoToChannel) as
    | ((id: string) => void)
    | undefined;
  const expand = unref(layout.expandVoiceSideChat) as (() => void) | undefined;
  if (openServerSurfaceForChannel) {
    openServerSurfaceForChannel(vid);
  } else {
    go?.(vid);
  }
  expand?.();
}

function toggleMute() {
  if (!layout) return;
  const muted = Boolean(unref(layout.vcMuted));
  const setMuted = unref(layout.onGuildChannelVcMuted) as
    | ((next: boolean) => void)
    | undefined;
  setMuted?.(!muted);
}

function toggleDeafen() {
  if (!layout) return;
  const deafened = Boolean(unref(layout.vcDeafened));
  const setDeafened = unref(layout.onGuildChannelVcDeafened) as
    | ((next: boolean) => void)
    | undefined;
  setDeafened?.(!deafened);
}

function leaveVoice() {
  collapseIfExpanded();
  if (!layout) return;
  const leave = unref(layout.handleChannelVoicePanelLeave) as
    | (() => void | Promise<void>)
    | undefined;
  void leave?.();
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="guild-vc-island-host pointer-events-none fixed inset-x-0 top-0 z-[95] flex justify-center"
      :style="{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }"
    >
      <!-- Backdrop tap target when expanded -->
      <button
        v-if="expanded"
        type="button"
        class="guild-vc-island-backdrop pointer-events-auto fixed inset-0 z-[-1] border-0 bg-scrim-1"
        aria-label="Close voice controls"
        @click="collapseIfExpanded"
      />

      <div
        class="guild-vc-island pointer-events-auto"
        :class="{
          'guild-vc-island--expanded': expanded,
          'guild-vc-island--speaking': isSpeaking,
        }"
      >
        <button
          type="button"
          class="guild-vc-island__bubble"
          :aria-expanded="expanded"
          aria-label="Voice session indicator"
          @click="toggleExpanded"
        >
          <div
            class="guild-vc-island__avatar-wrap"
            :class="{ 'guild-vc-island__avatar-wrap--live': isSpeaking }"
          >
            <template v-if="dominant">
              <PausedGifAvatar
                :src="resolveCallTileAvatarUrl(dominant.pfp, dominant.id)"
                :alt="dominant.name"
                :session-key="dominant.id"
                img-class="h-full w-full rounded-full object-cover"
              />
              <span
                v-if="isSpeaking"
                class="guild-vc-island__speak-ring"
                aria-hidden="true"
              />
            </template>
            <div
              v-else
              class="flex h-full w-full items-center justify-center rounded-full bg-accent/15"
            >
              <img
                :src="icons.mic"
                alt=""
                class="guild-vc-island__glyph h-4 w-4"
              />
            </div>
          </div>

          <Transition name="island-label">
            <div v-if="!expanded" class="guild-vc-island__label min-w-0">
              <span class="guild-vc-island__name truncate">
                {{ dominant?.name ?? voiceChannelName }}
              </span>
              <span
                class="guild-vc-island__status truncate"
                :class="{ 'guild-vc-island__status--live': isSpeaking }"
              >
                {{ isSpeaking ? 'Speaking' : 'In voice' }}
              </span>
            </div>
          </Transition>

          <Transition name="island-label">
            <span
              v-if="expanded"
              class="guild-vc-island__expanded-title truncate"
            >
              {{ voiceChannelName }}
            </span>
          </Transition>
        </button>

        <Transition name="island-controls">
          <div
            v-if="expanded"
            class="guild-vc-island__controls"
            role="toolbar"
            aria-label="Voice controls"
          >
            <button
              type="button"
              class="guild-vc-island__ctrl"
              :title="unref(layout?.vcMuted) ? 'Unmute' : 'Mute'"
              :aria-label="unref(layout?.vcMuted) ? 'Unmute' : 'Mute'"
              @click.stop="toggleMute"
            >
              <img
                :src="icons.mic"
                alt=""
                class="guild-vc-island__glyph h-4 w-4"
              />
            </button>
            <button
              type="button"
              class="guild-vc-island__ctrl"
              :title="unref(layout?.vcDeafened) ? 'Undeafen' : 'Deafen'"
              :aria-label="unref(layout?.vcDeafened) ? 'Undeafen' : 'Deafen'"
              @click.stop="toggleDeafen"
            >
              <img
                :src="icons.headphones"
                alt=""
                class="guild-vc-island__glyph h-4 w-4"
              />
            </button>
            <button
              type="button"
              class="guild-vc-island__ctrl guild-vc-island__ctrl--accent"
              title="Open voice channel"
              aria-label="Open voice channel"
              @click.stop="goToVoiceChannel"
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
            </button>
            <button
              type="button"
              class="guild-vc-island__ctrl guild-vc-island__ctrl--danger"
              title="Leave voice"
              aria-label="Leave voice"
              @click.stop="leaveVoice"
            >
              <img
                :src="icons.logOut"
                alt=""
                class="guild-vc-island__glyph h-4 w-4"
              />
            </button>
          </div>
        </Transition>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.guild-vc-island {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  max-width: min(92vw, 20rem);
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  background: color-mix(in srgb, var(--bg-elevated) 88%, black 12%);
  box-shadow:
    0 1px 0 color-mix(in srgb, white 8%, transparent),
    0 12px 40px color-mix(in srgb, black 42%, transparent);
  backdrop-filter: blur(20px) saturate(1.35);
  -webkit-backdrop-filter: blur(20px) saturate(1.35);
  overflow: hidden;
  transition:
    max-width 420ms cubic-bezier(0.32, 0.72, 0, 1),
    border-radius 420ms cubic-bezier(0.32, 0.72, 0, 1),
    box-shadow 320ms ease;
}

[data-theme='light'] .guild-vc-island {
  background: color-mix(in srgb, var(--bg-elevated) 92%, white 8%);
  box-shadow:
    0 1px 0 color-mix(in srgb, var(--border) 40%, transparent),
    0 14px 36px color-mix(in srgb, black 14%, transparent);
}

.guild-vc-island--expanded {
  max-width: min(92vw, 17.5rem);
  border-radius: 1.35rem;
}

.guild-vc-island--speaking:not(.guild-vc-island--expanded) {
  box-shadow:
    0 0 0 1px color-mix(in srgb, rgb(52 211 153) 35%, transparent),
    0 12px 40px color-mix(in srgb, rgb(16 185 129) 18%, transparent);
}

.guild-vc-island__bubble {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  min-height: 2.75rem;
  padding: 0.35rem 0.75rem 0.35rem 0.35rem;
  border: 0;
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.guild-vc-island__avatar-wrap {
  position: relative;
  flex-shrink: 0;
  width: 2.125rem;
  height: 2.125rem;
  border-radius: 999px;
  overflow: visible;
}

.guild-vc-island__avatar-wrap :deep(img),
.guild-vc-island__avatar-wrap > div {
  border-radius: 999px;
  overflow: hidden;
}

.guild-vc-island__speak-ring {
  position: absolute;
  inset: -3px;
  border-radius: 999px;
  border: 2px solid rgba(52, 211, 153, 0.85);
  animation: island-speak-pulse 1.4s ease-in-out infinite;
  pointer-events: none;
}

@keyframes island-speak-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.95;
  }
  50% {
    transform: scale(1.08);
    opacity: 0.55;
  }
}

.guild-vc-island__label {
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
  min-width: 0;
  padding-right: 0.25rem;
}

.guild-vc-island__name {
  font-size: 0.8125rem;
  font-weight: 650;
  line-height: 1.15;
}

.guild-vc-island__status {
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}

.guild-vc-island__status--live {
  color: rgba(52, 211, 153, 0.95);
}

[data-theme='light'] .guild-vc-island__status--live {
  color: rgb(4 120 87);
}

.guild-vc-island__expanded-title {
  flex: 1;
  min-width: 0;
  font-size: 0.8125rem;
  font-weight: 650;
  padding-right: 0.35rem;
}

.guild-vc-island__controls {
  display: flex;
  align-items: center;
  justify-content: space-evenly;
  gap: 0.25rem;
  padding: 0 0.5rem 0.55rem;
  border-top: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
}

.guild-vc-island__ctrl {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-glass-1) 85%, transparent);
  color: var(--text);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    transform 0.15s ease;

  &:hover {
    background: var(--ui-glass-2);
  }
  &:active {
    transform: scale(0.94);
  }
}

.guild-vc-island__ctrl--accent {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

.guild-vc-island__ctrl--danger {
  color: rgb(251 113 133);
}

[data-theme='light'] .guild-vc-island__ctrl--danger {
  color: rgb(190 18 60);
}

.guild-vc-island__glyph {
  opacity: 0.92;
}

[data-theme='dark'] .guild-vc-island__glyph {
  filter: invert(1);
}

.island-label-enter-active,
.island-label-leave-active {
  transition:
    opacity 220ms ease,
    transform 320ms cubic-bezier(0.32, 0.72, 0, 1);
}

.island-label-enter-from,
.island-label-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.96);
}

.island-controls-enter-active,
.island-controls-leave-active {
  transition:
    opacity 260ms ease,
    max-height 380ms cubic-bezier(0.32, 0.72, 0, 1),
    transform 380ms cubic-bezier(0.32, 0.72, 0, 1);
  overflow: hidden;
}

.island-controls-enter-from,
.island-controls-leave-to {
  opacity: 0;
  max-height: 0;
  transform: translateY(-6px);
}

.island-controls-enter-to,
.island-controls-leave-from {
  max-height: 3rem;
}
</style>

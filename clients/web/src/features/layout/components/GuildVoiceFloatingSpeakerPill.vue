<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, unref } from 'vue';
import {
  LAYOUT_CHAT_SURFACE_KEY,
  type LayoutChatSurfaceContext,
} from '@/features/layout/layoutInjectionKeys';
import { useSpeakingState } from '@/features/layout/composables/voice/useSpeakingState';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { icons } from '@/assets/icons';
import { resolveCallTileAvatarUrl } from '@/features/layout/display/avatarDisplay';

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
          <div class="guild-vc-island__avatar-wrap">
            <template v-if="dominant">
              <PausedGifAvatar
                :src="resolveCallTileAvatarUrl(dominant.pfp, dominant.id)"
                :alt="dominant.name"
                :session-key="dominant.id"
                img-class="h-full w-full rounded-full object-cover"
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

<style
  scoped
  lang="scss"
  src="./styles/GuildVoiceFloatingSpeakerPill.scss"
></style>

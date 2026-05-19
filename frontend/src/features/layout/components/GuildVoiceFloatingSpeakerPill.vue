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

const STORAGE_KEY = 'echoGuildVcSpeakerPillPos';

const pos = ref({ x: 16, y: 120 });

/**
 * Floating VC pill is mobile-only (Tailwind `md` breakpoint). Desktop has channel
 * list / voice chrome — a draggable “phone” chip must not appear on wide screens
 * even when `(pointer: coarse)` matches (touch laptops).
 */
const narrowViewport = ref(
  typeof window !== 'undefined' ? window.innerWidth < 768 : false,
);
/** Draggable grip: only when the pill is shown (narrow layout). */
const dragEnabled = ref(narrowViewport.value);

function syncNarrowViewportAndDrag() {
  if (typeof window === 'undefined') return;
  narrowViewport.value = window.innerWidth < 768;
  dragEnabled.value = narrowViewport.value;
}

function readPos() {
  if (typeof window === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const j = JSON.parse(raw) as { x: number; y: number };
    if (Number.isFinite(j.x) && Number.isFinite(j.y)) pos.value = j;
  } catch {
    /* ignore */
  }
}

function savePos() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pos.value));
  } catch {
    /* ignore */
  }
}

onMounted(() => {
  readPos();
  syncNarrowViewportAndDrag();
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', syncNarrowViewportAndDrag);
  }
  if (typeof window === 'undefined') return;
  if (dragEnabled.value && (!pos.value.y || pos.value.y < 40)) {
    const h = window.innerHeight;
    pos.value = {
      x: pos.value.x || 16,
      y: Math.max(100, Math.floor(h * 0.35)),
    };
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', syncNarrowViewportAndDrag);
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

const pillStyle = computed(() => {
  if (!dragEnabled.value) {
    return {
      left: 'auto',
      right: '16px',
      top: 'auto',
      bottom: 'max(96px, calc(72px + env(safe-area-inset-bottom, 0px)))',
    };
  }
  return {
    left: `${pos.value.x}px`,
    top: `${pos.value.y}px`,
    right: 'auto',
    bottom: 'auto',
  };
});

const dragging = ref(false);
let startX = 0;
let startY = 0;
let originX = 0;
let originY = 0;

function onGripDown(e: PointerEvent) {
  if (!dragEnabled.value) return;
  dragging.value = true;
  startX = e.clientX;
  startY = e.clientY;
  originX = pos.value.x;
  originY = pos.value.y;
  window.addEventListener('pointermove', onGripMove);
  window.addEventListener('pointerup', onGripUp, { once: true });
}

function onGripMove(e: PointerEvent) {
  if (!dragging.value) return;
  const dx = e.clientX - startX;
  const dy = e.clientY - startY;
  const w = typeof window !== 'undefined' ? window.innerWidth : 400;
  const h = typeof window !== 'undefined' ? window.innerHeight : 800;
  const nx = Math.min(Math.max(8, originX + dx), Math.max(48, w - 200));
  const ny = Math.min(Math.max(56, originY + dy), Math.max(120, h - 64));
  pos.value = { x: nx, y: ny };
}

function onGripUp() {
  dragging.value = false;
  window.removeEventListener('pointermove', onGripMove);
  savePos();
}

function goToVoiceChannel() {
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
      class="guild-vc-speaker-pill pointer-events-none fixed z-[95]"
      :style="pillStyle"
    >
      <div
        class="guild-vc-speaker-pill__shell pointer-events-auto flex max-w-[min(92vw,17rem)] cursor-default items-stretch overflow-hidden rounded-2xl border border-border bg-elevated/92 shadow-4 backdrop-blur-md"
      >
        <button
          v-if="dragEnabled"
          type="button"
          class="guild-vc-speaker-pill__grip flex w-7 shrink-0 cursor-grab touch-none items-center justify-center border-r border-border bg-glass-1 active:cursor-grabbing"
          aria-label="Move voice indicator"
          @pointerdown.prevent="onGripDown"
        >
          <span class="h-8 w-0.5 rounded-full bg-glass-active" />
        </button>
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left"
          @click="goToVoiceChannel"
        >
          <template v-if="dominant">
            <div
              class="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-glass-2"
            >
              <PausedGifAvatar
                :src="resolveCallTileAvatarUrl(dominant.pfp, dominant.id)"
                :alt="dominant.name"
                :session-key="dominant.id"
                img-class="rounded-full object-cover"
              />
            </div>
            <div class="min-w-0 flex-1">
              <div class="truncate text-xs font-semibold text-fg">
                {{ dominant.name }}
              </div>
              <div
                class="guild-vc-speaker-pill__speaking-label truncate text-[10px] font-semibold uppercase tracking-wide"
              >
                Speaking
              </div>
            </div>
          </template>
          <template v-else>
            <div
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15"
              aria-hidden="true"
            >
              <img
                :src="icons.mic"
                alt=""
                class="guild-vc-speaker-pill__glyph h-4 w-4"
              />
            </div>
            <div class="min-w-0 flex-1">
              <div class="truncate text-xs font-semibold text-fg">In voice</div>
              <div
                class="truncate text-[10px] font-semibold uppercase tracking-wide text-fg-subtle"
              >
                Tap to open
              </div>
            </div>
          </template>
        </button>
        <div
          class="flex shrink-0 items-center gap-1 border-l border-border px-1.5"
        >
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-md text-fg-soft transition hover:bg-glass-1 hover:text-fg"
            :title="unref(layout?.vcMuted) ? 'Unmute' : 'Mute'"
            :aria-label="unref(layout?.vcMuted) ? 'Unmute' : 'Mute'"
            @click.stop="toggleMute"
          >
            <img
              :src="icons.mic"
              alt=""
              class="guild-vc-speaker-pill__glyph h-3.5 w-3.5"
            />
          </button>
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-md text-fg-soft transition hover:bg-glass-1 hover:text-fg"
            :title="unref(layout?.vcDeafened) ? 'Undeafen' : 'Deafen'"
            :aria-label="unref(layout?.vcDeafened) ? 'Undeafen' : 'Deafen'"
            @click.stop="toggleDeafen"
          >
            <img
              :src="icons.headphones"
              alt=""
              class="guild-vc-speaker-pill__glyph h-3.5 w-3.5"
            />
          </button>
          <button
            type="button"
            class="guild-vc-speaker-pill__leave flex h-7 w-7 items-center justify-center rounded-md transition"
            title="Leave voice"
            aria-label="Leave voice"
            @click.stop="leaveVoice"
          >
            <img
              :src="icons.logOut"
              alt=""
              class="guild-vc-speaker-pill__glyph h-3.5 w-3.5"
            />
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.guild-vc-speaker-pill__speaking-label {
  color: rgba(52, 211, 153, 0.92);
}

[data-theme='light'] .guild-vc-speaker-pill__speaking-label {
  color: rgb(4 120 87);
}

/* Icons are authored dark; invert only on dark chrome. */
.guild-vc-speaker-pill__glyph {
  opacity: 0.9;
}

[data-theme='dark'] .guild-vc-speaker-pill__glyph {
  filter: invert(1);
}

.guild-vc-speaker-pill__leave {
  color: rgb(251 113 133);

  &:hover {
    background: rgba(244, 63, 94, 0.15);
    color: rgb(254 205 211);
  }
}

[data-theme='light'] .guild-vc-speaker-pill__leave {
  color: rgb(190 18 60);

  &:hover {
    background: rgba(225, 29, 72, 0.12);
    color: rgb(159 18 57);
  }
}
</style>

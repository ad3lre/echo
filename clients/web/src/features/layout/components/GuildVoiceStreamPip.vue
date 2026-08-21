<script setup lang="ts">
import { computed, inject, ref, unref, watch } from 'vue';
import StreamVideoTile from '@/features/voice/components/StreamVideoTile.vue';
import { icons } from '@/assets/icons';
import {
  LAYOUT_CHAT_SURFACE_KEY,
  type LayoutChatSurfaceContext,
} from '@/features/layout/layoutInjectionKeys';
import { useGuildVoiceStreamGlance } from '@/features/layout/composables/voice/useGuildVoiceStreamGlance';

const layout = inject(
  LAYOUT_CHAT_SURFACE_KEY,
  null,
) as LayoutChatSurfaceContext | null;

const { glance, pipVisible } = useGuildVoiceStreamGlance(layout);

/** User dismissed PiP until the active stream participant changes or voice disconnects. */
const dismissedForParticipantId = ref<string | null>(null);
const minimized = ref(false);

watch(
  () => unref(layout?.currentVoiceChannelId),
  (id) => {
    if (!String(id ?? '').trim()) {
      dismissedForParticipantId.value = null;
      minimized.value = false;
    }
  },
);

watch(
  () => glance.value?.id ?? null,
  (id, prev) => {
    if (!id) {
      dismissedForParticipantId.value = null;
      minimized.value = false;
      return;
    }
    if (prev && id !== prev) {
      dismissedForParticipantId.value = null;
    }
  },
);

const visible = computed(
  () =>
    pipVisible.value && dismissedForParticipantId.value !== glance.value?.id,
);

const narrowViewport = computed(
  () => typeof window !== 'undefined' && window.innerWidth < 768,
);

const pipPositionStyle = computed(() => {
  if (narrowViewport.value) {
    return {
      right: '16px',
      left: 'auto',
      bottom: 'max(11.5rem, calc(9.5rem + env(safe-area-inset-bottom, 0px)))',
      top: 'auto',
    };
  }
  return {
    right: '20px',
    left: 'auto',
    bottom: 'max(5.5rem, calc(4.5rem + env(safe-area-inset-bottom, 0px)))',
    top: 'auto',
  };
});

const remoteStreamVolumeControl = computed(() => {
  const g = glance.value;
  return !!(g && !g.isLocal);
});

const remoteStreamVolumePercent = computed(() => {
  const g = glance.value;
  if (!g || g.isLocal) return 100;
  const getter = unref(
    layout?.getRemoteParticipantVolume as ((id: string) => number) | undefined,
  );
  return getter?.(g.id) ?? 100;
});

const mirrorVideo = computed(() => {
  const g = glance.value;
  if (!g?.isLocal || g.isScreenShare) return false;
  return Boolean(unref(layout?.mirrorLocalCamera));
});

function onRemoteStreamVolumeChange(v: number) {
  const g = glance.value;
  if (!g || g.isLocal) return;
  const setter = unref(
    layout?.setRemoteParticipantVolume as
      | ((id: string, v: number) => void)
      | undefined,
  );
  setter?.(g.id, v);
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

function expandFullscreen() {
  const g = glance.value;
  if (!g) return;
  const open = unref(
    layout?.onRequestFullscreenStream as
      | ((participantId: string) => void)
      | undefined,
  );
  open?.(g.id);
}

function dismissPip() {
  const id = glance.value?.id;
  if (id) dismissedForParticipantId.value = id;
}

function toggleMinimized() {
  minimized.value = !minimized.value;
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="guild-vc-stream-pip pointer-events-none fixed z-[94] w-[min(92vw,20rem)]"
      :style="pipPositionStyle"
    >
      <div
        class="guild-vc-stream-pip__shell pointer-events-auto overflow-hidden rounded-xl border border-border bg-scrim-2 shadow-4 backdrop-blur-md"
      >
        <div v-if="minimized" class="flex items-center gap-2 px-2.5 py-2">
          <button
            type="button"
            class="min-w-0 flex-1 truncate text-left text-xs font-semibold text-fg"
            :title="glance?.name"
            @click="goToVoiceChannel"
          >
            {{ glance?.name }}
            <span class="text-fg-subtle"> · Live</span>
          </button>
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-md text-fg-soft transition hover:bg-glass-1 hover:text-fg"
            title="Expand preview"
            aria-label="Expand preview"
            @click="toggleMinimized"
          >
            <img
              :src="icons.stream"
              alt=""
              class="guild-vc-stream-pip__glyph h-3.5 w-3.5"
            />
          </button>
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-md text-fg-soft transition hover:bg-glass-1 hover:text-fg"
            title="Close preview"
            aria-label="Close preview"
            @click="dismissPip"
          >
            <span class="text-sm leading-none" aria-hidden="true">×</span>
          </button>
        </div>

        <template v-else>
          <div
            class="guild-vc-stream-pip__video relative aspect-video w-full bg-black/40"
          >
            <StreamVideoTile
              v-if="glance"
              class="absolute inset-0 h-full w-full"
              :track="glance.track ?? null"
              :participant-name="glance.name"
              :participant-pfp="glance.pfp"
              :participant-id="glance.id"
              :is-local="glance.isLocal"
              :is-screen-share="glance.isScreenShare"
              :mirror-video="mirrorVideo"
              :remote-stream-volume-control="remoteStreamVolumeControl"
              :remote-stream-volume-percent="remoteStreamVolumePercent"
              hide-participant-bar
              delegate-context-menu
              @remote-stream-volume-change="onRemoteStreamVolumeChange"
            />
          </div>
          <div
            class="flex items-center gap-1 border-t border-border px-2 py-1.5"
          >
            <button
              type="button"
              class="min-w-0 flex-1 truncate text-left text-xs font-semibold text-fg"
              :title="`Return to voice — ${glance?.name ?? ''}`"
              @click="goToVoiceChannel"
            >
              {{ glance?.name }}
            </button>
            <button
              type="button"
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-soft transition hover:bg-glass-1 hover:text-fg"
              title="Fullscreen"
              aria-label="Fullscreen stream"
              @click="expandFullscreen"
            >
              <img
                :src="icons.stream"
                alt=""
                class="guild-vc-stream-pip__glyph h-3.5 w-3.5"
              />
            </button>
            <button
              type="button"
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-soft transition hover:bg-glass-1 hover:text-fg"
              title="Minimize"
              aria-label="Minimize preview"
              @click="toggleMinimized"
            >
              <span class="text-sm leading-none" aria-hidden="true">−</span>
            </button>
            <button
              type="button"
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-soft transition hover:bg-glass-1 hover:text-fg"
              title="Close preview"
              aria-label="Close preview"
              @click="dismissPip"
            >
              <span class="text-sm leading-none" aria-hidden="true">×</span>
            </button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.guild-vc-stream-pip__glyph {
  opacity: 0.9;
}

[data-theme='dark'] .guild-vc-stream-pip__glyph {
  filter: invert(1);
}
</style>

<script setup lang="ts">
import { icons } from '@/assets/icons';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import ServerOwnerCrownIcon from '@/components/ServerOwnerCrownIcon.vue';
import { resolveCallTileAvatarUrl } from '@/utils/avatarDisplay';

const props = defineProps<{
  open: boolean;
  channelName: string;
  participants: Array<{ id: string; name: string; pfp: string }>;
  /** Guild owner user id — crown in participant chips. */
  serverOwnerId?: string | null;
  canJoin: boolean;
  isMuted: boolean;
}>();

const emit = defineEmits<{
  close: [];
  join: [];
  chat: [];
  openAudioSettings: [];
  toggleMute: [next: boolean];
}>();

function avatarUrl(p: { id: string; pfp: string }) {
  return resolveCallTileAvatarUrl(p.pfp, p.id);
}
</script>

<template>
  <Teleport to="body">
    <Transition name="guild-vc-lobby">
      <div
        v-if="open"
        class="fixed inset-0 z-[120] flex flex-col justify-end"
        role="dialog"
        aria-modal="true"
        :aria-label="`Voice channel: ${channelName}`"
      >
        <!-- backdrop -->
        <button
          type="button"
          class="absolute inset-0 bg-overlay-dim backdrop-blur-sm"
          aria-label="Close"
          @click="emit('close')"
        />

        <!-- sheet -->
        <div
          class="vc-lobby-sheet relative flex max-h-[min(88dvh,740px)] flex-col rounded-t-[28px] overflow-hidden"
          @click.stop
        >
          <!-- drag handle -->
          <div class="flex justify-center pt-3 pb-1 shrink-0">
            <span class="h-[3px] w-9 rounded-full bg-glass-active" />
          </div>

          <!-- scrollable body -->
          <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <!-- header -->
            <div class="flex items-center gap-3 px-5 pt-2 pb-4">
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-glass-1"
              >
                <img
                  :src="icons.volumeUp"
                  alt=""
                  class="vc-lobby-glyph h-5 w-5 opacity-80"
                />
              </div>
              <div class="min-w-0 flex-1">
                <p
                  class="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle"
                >
                  Voice channel
                </p>
                <h2
                  class="truncate text-[17px] font-bold leading-tight text-fg"
                >
                  {{ channelName || 'Voice' }}
                </h2>
              </div>
              <button
                type="button"
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-glass-1 text-fg-subtle transition-colors hover:bg-glass-3 hover:text-fg-soft"
                aria-label="Close"
                @click="emit('close')"
              >
                <svg
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <!-- participants -->
            <div class="px-5 pb-5">
              <p
                class="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle"
              >
                In voice · {{ participants.length }}
              </p>

              <!-- populated -->
              <div v-if="participants.length" class="flex flex-wrap gap-2">
                <div
                  v-for="p in participants"
                  :key="p.id"
                  class="flex min-w-0 items-center gap-2 rounded-2xl bg-glass-1 px-3 py-2"
                >
                  <div class="h-7 w-7 shrink-0 overflow-hidden rounded-full">
                    <PausedGifAvatar
                      :src="avatarUrl(p)"
                      :alt="p.name"
                      img-class="rounded-full object-cover"
                      :session-key="p.id"
                    />
                  </div>
                  <span
                    class="flex min-w-0 max-w-[8rem] items-center gap-0.5 truncate text-[13px] font-medium text-fg-soft"
                  >
                    <span class="truncate">{{ p.name }}</span>
                    <ServerOwnerCrownIcon
                      v-if="
                        props.serverOwnerId?.trim() &&
                        p.id === props.serverOwnerId.trim()
                      "
                      icon-class="h-3 w-3"
                    />
                  </span>
                </div>
              </div>

              <!-- empty -->
              <div
                v-else
                class="flex flex-col items-center gap-2 py-6 text-center"
              >
                <div
                  class="flex h-11 w-11 items-center justify-center rounded-full bg-glass-1"
                >
                  <img
                    :src="icons.volumeUp"
                    alt=""
                    class="vc-lobby-glyph h-5 w-5 opacity-40"
                  />
                </div>
                <p class="text-[13px] text-fg-subtle">
                  No one here yet — be the first.
                </p>
              </div>
            </div>
          </div>

          <!-- sticky actions -->
          <div
            class="vc-lobby-actions shrink-0 px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
          >
            <div class="grid grid-cols-[3rem_1fr_3rem] items-center gap-2.5">
              <button
                type="button"
                class="vc-lobby-mini-btn inline-flex h-12 w-12 items-center justify-center rounded-2xl text-fg-soft transition hover:text-fg"
                :class="props.isMuted ? 'vc-lobby-mini-btn--active' : ''"
                :aria-label="
                  props.isMuted ? 'Unmute microphone' : 'Mute microphone'
                "
                :title="props.isMuted ? 'Unmute' : 'Mute'"
                @click="emit('toggleMute', !props.isMuted)"
              >
                <span
                  class="relative inline-flex h-[22px] w-[22px] items-center justify-center"
                >
                  <img
                    :src="icons.mic"
                    alt=""
                    class="vc-lobby-glyph h-[17px] w-[17px]"
                    :class="props.isMuted ? 'opacity-60' : 'opacity-95'"
                  />
                  <span
                    v-if="props.isMuted"
                    class="pointer-events-none absolute inset-0 m-auto h-[2px] w-[120%] rotate-[-42deg] rounded bg-rose-400/90"
                    aria-hidden="true"
                  />
                </span>
              </button>
              <button
                type="button"
                class="vc-lobby-join-btn flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl text-[15px] font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-35"
                :disabled="!canJoin"
                @click="emit('join')"
              >
                <img
                  :src="icons.volumeUp"
                  alt=""
                  class="h-[18px] w-[18px] brightness-0 invert"
                />
                Join voice
              </button>
              <button
                type="button"
                class="vc-lobby-mini-btn inline-flex h-12 w-12 items-center justify-center rounded-2xl text-fg-soft transition hover:text-fg"
                aria-label="Voice settings"
                title="Voice settings"
                @click="emit('openAudioSettings')"
              >
                <img
                  :src="icons.settings"
                  alt=""
                  class="vc-lobby-glyph h-[18px] w-[18px]"
                />
              </button>
            </div>
            <button
              type="button"
              class="vc-lobby-secondary-btn mt-2.5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-[14px] font-semibold"
              @click="emit('chat')"
            >
              <img
                :src="icons.message"
                alt=""
                class="vc-lobby-glyph h-[15px] w-[15px] opacity-75"
              />
              Open chat without joining
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Sheet surface — glass + subtle border at top edge only */
.vc-lobby-sheet {
  background:
    radial-gradient(
      circle at 60% 0%,
      rgba(100, 80, 180, 0.12) 0%,
      transparent 55%
    ),
    linear-gradient(
      180deg,
      rgba(22, 16, 36, 0.97) 0%,
      rgba(13, 10, 22, 0.99) 100%
    );
  backdrop-filter: blur(32px) saturate(1.4);
  -webkit-backdrop-filter: blur(32px) saturate(1.4);
  box-shadow:
    0 -1px 0 0 rgba(255, 255, 255, 0.08),
    0 -24px 80px rgba(0, 0, 0, 0.7);
}

:global([data-theme='light'] .vc-lobby-sheet) {
  background:
    radial-gradient(
      circle at 56% 0%,
      rgba(99, 102, 241, 0.09) 0%,
      transparent 58%
    ),
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--elevated) 96%, white 4%) 0%,
      color-mix(in srgb, var(--elevated) 98%, transparent) 100%
    );
  box-shadow:
    0 -1px 0 0 color-mix(in srgb, var(--border) 72%, transparent),
    0 -20px 58px color-mix(in srgb, var(--text) 10%, transparent);
}

:global([data-theme='dark'] .vc-lobby-glyph) {
  filter: brightness(0) invert(1);
}

:global([data-theme='light'] .vc-lobby-glyph) {
  filter: none;
  opacity: 0.78;
}

/* Join button — vivid green glow pill */
.vc-lobby-join-btn {
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  box-shadow:
    0 0 0 1px rgba(34, 197, 94, 0.25),
    0 6px 28px rgba(34, 197, 94, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.18);
}
.vc-lobby-join-btn:not(:disabled):hover {
  background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
  box-shadow:
    0 0 0 1px rgba(74, 222, 128, 0.35),
    0 8px 32px rgba(34, 197, 94, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.22);
}
.vc-lobby-join-btn:not(:disabled):active {
  transform: scale(0.985);
}

.vc-lobby-mini-btn {
  background: color-mix(in srgb, white 8%, transparent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
}
.vc-lobby-mini-btn:hover {
  background: color-mix(in srgb, white 13%, transparent);
}
.vc-lobby-mini-btn--active {
  background: color-mix(in srgb, rgb(244 63 94) 18%, transparent);
  color: rgb(254 205 211 / 0.95);
}

.vc-lobby-secondary-btn {
  background: color-mix(in srgb, white 8%, transparent);
  color: var(--muted);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    transform 0.12s ease;
}

.vc-lobby-secondary-btn:hover {
  background: color-mix(in srgb, white 14%, transparent);
  color: var(--text);
}

.vc-lobby-secondary-btn:active {
  transform: scale(0.99);
}

.vc-lobby-secondary-btn:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
  outline-offset: 2px;
}

:global([data-theme='light'] .vc-lobby-secondary-btn) {
  background: color-mix(in srgb, var(--elevated) 82%, white 18%);
  color: var(--fg-soft);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 68%, transparent),
    0 1px 0 color-mix(in srgb, var(--border) 70%, transparent);
}

:global([data-theme='light'] .vc-lobby-secondary-btn:hover) {
  background: color-mix(in srgb, var(--elevated) 74%, white 26%);
  color: var(--fg);
}

/* Enter / leave */
.guild-vc-lobby-enter-active {
  transition: opacity 0.2s ease;
}
.guild-vc-lobby-leave-active {
  transition: opacity 0.18s ease;
}
.guild-vc-lobby-enter-active .vc-lobby-sheet,
.guild-vc-lobby-leave-active .vc-lobby-sheet {
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}
.guild-vc-lobby-enter-from,
.guild-vc-lobby-leave-to {
  opacity: 0;
}
.guild-vc-lobby-enter-from .vc-lobby-sheet,
.guild-vc-lobby-leave-to .vc-lobby-sheet {
  transform: translateY(100%);
}
</style>

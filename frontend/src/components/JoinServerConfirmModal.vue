<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { icons } from '@/assets/icons';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { serverGuildIconDisplayUrl } from '@/utils/serverGuildIconDisplayUrl';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    serverName: string;
    iconUrl?: string;
    bannerUrl?: string;
    description?: string;
    memberCount?: number;
    subtitle?: string;
    isVoiceInvite?: boolean;
    /** Explore directory social proof */
    voiceParticipantCount?: number;
    busy?: boolean;
  }>(),
  { busy: false },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  confirm: [];
}>();

const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

const displayName = computed(() => props.serverName.trim() || 'Server');

const iconSrc = computed(() =>
  safeImageUrl(serverGuildIconDisplayUrl(props.iconUrl)),
);

const bannerSrc = computed(() => {
  const b = props.bannerUrl?.trim();
  return b ? safeImageUrl(b) : '';
});

const hasBanner = computed(() => !!bannerSrc.value);

const bannerStyle = computed(() =>
  hasBanner.value
    ? ({
        backgroundImage: `linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--elevated) 55%, transparent) 100%), url(${bannerSrc.value})`,
      } as const)
    : undefined,
);

const memberBadge = computed(() => {
  const n = props.memberCount;
  if (n == null || n < 1) return '';
  return `${n.toLocaleString()} member${n === 1 ? '' : 's'}`;
});

const voiceLiveLine = computed(() => {
  const n = props.voiceParticipantCount;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 1) return '';
  return `${n.toLocaleString()} in voice`;
});

const voiceMetaLine = computed(() => {
  if (voiceLiveLine.value) return voiceLiveLine.value;
  const sub = props.subtitle?.trim();
  if (props.isVoiceInvite && sub) return sub;
  return '';
});

const aboutText = computed(() => props.description?.trim() ?? '');

const showAbout = computed(() => aboutText.value.length > 0);

const decorativeOrbCount = 4;

function close() {
  if (props.busy) return;
  emit('update:modelValue', false);
}

function onConfirmJoin() {
  if (props.busy) return;
  emit('confirm');
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-[170] flex items-center justify-center modal-overlay-bg px-3 py-6 sm:px-4"
    @click.self="close"
  >
    <div
      ref="modalRef"
      role="dialog"
      aria-modal="true"
      aria-labelledby="join-server-title"
      class="join-server-confirm-modal real-glass-modal relative flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-transparent text-foreground shadow-2xl"
    >
      <!-- Hero: banner or themed fallback -->
      <div
        class="join-server-confirm-modal__hero relative h-32 shrink-0 sm:h-36"
        :class="
          hasBanner
            ? 'bg-cover bg-center'
            : 'bg-gradient-to-br from-indigo-500/35 via-[var(--surface)] to-[var(--elevated)]'
        "
        :style="bannerStyle"
      >
        <div
          class="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--elevated)] via-[var(--elevated)]/35 to-transparent"
          aria-hidden="true"
        />
        <div
          class="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border/50"
          aria-hidden="true"
        />
      </div>

      <div class="relative flex min-h-0 flex-1 flex-col px-5 pb-5 pt-0 sm:px-6 sm:pb-6">
        <!-- Icon overlaps hero -->
        <div class="flex gap-4 -mt-11 sm:-mt-12">
          <img
            :src="iconSrc"
            :alt="`${displayName} icon`"
            class="h-[4.5rem] w-[4.5rem] shrink-0 rounded-2xl border-2 border-border bg-[var(--elevated)] object-contain shadow-lg sm:h-[5.25rem] sm:w-[5.25rem]"
          />
          <div class="min-w-0 flex-1 pt-10 sm:pt-11">
            <h2
              id="join-server-title"
              class="text-lg font-bold leading-tight text-foreground sm:text-xl"
            >
              {{ isVoiceInvite ? 'Join voice channel?' : 'Join this server?' }}
            </h2>
            <p
              class="mt-1.5 text-sm leading-relaxed text-fg-subtle sm:text-[0.9375rem]"
            >
              {{
                isVoiceInvite
                  ? 'You’ll join the server and connect to voice when you confirm.'
                  : 'You’ll become a member and can see channels based on your roles.'
              }}
            </p>
          </div>
        </div>

        <div class="mt-4 min-w-0 space-y-4">
          <div class="flex flex-wrap items-center gap-2">
            <span
              class="truncate text-base font-semibold text-foreground sm:text-lg"
              :title="displayName"
            >
              {{ displayName }}
            </span>
            <span
              v-if="memberBadge"
              class="shrink-0 rounded-full bg-glass-2 px-2.5 py-0.5 text-[11px] font-semibold text-fg-subtle ring-1 ring-border/70"
            >
              {{ memberBadge }}
            </span>
            <span
              v-if="voiceMetaLine"
              class="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-500/25 dark:text-emerald-100 dark:ring-emerald-400/30"
            >
              <img
                :src="icons.headphones"
                alt=""
                class="h-3 w-3 shrink-0 opacity-90 brightness-0 invert"
                aria-hidden="true"
              />
              {{ voiceMetaLine }}
            </span>
          </div>

          <div
            v-if="showAbout"
            class="rounded-xl border border-border/60 bg-glass-2/50 p-3 sm:p-3.5"
          >
            <div
              class="text-[10px] font-bold uppercase tracking-[0.12em] text-fg-soft"
            >
              About
            </div>
            <p
              class="join-server-confirm-modal__about mt-1.5 max-h-36 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-fg-subtle custom-scrollbar sm:max-h-40"
            >
              {{ aboutText }}
            </p>
          </div>

          <!-- Decorative “community” strip (no individual member data from API) -->
          <div
            v-if="memberCount != null && memberCount > 0"
            class="flex items-center gap-3 rounded-xl border border-border/50 bg-glass-1/60 px-3 py-2.5"
          >
            <div class="flex shrink-0 -space-x-2" aria-hidden="true">
              <div
                v-for="i in decorativeOrbCount"
                :key="i"
                class="h-9 w-9 rounded-full border-2 border-[var(--elevated)] bg-gradient-to-br shadow-sm"
                :class="[
                  i === 1
                    ? 'from-violet-400/90 to-indigo-600/95'
                    : i === 2
                      ? 'from-sky-400/85 to-cyan-600/90'
                      : i === 3
                        ? 'from-fuchsia-400/85 to-pink-600/90'
                        : 'from-amber-400/80 to-orange-600/90',
                ]"
              />
            </div>
            <div class="min-w-0">
              <p class="text-xs font-semibold text-foreground">Community</p>
              <p class="text-[11px] text-fg-soft">
                Member profiles stay private until you join — this is the live
                headcount.
              </p>
            </div>
          </div>
        </div>

        <div
          class="mt-auto flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/70 pt-4"
        >
          <button
            type="button"
            class="rounded-lg border border-border/70 px-4 py-2 text-sm font-semibold text-fg-subtle transition-colors hover:border-border hover:bg-glass-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            :disabled="busy"
            @click="close"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:pointer-events-none disabled:opacity-60 dark:bg-indigo-600/90"
            :disabled="busy"
            @click="onConfirmJoin"
          >
            {{ busy ? 'Joining…' : 'Join' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.modal-overlay-bg {
  background-color: var(--vue-auto-016);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

.real-glass-modal {
  box-shadow: 0px 4px 60px var(--vue-auto-013);
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background-color: var(--vue-auto-015);
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
  }
}

.join-server-confirm-modal__about {
  scrollbar-width: thin;
}
</style>

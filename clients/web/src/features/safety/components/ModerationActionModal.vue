<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed, ref, watch, toRef } from 'vue';
import { useFocusTrap } from '@/features/layout/useFocusTrap';
import { useAutofocusOnOpen } from '@/features/layout/useAutofocusOnOpen';
import { safeImageUrl } from '@/features/layout/display/safeImageUrl';
import { icons } from '@/assets/icons';
import {
  BAN_PRESET_ONE_MONTH_MINUTES,
  BAN_PRESET_THREE_MONTHS_MINUTES,
  MAX_ECHO_BAN_DURATION_MINUTES,
} from '@/features/safety/echoModerationLimits';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    action: 'kick' | 'ban' | 'timeout' | 'untimeout' | null;
    /** Display name */
    targetUserName: string;
    targetUserPfp?: string;
    serverName: string;
    /** Echo: show “delete recent messages” when actor has Manage Messages (server purge on ban). */
    canDeleteRecentMessages?: boolean;
  }>(),
  { canDeleteRecentMessages: false },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  /** Kick: undefined. Timeout: minutes. Ban: duration + reason. */
  confirm: [
    payload?:
      | { timeoutMinutes: number }
      | {
          banDurationMinutes: number | null;
          reason: string;
          deleteRecentMessagesHours: number;
        },
  ];
}>();

const modalRef = ref<HTMLElement | null>(null);
const banReasonInputRef = ref<HTMLTextAreaElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

const banFlowActive = computed(
  () => props.modelValue && props.action === 'ban',
);

useAutofocusOnOpen(toRef(props, 'modelValue'), banReasonInputRef, {
  when: banFlowActive,
});

/** Presets in minutes (fewer choices + optional custom, matches backend max 40320). */
const TIMEOUT_PRESETS = computed(() => [
  { label: echoT('b22.mam.min5'), minutes: 5 },
  { label: echoT('b22.mam.hour1'), minutes: 60 },
  { label: echoT('b22.mam.day1'), minutes: 1440 },
  { label: echoT('b22.mam.week1'), minutes: 10080 },
]);

const MAX_TIMEOUT_MINUTES = 40320;

const selectedTimeoutMinutes = ref(60);
const timeoutUseCustom = ref(false);
const customTimeoutMinutesStr = ref('120');

/** Ban: null minutes ⇒ permanent */
const banPermanent = ref(true);
const selectedBanMinutes = ref(BAN_PRESET_ONE_MONTH_MINUTES);
const banUseCustom = ref(false);
const customBanMinutesStr = ref(String(BAN_PRESET_ONE_MONTH_MINUTES));
const banReason = ref('');

/** compact: optional purge of this member’s recent messages across the server when banning. */
const DELETE_MESSAGE_HISTORY_PRESETS = computed(() => [
  { label: echoT('b22.mam.noDelete'), hours: 0 },
  { label: echoT('b22.mam.prevHour'), hours: 1 },
  { label: echoT('b22.mam.prev24h'), hours: 24 },
  { label: echoT('b22.mam.prev3d'), hours: 72 },
  { label: echoT('b22.mam.prev7d'), hours: 168 },
]);
const selectedDeleteRecentMessagesHours = ref(0);

const BAN_DURATION_PRESETS = computed(() => [
  { label: echoT('b22.mam.month1'), minutes: BAN_PRESET_ONE_MONTH_MINUTES },
  { label: echoT('b22.mam.months3'), minutes: BAN_PRESET_THREE_MONTHS_MINUTES },
]);

watch(
  () => props.modelValue,
  (open) => {
    if (open && props.action === 'timeout') {
      selectedTimeoutMinutes.value = 60;
      timeoutUseCustom.value = false;
      customTimeoutMinutesStr.value = '120';
    }
    if (open && props.action === 'ban') {
      banPermanent.value = true;
      banUseCustom.value = false;
      selectedBanMinutes.value = BAN_PRESET_ONE_MONTH_MINUTES;
      customBanMinutesStr.value = String(BAN_PRESET_ONE_MONTH_MINUTES);
      banReason.value = '';
      selectedDeleteRecentMessagesHours.value = 0;
    }
  },
);

const title = computed(() => {
  switch (props.action) {
    case 'kick':
      return echoT('b22.mam.kickMember');
    case 'ban':
      return echoT('b22.mam.banMember');
    case 'timeout':
      return echoT('b22.mam.timeoutMember');
    case 'untimeout':
      return echoT('b22.mam.removeTimeout');
    default:
      return 'Moderation';
  }
});

const description = computed(() => {
  const name = props.targetUserName;
  const server = props.serverName;
  switch (props.action) {
    case 'kick':
      return echoT('b22.mam.descKick', { name, server });
    case 'ban':
      return echoT('b22.mam.descBan', { name, server });
    case 'timeout':
      return echoT('b22.mam.descTimeout', { name, server });
    case 'untimeout':
      return echoT('b22.mam.descUntimeout', { name, server });
    default:
      return '';
  }
});

const accentClass = computed(() => {
  switch (props.action) {
    case 'kick':
      return 'from-amber-500/25 to-transparent';
    case 'ban':
      return 'from-rose-500/30 to-transparent';
    case 'timeout':
    case 'untimeout':
      return 'from-violet-500/25 to-transparent';
    default:
      return 'from-white/10 to-transparent';
  }
});

function close() {
  emit('update:modelValue', false);
}

function resolvedTimeoutMinutes(): number {
  if (timeoutUseCustom.value) {
    const n = parseInt(customTimeoutMinutesStr.value.trim(), 10);
    if (!Number.isFinite(n)) return 60;
    return Math.min(MAX_TIMEOUT_MINUTES, Math.max(1, Math.floor(n)));
  }
  return selectedTimeoutMinutes.value;
}

function selectTimeoutPreset(minutes: number) {
  timeoutUseCustom.value = false;
  selectedTimeoutMinutes.value = minutes;
}

function enableCustomTimeout() {
  timeoutUseCustom.value = true;
}

function selectBanPreset(minutes: number) {
  banPermanent.value = false;
  banUseCustom.value = false;
  selectedBanMinutes.value = minutes;
}

function selectPermanentBan() {
  banPermanent.value = true;
  banUseCustom.value = false;
}

function enableCustomBan() {
  banPermanent.value = false;
  banUseCustom.value = true;
}

function resolvedBanMinutes(): number | null {
  if (banPermanent.value) return null;
  if (banUseCustom.value) {
    const n = parseInt(customBanMinutesStr.value.trim(), 10);
    if (!Number.isFinite(n)) return BAN_PRESET_ONE_MONTH_MINUTES;
    return Math.min(MAX_ECHO_BAN_DURATION_MINUTES, Math.max(1, Math.floor(n)));
  }
  return selectedBanMinutes.value;
}

function onConfirm() {
  if (props.action === 'timeout') {
    emit('confirm', { timeoutMinutes: resolvedTimeoutMinutes() });
  } else if (props.action === 'ban') {
    emit('confirm', {
      banDurationMinutes: resolvedBanMinutes(),
      reason: banReason.value.trim(),
      deleteRecentMessagesHours: props.canDeleteRecentMessages
        ? selectedDeleteRecentMessagesHours.value
        : 0,
    });
  } else {
    emit('confirm');
  }
}
</script>

<template>
  <div
    v-if="modelValue && action"
    class="fixed inset-0 z-[160] flex items-center justify-center modal-overlay-bg px-4"
    @click.self="close"
  >
    <div
      ref="modalRef"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="'mod-action-title'"
      class="real-glass-modal relative w-full max-w-md rounded-xl p-6 text-foreground bg-transparent"
    >
      <div
        class="pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-xl bg-gradient-to-b opacity-90"
        :class="accentClass"
      />

      <div class="relative">
        <div class="flex items-start gap-4">
          <img
            :src="safeImageUrl(targetUserPfp || '')"
            alt=""
            class="h-14 w-14 shrink-0 rounded-full bg-glass-2 object-cover ring-2 ring-border"
          />
          <div class="min-w-0 flex-1">
            <h2
              id="mod-action-title"
              class="text-lg font-bold leading-tight text-foreground"
            >
              {{ title }}
            </h2>
            <p class="mt-1 text-sm font-semibold text-fg">
              {{ targetUserName }}
            </p>
            <p class="mt-2 text-sm leading-relaxed text-fg-soft">
              {{ description }}
            </p>
          </div>
        </div>

        <div v-if="action === 'timeout'" class="mt-5 space-y-3">
          <div
            class="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle"
          >
            {{ echoT('b22.mam.duration') }}
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="preset in TIMEOUT_PRESETS"
              :key="preset.minutes"
              type="button"
              class="rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
              :class="
                !timeoutUseCustom && selectedTimeoutMinutes === preset.minutes
                  ? 'bg-indigo-500/35 text-foreground ring-1 ring-indigo-400/50'
                  : 'bg-glass-1 text-fg-soft hover:bg-glass-2'
              "
              @click="selectTimeoutPreset(preset.minutes)"
            >
              {{ preset.label }}
            </button>
            <button
              type="button"
              class="rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
              :class="
                timeoutUseCustom
                  ? 'bg-indigo-500/35 text-foreground ring-1 ring-indigo-400/50'
                  : 'bg-glass-1 text-fg-soft hover:bg-glass-2'
              "
              @click="enableCustomTimeout"
            >
              {{ echoT('b22.mam.custom') }}
            </button>
          </div>
          <div
            v-if="timeoutUseCustom"
            class="rounded-lg border border-border bg-scrim-1 px-3 py-2"
          >
            <label
              class="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle"
              for="timeout-custom-min"
            >
              {{ echoT('b22.mam.minutesRange', { max: MAX_TIMEOUT_MINUTES }) }}
            </label>
            <input
              id="timeout-custom-min"
              v-model="customTimeoutMinutesStr"
              type="number"
              min="1"
              :max="MAX_TIMEOUT_MINUTES"
              class="mt-2 w-full rounded-md border border-border bg-scrim-2 px-3 py-2 text-sm text-foreground tabular-nums outline-none focus:border-indigo-400/40"
              @keydown.enter.prevent="onConfirm"
            />
          </div>
        </div>

        <div v-else-if="action === 'ban'" class="mt-5 space-y-4">
          <div>
            <div
              class="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle"
            >
              {{ echoT('b22.mam.banPeriod') }}
            </div>
            <div class="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
                :class="
                  banPermanent
                    ? 'bg-rose-500/35 text-foreground ring-1 ring-rose-400/45'
                    : 'bg-glass-1 text-fg-soft hover:bg-glass-2'
                "
                @click="selectPermanentBan"
              >
                {{ echoT('b22.mam.permanent') }}
              </button>
              <button
                v-for="preset in BAN_DURATION_PRESETS"
                :key="preset.minutes"
                type="button"
                class="rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
                :class="
                  !banPermanent &&
                  !banUseCustom &&
                  selectedBanMinutes === preset.minutes
                    ? 'bg-rose-500/35 text-foreground ring-1 ring-rose-400/45'
                    : 'bg-glass-1 text-fg-soft hover:bg-glass-2'
                "
                @click="selectBanPreset(preset.minutes)"
              >
                {{ preset.label }}
              </button>
              <button
                type="button"
                class="rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
                :class="
                  !banPermanent && banUseCustom
                    ? 'bg-rose-500/35 text-foreground ring-1 ring-rose-400/45'
                    : 'bg-glass-1 text-fg-soft hover:bg-glass-2'
                "
                @click="enableCustomBan"
              >
                {{ echoT('b22.mam.custom') }}
              </button>
            </div>
            <div
              v-if="!banPermanent && banUseCustom"
              class="mt-3 rounded-lg border border-border bg-scrim-1 px-3 py-2"
            >
              <label
                class="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle"
                for="ban-custom-min"
              >
                {{
                  echoT('b22.mam.minutesRange', {
                    max: MAX_ECHO_BAN_DURATION_MINUTES,
                  })
                }}
              </label>
              <input
                id="ban-custom-min"
                v-model="customBanMinutesStr"
                type="number"
                min="1"
                :max="MAX_ECHO_BAN_DURATION_MINUTES"
                class="mt-2 w-full rounded-md border border-border bg-scrim-2 px-3 py-2 text-sm text-foreground tabular-nums outline-none focus:border-rose-400/40"
                @keydown.enter.prevent="onConfirm"
              />
            </div>
          </div>
          <div>
            <label
              class="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle"
              for="ban-reason-input"
            >
              {{ echoT('b22.mam.reasonOptional') }}
            </label>
            <textarea
              id="ban-reason-input"
              ref="banReasonInputRef"
              v-model="banReason"
              rows="3"
              maxlength="500"
              class="mt-2 w-full resize-y rounded-lg border border-border bg-scrim-1 px-3 py-2 text-sm text-foreground placeholder:text-fg-subtle focus:border-rose-400/40 focus:outline-none focus:ring-1 focus:ring-rose-400/30"
              :placeholder="echoT('b22.mam.reasonPlaceholder')"
            />
            <div class="mt-1 text-right text-[11px] text-fg-subtle">
              {{ banReason.length }}/500
            </div>
          </div>
          <div v-if="canDeleteRecentMessages" class="space-y-2">
            <div
              class="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle"
            >
              {{ echoT('b22.mam.deleteHistory') }}
            </div>
            <p class="text-xs leading-relaxed text-fg-subtle">
              {{ echoT('b22.mam.deleteHistoryHelp') }}
            </p>
            <div class="flex flex-col gap-1.5">
              <label
                v-for="opt in DELETE_MESSAGE_HISTORY_PRESETS"
                :key="opt.hours"
                class="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-scrim-1 px-3 py-2 text-sm transition-colors hover:bg-scrim-1"
                :class="
                  selectedDeleteRecentMessagesHours === opt.hours
                    ? 'ring-1 ring-rose-400/45'
                    : ''
                "
              >
                <input
                  v-model.number="selectedDeleteRecentMessagesHours"
                  type="radio"
                  class="h-3.5 w-3.5 accent-rose-500"
                  :value="opt.hours"
                />
                <span class="text-fg-soft">{{ opt.label }}</span>
              </label>
            </div>
          </div>
        </div>

        <div
          class="mt-6 flex items-center justify-end gap-2 border-t border-border pt-4"
        >
          <button
            type="button"
            class="rounded-lg px-4 py-2 text-sm font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-white"
            @click="close"
          >
            {{ echoT('b22.mam.cancel') }}
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors"
            :class="
              action === 'ban'
                ? 'bg-rose-600/85 hover:bg-rose-600'
                : action === 'kick'
                  ? 'bg-amber-600/80 hover:bg-amber-600'
                  : 'bg-violet-600/85 hover:bg-violet-600'
            "
            @click="onConfirm"
          >
            <img
              v-if="action === 'ban'"
              :src="icons.banUser"
              alt=""
              class="h-4 w-4 opacity-90 filter invert"
            />
            <span v-if="action === 'kick'">{{ echoT('b22.mam.kick') }}</span>
            <span v-else-if="action === 'ban'">{{ echoT('b22.mam.ban') }}</span>
            <span v-else-if="action === 'untimeout'">{{
              echoT('b22.mam.removeTimeout')
            }}</span>
            <span v-else>{{ echoT('b22.mam.applyTimeout') }}</span>
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
</style>

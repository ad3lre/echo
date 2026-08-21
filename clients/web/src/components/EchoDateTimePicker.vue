<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import {
  VueDatePicker,
  WeekStart,
  type FormatsConfig,
} from '@vuepic/vue-datepicker';
import '@vuepic/vue-datepicker/dist/main.css';
import {
  formatDateTimeLocal,
  isDateTimeBeforeMin,
  parseDateTimeLocal,
} from '@/features/server-settings/calendarDate';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    /** Earliest selectable moment; `'now'` blocks past dates/times. */
    minDateTime?: Date | 'now';
    /** Shown when a selection is before `minDateTime`. */
    minErrorMessage?: string;
    surface?: 'default' | 'server';
    disabled?: boolean;
    /** External invalid state (e.g. form validation). */
    invalid?: boolean;
    id?: string;
    /** Teleport popover to body (recommended inside modals). */
    teleportMenu?: boolean;
  }>(),
  {
    surface: 'default',
    teleportMenu: true,
    minErrorMessage: 'This date and time cannot be in the past.',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const pickerUid = useId();
const triggerId = computed(() => props.id ?? `echo-dtp-trigger-${pickerUid}`);
const menuId = computed(() => `echo-dtp-menu-${pickerUid}`);
const isServerSurface = computed(() => props.surface === 'server');

/** Snapshot `'now'` when the menu opens so the floor does not drift mid-edit. */
const minNowSnapshot = ref<Date | null>(null);
const panelError = ref('');

const minDate = computed((): Date | undefined => {
  if (props.minDateTime === undefined) return undefined;
  if (props.minDateTime === 'now') {
    return minNowSnapshot.value ?? new Date();
  }
  return props.minDateTime;
});

const pickerValue = computed(() => parseDateTimeLocal(props.modelValue));

function onPickerUpdate(value: unknown) {
  if (value == null) {
    emit('update:modelValue', '');
    return;
  }
  const d = value instanceof Date ? value : parseDateTimeLocal(String(value));
  if (!d) return;
  const next = formatDateTimeLocal(d);
  if (isDateTimeBeforeMin(next, props.minDateTime)) {
    panelError.value = props.minErrorMessage;
    return;
  }
  panelError.value = '';
  emit('update:modelValue', next);
}

function formatPickerDisplay(date: Date): string {
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

const pickerFormats: Partial<FormatsConfig> = {
  input: formatPickerDisplay,
  preview: formatPickerDisplay,
  weekDay: 'EEEEEE',
};

const timeConfig = {
  enableTimePicker: true,
  enableSeconds: false,
  is24: true,
  timePickerInline: true,
};

const actionRow = {
  selectBtnLabel: 'Done',
  cancelBtnLabel: 'Cancel',
  showNow: false,
  showPreview: true,
};

const inputAttrs = computed(() => ({
  id: triggerId.value,
  clearable: false,
  hideInputIcon: true,
  autocomplete: 'off',
}));

const ui = computed(() => ({
  menu: [
    'echo-dtp-menu',
    isServerSurface.value ? 'echo-dtp-menu--server' : 'echo-dtp-menu--default',
  ],
  input: 'echo-dtp-dp-input',
}));

function onOpen() {
  if (props.minDateTime === 'now') {
    minNowSnapshot.value = new Date();
  }
  panelError.value = '';
}

function onInvalidSelect() {
  panelError.value = props.minErrorMessage;
}
</script>

<template>
  <div
    class="echo-dtp"
    :class="[
      isServerSurface ? 'echo-dtp--server' : 'echo-dtp--default',
      props.invalid && 'echo-dtp--invalid',
    ]"
  >
    <VueDatePicker
      :model-value="pickerValue"
      :dark="true"
      :teleport="props.teleportMenu"
      :disabled="props.disabled"
      :min-date="minDate"
      :prevent-min-max-navigation="!!minDate"
      :week-start="WeekStart.Sunday"
      :six-weeks="true"
      :formats="pickerFormats"
      :time-config="timeConfig"
      :action-row="actionRow"
      :input-attrs="inputAttrs"
      :ui="ui"
      :menu-id="menuId"
      placeholder="Select date & time"
      :floating="{ offset: 8 }"
      @update:model-value="onPickerUpdate"
      @open="onOpen"
      @invalid-select="onInvalidSelect"
    >
      <template #dp-input="{ value, isMenuOpen, toggleMenu }">
        <button
          :id="triggerId"
          type="button"
          class="echo-dtp-trigger"
          :class="{ 'echo-dtp-trigger--open': isMenuOpen }"
          :disabled="props.disabled"
          :aria-expanded="isMenuOpen"
          aria-haspopup="dialog"
          :aria-controls="menuId"
          :aria-invalid="props.invalid || !!panelError"
          @click="toggleMenu"
        >
          <span class="echo-dtp-trigger-text truncate">{{
            value || 'Select date & time'
          }}</span>
          <svg
            class="echo-dtp-chevron h-4 w-4 shrink-0 transition-transform"
            :class="{ 'rotate-180': isMenuOpen }"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </template>
    </VueDatePicker>
    <p v-if="panelError" class="mt-2 text-xs text-red-400">{{ panelError }}</p>
  </div>
</template>

<style scoped lang="scss">
.echo-dtp {
  position: relative;
  width: 100%;
}

.echo-dtp :deep(.dp--main),
.echo-dtp :deep(.dp--input-wrap) {
  width: 100%;
}

.echo-dtp-trigger {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  border: none;
  border-radius: 0.9rem;
  padding: 0.85rem 1rem;
  text-align: left;
  outline: none;
  transition:
    box-shadow 0.15s ease,
    background-color 0.15s ease;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  &:focus-visible {
    outline: none;
  }
}

.echo-dtp--default .echo-dtp-trigger {
  background: var(--echo-control-bg);
  box-shadow: inset 0 0 0 1px var(--echo-control-border);
  color: var(--echo-control-fg);

  &:hover:not(:disabled) {
    background: var(--echo-control-bg-hover);
    box-shadow: inset 0 0 0 1px var(--echo-control-border-hover);
  }

  &.echo-dtp-trigger--open,
  &:focus-visible:not(:disabled) {
    box-shadow: inset 0 0 0 1px var(--echo-control-border-focus);
    background: var(--echo-control-bg-active);
  }
}

.echo-dtp--server .echo-dtp-trigger {
  background: var(--srv-input-bg);
  box-shadow: inset 0 0 0 1px var(--srv-input-ring);
  color: var(--srv-input-fg);

  &:hover:not(:disabled) {
    background: var(--srv-role-trigger-hover-bg);
  }

  &.echo-dtp-trigger--open,
  &:focus-visible:not(:disabled) {
    box-shadow: inset 0 0 0 1px var(--srv-input-focus-ring);
  }
}

.echo-dtp--invalid .echo-dtp-trigger {
  box-shadow:
    inset 0 0 0 1px var(--srv-input-ring),
    0 0 0 1px rgb(248 113 113 / 0.6);
}

.echo-dtp-trigger-text {
  min-width: 0;
  flex: 1;
  font-size: 0.875rem;
}

.echo-dtp--default .echo-dtp-chevron {
  color: var(--echo-control-chevron);
}

.echo-dtp--server .echo-dtp-chevron {
  color: var(--srv-subtitle-fg);
}
</style>

<!-- Teleported menu is mounted on body; variables must not be scoped. -->
<style lang="scss">
.echo-dtp-menu {
  --dp-font-family: inherit;
  --dp-border-radius: 0.9rem;
  --dp-cell-border-radius: 0.5rem;
  --dp-menu-min-width: 280px;
  --dp-time-font-size: 1.15rem;
  --dp-font-size: 0.875rem;
  --dp-background-color: color-mix(
    in srgb,
    var(--echo-menu-bg, var(--bg)) 94%,
    transparent
  );
  --dp-text-color: var(--echo-control-fg, var(--fg));
  --dp-hover-color: var(--glass-hover, rgb(255 255 255 / 0.08));
  --dp-hover-text-color: var(--echo-control-fg, var(--fg));
  --dp-hover-icon-color: var(--echo-control-chevron, var(--muted));
  --dp-primary-color: var(--accent);
  --dp-primary-disabled-color: color-mix(
    in srgb,
    var(--accent) 45%,
    transparent
  );
  --dp-primary-text-color: white;
  --dp-secondary-color: var(--fg-soft, var(--muted));
  --dp-border-color: var(--echo-control-border, var(--border));
  --dp-menu-border-color: var(
    --echo-menu-surface-border,
    var(--echo-control-border, var(--border))
  );
  --dp-border-color-hover: var(--echo-control-border-hover, var(--border));
  --dp-border-color-focus: var(--echo-control-border-focus, var(--accent));
  --dp-disabled-color: transparent;
  --dp-disabled-color-text: var(--fg-soft, var(--muted));
  --dp-icon-color: var(--echo-control-chevron, var(--muted));
  --dp-danger-color: rgb(248 113 113);
  --dp-success-color: var(--accent);
  --dp-scroll-bar-background: transparent;
  --dp-scroll-bar-color: var(--border);
  --dp-highlight-color: color-mix(in srgb, var(--accent) 20%, transparent);

  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.echo-dtp-menu--server {
  --dp-background-color: var(--srv-input-bg, var(--echo-menu-bg));
  --dp-text-color: var(--srv-input-fg, var(--fg));
  --dp-hover-color: var(--srv-role-trigger-hover-bg, var(--glass-hover));
  --dp-hover-text-color: var(--srv-input-fg, var(--fg));
  --dp-border-color: var(--srv-input-ring, var(--border));
  --dp-menu-border-color: transparent;
  --dp-icon-color: var(--srv-subtitle-fg, var(--muted));
  background: var(--srv-role-menu-bg, var(--dp-background-color));
  box-shadow: var(--srv-role-menu-shadow, none);
}
</style>

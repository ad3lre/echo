<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  useId,
  watch,
} from 'vue';
import {
  buildMonthGrid,
  ceilToFiveMinutes,
  compareCalendarDays,
  dateToCalendarKey,
  formatDateTimeLocal,
  isSameCalendarDay,
  parseDateTimeLocal,
  resolveMinDateTime,
  startOfDay,
  type CalendarCell,
} from '@/utils/calendarDate';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    /** Earliest selectable moment; `'now'` blocks past dates/times. */
    minDateTime?: Date | 'now';
    /** Shown when draft is before `minDateTime`. */
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

const isOpen = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const openUpward = ref(false);
const fixedMenuStyle = ref<Record<string, string>>({});
const panelError = ref('');

const viewYear = ref(new Date().getFullYear());
const viewMonth = ref(new Date().getMonth());
const draftDay = ref(startOfDay(new Date()));
const draftHour = ref(12);
const draftMinute = ref(0);
const focusedDayKey = ref('');
const pickerUid = useId();
const triggerId = computed(() => props.id ?? `echo-dtp-trigger-${pickerUid}`);
const panelId = computed(() => `echo-dtp-panel-${pickerUid}`);

const isServerSurface = computed(() => props.surface === 'server');
const minResolved = computed(() => resolveMinDateTime(props.minDateTime));

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

const monthGrid = computed(() =>
  buildMonthGrid(viewYear.value, viewMonth.value),
);

const monthLabel = computed(() =>
  new Date(viewYear.value, viewMonth.value, 1).toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  }),
);

const displayText = computed(() => {
  const d = parseDateTimeLocal(props.modelValue);
  if (!d) return 'Select date & time';
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
});

const draftValue = computed(() => {
  const d = new Date(
    draftDay.value.getFullYear(),
    draftDay.value.getMonth(),
    draftDay.value.getDate(),
    draftHour.value,
    draftMinute.value,
  );
  return formatDateTimeLocal(d);
});

const hourOptions = computed(() => {
  const min = minResolved.value;
  const onMinDay = min != null && isSameCalendarDay(draftDay.value, min);
  const minHour = onMinDay ? min.getHours() : 0;
  return Array.from({ length: 24 }, (_, h) => ({
    value: h,
    disabled: onMinDay && h < minHour,
  }));
});

const minuteOptions = computed(() => {
  const min = minResolved.value;
  const onMinDay = min != null && isSameCalendarDay(draftDay.value, min);
  const minHour = onMinDay ? min.getHours() : -1;
  const minMinute =
    onMinDay && draftHour.value === minHour ? min.getMinutes() : 0;
  return Array.from({ length: 60 }, (_, m) => ({
    value: m,
    disabled: onMinDay && draftHour.value === minHour && m < minMinute,
  }));
});

function isDayDisabled(date: Date): boolean {
  const min = minResolved.value;
  if (!min) return false;
  return compareCalendarDays(date, min) < 0;
}

function syncDraftFromModel() {
  const parsed = parseDateTimeLocal(props.modelValue);
  let d = parsed ?? ceilToFiveMinutes(minResolved.value ?? new Date());
  const min = minResolved.value;
  if (min && d.getTime() < min.getTime()) {
    d = ceilToFiveMinutes(min);
  }
  draftDay.value = startOfDay(d);
  draftHour.value = d.getHours();
  draftMinute.value = d.getMinutes();
  viewYear.value = d.getFullYear();
  viewMonth.value = d.getMonth();
  focusedDayKey.value = dateToCalendarKey(d);
  panelError.value = '';
}

function validateDraft(): string {
  const min = minResolved.value;
  if (!min) return '';
  const d = parseDateTimeLocal(draftValue.value);
  if (!d) return 'Pick a valid date and time.';
  if (d.getTime() < min.getTime()) {
    return props.minErrorMessage;
  }
  return '';
}

function validateDraftLive() {
  panelError.value = validateDraft();
}

function clampTimeToMin() {
  const min = minResolved.value;
  if (!min || !isSameCalendarDay(draftDay.value, min)) return;
  if (draftHour.value < min.getHours()) {
    draftHour.value = min.getHours();
    draftMinute.value = min.getMinutes();
    return;
  }
  if (
    draftHour.value === min.getHours() &&
    draftMinute.value < min.getMinutes()
  ) {
    draftMinute.value = min.getMinutes();
  }
}

function selectDay(cell: CalendarCell) {
  if (isDayDisabled(cell.date)) return;
  draftDay.value = startOfDay(cell.date);
  focusedDayKey.value = dateToCalendarKey(cell.date);
  clampTimeToMin();
  validateDraftLive();
}

function dayButtonClass(cell: CalendarCell): string {
  const key = dateToCalendarKey(cell.date);
  const selected = key === dateToCalendarKey(draftDay.value);
  const focused = key === focusedDayKey.value;
  const disabled = isDayDisabled(cell.date);
  const base =
    'echo-dtp-day h-9 w-9 rounded-lg text-sm font-medium transition-colors';
  if (disabled) {
    return `${base} cursor-not-allowed opacity-35`;
  }
  if (selected) {
    return `${base} echo-dtp-day--selected`;
  }
  if (focused) {
    return `${base} echo-dtp-day--focused`;
  }
  if (!cell.inMonth) {
    return `${base} echo-dtp-day--muted`;
  }
  return `${base} echo-dtp-day--default`;
}

function prevMonth() {
  if (viewMonth.value === 0) {
    viewMonth.value = 11;
    viewYear.value -= 1;
  } else {
    viewMonth.value -= 1;
  }
}

function nextMonth() {
  if (viewMonth.value === 11) {
    viewMonth.value = 0;
    viewYear.value += 1;
  } else {
    viewMonth.value += 1;
  }
}

function moveFocusedDay(deltaDays: number) {
  const current = parseDateTimeLocal(`${focusedDayKey.value}T12:00`);
  const base = current ?? draftDay.value;
  const next = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + deltaDays,
  );
  focusedDayKey.value = dateToCalendarKey(next);
  if (
    next.getMonth() !== viewMonth.value ||
    next.getFullYear() !== viewYear.value
  ) {
    viewMonth.value = next.getMonth();
    viewYear.value = next.getFullYear();
  }
}

function onDayKeydown(ev: KeyboardEvent, cell: CalendarCell) {
  if (ev.key === 'ArrowLeft') {
    ev.preventDefault();
    moveFocusedDay(-1);
  } else if (ev.key === 'ArrowRight') {
    ev.preventDefault();
    moveFocusedDay(1);
  } else if (ev.key === 'ArrowUp') {
    ev.preventDefault();
    moveFocusedDay(-7);
  } else if (ev.key === 'ArrowDown') {
    ev.preventDefault();
    moveFocusedDay(7);
  } else if (ev.key === 'Enter' || ev.key === ' ') {
    ev.preventDefault();
    selectDay(cell);
  }
}

const PANEL_APPROX_HEIGHT = 380;
const GAP = 8;

function syncPanelGeometry() {
  const el = triggerRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - GAP;
  const spaceAbove = rect.top - GAP;
  openUpward.value =
    spaceBelow < PANEL_APPROX_HEIGHT && spaceAbove > spaceBelow;
  const width = Math.max(rect.width, 280);
  let left = rect.left;
  if (left + width > window.innerWidth - GAP) {
    left = Math.max(GAP, window.innerWidth - width - GAP);
  }
  const top = openUpward.value ? rect.top - GAP : rect.bottom + GAP;
  fixedMenuStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    transform: openUpward.value ? 'translateY(-100%)' : 'none',
  };
}

async function openPanel() {
  if (props.disabled) return;
  syncDraftFromModel();
  isOpen.value = true;
  await nextTick();
  syncPanelGeometry();
}

function closePanel() {
  isOpen.value = false;
  panelError.value = '';
}

function confirmSelection() {
  clampTimeToMin();
  const err = validateDraft();
  if (err) {
    panelError.value = err;
    return;
  }
  emit('update:modelValue', draftValue.value);
  closePanel();
}

function onDocumentPointerDown(ev: MouseEvent) {
  if (!isOpen.value) return;
  const t = ev.target as Node;
  if (triggerRef.value?.contains(t) || panelRef.value?.contains(t)) return;
  closePanel();
}

function onWindowChange() {
  if (isOpen.value) syncPanelGeometry();
}

watch([draftHour, draftMinute], () => {
  if (isOpen.value) validateDraftLive();
});

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown);
  window.addEventListener('resize', onWindowChange);
  window.addEventListener('scroll', onWindowChange, true);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown);
  window.removeEventListener('resize', onWindowChange);
  window.removeEventListener('scroll', onWindowChange, true);
});
</script>

<template>
  <div
    class="echo-dtp"
    :class="[
      isServerSurface ? 'echo-dtp--server' : 'echo-dtp--default',
      props.invalid && 'echo-dtp--invalid',
    ]"
  >
    <button
      :id="triggerId"
      ref="triggerRef"
      type="button"
      class="echo-dtp-trigger"
      :class="{ 'echo-dtp-trigger--open': isOpen }"
      :disabled="props.disabled"
      :aria-expanded="isOpen"
      aria-haspopup="dialog"
      :aria-controls="panelId"
      @click="isOpen ? closePanel() : openPanel()"
    >
      <span class="echo-dtp-trigger-text truncate">{{ displayText }}</span>
      <svg
        class="echo-dtp-chevron h-4 w-4 shrink-0 transition-transform"
        :class="{ 'rotate-180': isOpen }"
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

    <Teleport to="body" :disabled="!props.teleportMenu">
      <Transition name="echo-dtp-fade">
        <div
          v-if="isOpen"
          :id="panelId"
          ref="panelRef"
          role="dialog"
          aria-modal="false"
          :aria-labelledby="triggerId"
          class="echo-dtp-panel"
          :class="[
            props.teleportMenu ? 'fixed z-[430]' : 'absolute z-[430] mt-2',
            isServerSurface && 'echo-dtp-panel--server',
            !props.teleportMenu && openUpward && 'bottom-full mb-2 mt-0',
          ]"
          :style="props.teleportMenu ? fixedMenuStyle : undefined"
        >
          <div class="echo-dtp-panel-inner">
            <div class="flex items-center justify-between gap-2 px-1 pb-2">
              <button
                type="button"
                class="echo-dtp-nav-btn"
                aria-label="Previous month"
                @click="prevMonth"
              >
                ‹
              </button>
              <div class="text-sm font-semibold">{{ monthLabel }}</div>
              <button
                type="button"
                class="echo-dtp-nav-btn"
                aria-label="Next month"
                @click="nextMonth"
              >
                ›
              </button>
            </div>

            <div
              class="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide echo-dtp-weekdays"
            >
              <span v-for="wd in WEEKDAY_LABELS" :key="wd">{{ wd }}</span>
            </div>
            <div class="mt-1 grid grid-cols-7 gap-1">
              <button
                v-for="cell in monthGrid"
                :key="dateToCalendarKey(cell.date)"
                type="button"
                :class="dayButtonClass(cell)"
                :disabled="isDayDisabled(cell.date)"
                :tabindex="
                  dateToCalendarKey(cell.date) === focusedDayKey ? 0 : -1
                "
                :aria-label="
                  cell.date.toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })
                "
                :aria-pressed="
                  dateToCalendarKey(cell.date) === dateToCalendarKey(draftDay)
                "
                @click="selectDay(cell)"
                @keydown="onDayKeydown($event, cell)"
              >
                {{ cell.date.getDate() }}
              </button>
            </div>

            <div class="mt-3 flex items-center gap-2">
              <label class="echo-dtp-time-label">
                <span class="sr-only">Hour</span>
                <select
                  v-model.number="draftHour"
                  class="echo-dtp-time-select"
                  @change="clampTimeToMin"
                >
                  <option
                    v-for="opt in hourOptions"
                    :key="opt.value"
                    :value="opt.value"
                    :disabled="opt.disabled"
                  >
                    {{ String(opt.value).padStart(2, '0') }}
                  </option>
                </select>
              </label>
              <span class="text-sm font-semibold echo-dtp-time-sep">:</span>
              <label class="echo-dtp-time-label">
                <span class="sr-only">Minute</span>
                <select
                  v-model.number="draftMinute"
                  class="echo-dtp-time-select"
                >
                  <option
                    v-for="opt in minuteOptions"
                    :key="opt.value"
                    :value="opt.value"
                    :disabled="opt.disabled"
                  >
                    {{ String(opt.value).padStart(2, '0') }}
                  </option>
                </select>
              </label>
            </div>

            <p v-if="panelError" class="mt-2 text-xs text-red-400">
              {{ panelError }}
            </p>

            <div class="mt-3 flex justify-end gap-2">
              <button
                type="button"
                class="echo-dtp-action echo-dtp-action--ghost"
                @click="closePanel"
              >
                Cancel
              </button>
              <button
                type="button"
                class="echo-dtp-action echo-dtp-action--primary"
                :disabled="!!panelError"
                @click="confirmSelection"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.echo-dtp {
  position: relative;
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

.echo-dtp-panel {
  border-radius: 0.9rem;
  background: var(--echo-control-bg, var(--bg));
  box-shadow:
    0 16px 40px rgb(0 0 0 / 0.35),
    inset 0 0 0 1px var(--echo-control-border, var(--border));
  color: var(--echo-control-fg, var(--fg));
}

.echo-dtp-panel--server {
  background: var(--srv-input-bg);
  box-shadow:
    0 16px 40px rgb(0 0 0 / 0.35),
    inset 0 0 0 1px var(--srv-input-ring);
  color: var(--srv-input-fg);
}

.echo-dtp-panel-inner {
  padding: 0.85rem;
}

.echo-dtp-nav-btn {
  display: inline-flex;
  height: 2rem;
  width: 2rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  font-size: 1.25rem;
  line-height: 1;
  color: inherit;
  opacity: 0.85;
  transition: background-color 0.15s ease;

  &:hover {
    background: var(--glass-hover, rgb(255 255 255 / 0.08));
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
}

.echo-dtp-weekdays {
  color: var(--fg-soft, var(--muted));
}

.echo-dtp-day--default:hover:not(:disabled) {
  background: var(--glass-hover, rgb(255 255 255 / 0.08));
}

.echo-dtp-day--muted {
  opacity: 0.45;
}

.echo-dtp-day--focused {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.echo-dtp-day--selected {
  background: var(--accent);
  color: white;
}

.echo-dtp-time-label {
  flex: 1;
}

.echo-dtp-time-select {
  width: 100%;
  border: none;
  border-radius: 0.65rem;
  padding: 0.45rem 0.55rem;
  font-size: 0.875rem;
  background: var(--glass-1, rgb(255 255 255 / 0.06));
  box-shadow: inset 0 0 0 1px var(--border);
  color: inherit;
  outline: none;

  &:focus-visible {
    box-shadow: inset 0 0 0 1px var(--accent);
  }
}

.echo-dtp-time-sep {
  color: var(--fg-soft, var(--muted));
}

.echo-dtp-action {
  border-radius: 0.65rem;
  padding: 0.45rem 0.85rem;
  font-size: 0.8125rem;
  font-weight: 600;
  transition: background-color 0.15s ease;

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
}

.echo-dtp-action--ghost {
  color: var(--fg-soft, var(--muted));

  &:hover {
    background: var(--glass-hover, rgb(255 255 255 / 0.08));
  }
}

.echo-dtp-action--primary {
  background: var(--accent);
  color: white;

  &:hover:not(:disabled) {
    opacity: 0.92;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}

.echo-dtp-fade-enter-active,
.echo-dtp-fade-leave-active {
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}

.echo-dtp-fade-enter-from,
.echo-dtp-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import StatusIndicator from '@/components/StatusIndicator.vue';
import { icons } from '@/assets/icons';
import type { MemberProfile, PopoutAnchorRect } from '@/utils/memberProfiles';
import {
  clampFixedOverlayBox,
  readOverlayVisibleViewport,
} from '@/utils/overlayViewport';

type PresenceStatus = 'online' | 'idle' | 'do_not_disturb' | 'offline';

const props = defineProps<{
  modelValue: boolean;
  profile: MemberProfile | null;
  anchor: PopoutAnchorRect | null;
  customStatus: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'update:customStatus': [value: string];
  'update:status': [value: PresenceStatus];
  'open-full-profile': [];
  'open-settings': [];
}>();

const CUSTOM_STATUS_MAX_LENGTH = 140;
/** ~8 wrapped lines at popout width — keeps the panel from growing without bound. */
const CUSTOM_STATUS_MAX_LINES = 8;

const draftStatus = ref('');
const isEditingCustomStatus = ref(false);
const statusInputRef = ref<HTMLTextAreaElement | null>(null);
const popoutLayoutTick = ref(0);

watch(
  () => props.customStatus,
  (value) => {
    draftStatus.value = value;
  },
  { immediate: true },
);

const statusOptionsPrimary: Array<{
  id: PresenceStatus;
  label: string;
  description: string;
}> = [
  { id: 'online', label: 'Online', description: 'Show as active' },
  { id: 'idle', label: 'Idle', description: 'Away for a bit' },
];

const statusOptionDnd = {
  id: 'do_not_disturb' as const,
  label: 'Do Not Disturb',
  description: 'No notifications',
};

function openSettingsFromStatusTray() {
  emit('open-settings');
  emit('update:modelValue', false);
}

const placement = computed(() => {
  void popoutLayoutTick.value;
  const width = 340;
  const padding = 16;
  const viewport = readOverlayVisibleViewport();
  const viewportWidth = viewport.width;
  const viewportHeight = viewport.height;
  const popoutHeight = Math.min(320, viewportHeight - padding * 2);
  const gap = 12;
  const visibleRight = viewport.offsetLeft + viewportWidth;
  const visibleBottom = viewport.offsetTop + viewportHeight;

  if (!props.anchor) {
    const centered = clampFixedOverlayBox(
      viewport.offsetLeft + viewportWidth / 2 - width / 2,
      viewport.offsetTop + viewportHeight / 2 - popoutHeight / 2,
      width,
      popoutHeight,
      viewport,
      padding,
    );
    return {
      side: 'right' as const,
      style: {
        left: `${centered.left}px`,
        top: `${centered.top}px`,
      },
    };
  }

  const side =
    visibleRight - props.anchor.right - padding >= width + gap
      ? 'right'
      : 'left';
  let left =
    side === 'right'
      ? Math.min(props.anchor.right + gap, visibleRight - width - padding)
      : Math.max(
          props.anchor.left - width - gap,
          viewport.offsetLeft + padding,
        );

  /** Top action rail / window edge: anchor sits high — open below the avatar instead of pinning with `bottom` (avoids clipping). */
  const anchorHigh = props.anchor.top < viewport.offsetTop + 100;
  if (anchorHigh) {
    const topPx = props.anchor.bottom + gap;
    const maxHeightPx = Math.max(280, visibleBottom - topPx - padding);
    const fitted = clampFixedOverlayBox(
      left,
      topPx,
      width,
      Math.min(popoutHeight, maxHeightPx),
      viewport,
      padding,
    );
    return {
      side,
      style: {
        left: `${fitted.left}px`,
        top: `${fitted.top}px`,
        maxHeight: `${maxHeightPx}px`,
      },
    };
  }

  const layoutHeight =
    typeof window !== 'undefined' ? window.innerHeight : viewportHeight;
  const bottomPx = layoutHeight - props.anchor.top + 8;
  const maxHeightPx = Math.max(
    120,
    props.anchor.top - viewport.offsetTop - padding - 8,
  );
  left = Math.min(
    Math.max(left, viewport.offsetLeft + padding),
    Math.max(viewport.offsetLeft + padding, visibleRight - width - padding),
  );

  return {
    side,
    style: {
      left: `${left}px`,
      bottom: `${bottomPx}px`,
      maxHeight: `${maxHeightPx}px`,
    },
  };
});

function closePopout() {
  emit('update:modelValue', false);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closePopout();
}

function commitCustomStatus() {
  emit(
    'update:customStatus',
    draftStatus.value.trim().slice(0, CUSTOM_STATUS_MAX_LENGTH),
  );
  isEditingCustomStatus.value = false;
}

function cancelCustomStatusEdit() {
  draftStatus.value = props.customStatus;
  isEditingCustomStatus.value = false;
}

function resizeStatusInput(el?: HTMLTextAreaElement | null) {
  const ta = el ?? statusInputRef.value;
  if (!ta) return;
  const linePx = parseFloat(getComputedStyle(ta).lineHeight) || 20.3;
  const maxHeight = linePx * CUSTOM_STATUS_MAX_LINES;
  ta.style.height = 'auto';
  const next = Math.max(linePx, Math.min(ta.scrollHeight, maxHeight));
  ta.style.height = `${next}px`;
  ta.style.overflowY = ta.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

function beginCustomStatusEdit() {
  if (isEditingCustomStatus.value) return;
  isEditingCustomStatus.value = true;
  draftStatus.value = props.customStatus;
  nextTick(() => {
    resizeStatusInput();
    statusInputRef.value?.focus();
  });
}

function onStatusInput(event: Event) {
  resizeStatusInput(event.target as HTMLTextAreaElement);
}

function handleViewportUpdate() {
  popoutLayoutTick.value += 1;
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('resize', handleViewportUpdate);
  window.visualViewport?.addEventListener('resize', handleViewportUpdate);
  window.visualViewport?.addEventListener('scroll', handleViewportUpdate);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('resize', handleViewportUpdate);
  window.visualViewport?.removeEventListener('resize', handleViewportUpdate);
  window.visualViewport?.removeEventListener('scroll', handleViewportUpdate);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue && profile"
      class="fixed inset-0 z-[170]"
      @click="closePopout"
    >
      <article
        class="self-popout fixed"
        :class="
          placement.side === 'right'
            ? 'self-popout--right'
            : 'self-popout--left'
        "
        :style="placement.style"
        @click.stop
      >
        <section
          class="self-popout__panel self-popout__panel--status chat-liquid-glass-menu group"
          @click="beginCustomStatusEdit"
        >
          <div class="self-popout__panel-label">Custom Status</div>
          <div class="self-popout__status-row">
            <div class="self-popout__quote-icon" aria-hidden="true">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.274-.226.653-.366 1.074-.366 1.796 0 3.25 1.454 3.25 3.25 0 1.796-1.454 3.25-3.25 3.25-1.076 0-2.008-.52-2.167-1.635zm10.5 0c-1.03-1.094-1.583-2.321-1.583-4.31 0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.274-.226.653-.366 1.074-.366 1.796 0 3.25 1.454 3.25 3.25 0 1.796-1.454 3.25-3.25 3.25-1.076 0-2.008-.52-2.167-1.635z"
                />
              </svg>
            </div>
            <div class="min-w-0 flex-1 self-popout__status-value">
              <textarea
                v-if="isEditingCustomStatus"
                ref="statusInputRef"
                v-model="draftStatus"
                rows="1"
                :maxlength="CUSTOM_STATUS_MAX_LENGTH"
                class="self-popout__status-input"
                placeholder="Set a custom status..."
                @blur="commitCustomStatus"
                @input="onStatusInput"
                @keydown.esc.stop.prevent="cancelCustomStatusEdit"
                @keydown.meta.enter.prevent="commitCustomStatus"
                @keydown.ctrl.enter.prevent="commitCustomStatus"
                @click.stop
              />
              <p v-else class="self-popout__status-text">
                {{ customStatus || 'Set a custom status' }}
              </p>
            </div>
          </div>
        </section>

        <section
          class="self-popout__panel self-popout__panel--presence chat-liquid-glass-menu"
        >
          <div class="self-popout__panel-label">Online Status</div>
          <button
            v-for="option in statusOptionsPrimary"
            :key="option.id"
            type="button"
            class="self-popout__presence-option"
            :class="
              profile.status === option.id
                ? 'self-popout__presence-option--active'
                : ''
            "
            @click.stop="emit('update:status', option.id)"
          >
            <div class="relative flex h-5 w-5 items-center justify-center">
              <StatusIndicator :status="option.id" size="sm" />
            </div>
            <div class="flex-1 min-w-0 text-left">
              <div class="self-popout__presence-title">{{ option.label }}</div>
              <div class="self-popout__presence-description">
                {{ option.description }}
              </div>
            </div>
            <div
              v-if="profile.status === option.id"
              class="self-popout__presence-check shrink-0"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
          </button>

          <div class="self-popout__presence-dnd-row">
            <button
              type="button"
              class="self-popout__presence-option self-popout__presence-option--dnd"
              :class="
                profile.status === statusOptionDnd.id
                  ? 'self-popout__presence-option--active'
                  : ''
              "
              @click.stop="emit('update:status', statusOptionDnd.id)"
            >
              <div
                class="relative flex h-5 w-5 shrink-0 items-center justify-center"
              >
                <StatusIndicator :status="statusOptionDnd.id" size="sm" />
              </div>
              <div class="min-w-0 flex-1 text-left">
                <div class="self-popout__presence-title truncate">
                  {{ statusOptionDnd.label }}
                </div>
                <div class="self-popout__presence-description truncate">
                  {{ statusOptionDnd.description }}
                </div>
              </div>
              <div
                v-if="profile.status === statusOptionDnd.id"
                class="self-popout__presence-check shrink-0"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
            </button>
            <button
              type="button"
              class="self-popout__presence-gear chat-focus-ring"
              title="User settings"
              aria-label="Open user settings"
              @click.stop="openSettingsFromStatusTray"
            >
              <img
                :src="icons.settings"
                alt=""
                class="h-[18px] w-[18px] opacity-85 filter invert"
              />
            </button>
          </div>
        </section>
      </article>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.self-popout {
  width: min(340px, calc(100vw - 32px));
  display: grid;
  grid-template-rows: auto auto;
  gap: 0.8rem;
  min-height: 0;
  animation: popout-enter 160ms cubic-bezier(0.16, 1, 0.3, 1);
}

/* Same glass as chat header (.chat-liquid-glass-menu); keep layout + larger radius */
.self-popout__panel {
  position: relative;
  border-radius: 22px !important;
  padding: 1rem;
}

.self-popout__panel--status {
  transform: none;
  min-height: 0;
  overflow-y: auto;
}

.self-popout__panel--presence {
  transform: none;
}

.self-popout__panel-label {
  position: relative;
  z-index: 1;
  margin-bottom: 0.7rem;
  padding-left: 0.15rem;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--vue-auto-067);
}

.self-popout__status-row {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
}

.self-popout__quote-icon {
  margin-top: 2px;
  color: var(--vue-auto-228);
}

/* Reserve at least one line so swapping <p> ↔ textarea does not jump the popout. */
.self-popout__status-value {
  min-height: 1.45rem;
}

.self-popout__status-text,
.self-popout__status-input {
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  border: 0;
  background: transparent;
  padding: 0;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.45rem;
  color: var(--vue-auto-009);
  outline: none;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.self-popout__status-text {
  cursor: text;
  min-height: 1.45rem;
}

.self-popout__status-input {
  display: block;
  min-height: 1.45rem;
  resize: none;
  overflow-x: hidden;
}

.self-popout__status-input::placeholder {
  color: var(--vue-auto-072);
}

.self-popout__presence-option {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  width: 100%;
  border-radius: 16px;
  padding: 0.7rem 0.7rem;
  transition:
    background-color 140ms ease,
    box-shadow 140ms ease,
    transform 140ms ease;
}

.self-popout__presence-option + .self-popout__presence-option {
  margin-top: 0.15rem;
}

.self-popout__presence-dnd-row {
  display: flex;
  align-items: stretch;
  gap: 0.35rem;
  margin-top: 0.15rem;
}

.self-popout__presence-option--dnd {
  flex: 1;
  min-width: 0;
  padding-left: 0.55rem;
  padding-right: 0.55rem;
}

.self-popout__presence-gear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  flex-shrink: 0;
  border: 0;
  border-radius: 16px;
  background: transparent;
  color: var(--vue-auto-043);
  cursor: pointer;
  transition: background-color 140ms ease;
}

.self-popout__presence-gear:hover {
  background: var(--vue-auto-001);
}

.self-popout__presence-option:hover {
  background: var(--vue-auto-005);
}

.self-popout__presence-option--active {
  background: linear-gradient(135deg, var(--vue-auto-229), var(--vue-auto-230));
  box-shadow: inset 0 0 0 1px var(--vue-auto-231);
}

.self-popout__presence-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--vue-auto-012);
}

.self-popout__presence-description {
  margin-top: 2px;
  font-size: 11px;
  color: var(--vue-auto-232);
}

.self-popout__presence-check {
  color: var(--vue-auto-233);
}

@keyframes popout-enter {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.self-popout--right {
  transform-origin: bottom left;
}

.self-popout--left {
  transform-origin: bottom right;
}
</style>

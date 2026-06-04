<script setup lang="ts">
import { computed, ref, watch, toRef } from 'vue';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { useAutofocusOnOpen } from '@/composables/useAutofocusOnOpen';
import EchoDropdown from '@/components/EchoDropdown.vue';
import ChannelIconPickerPopover from '@/components/ChannelIconPickerPopover.vue';
import { icons } from '@/assets/icons';
import {
  clampEchoChannelName,
  ECHO_CHANNEL_NAME_MAX_LENGTH,
} from '@shared/echoChannelLimits';

export type CreateChannelCategoryOption = { id: string; label: string };

const props = defineProps<{
  modelValue: boolean;
  serverName: string;
  /** Server scope for the icon emoji picker (optional). */
  serverId?: string | null;
  categoryOptions: CreateChannelCategoryOption[];
  /** When set, category dropdown defaults to this id */
  initialCategoryId?: string | null;
}>();

export type CreateChannelModalSubmitPayload =
  | {
      kind: 'channel';
      name: string;
      type: 'text' | 'voice' | 'stage' | 'forum' | 'paper';
      categoryId: string;
      iconKey: string;
    }
  | { kind: 'category'; name: string };

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submit: [payload: CreateChannelModalSubmitPayload];
}>();

type CreationMode = 'text' | 'voice' | 'stage' | 'forum' | 'paper' | 'category';

const CHANNEL_TYPE_OPTIONS: {
  id: CreationMode;
  label: string;
  subtitle: string;
  icon: string;
}[] = [
  {
    id: 'text',
    label: 'Text',
    subtitle: 'Send messages',
    icon: icons.hashtag,
  },
  {
    id: 'forum',
    label: 'Forum',
    subtitle: 'Organized threads',
    icon: icons.messageAlt,
  },
  {
    id: 'paper',
    label: 'Paper',
    subtitle: 'Collaborative document',
    icon: icons.file,
  },
  {
    id: 'voice',
    label: 'Voice',
    subtitle: 'Voice, video, screen share',
    icon: icons.volumeUp,
  },
  {
    id: 'stage',
    label: 'Stage',
    subtitle: 'Events and panels',
    icon: icons.sofa,
  },
  {
    id: 'category',
    label: 'Category',
    subtitle: 'Group channels',
    icon: icons.list,
  },
];

const modalRef = ref<HTMLElement | null>(null);
const channelNameInputRef = ref<HTMLInputElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

useAutofocusOnOpen(toRef(props, 'modelValue'), channelNameInputRef);

const channelName = ref('');
const creationMode = ref<CreationMode>('text');
const selectedCategory = ref('');
const selectedIconKey = ref<string>('message');

const categoryDropdownOptions = computed(() =>
  props.categoryOptions.map((o) => ({ label: o.label, value: o.id })),
);

const isCategoryMode = computed(() => creationMode.value === 'category');

const channelNamePrefixIcon = computed(() => {
  if (isCategoryMode.value) return null;
  if (creationMode.value === 'voice') return icons.volumeUp;
  if (creationMode.value === 'stage') return icons.sofa;
  if (creationMode.value === 'paper') return icons.file;
  if (creationMode.value === 'forum') return icons.messageAlt;
  return icons.hashtag;
});

function defaultIconForType(
  t: 'text' | 'voice' | 'stage' | 'forum' | 'paper',
): string {
  if (t === 'voice') return 'volumeUp';
  if (t === 'stage') return 'sofa';
  if (t === 'forum') return 'messageAlt';
  if (t === 'paper') return 'file';
  return 'message';
}

const trimmedName = computed(() => channelName.value.trim());
const categoryNameIsDuplicate = computed(() =>
  props.categoryOptions.some((o) => o.label === trimmedName.value),
);

const canSubmit = computed(() => {
  if (!trimmedName.value) return false;
  if (creationMode.value === 'category') return !categoryNameIsDuplicate.value;
  return !!selectedCategory.value;
});

const submitLabel = computed(() =>
  isCategoryMode.value ? 'Create category' : 'Create channel',
);

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    channelName.value = '';
    creationMode.value = 'text';
    selectedIconKey.value = defaultIconForType('text');
    const opts = props.categoryOptions;
    const init = props.initialCategoryId;
    if (init && opts.some((o) => o.id === init)) {
      selectedCategory.value = init;
    } else {
      selectedCategory.value = opts[0]?.id ?? '';
    }
  },
);

watch(
  () => [props.initialCategoryId, props.modelValue] as const,
  () => {
    if (!props.modelValue || !props.initialCategoryId) return;
    if (props.categoryOptions.some((o) => o.id === props.initialCategoryId)) {
      selectedCategory.value = props.initialCategoryId!;
    }
  },
);

watch(creationMode, (mode) => {
  if (
    mode === 'text' ||
    mode === 'voice' ||
    mode === 'stage' ||
    mode === 'forum' ||
    mode === 'paper'
  ) {
    selectedIconKey.value = defaultIconForType(mode);
  }
});

function close() {
  emit('update:modelValue', false);
}

function submit() {
  const name = trimmedName.value;
  if (!name || !canSubmit.value) return;
  if (creationMode.value === 'category') {
    emit('submit', { kind: 'category', name });
    emit('update:modelValue', false);
    return;
  }
  emit('submit', {
    kind: 'channel',
    name: clampEchoChannelName(name),
    type: creationMode.value,
    categoryId: selectedCategory.value,
    iconKey: selectedIconKey.value,
  });
  emit('update:modelValue', false);
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-[150] flex items-center justify-center modal-overlay-bg px-4 py-6"
    @click.self="close"
  >
    <div
      ref="modalRef"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-channel-title"
      class="create-channel-modal real-glass-modal relative w-full max-w-[400px] rounded-2xl p-4 text-foreground sm:p-5"
      @click.stop
    >
      <div class="create-channel-stack">
        <div class="cc-widget cc-widget--toolbar">
          <div class="cc-widget-header">
            <div class="min-w-0 flex-1">
              <h2
                id="create-channel-title"
                class="cc-widget-title cc-widget-title--header"
              >
                {{ isCategoryMode ? 'Create category' : 'Create channel' }}
              </h2>
              <p class="cc-widget-subtitle">
                in
                <span class="font-medium text-foreground">{{
                  serverName
                }}</span>
              </p>
            </div>
            <button
              type="button"
              class="cc-widget-close chat-focus-ring"
              aria-label="Close"
              @click="close"
            >
              <span class="cc-widget-close-glyph" aria-hidden="true">×</span>
            </button>
          </div>
        </div>

        <div class="cc-widget cc-widget--form">
          <label
            class="cc-field-label"
            :for="
              isCategoryMode ? 'create-category-name' : 'create-channel-name'
            "
          >
            {{ isCategoryMode ? 'Name' : 'Channel name' }}
          </label>
          <div class="cc-name-row chat-focus-ring">
            <span
              v-if="channelNamePrefixIcon && !isCategoryMode"
              class="cc-name-prefix"
              aria-hidden="true"
            >
              <img
                :src="channelNamePrefixIcon"
                alt=""
                class="cc-widget-icon echo-ink-icon"
              />
            </span>
            <input
              :id="
                isCategoryMode ? 'create-category-name' : 'create-channel-name'
              "
              ref="channelNameInputRef"
              v-model="channelName"
              type="text"
              class="cc-name-input"
              :placeholder="isCategoryMode ? 'new-category' : 'new-channel'"
              :maxlength="isCategoryMode ? 100 : ECHO_CHANNEL_NAME_MAX_LENGTH"
              @keydown.enter.prevent="submit"
            />
            <ChannelIconPickerPopover
              v-if="!isCategoryMode"
              v-model="selectedIconKey"
              variant="combined"
              :channel-type="
                creationMode === 'voice' || creationMode === 'stage'
                  ? 'voice'
                  : 'text'
              "
              :server-id="props.serverId ?? undefined"
            />
          </div>
          <p
            v-if="isCategoryMode && trimmedName && categoryNameIsDuplicate"
            class="cc-widget-note cc-widget-note--warning"
          >
            A category with this name already exists.
          </p>
        </div>

        <div
          v-if="!isCategoryMode"
          class="cc-widget cc-widget--field create-channel-dropdowns"
        >
          <EchoDropdown
            v-model="selectedCategory"
            :options="categoryDropdownOptions"
            label="Category"
            class="create-channel-category-dropdown"
          />
        </div>

        <fieldset class="cc-widget cc-widget--types">
          <legend class="cc-field-label">Type</legend>
          <div
            class="cc-type-grid"
            role="radiogroup"
            :aria-label="isCategoryMode ? 'Creation type' : 'Channel type'"
          >
            <label
              v-for="opt in CHANNEL_TYPE_OPTIONS"
              :key="opt.id"
              class="cc-type-choice chat-focus-ring"
              :class="{
                'cc-type-choice--selected': creationMode === opt.id,
              }"
            >
              <input
                v-model="creationMode"
                class="sr-only"
                type="radio"
                name="create-channel-type"
                :value="opt.id"
              />
              <img
                :src="opt.icon"
                alt=""
                class="cc-widget-icon cc-type-choice-icon echo-ink-icon"
              />
              <span class="cc-type-choice-copy">
                <span class="cc-type-choice-title">{{ opt.label }}</span>
                <span class="cc-type-choice-subtitle">{{ opt.subtitle }}</span>
              </span>
            </label>
          </div>
        </fieldset>

        <div class="cc-widget cc-widget--actions">
          <button
            type="button"
            class="cc-btn cc-btn--ghost chat-focus-ring"
            @click="close"
          >
            Cancel
          </button>
          <button
            type="button"
            class="cc-btn cc-btn--primary chat-focus-ring"
            :disabled="!canSubmit"
            @click="submit"
          >
            {{ submitLabel }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.modal-overlay-bg {
  background-color: var(--vue-auto-011);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

.real-glass-modal {
  background: var(--echo-modal-bg-heavy);
  border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  box-shadow:
    0 28px 90px rgba(0, 0, 0, 0.78),
    inset 0 1px 0 rgba(255, 255, 255, 0.035);
  backdrop-filter: blur(18px) saturate(1.05);
  -webkit-backdrop-filter: blur(18px) saturate(1.05);
}

.create-channel-stack {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.cc-widget {
  width: 100%;
  border-radius: 0.9rem;
  padding: 0.7rem 0.8rem;
  background: var(--glass-tint);
  color: var(--text);
}

.cc-widget--toolbar {
  padding-top: 0.55rem;
  padding-bottom: 0.55rem;
  background: transparent;
  padding-left: 0.15rem;
  padding-right: 0.15rem;
}

.cc-widget-header {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.cc-widget-title {
  font-size: 0.95rem;
  font-weight: 750;
  letter-spacing: 0.01em;
  color: var(--text);
  line-height: 1.25;
}

.cc-widget-title--header {
  font-size: 1.05rem;
}

.cc-widget-subtitle {
  margin-top: 0.15rem;
  font-size: 0.75rem;
  line-height: 1.25;
  color: var(--muted);
}

.cc-widget-close {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 1.8rem;
  height: 1.8rem;
  border-radius: 999px;
  color: var(--muted);
  transition:
    background-color 0.14s ease,
    color 0.14s ease;
}

.cc-widget-close:hover {
  background: color-mix(in srgb, var(--glass-tint) 75%, transparent);
  color: var(--text);
}

.cc-widget-close-glyph {
  font-size: 1.15rem;
  font-weight: 400;
  line-height: 1;
}

.cc-field-label {
  display: block;
  margin-bottom: 0.45rem;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}

.cc-widget--form {
  padding-top: 0.65rem;
}

.cc-name-row {
  display: flex;
  align-items: stretch;
  gap: 0.35rem;
  border-radius: 0.75rem;
  padding: 0.2rem 0.45rem;
  background: color-mix(in srgb, var(--elevated) 42%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.cc-name-row:focus-within {
  border-color: color-mix(in srgb, var(--accent) 28%, var(--border));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent);
}

.cc-name-prefix {
  display: flex;
  align-items: center;
  padding-left: 0.35rem;
  opacity: 0.78;
}

.cc-name-input {
  width: 100%;
  min-width: 0;
  flex: 1;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 0.9rem;
  outline: none;
  padding: 0.55rem 0.2rem;
}

.cc-name-input::placeholder {
  color: color-mix(in srgb, var(--muted) 75%, transparent);
}

.cc-name-row :deep(.channel-icon-trigger) {
  border-left: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
}

.cc-widget-note {
  margin-top: 0.45rem;
  font-size: 0.75rem;
  line-height: 1.3;
  color: var(--muted);
}

.cc-widget-note--warning {
  color: var(--server-ping-broadcast, #f87171);
}

.cc-widget--types {
  border: 0;
  min-width: 0;
  padding-top: 0.65rem;
}

.cc-type-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.4rem;
}

.cc-type-choice {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  min-height: 3.25rem;
  padding: 0.55rem 0.6rem;
  border-radius: 0.75rem;
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  background: color-mix(in srgb, var(--elevated) 35%, transparent);
  cursor: pointer;
  text-align: left;
  transition:
    border-color 0.14s ease,
    background-color 0.14s ease;
}

.cc-type-choice:hover:not(.cc-type-choice--selected) {
  background: color-mix(in srgb, var(--elevated) 55%, transparent);
  border-color: color-mix(in srgb, var(--border) 80%, transparent);
}

.cc-type-choice--selected {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--elevated) 40%);
}

.cc-type-choice--selected:hover {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
  background: color-mix(in srgb, var(--accent) 14%, var(--elevated) 40%);
}

.cc-type-choice-icon {
  margin-top: 0.05rem;
}

.cc-type-choice-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.cc-type-choice-title {
  font-size: 0.8rem;
  font-weight: 700;
  line-height: 1.2;
  color: var(--text);
}

.cc-type-choice-subtitle {
  font-size: 0.68rem;
  line-height: 1.2;
  color: var(--muted);
}

.cc-widget-icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  object-fit: contain;
  opacity: 0.85;
}

[data-theme='dark'] .cc-widget-icon {
  filter: invert(1);
}

.cc-widget--actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding-top: 0.55rem;
  padding-bottom: 0.55rem;
  background: transparent;
  padding-left: 0.1rem;
  padding-right: 0.1rem;
}

.cc-btn {
  border-radius: 0.65rem;
  font-size: 0.85rem;
  font-weight: 650;
  transition:
    background-color 0.14s ease,
    color 0.14s ease,
    opacity 0.14s ease;
}

.cc-btn--ghost {
  padding: 0.45rem 0.35rem;
  color: var(--muted);
}

.cc-btn--ghost:hover {
  color: var(--text);
}

.cc-btn--primary {
  padding: 0.5rem 1rem;
  color: var(--text);
  background: var(--echo-control-bg);
  border: 1px solid var(--echo-control-border);
}

.cc-btn--primary:hover:not(:disabled) {
  background: var(--echo-control-bg-hover);
  border-color: var(--echo-control-border-hover);
}

.cc-btn--primary:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.create-channel-dropdowns {
  padding-top: 0.6rem;
  padding-bottom: 0.6rem;

  :deep(.echo-dropdown-trigger) {
    min-height: 40px;
    border-radius: 0.75rem;
    background: color-mix(in srgb, var(--elevated) 42%, transparent);
    border: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
    box-shadow: none;
  }
  :deep(.echo-dropdown-trigger:hover) {
    background: var(--echo-control-bg-hover);
    border-color: color-mix(in srgb, var(--border) 88%, transparent);
  }
  :deep(.echo-dropdown-trigger--open) {
    background: var(--echo-control-bg-hover);
    border-color: color-mix(in srgb, var(--accent) 28%, var(--border));
  }
  :deep(.echo-dropdown-trigger-text) {
    color: var(--text);
  }
  :deep(.echo-dropdown-chevron) {
    color: var(--muted);
  }
  :deep(.echo-dropdown-menu) {
    border-radius: 0.75rem;
    background: var(--echo-modal-bg-heavy);
    box-shadow:
      0 20px 60px rgba(0, 0, 0, 0.72),
      inset 0 1px 0 rgba(255, 255, 255, 0.035);
    border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  }
  :deep(.echo-dropdown-menu::before) {
    display: none;
  }
  :deep(.echo-dropdown-menu .echo-dropdown-option) {
    color: var(--text);
  }
  :deep(.echo-dropdown-menu .echo-dropdown-option:hover) {
    background: var(--echo-control-bg-hover);
  }
  :deep(
    .echo-dropdown-menu .echo-dropdown-option.echo-dropdown-option--selected
  ) {
    color: var(--text);
    background: color-mix(
      in srgb,
      var(--echo-modal-bg-muted) 55%,
      var(--elevated) 45%
    );
    font-weight: 600;
  }
}

:deep(.create-channel-category-dropdown .echo-dropdown-container) {
  gap: 0;
}

:deep(.create-channel-category-dropdown .settings-label) {
  margin-bottom: 0.45rem;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}
</style>

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
      type: 'text' | 'voice' | 'stage' | 'forum';
      categoryId: string;
      iconKey: string;
    }
  | { kind: 'category'; name: string };

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submit: [payload: CreateChannelModalSubmitPayload];
}>();

type CreationMode = 'text' | 'voice' | 'stage' | 'forum' | 'category';

const CHANNEL_TYPE_OPTIONS: {
  id: CreationMode;
  label: string;
  description: string;
  icon: string;
  iconClass?: string;
}[] = [
  {
    id: 'text',
    label: 'Text',
    description:
      'Send messages, images, GIFs, emoji, opinions, and puns.',
    icon: icons.hashtag,
    iconClass: 'create-channel-type-icon--hash',
  },
  {
    id: 'voice',
    label: 'Voice',
    description: 'Hang out together with voice, video, and screen share.',
    icon: icons.volumeUp,
  },
  {
    id: 'forum',
    label: 'Forum',
    description: 'Create a space for organized discussions.',
    icon: icons.messageAlt,
  },
  {
    id: 'stage',
    label: 'Stage',
    description: 'Host events, panels, and Q&As for an audience.',
    icon: icons.discordStage,
    iconClass: 'create-channel-type-icon--native',
  },
  {
    id: 'category',
    label: 'Category',
    description: 'Group text and voice channels under a collapsible header.',
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
  if (creationMode.value === 'stage') return icons.discordStage;
  return icons.hashtag;
});

function defaultIconForType(t: 'text' | 'voice' | 'stage' | 'forum'): string {
  if (t === 'voice') return 'volumeUp';
  if (t === 'stage') return 'sofa';
  if (t === 'forum') return 'messageAlt';
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
    mode === 'forum'
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
    class="fixed inset-0 z-[150] flex items-center justify-center modal-overlay-bg px-4"
    @click.self="close"
  >
    <div
      ref="modalRef"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-channel-title"
      class="create-channel-modal real-glass-modal relative w-full max-w-[440px] rounded-xl p-6 text-foreground"
    >
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <h2 id="create-channel-title" class="text-xl font-bold leading-tight">
            {{
              isCategoryMode ? 'Create category' : 'Create channel'
            }}
          </h2>
          <p class="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-fg-soft">
            <span>in</span>
            <span class="truncate font-medium text-fg">{{ serverName }}</span>
          </p>
        </div>
        <button
          type="button"
          class="create-channel-close shrink-0 rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-glass-hover hover:text-fg"
          aria-label="Close"
          @click="close"
        >
          <svg
            class="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div class="mt-5 space-y-5">
        <fieldset class="min-w-0 border-0 p-0">
          <legend class="settings-label mb-2">Channel type</legend>
          <div
            class="create-channel-type-list"
            role="radiogroup"
            aria-label="Channel type"
          >
            <label
              v-for="opt in CHANNEL_TYPE_OPTIONS"
              :key="opt.id"
              class="create-channel-type-option"
              :class="{
                'create-channel-type-option--selected':
                  creationMode === opt.id,
              }"
            >
              <input
                v-model="creationMode"
                class="create-channel-type-input"
                type="radio"
                name="create-channel-type"
                :value="opt.id"
              />
              <span class="create-channel-type-radio" aria-hidden="true" />
              <img
                :src="opt.icon"
                alt=""
                class="create-channel-type-icon shrink-0"
                :class="opt.iconClass"
              />
              <span class="min-w-0 flex-1">
                <span class="block text-base font-semibold text-fg">
                  {{ opt.label }}
                </span>
                <span class="mt-0.5 block text-sm leading-snug text-fg-subtle">
                  {{ opt.description }}
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        <div>
          <label
            class="settings-label"
            :for="isCategoryMode ? 'create-category-name' : 'create-channel-name'"
          >
            {{ isCategoryMode ? 'Category name' : 'Channel name' }}
          </label>
          <div
            class="create-channel-name-row mt-2 flex min-h-[44px] items-stretch overflow-hidden rounded-lg"
          >
            <span
              v-if="channelNamePrefixIcon && !isCategoryMode"
              class="create-channel-name-prefix flex shrink-0 items-center justify-center px-3"
              aria-hidden="true"
            >
              <img
                :src="channelNamePrefixIcon"
                alt=""
                class="h-[18px] w-[18px] object-contain opacity-70"
                :class="
                  creationMode === 'text' || creationMode === 'forum'
                    ? 'create-channel-prefix-hash'
                    : creationMode === 'stage'
                      ? 'create-channel-prefix-stage opacity-80'
                      : 'filter invert opacity-60'
                "
              />
            </span>
            <input
              :id="
                isCategoryMode ? 'create-category-name' : 'create-channel-name'
              "
              ref="channelNameInputRef"
              v-model="channelName"
              type="text"
              class="create-channel-name-input min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-sm text-fg outline-none placeholder:text-fg-subtle"
              :placeholder="
                isCategoryMode ? 'new-category' : 'new-channel'
              "
              :maxlength="
                isCategoryMode ? 100 : ECHO_CHANNEL_NAME_MAX_LENGTH
              "
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
            v-if="
              isCategoryMode && trimmedName && categoryNameIsDuplicate
            "
            class="mt-2 text-xs text-rose-300/90"
          >
            A category with this name already exists.
          </p>
        </div>

        <div v-if="!isCategoryMode" class="create-channel-dropdowns">
          <EchoDropdown
            v-model="selectedCategory"
            :options="categoryDropdownOptions"
            label="Category"
          />
        </div>
      </div>

      <div class="mt-6 flex justify-end gap-3">
        <button
          type="button"
          class="create-channel-btn-cancel rounded-[3px] px-4 py-2 text-sm font-medium text-fg transition-colors"
          @click="close"
        >
          Cancel
        </button>
        <button
          type="button"
          class="create-channel-btn-submit rounded-[3px] px-4 py-2 text-sm font-medium transition-[filter,opacity] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="!canSubmit"
          @click="submit"
        >
          {{
            isCategoryMode ? 'Create category' : 'Create channel'
          }}
        </button>
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
  background: var(--echo-modal-bg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-3);
  backdrop-filter: blur(24px) saturate(1.2);
  -webkit-backdrop-filter: blur(24px) saturate(1.2);
}

.settings-label {
  display: block;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--muted);
}

.create-channel-type-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.create-channel-type-option {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.5rem 0.625rem;
  margin: 0 -0.625rem;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.create-channel-type-option:hover {
  background: color-mix(in srgb, var(--elevated) 65%, transparent);
}

.create-channel-type-option--selected {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.create-channel-type-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.create-channel-type-radio {
  flex-shrink: 0;
  width: 1.5rem;
  height: 1.5rem;
  margin-top: 0.125rem;
  border-radius: 50%;
  border: 2px solid var(--muted);
  background: transparent;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    box-shadow 0.15s ease;
  position: relative;
}

.create-channel-type-option--selected .create-channel-type-radio {
  border-color: var(--accent);
  background: var(--accent);
  box-shadow: inset 0 0 0 3px var(--accent-contrast-fg);
}

.create-channel-type-icon {
  width: 1.5rem;
  height: 1.5rem;
  margin-top: 0.125rem;
  object-fit: contain;
  opacity: 0.88;
  filter: invert(1);
}

.create-channel-type-icon--hash,
.create-channel-prefix-hash {
  filter: none;
  opacity: 0.55;
}

.create-channel-type-icon--native,
.create-channel-prefix-stage {
  filter: none;
}

.create-channel-name-row {
  background: var(--surface);
  border: 1px solid var(--border);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.create-channel-name-row:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.create-channel-name-prefix {
  color: var(--muted);
  border-right: 1px solid var(--border);
}

.create-channel-name-row :deep(.channel-icon-trigger) {
  border-left: 1px solid var(--border);
}

.create-channel-btn-cancel {
  background: transparent;
}

.create-channel-btn-cancel:hover {
  text-decoration: underline;
}

.create-channel-btn-submit {
  background: var(--accent);
  color: var(--accent-contrast-fg);
}

.create-channel-dropdowns {
  :deep(.echo-dropdown-trigger) {
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: none;
  }
  :deep(.echo-dropdown-trigger:hover) {
    background: var(--elevated);
  }
  :deep(.echo-dropdown-trigger--open) {
    background: var(--elevated);
  }
  :deep(.echo-dropdown-trigger-text) {
    color: var(--text);
  }
  :deep(.echo-dropdown-chevron) {
    color: var(--muted);
  }
  :deep(.echo-dropdown-menu) {
    background: var(--surface);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    box-shadow: var(--shadow-3);
    border: 1px solid var(--border);
  }
  :deep(.echo-dropdown-menu::before) {
    display: none;
  }
  :deep(.echo-dropdown-menu .echo-dropdown-option) {
    color: var(--text);
  }
  :deep(.echo-dropdown-menu .echo-dropdown-option:hover) {
    background: var(--elevated);
  }
  :deep(
    .echo-dropdown-menu .echo-dropdown-option.echo-dropdown-option--selected
  ) {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    font-weight: 700;
  }
}
</style>

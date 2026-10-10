<script setup lang="ts">
import { computed, ref, watch, toRef } from 'vue';
import { useFocusTrap } from '@/features/layout/useFocusTrap';
import { useAutofocusOnOpen } from '@/features/layout/useAutofocusOnOpen';
import EchoDropdown from '@/components/EchoDropdown.vue';
import ChannelIconPickerPopover from '@/features/channel-settings/ChannelIconPickerPopover.vue';
import { icons } from '@/assets/icons';
import {
  clampEchoChannelName,
  ECHO_CHANNEL_NAME_MAX_LENGTH,
} from '@shared/echoChannelLimits';
import {
  isPaperFeatureEnabled,
  isExperimentalChannelTypeEnabled,
} from '@/features/paper/paperFeatureToggle';

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
  ...(isPaperFeatureEnabled
    ? [
        {
          id: 'paper' as const,
          label: 'Paper',
          subtitle: 'Collaborative document',
          icon: icons.file,
        },
      ]
    : []),
  {
    id: 'voice',
    label: 'Voice',
    subtitle: 'Voice, video, screen share',
    icon: icons.volumeUp,
  },
  ...(isExperimentalChannelTypeEnabled('stage')
    ? [
        {
          id: 'stage' as const,
          label: 'Stage',
          subtitle: 'Events and panels',
          icon: icons.sofa,
        },
      ]
    : []),
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

<style scoped lang="scss" src="./styles/CreateChannelModal.scss"></style>

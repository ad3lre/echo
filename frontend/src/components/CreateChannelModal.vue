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
      type: 'text' | 'voice' | 'forum';
      categoryId: string;
      iconKey: string;
    }
  | { kind: 'category'; name: string };

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submit: [payload: CreateChannelModalSubmitPayload];
}>();

const modalRef = ref<HTMLElement | null>(null);
const channelNameInputRef = ref<HTMLInputElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

useAutofocusOnOpen(toRef(props, 'modelValue'), channelNameInputRef);

const channelName = ref('');
/** Text / voice channel, or a new category (no channel row). */
const creationMode = ref<'text' | 'voice' | 'forum' | 'category'>('text');
const selectedCategory = ref('');
const selectedIconKey = ref<string>('message');

const categoryDropdownOptions = computed(() =>
  props.categoryOptions.map((o) => ({ label: o.label, value: o.id })),
);

function defaultIconForType(t: 'text' | 'voice' | 'forum'): string {
  if (t === 'voice') return 'volumeUp';
  if (t === 'forum') return 'messageAlt';
  return 'message';
}

const segmentIndex = computed(() =>
  creationMode.value === 'text'
    ? 0
    : creationMode.value === 'voice'
      ? 1
      : creationMode.value === 'forum'
        ? 2
        : 3,
);

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
  if (mode === 'text' || mode === 'voice' || mode === 'forum') {
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
      class="real-glass-modal relative w-full max-w-md rounded-xl p-6 text-foreground"
    >
      <h2 id="create-channel-title" class="text-xl font-bold">
        {{ creationMode === 'category' ? 'Create category' : 'Create channel' }}
      </h2>
      <p class="mt-1 text-sm text-fg-soft">in {{ serverName }}</p>

      <div class="mt-5 space-y-5">
        <div>
          <div class="settings-label">Type</div>
          <div
            class="relative mt-2 flex w-full overflow-hidden rounded-lg bg-glass-2 p-0.5"
          >
            <div
              class="create-channel-type-highlight pointer-events-none absolute inset-y-0.5 w-[calc((100%-4px)/4)] rounded-md transition-transform duration-300 ease-out"
              style="left: 2px"
              :style="{ transform: `translateX(calc(${segmentIndex} * 100%))` }"
            />
            <button
              type="button"
              class="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-row items-center justify-center gap-1.5 rounded-md py-2 transition-colors"
              :class="
                creationMode === 'text'
                  ? 'text-white'
                  : 'text-fg-subtle hover:text-fg-soft'
              "
              @click="creationMode = 'text'"
            >
              <img
                :src="icons.message"
                alt=""
                class="h-4 w-4 shrink-0 object-contain opacity-90 filter invert"
                :class="creationMode === 'text' ? 'opacity-100' : 'opacity-55'"
              />
              <span class="text-xs font-semibold tracking-wide">Text</span>
            </button>
            <button
              type="button"
              class="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-row items-center justify-center gap-1.5 rounded-md py-2 transition-colors"
              :class="
                creationMode === 'voice'
                  ? 'text-white'
                  : 'text-fg-subtle hover:text-fg-soft'
              "
              @click="creationMode = 'voice'"
            >
              <img
                :src="icons.volumeUp"
                alt=""
                class="h-4 w-4 shrink-0 object-contain opacity-90 filter invert"
                :class="creationMode === 'voice' ? 'opacity-100' : 'opacity-55'"
              />
              <span class="text-xs font-semibold tracking-wide">Voice</span>
            </button>
            <button
              type="button"
              class="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-row items-center justify-center gap-1.5 rounded-md py-2 transition-colors"
              :class="
                creationMode === 'forum'
                  ? 'text-white'
                  : 'text-fg-subtle hover:text-fg-soft'
              "
              @click="creationMode = 'forum'"
            >
              <img
                :src="icons.message"
                alt=""
                class="h-4 w-4 shrink-0 object-contain opacity-90 filter invert"
                :class="creationMode === 'forum' ? 'opacity-100' : 'opacity-55'"
              />
              <span class="text-xs font-semibold tracking-wide">Forum</span>
            </button>
            <button
              type="button"
              class="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-row items-center justify-center gap-1.5 rounded-md py-2 transition-colors"
              :class="
                creationMode === 'category'
                  ? 'text-white'
                  : 'text-fg-subtle hover:text-fg-soft'
              "
              @click="creationMode = 'category'"
            >
              <img
                :src="icons.list"
                alt=""
                class="h-4 w-4 shrink-0 object-contain opacity-90 filter invert"
                :class="
                  creationMode === 'category' ? 'opacity-100' : 'opacity-55'
                "
              />
              <span class="text-xs font-semibold tracking-wide">Category</span>
            </button>
          </div>
        </div>

        <div>
          <label class="settings-label">
            {{ creationMode === 'category' ? 'Category name' : 'Channel name' }}
          </label>
          <div
            class="create-channel-name-row mt-2 flex min-h-[44px] items-stretch overflow-hidden rounded-xl"
          >
            <ChannelIconPickerPopover
              v-if="creationMode !== 'category'"
              v-model="selectedIconKey"
              variant="combined"
              :channel-type="creationMode === 'voice' ? 'voice' : 'text'"
              :server-id="props.serverId ?? undefined"
            />
            <input
              ref="channelNameInputRef"
              v-model="channelName"
              type="text"
              class="create-channel-name-input min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-sm text-fg outline-none placeholder:text-fg-subtle"
              :placeholder="
                creationMode === 'category' ? 'new-category' : 'new-channel'
              "
              :maxlength="
                creationMode === 'category' ? 100 : ECHO_CHANNEL_NAME_MAX_LENGTH
              "
              @keydown.enter.prevent="submit"
            />
          </div>
          <p
            v-if="
              creationMode === 'category' &&
              trimmedName &&
              categoryNameIsDuplicate
            "
            class="mt-2 text-xs text-rose-300/90"
          >
            A category with this name already exists.
          </p>
        </div>

        <div
          v-if="creationMode !== 'category'"
          class="create-channel-dropdowns"
        >
          <EchoDropdown
            v-model="selectedCategory"
            :options="categoryDropdownOptions"
            label="Category"
          />
        </div>
      </div>

      <div class="mt-6 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg px-4 py-2 text-sm font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg"
          @click="close"
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-[color:var(--accent-contrast-fg)] transition-[filter,opacity] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="!canSubmit"
          @click="submit"
        >
          {{
            creationMode === 'category' ? 'Create category' : 'Create channel'
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

/*
 * Modal shell: theme `--echo-modal-bg` keeps panels readable in light mode (no wash
 * through `--chat-glass-bg-strong`). Inputs use solid `--surface` so nothing bleeds through.
 */
.real-glass-modal {
  background: var(--echo-modal-bg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-3);
  backdrop-filter: blur(24px) saturate(1.2);
  -webkit-backdrop-filter: blur(24px) saturate(1.2);
}

.create-channel-name-row {
  background: var(--surface);
  border: 1px solid var(--border);
}

.settings-label {
  display: block;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--muted);
}

.create-channel-dropdowns {
  :deep(.echo-dropdown-trigger) {
    background: var(--surface);
    border: 1px solid var(--border);
  }
  :deep(.echo-dropdown-trigger:hover) {
    background: var(--elevated);
  }
  :deep(.echo-dropdown-trigger--open) {
    background: var(--elevated);
  }
  :deep(.echo-dropdown-menu) {
    background: var(--vue-auto-039);
  }
  :deep(.echo-dropdown-menu::before) {
    background: none;
  }
  :deep(.echo-dropdown-menu button) {
    color: var(--vue-auto-030);
  }
  :deep(.echo-dropdown-menu button:hover) {
    background: var(--vue-auto-001);
  }
  :deep(.echo-dropdown-menu button.text-indigo-300) {
    color: var(--vue-auto-012);
    background: var(--vue-auto-003);
    font-weight: 700;
  }
  :deep(.echo-dropdown-trigger svg) {
    color: var(--vue-auto-017);
  }
}

.create-channel-type-highlight {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent) 44%, transparent),
    color-mix(in srgb, var(--accent) 24%, transparent)
  );
}
</style>

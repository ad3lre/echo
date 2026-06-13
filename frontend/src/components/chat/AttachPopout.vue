<script setup lang="ts">
import { IMAGE_SLOT_ASPECT_RATIOS } from '@shared/imageSlot';

const props = withDefaults(
  defineProps<{
    canUploadFiles?: boolean;
    canCreatePolls?: boolean;
    canInsertImageSlot?: boolean;
    placement?: 'up' | 'down';
    theme?: 'default' | 'forum';
  }>(),
  {
    canUploadFiles: true,
    canCreatePolls: true,
    canInsertImageSlot: true,
    placement: 'up',
    theme: 'default',
  },
);

const emit = defineEmits<{
  upload: [];
  createPoll: [];
  insertImageSlot: [aspectW: number, aspectH: number];
}>();

const imageSlotRatios = IMAGE_SLOT_ASPECT_RATIOS;

function handleUpload() {
  emit('upload');
}

function handleCreatePoll() {
  emit('createPoll');
}

function handleInsertImageSlot(aspectW: number, aspectH: number) {
  emit('insertImageSlot', aspectW, aspectH);
}
</script>

<template>
  <div
    class="chat-popout chat-popout--left chat-liquid-glass-menu attach-popout absolute left-4 w-[240px] overflow-hidden"
    :class="props.placement === 'down' ? 'top-full mt-2' : 'bottom-full mb-2'"
    :data-placement="props.placement"
    role="menu"
  >
    <div class="chat-popout-inner p-1.5">
      <button
        v-if="props.canUploadFiles"
        type="button"
        role="menuitem"
        class="attach-option flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-glass-hover"
        @click="handleUpload"
      >
        <span
          class="attach-popout__icon flex h-7 w-7 flex-shrink-0 items-center justify-center"
        >
          <svg
            class="h-4 w-4 text-fg"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
        </span>
        <div class="min-w-0">
          <div
            class="text-sm font-medium"
            :class="props.theme === 'forum' ? 'text-fg' : 'text-foreground'"
          >
            Upload file
          </div>
          <div
            class="text-[11px]"
            :class="props.theme === 'forum' ? 'text-fg-soft' : 'text-muted'"
          >
            Images, documents, and more
          </div>
        </div>
      </button>
      <template v-if="props.canInsertImageSlot">
        <button
          v-for="ratio in imageSlotRatios"
          :key="`${ratio.w}:${ratio.h}`"
          type="button"
          role="menuitem"
          class="attach-option flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-glass-hover"
          @click="handleInsertImageSlot(ratio.w, ratio.h)"
        >
          <span
            class="attach-popout__icon flex h-7 w-7 flex-shrink-0 items-center justify-center"
          >
            <svg
              class="h-4 w-4 text-fg"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </span>
          <div class="min-w-0">
            <div
              class="text-sm font-medium"
              :class="props.theme === 'forum' ? 'text-fg' : 'text-foreground'"
            >
              Image slot {{ ratio.w }}:{{ ratio.h }}
            </div>
            <div
              class="text-[11px]"
              :class="props.theme === 'forum' ? 'text-fg-soft' : 'text-muted'"
            >
              Placeholder to fill later
            </div>
          </div>
        </button>
      </template>
      <button
        v-if="props.canCreatePolls"
        type="button"
        role="menuitem"
        class="attach-option flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-glass-hover"
        @click="handleCreatePoll"
      >
        <span
          class="attach-popout__icon flex h-7 w-7 flex-shrink-0 items-center justify-center"
        >
          <svg
            class="h-4 w-4 text-fg"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
        </span>
        <div class="min-w-0">
          <div
            class="text-sm font-medium"
            :class="props.theme === 'forum' ? 'text-fg' : 'text-foreground'"
          >
            Create poll
          </div>
          <div
            class="text-[11px]"
            :class="props.theme === 'forum' ? 'text-fg-soft' : 'text-muted'"
          >
            Ask a question with options
          </div>
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.chat-popout {
  z-index: 30;

  &--left::after {
    left: 0.5rem;
    right: auto;
  }

  .chat-popout-inner {
    position: relative;
    background-color: transparent;
  }

  &::after {
    content: '';
    position: absolute;
    bottom: -6px;
    right: 1.5rem;
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 6px solid var(--vue-auto-040);
  }

  &[data-placement='down']::after {
    bottom: auto;
    top: -6px;
    border-top: none;
    border-bottom: 6px solid var(--vue-auto-040);
  }
}

/* Flat attach menu — glass shadow/stack reads muddy on light chat surfaces. */
.attach-popout {
  box-shadow: none;
}

:global([data-theme='light']) .attach-popout.chat-liquid-glass-menu {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  background-color: var(--echo-menu-bg);
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  box-shadow: none;
}

:global([data-theme='light']) .attach-popout::after {
  border-top-color: var(--echo-menu-bg);
}

:global([data-theme='light']) .attach-popout[data-placement='down']::after {
  border-bottom-color: var(--echo-menu-bg);
}
</style>

<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';

const props = defineProps<{
  label: string;
  title?: string;
  align?: 'left' | 'right';
  class?: string;
}>();

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);

function close() {
  open.value = false;
}

function toggleOpen() {
  open.value = !open.value;
}

/** Deferred click listener so native <select> / color pickers can finish before we unmount. */
let outsideClickHandler: ((ev: MouseEvent) => void) | null = null;

function detachOutsideClick() {
  if (!outsideClickHandler) return;
  document.removeEventListener('click', outsideClickHandler, true);
  outsideClickHandler = null;
}

function attachOutsideClick() {
  detachOutsideClick();
  outsideClickHandler = (ev: MouseEvent) => {
    if (!open.value) return;
    const root = rootRef.value;
    if (root && !root.contains(ev.target as Node)) {
      close();
    }
  };
  document.addEventListener('click', outsideClickHandler, true);
}

function onDocumentKeyDown(ev: KeyboardEvent) {
  if (ev.key === 'Escape' && open.value) {
    close();
  }
}

watch(open, (isOpen) => {
  detachOutsideClick();
  if (isOpen) {
    queueMicrotask(() => {
      if (open.value) attachOutsideClick();
    });
    document.addEventListener('keydown', onDocumentKeyDown);
  } else {
    document.removeEventListener('keydown', onDocumentKeyDown);
  }
});

onUnmounted(() => {
  detachOutsideClick();
  document.removeEventListener('keydown', onDocumentKeyDown);
});

defineExpose({ close });
</script>

<template>
  <div ref="rootRef" class="relative" :class="props.class">
    <button
      type="button"
      class="paper-chrome-menu-btn"
      :title="title ?? label"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click.stop="toggleOpen"
    >
      <span class="paper-chrome-menu-btn__icon" aria-hidden="true">
        <slot name="icon" />
      </span>
      <span v-if="label" class="paper-chrome-menu-btn__label">{{ label }}</span>
      <svg
        class="paper-chrome-menu-chevron"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
    <div
      v-if="open"
      class="paper-chrome-menu-panel"
      :class="
        align === 'left'
          ? 'paper-chrome-menu-panel--left'
          : 'paper-chrome-menu-panel--right'
      "
    >
      <slot :close="close" />
    </div>
  </div>
</template>

<style scoped src="./styles/PaperChromeDropdown.scss"></style>

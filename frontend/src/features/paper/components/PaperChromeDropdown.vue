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

<style scoped>
.paper-chrome-menu-btn {
  display: inline-flex;
  height: 2rem;
  align-items: center;
  gap: 0.3rem;
  border-radius: 8px;
  padding: 0 0.45rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text);
  transition: background 0.15s ease;
}

.paper-chrome-menu-btn__icon {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
}

.paper-chrome-menu-btn__icon:empty {
  display: none;
}

.paper-chrome-menu-btn__label {
  max-width: 5.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.paper-chrome-menu-btn:hover {
  background: color-mix(in srgb, var(--text) 8%, transparent);
}

.paper-chrome-menu-btn:focus {
  outline: none;
}

.paper-chrome-menu-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.paper-chrome-menu-chevron {
  width: 0.875rem;
  height: 0.875rem;
  opacity: 0.65;
}

.paper-chrome-menu-panel {
  position: absolute;
  top: calc(100% + 6px);
  z-index: 50;
  min-width: 14rem;
  max-width: min(20rem, calc(100vw - 2rem));
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--bg-elevated, var(--bg));
  padding: 0.35rem 0;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.22);
}

.paper-chrome-menu-panel--right {
  right: 0;
}

.paper-chrome-menu-panel--left {
  left: 0;
}
</style>

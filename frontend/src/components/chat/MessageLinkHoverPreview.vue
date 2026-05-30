<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { Embed } from '@shared/types';
import { openExternal } from '@/platform/desktopBridge';
import { copyToClipboard } from '@/utils/copyToClipboard';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import { bioLinkFaviconUrl, formatBioLinkDisplay } from '@/utils/bioLinkText';
import { safeImageUrl } from '@/utils/safeImageUrl';

const props = defineProps<{
  href: string;
  embed?: Embed;
  anchorRect: DOMRect;
}>();

const viewport = ref({ width: 1024, height: 768 });

function syncViewport() {
  viewport.value = {
    width: window.innerWidth || 1024,
    height: window.innerHeight || 768,
  };
}

onMounted(() => {
  syncViewport();
  window.addEventListener('resize', syncViewport, { passive: true });
});

onUnmounted(() => {
  window.removeEventListener('resize', syncViewport);
});

const url = computed(() => {
  try {
    return new URL(props.href);
  } catch {
    return null;
  }
});

const host = computed(() => url.value?.hostname.replace(/^www\./i, '') ?? '');
const displayUrl = computed(() => formatBioLinkDisplay(props.href));
const title = computed(
  () => props.embed?.title?.trim() || host.value || displayUrl.value,
);
const provider = computed(
  () => props.embed?.provider?.trim() || host.value || 'Website',
);
const description = computed(() => props.embed?.description?.trim() ?? '');
const imageUrl = computed(() => {
  const raw =
    props.embed?.thumbnail?.url?.trim() ||
    props.embed?.image?.url?.trim() ||
    bioLinkFaviconUrl(props.href);
  return raw ? safeImageUrl(raw) : '';
});

const positionStyle = computed(() => {
  const width = 320;
  const margin = 10;
  const x = Math.min(
    Math.max(margin, props.anchorRect.left),
    Math.max(margin, viewport.value.width - width - margin),
  );
  const estimatedHeight = 164;
  const below = props.anchorRect.bottom + 8;
  const top =
    below + estimatedHeight <= viewport.value.height - margin
      ? below
      : Math.max(margin, props.anchorRect.top - estimatedHeight - 8);
  return {
    left: `${x}px`,
    top: `${top}px`,
    width: `${width}px`,
  };
});

async function onCopy() {
  const ok = await copyToClipboard(props.href);
  dispatchAppToast(
    ok ? 'Link copied' : 'Could not copy link',
    ok ? 'info' : 'warning',
  );
}

function onOpen() {
  void openExternal(props.href);
}
</script>

<template>
  <div
    class="message-link-hover-preview"
    :style="positionStyle"
    role="dialog"
    aria-label="Link preview"
  >
    <div class="message-link-hover-preview__body">
      <img
        v-if="imageUrl"
        class="message-link-hover-preview__image"
        :src="imageUrl"
        alt=""
        loading="lazy"
        decoding="async"
      />
      <div class="message-link-hover-preview__copy">
        <div class="message-link-hover-preview__provider">{{ provider }}</div>
        <div class="message-link-hover-preview__title">{{ title }}</div>
        <div v-if="description" class="message-link-hover-preview__description">
          {{ description }}
        </div>
        <div class="message-link-hover-preview__url">{{ displayUrl }}</div>
      </div>
    </div>
    <div class="message-link-hover-preview__actions">
      <button type="button" @click.stop.prevent="onCopy">Copy</button>
      <button type="button" @click.stop.prevent="onOpen">Open</button>
    </div>
  </div>
</template>

<style scoped>
.message-link-hover-preview {
  position: fixed;
  z-index: 80;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--elevated);
  color: var(--text);
  box-shadow: var(--shadow-3);
  padding: 0.625rem;
}

.message-link-hover-preview__body {
  display: flex;
  min-width: 0;
  gap: 0.625rem;
}

.message-link-hover-preview__image {
  width: 2.5rem;
  height: 2.5rem;
  flex: 0 0 auto;
  border-radius: 6px;
  object-fit: cover;
  background: color-mix(in srgb, var(--surface) 84%, var(--border));
}

.message-link-hover-preview__copy {
  min-width: 0;
}

.message-link-hover-preview__provider,
.message-link-hover-preview__url {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 0.6875rem;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-link-hover-preview__title {
  overflow: hidden;
  margin-top: 0.125rem;
  font-size: 0.875rem;
  font-weight: 700;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-link-hover-preview__description {
  display: -webkit-box;
  overflow: hidden;
  margin-top: 0.25rem;
  color: var(--text-muted);
  font-size: 0.75rem;
  line-height: 1.3;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.message-link-hover-preview__url {
  margin-top: 0.25rem;
}

.message-link-hover-preview__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.375rem;
  margin-top: 0.625rem;
}

.message-link-hover-preview__actions button {
  min-height: 1.75rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: color-mix(in srgb, var(--surface) 88%, var(--text) 12%);
  color: var(--text);
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
  padding: 0 0.625rem;
}

.message-link-hover-preview__actions button:hover,
.message-link-hover-preview__actions button:focus-visible {
  border-color: var(--accent);
  color: var(--accent);
  outline: none;
}
</style>

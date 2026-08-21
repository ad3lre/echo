<script setup lang="ts">
import { computed, ref } from 'vue';
import { bioLinkFaviconUrl } from '@/features/member-profile/bioLinkText';
import { safeImageUrl } from '@/features/layout/display/safeImageUrl';

const props = defineProps<{
  href: string;
  display: string;
}>();

const faviconFailed = ref(false);
const faviconSrc = computed(() => {
  if (faviconFailed.value) return null;
  const url = bioLinkFaviconUrl(props.href);
  return url ? safeImageUrl(url) : null;
});

function onFaviconError() {
  faviconFailed.value = true;
}
</script>

<template>
  <a
    :href="href"
    target="_blank"
    rel="noopener noreferrer"
    class="profile-bio-link inline-flex max-w-full items-center gap-1 align-baseline font-medium underline-offset-2 hover:underline"
    @click.stop
  >
    <img
      v-if="faviconSrc"
      :src="faviconSrc"
      alt=""
      width="14"
      height="14"
      class="profile-bio-link__favicon size-3.5 shrink-0 rounded-sm object-contain"
      loading="lazy"
      decoding="async"
      @error="onFaviconError"
    />
    <span class="min-w-0 truncate">{{ display }}</span>
  </a>
</template>

<style scoped>
.profile-bio-link {
  color: var(--md-link-fg);
}

.profile-bio-link:hover {
  color: var(--md-link-fg-hover);
}

.profile-bio-link__favicon {
  margin-top: 0.1em;
}
</style>

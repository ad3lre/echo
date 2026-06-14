<script setup lang="ts">
import { computed } from 'vue';
import BioExternalLink from '@/features/layout/components/member-profile/BioExternalLink.vue';
import { parseBioTextSegments } from '@/utils/bioLinkText';

const props = defineProps<{
  text: string;
  /** Classes merged onto the root paragraph (typography from parent surfaces). */
  bodyClass?: string;
}>();

const segments = computed(() => parseBioTextSegments(props.text));
</script>

<template>
  <p
    class="profile-bio-text whitespace-pre-wrap break-words"
    :class="bodyClass"
  >
    <template v-for="(segment, index) in segments" :key="index">
      <template v-if="segment.type === 'text'">{{ segment.value }}</template>
      <BioExternalLink v-else :href="segment.href" :display="segment.display" />
    </template>
  </p>
</template>

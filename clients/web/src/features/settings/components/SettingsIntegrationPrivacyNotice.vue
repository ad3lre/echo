<script setup lang="ts">
import { computed } from 'vue';
import { withBasePath } from '@/features/layout/urlNavigation';

const appBase = import.meta.env.BASE_URL || '/';
const privacyHref = computed(() => withBasePath('/legal/privacy', appBase));
</script>

<template>
  <p class="max-w-2xl text-xs leading-relaxed text-muted">
    Echo’s use of Google user data (sign-in, YouTube live) is described in our
    <a
      :href="privacyHref"
      class="underline decoration-muted/50 underline-offset-2 hover:text-foreground"
      >Privacy Policy</a
    >
    (Section 14 — Google API Services and YouTube Data).
  </p>
</template>

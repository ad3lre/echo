<script setup lang="ts">
import { computed } from 'vue';
import { echoT } from '@/i18n';
import { withBasePath } from '@/features/layout/urlNavigation';

const appBase = import.meta.env.BASE_URL || '/';
const privacyHref = computed(() => withBasePath('/legal/privacy', appBase));
</script>

<template>
  <i18n-t
    keypath="b19.privacy.text"
    tag="p"
    scope="global"
    class="max-w-2xl text-xs leading-relaxed text-muted"
  >
    <template #link>
      <a
        :href="privacyHref"
        class="underline decoration-muted/50 underline-offset-2 hover:text-foreground"
        >{{ echoT('b19.privacy.link') }}</a
      >
    </template>
  </i18n-t>
</template>

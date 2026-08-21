<script setup lang="ts">
import { LEGAL_DOC_TABS } from '@/features/settings/legalDocs';
import SettingsDocTabbedView from '@/features/settings/components/SettingsDocTabbedView.vue';
</script>

<template>
  <SettingsDocTabbedView
    root-class="settings-legal"
    ariaLabel="Legal documents"
    :tabs="LEGAL_DOC_TABS"
  />
</template>

<script setup lang="ts">
import type { PaperEditorPanelBridgeContext } from '@/features/paper/paperEditorPanelBridge';
import PaperEditorPanelShell from '@/features/paper/components/PaperEditorPanelShell.vue';

defineProps<{
  context: PaperEditorPanelBridgeContext;
}>();
</script>

<template>
  <PaperEditorPanelShell :context="context" />
</template>

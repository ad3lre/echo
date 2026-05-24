<script setup lang="ts">
import { openReportModal } from '@/features/safety/reportModal';

function openReportForm() {
  openReportModal({ kind: 'general' });
}
</script>

<template>
  <div class="settings-report-abuse flex flex-col gap-6">
    <div class="settings-card rounded-2xl p-6">
      <p class="text-sm leading-relaxed text-muted">
        You can also report directly from a user profile menu or a message
        context menu. Use this form when you have a user or message ID but
        cannot open those menus.
      </p>
      <button
        type="button"
        class="mt-4 rounded-lg bg-rose-600/90 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600"
        @click="openReportForm"
      >
        Open report form
      </button>
    </div>
  </div>
</template>

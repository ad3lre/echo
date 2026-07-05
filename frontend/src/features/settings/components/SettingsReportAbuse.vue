<script setup lang="ts">
import { icons } from '@/assets/icons';
import { openReportModal } from '@/features/safety/reportModal';

function openReportForm() {
  openReportModal({ kind: 'general' });
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="settings-card rounded-2xl p-6">
      <div class="flex items-start gap-4">
        <span
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 ring-1 ring-rose-500/25"
          aria-hidden="true"
        >
          <img
            :src="icons.shield"
            alt=""
            class="echo-ink-icon h-5 w-5 opacity-90"
          />
        </span>
        <div class="min-w-0 flex-1">
          <div class="settings-label">Trust &amp; Safety</div>
          <p class="mt-2 text-sm leading-relaxed text-muted">
            Reports go to Echo's Trust &amp; Safety team for review. Most
            reports are handled within a few business days.
          </p>
          <ul class="mt-4 space-y-2 text-sm text-fg-soft">
            <li class="flex items-start gap-2">
              <span
                class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400/80"
                aria-hidden="true"
              />
              <span
                >From a user profile — open their profile menu and choose
                <span class="font-semibold text-foreground">Report</span></span
              >
            </li>
            <li class="flex items-start gap-2">
              <span
                class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400/80"
                aria-hidden="true"
              />
              <span
                >From a message — right-click or long-press and choose
                <span class="font-semibold text-foreground"
                  >Report message</span
                ></span
              >
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div class="settings-card rounded-2xl p-6">
      <div class="settings-label">Manual report</div>
      <p class="mt-2 text-sm leading-relaxed text-muted">
        Use this when you have a user or message ID but cannot open those menus
        — for example, content shared outside Echo.
      </p>
      <button
        type="button"
        class="mt-4 rounded-lg bg-rose-600/85 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-600"
        @click="openReportForm"
      >
        Open report form
      </button>
    </div>
  </div>
</template>

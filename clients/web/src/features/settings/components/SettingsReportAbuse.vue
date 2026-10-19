<script setup lang="ts">
import { echoT } from '@/i18n';
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
          <div class="settings-label">{{ echoT('b40.report.tns') }}</div>
          <p class="mt-2 text-sm leading-relaxed text-muted">
            {{ echoT('b40.report.intro') }}
          </p>
          <ul class="mt-4 space-y-2 text-sm text-fg-soft">
            <li class="flex items-start gap-2">
              <span
                class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400/80"
                aria-hidden="true"
              />
              <i18n-t
                keypath="b40.report.fromProfile"
                tag="span"
                scope="global"
              >
                <template #report>
                  <span class="font-semibold text-foreground">{{
                    echoT('b40.report.report')
                  }}</span>
                </template>
              </i18n-t>
            </li>
            <li class="flex items-start gap-2">
              <span
                class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400/80"
                aria-hidden="true"
              />
              <i18n-t
                keypath="b40.report.fromMessage"
                tag="span"
                scope="global"
              >
                <template #report>
                  <span class="font-semibold text-foreground">{{
                    echoT('b40.report.reportMessage')
                  }}</span>
                </template>
              </i18n-t>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div class="settings-card rounded-2xl p-6">
      <div class="settings-label">{{ echoT('b40.report.manual') }}</div>
      <p class="mt-2 text-sm leading-relaxed text-muted">
        {{ echoT('b40.report.manualDesc') }}
      </p>
      <button
        type="button"
        class="mt-4 rounded-lg bg-rose-600/85 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-600"
        @click="openReportForm"
      >
        {{ echoT('b40.report.openForm') }}
      </button>
    </div>
  </div>
</template>

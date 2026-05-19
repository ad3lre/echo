<script setup lang="ts">
import { ref, watch, toRef } from 'vue';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { useDiscordProfileImport } from '@/features/settings/composables/useDiscordProfileImport';
import { markDiscordProfileImportPromptDone } from '@/features/discord/discordProfileImportFlow';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import {
  discordProfileImportPromptBody,
  discordProfileImportPromptImportCta,
  discordProfileImportPromptNotNowCta,
  discordProfileImportPromptTitle,
} from '@/features/discord/discordIntegrationCopy';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();

const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

const { busy, error, importFromDiscord } = useDiscordProfileImport();

watch(
  () => props.modelValue,
  (open) => {
    if (open) error.value = '';
  },
);

function dismiss() {
  markDiscordProfileImportPromptDone();
  emit('update:modelValue', false);
}

async function onImport() {
  const ok = await importFromDiscord();
  if (!ok) return;
  dispatchAppToast('Profile updated from Discord.', 'info');
  emit('update:modelValue', false);
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-[165] flex items-center justify-center bg-overlay-heavy px-4"
    @click.self="dismiss"
  >
    <div
      ref="modalRef"
      role="dialog"
      aria-modal="true"
      aria-labelledby="discord-import-prompt-title"
      class="w-full max-w-md rounded-2xl border border-border bg-[var(--echo-modal-bg)] p-6 text-white shadow-xl"
    >
      <h2 id="discord-import-prompt-title" class="text-lg font-semibold">
        {{ discordProfileImportPromptTitle }}
      </h2>
      <p class="mt-2 text-sm leading-relaxed text-fg-soft">
        {{ discordProfileImportPromptBody }}
      </p>
      <p v-if="error" class="mt-3 text-sm text-red-400/90">{{ error }}</p>
      <div class="mt-6 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          class="rounded-lg px-3 py-2 text-sm text-fg-soft hover:bg-glass-hover"
          :disabled="busy"
          @click="dismiss"
        >
          {{ discordProfileImportPromptNotNowCta }}
        </button>
        <button
          type="button"
          class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          :disabled="busy"
          @click="onImport"
        >
          {{ busy ? 'Importing…' : discordProfileImportPromptImportCta }}
        </button>
      </div>
    </div>
  </div>
</template>

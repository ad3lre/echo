<script setup lang="ts">
import { ref, watch } from 'vue';
import { createGuildEvent } from '@/services/http/echoServerEventsHttp';
import {
  parseDateTimeLocalToUtcIso,
  utcIsoToDateTimeLocalValue,
} from '@/features/server-settings/utils/serverEventFormDateTime';
import { withStageModeInDescription } from '@/features/voice/stage/stageLobbyUtils';
import { dispatchAppToast } from '@/utils/controllerMissingAction';

const props = defineProps<{
  open: boolean;
  serverId: string;
  stageChannelId: string;
  stageChannelName: string;
}>();

const emit = defineEmits<{
  close: [];
  created: [];
}>();

const draftTitle = ref('');
const draftDescription = ref('');
const draftStarts = ref('');
const draftEnds = ref('');
const youtubeLive = ref(false);
const saving = ref(false);

function resetDraft() {
  draftTitle.value = '';
  draftDescription.value = '';
  const now = new Date();
  const start = new Date(now.getTime() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  draftStarts.value = utcIsoToDateTimeLocalValue(start.toISOString());
  draftEnds.value = utcIsoToDateTimeLocalValue(end.toISOString());
  youtubeLive.value = false;
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) resetDraft();
  },
);

async function submit() {
  const title = draftTitle.value.trim();
  if (!title) {
    dispatchAppToast('Event title is required.', 'warning');
    return;
  }
  const startsIso = parseDateTimeLocalToUtcIso(draftStarts.value);
  const endsIso = parseDateTimeLocalToUtcIso(draftEnds.value);
  if (!startsIso || !endsIso) {
    dispatchAppToast('Pick valid start and end times.', 'warning');
    return;
  }
  if (new Date(endsIso) <= new Date(startsIso)) {
    dispatchAppToast('End time must be after start.', 'warning');
    return;
  }

  saving.value = true;
  try {
    await createGuildEvent('', props.serverId, {
      title,
      description: withStageModeInDescription(
        draftDescription.value.trim(),
        youtubeLive.value,
      ),
      startsAt: startsIso,
      endsAt: endsIso,
      timezoneLabel: null,
      channelId: props.stageChannelId,
      customLocation: null,
      maxAttendees: null,
    });
    dispatchAppToast('Event scheduled.', 'success');
    emit('created');
    emit('close');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not schedule event';
    dispatchAppToast(msg, 'warning');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[320] flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stage-schedule-event-title"
      @click.self="emit('close')"
    >
      <div
        class="w-full max-w-lg rounded-2xl border border-border bg-[var(--bg)] p-5 shadow-2xl"
      >
        <div class="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2
              id="stage-schedule-event-title"
              class="text-lg font-bold text-foreground"
            >
              Schedule stage event
            </h2>
            <p class="mt-1 text-sm text-muted">
              {{ stageChannelName }} · members can RSVP from the sidebar
            </p>
          </div>
          <button
            type="button"
            class="rounded-lg px-2 py-1 text-xs text-fg-soft hover:bg-glass-hover"
            @click="emit('close')"
          >
            Close
          </button>
        </div>

        <div class="space-y-3">
          <div>
            <label class="text-xs font-semibold text-fg-soft">Title</label>
            <input
              v-model="draftTitle"
              type="text"
              maxlength="200"
              class="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg"
              placeholder="Weekly show, AMA, launch party…"
            />
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="text-xs font-semibold text-fg-soft">Starts</label>
              <input
                v-model="draftStarts"
                type="datetime-local"
                class="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg"
              />
            </div>
            <div>
              <label class="text-xs font-semibold text-fg-soft">Ends</label>
              <input
                v-model="draftEnds"
                type="datetime-local"
                class="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg"
              />
            </div>
          </div>
          <div>
            <label class="text-xs font-semibold text-fg-soft"
              >Description (optional)</label
            >
            <textarea
              v-model="draftDescription"
              rows="3"
              maxlength="4000"
              class="mt-1 w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg"
              placeholder="What should people expect?"
            />
          </div>
          <label
            class="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-glass-1 px-3 py-2.5"
          >
            <input v-model="youtubeLive" type="checkbox" class="rounded" />
            <span class="text-sm text-foreground"
              >Plan to go live on YouTube during this event</span
            >
          </label>
        </div>

        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-fg-soft hover:bg-glass-hover"
            :disabled="saving"
            @click="emit('close')"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            :disabled="saving"
            @click="submit"
          >
            {{ saving ? 'Saving…' : 'Schedule event' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed, ref, watch } from 'vue';
import { createGuildEvent } from '@/features/server-events/echoServerEventsHttp';
import EchoDateTimePicker from '@/components/EchoDateTimePicker.vue';
import {
  isDateTimeLocalInPast,
  parseDateTimeLocalToUtcIso,
  utcIsoToDateTimeLocalValue,
} from '@/features/server-settings/serverEventFormDateTime';
import { parseDateTimeLocal } from '@/features/server-settings/calendarDate';
import { YOUTUBE_INTEGRATION_ENABLED } from '@shared/integrationKillSwitches';
import { withStageModeInDescription } from '@/features/voice/stage/stageLobbyUtils';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';

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
const startsError = ref('');
const endsError = ref('');

const minEndDateTime = computed((): Date | undefined => {
  const start = parseDateTimeLocal(draftStarts.value);
  if (!start) return undefined;
  return new Date(start.getTime() + 60_000);
});

function resetDraft() {
  draftTitle.value = '';
  draftDescription.value = '';
  const now = new Date();
  const start = new Date(now.getTime() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  draftStarts.value = utcIsoToDateTimeLocalValue(start.toISOString());
  draftEnds.value = utcIsoToDateTimeLocalValue(end.toISOString());
  youtubeLive.value = false;
  startsError.value = '';
  endsError.value = '';
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) resetDraft();
  },
);

async function submit() {
  startsError.value = '';
  endsError.value = '';
  const title = draftTitle.value.trim();
  if (!title) {
    dispatchAppToast(echoT('b10.stage.titleRequired'), 'warning');
    return;
  }
  const startsIso = parseDateTimeLocalToUtcIso(draftStarts.value);
  const endsIso = parseDateTimeLocalToUtcIso(draftEnds.value);
  if (!startsIso) {
    startsError.value = echoT('b10.stage.pickValidStart');
    dispatchAppToast(echoT('b10.stage.pickValidTimes'), 'warning');
    return;
  }
  if (isDateTimeLocalInPast(draftStarts.value)) {
    startsError.value = echoT('b10.stage.startPast');
    dispatchAppToast(echoT('b10.stage.startPast'), 'warning');
    return;
  }
  if (!endsIso) {
    endsError.value = echoT('b10.stage.pickValidEnd');
    dispatchAppToast(echoT('b10.stage.pickValidTimes'), 'warning');
    return;
  }
  if (new Date(endsIso) <= new Date(startsIso)) {
    endsError.value = echoT('b10.stage.endAfterStart');
    dispatchAppToast(echoT('b10.stage.endTimeAfterStart'), 'warning');
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
    dispatchAppToast(echoT('b10.stage.scheduled'), 'success');
    emit('created');
    emit('close');
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : echoT('b10.stage.couldNotSchedule');
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
              {{ echoT('b10.stage.scheduleStageEvent') }}
            </h2>
            <p class="mt-1 text-sm text-muted">
              {{ echoT('b10.stage.membersRsvp', { name: stageChannelName }) }}
            </p>
          </div>
          <button
            type="button"
            class="rounded-lg px-2 py-1 text-xs text-fg-soft hover:bg-glass-hover"
            @click="emit('close')"
          >
            {{ echoT('b10.stage.close') }}
          </button>
        </div>

        <div class="space-y-3">
          <div>
            <label class="text-xs font-semibold text-fg-soft">{{
              echoT('b10.stage.title')
            }}</label>
            <input
              v-model="draftTitle"
              type="text"
              maxlength="200"
              class="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg"
              :placeholder="echoT('b10.stage.titlePlaceholder')"
            />
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="text-xs font-semibold text-fg-soft">{{
                echoT('b10.stage.starts')
              }}</label>
              <EchoDateTimePicker
                v-model="draftStarts"
                class="mt-1"
                min-date-time="now"
                :invalid="!!startsError"
              />
              <p v-if="startsError" class="mt-1 text-xs text-red-400">
                {{ startsError }}
              </p>
            </div>
            <div>
              <label class="text-xs font-semibold text-fg-soft">{{
                echoT('b10.stage.ends')
              }}</label>
              <EchoDateTimePicker
                v-model="draftEnds"
                class="mt-1"
                :min-date-time="minEndDateTime"
                :min-error-message="echoT('b10.stage.endAfterStart')"
                :invalid="!!endsError"
              />
              <p v-if="endsError" class="mt-1 text-xs text-red-400">
                {{ endsError }}
              </p>
            </div>
          </div>
          <div>
            <label class="text-xs font-semibold text-fg-soft">{{
              echoT('b10.stage.descriptionOptional')
            }}</label>
            <textarea
              v-model="draftDescription"
              rows="3"
              maxlength="4000"
              class="mt-1 w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg"
              :placeholder="echoT('b10.stage.descriptionPlaceholder')"
            />
          </div>
          <label
            v-if="YOUTUBE_INTEGRATION_ENABLED"
            class="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-glass-1 px-3 py-2.5"
          >
            <input v-model="youtubeLive" type="checkbox" class="rounded" />
            <span class="text-sm text-foreground">{{
              echoT('b10.stage.planYoutube')
            }}</span>
          </label>
        </div>

        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-fg-soft hover:bg-glass-hover"
            :disabled="saving"
            @click="emit('close')"
          >
            {{ echoT('b10.stage.cancel') }}
          </button>
          <button
            type="button"
            class="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            :disabled="saving"
            @click="submit"
          >
            {{
              saving
                ? echoT('b10.stage.saving')
                : echoT('b10.stage.scheduleEvent')
            }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

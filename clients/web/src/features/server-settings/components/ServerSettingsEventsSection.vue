<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue';
import type { ChannelSummary } from '@shared/types';
import { useChannelIconResolver } from '@/features/layout/channels/useChannelIconResolver';
import { useEchoWorkspace } from '@/features/layout/echoWorkspace/useEchoWorkspace';
import { useAuthSessionStore } from '@/features/auth/authSession';
import { uploadServerEventCoverFile } from '@/features/server-events/echoServerEventCovers';
import {
  cancelGuildEvent,
  createGuildEvent,
  fetchGuildEventsForManagement,
  updateGuildEvent,
  type EchoServerEventManagementRow,
} from '@/features/server-events/echoServerEventsHttp';
import EchoDropdown from '@/components/EchoDropdown.vue';
import EchoDateTimePicker from '@/components/EchoDateTimePicker.vue';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';
import { safeImageUrl } from '@/features/layout/display/safeImageUrl';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import {
  extractUploadErrorMessage,
  isValidBrandingImageFile,
} from '@/features/server-settings/domain/brandingUploads';
import {
  readBlobAsDataUrl,
  uploadBrandingAssetWithInlineFallback,
} from '@/features/server-settings/brandingUploadFallback';
import {
  isDateTimeLocalInPast,
  parseDateTimeLocalToUtcIso,
  utcIsoToDateTimeLocalValue,
} from '@/features/server-settings/serverEventFormDateTime';
import { parseDateTimeLocal } from '@/features/server-settings/calendarDate';
import { toggleExpandedEventId } from '@/features/server-settings/serverSettingsEventExpand';

const props = defineProps<{
  serverId: string;
  /** Discord-imported layout: offer mirroring Echo events to Discord scheduled events. */
  isDiscordImportedServer?: boolean;
}>();

const emit = defineEmits<{
  'echo-workspace-refresh': [];
}>();

const workspace = useEchoWorkspace();
const authSession = useAuthSessionStore();
const serverIdRef = toRef(props, 'serverId');
const channelIconResolver = useChannelIconResolver(serverIdRef);

const events = ref<EchoServerEventManagementRow[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const saving = ref(false);
const cancellingId = ref<string | null>(null);
const coverUploading = ref(false);
const coverFileInputRef = ref<HTMLInputElement | null>(null);
const expandedEventId = ref<string | null>(null);
const nowMs = ref(Date.now());
let countdownTimer: ReturnType<typeof setInterval> | null = null;

const showDiscordMirrorUi = computed(
  () => props.isDiscordImportedServer === true,
);
const draftMirrorToDiscord = ref(false);
/** True when the row already had a Discord scheduled event id at editor open. */
const editingHadDiscordMirror = ref(false);

const showEditor = ref(false);
const editingEventId = ref<string | null>(null);

const draftTitle = ref('');
const draftDescription = ref('');
const draftStarts = ref('');
const draftEnds = ref('');
const draftChannelId = ref('');
const draftImageUrl = ref('');

const fieldErrors = ref({
  title: '',
  starts: '',
  ends: '',
});

const flatChannels = computed((): ChannelSummary[] => {
  const cats = workspace.categoriesByServer.value[props.serverId] ?? [];
  const out: ChannelSummary[] = [];
  for (const c of cats) {
    for (const ch of c.channels ?? []) {
      if (ch.type === 'text' || ch.type === 'voice' || ch.type === 'stage')
        out.push(ch);
    }
  }
  return out;
});

type LocationTab = 'voice' | 'text' | 'custom';
const locationTab = ref<LocationTab>('voice');
const draftCustomLocation = ref('');

function pickChannel(id: string): ChannelSummary | undefined {
  return flatChannels.value.find((c) => c.id === id);
}

const voiceLocationOptions = computed(() => {
  const opts: {
    value: string;
    label: string;
    iconSrc?: string;
    iconMono?: boolean;
  }[] = [{ value: '', label: echoT('b05.eventsSection.noVoiceChannel') }];
  for (const ch of flatChannels.value) {
    if (ch.type !== 'voice' && ch.type !== 'stage') continue;
    const iconSrc = channelIconResolver.getIconUrl(ch);
    opts.push({
      value: ch.id,
      label: ch.name,
      iconSrc: iconSrc || undefined,
      iconMono: channelIconResolver.usesSvgInvert(ch),
    });
  }
  return opts;
});

const textLocationOptions = computed(() => {
  const opts: {
    value: string;
    label: string;
    iconSrc?: string;
    iconMono?: boolean;
  }[] = [{ value: '', label: echoT('b05.eventsSection.noTextChannel') }];
  for (const ch of flatChannels.value) {
    if (ch.type !== 'text') continue;
    const iconSrc = channelIconResolver.getIconUrl(ch);
    opts.push({
      value: ch.id,
      label: `#${ch.name}`,
      iconSrc: iconSrc || undefined,
      iconMono: channelIconResolver.usesSvgInvert(ch),
    });
  }
  return opts;
});

const minEndDateTime = computed((): Date | undefined => {
  const start = parseDateTimeLocal(draftStarts.value);
  if (!start) return undefined;
  return new Date(start.getTime() + 60_000);
});

watch(locationTab, (tab) => {
  if (tab !== 'voice' && tab !== 'text') return;
  const id = draftChannelId.value.trim();
  if (!id) return;
  const ch = pickChannel(id);
  if (!ch || ch.type !== (tab === 'voice' ? 'voice' : 'text')) {
    draftChannelId.value = '';
  }
});

async function load() {
  if (!props.serverId.trim()) return;
  loading.value = true;
  error.value = null;
  try {
    /* `echoFetch` uses cookie session; bearer token arg is ignored (see `transport.ts`). */
    events.value = await fetchGuildEventsForManagement('', props.serverId);
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : echoT('b05.eventsSection.loadFailed');
  } finally {
    loading.value = false;
    syncCountdownTimer();
  }
}

function syncCountdownTimer() {
  if (events.value.length > 0) {
    if (countdownTimer == null) {
      countdownTimer = setInterval(() => {
        nowMs.value = Date.now();
      }, 1000);
    }
  } else if (countdownTimer != null) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

onMounted(load);
onBeforeUnmount(() => {
  if (countdownTimer != null) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
});
watch(
  () => props.serverId,
  () => {
    expandedEventId.value = null;
    void load();
  },
);
watch(
  () => events.value.length,
  () => {
    syncCountdownTimer();
  },
);

function clearFieldErrors() {
  fieldErrors.value = {
    title: '',
    starts: '',
    ends: '',
  };
}

function resetDraft() {
  editingEventId.value = null;
  draftTitle.value = '';
  draftDescription.value = '';
  draftStarts.value = '';
  draftEnds.value = '';
  draftChannelId.value = '';
  draftCustomLocation.value = '';
  locationTab.value = 'voice';
  draftImageUrl.value = '';
  clearFieldErrors();
  draftMirrorToDiscord.value = false;
  editingHadDiscordMirror.value = false;
}

function openCreate() {
  expandedEventId.value = null;
  resetDraft();
  const now = new Date();
  const start = new Date(now.getTime() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  draftStarts.value = utcIsoToDateTimeLocalValue(start.toISOString());
  draftEnds.value = utcIsoToDateTimeLocalValue(end.toISOString());
  showEditor.value = true;
}

/** Expand inline details in settings — never guild shell navigation. */
function selectEvent(id: string) {
  expandedEventId.value = toggleExpandedEventId(expandedEventId.value, id);
}

function openEdit(ev: EchoServerEventManagementRow) {
  clearFieldErrors();
  expandedEventId.value = null;
  editingEventId.value = ev.id;
  draftTitle.value = ev.title;
  draftDescription.value = ev.description ?? '';
  draftStarts.value = utcIsoToDateTimeLocalValue(ev.startsAt);
  draftEnds.value = utcIsoToDateTimeLocalValue(ev.endsAt);
  draftCustomLocation.value = ev.customLocation?.trim() ?? '';
  if (ev.customLocation?.trim()) {
    locationTab.value = 'custom';
    draftChannelId.value = '';
  } else {
    const cid = ev.channelId?.trim() ?? '';
    draftChannelId.value = cid;
    const ch = cid ? pickChannel(cid) : undefined;
    locationTab.value = ch?.type === 'text' ? 'text' : 'voice';
  }
  draftImageUrl.value = ev.imageUrl?.trim() ?? '';
  editingHadDiscordMirror.value = !!ev.discordScheduledEventId?.trim();
  draftMirrorToDiscord.value = false;
  showEditor.value = true;
}

function closeEditor() {
  showEditor.value = false;
  resetDraft();
}

function validateForm(): boolean {
  clearFieldErrors();
  let ok = true;
  if (!draftTitle.value.trim()) {
    fieldErrors.value.title = echoT('b05.eventsSection.titleRequired');
    ok = false;
  }
  const startsIso = parseDateTimeLocalToUtcIso(draftStarts.value);
  const endsIso = parseDateTimeLocalToUtcIso(draftEnds.value);
  if (!startsIso) {
    fieldErrors.value.starts = echoT('b05.eventsSection.startInvalid');
    ok = false;
  } else if (isDateTimeLocalInPast(draftStarts.value)) {
    fieldErrors.value.starts = echoT('b05.eventsSection.startPast');
    ok = false;
  }
  if (!endsIso) {
    fieldErrors.value.ends = echoT('b05.eventsSection.endInvalid');
    ok = false;
  }
  if (startsIso && endsIso && new Date(endsIso) <= new Date(startsIso)) {
    fieldErrors.value.ends = echoT('b05.eventsSection.endBeforeStart');
    ok = false;
  }
  return ok;
}

async function submitSave() {
  if (!validateForm()) {
    dispatchAppToast(echoT('b05.eventsSection.fixFields'), 'warning');
    return;
  }
  const startsIso = parseDateTimeLocalToUtcIso(draftStarts.value)!;
  const endsIso = parseDateTimeLocalToUtcIso(draftEnds.value)!;

  saving.value = true;
  try {
    const locationBody =
      locationTab.value === 'custom'
        ? {
            channelId: null,
            customLocation: draftCustomLocation.value.trim() || null,
          }
        : {
            channelId: draftChannelId.value.trim() || null,
            customLocation: null,
          };
    const mirrorToDiscord =
      showDiscordMirrorUi.value &&
      draftMirrorToDiscord.value &&
      !editingHadDiscordMirror.value;

    if (editingEventId.value) {
      const patchOut = await updateGuildEvent(
        '',
        props.serverId,
        editingEventId.value,
        {
          title: draftTitle.value.trim(),
          description: draftDescription.value.trim(),
          imageUrl: draftImageUrl.value.trim(),
          startsAt: startsIso,
          endsAt: endsIso,
          timezoneLabel: null,
          ...locationBody,
          maxAttendees: null,
          ...(mirrorToDiscord ? { mirrorToDiscord: true } : {}),
        },
      );
      if (patchOut.discordMirror && !patchOut.discordMirror.ok) {
        dispatchAppToast(
          patchOut.discordMirror.message ??
            'Echo saved, but Discord could not update the listing.',
          'warning',
        );
      } else {
        dispatchAppToast(echoT('b05.eventsSection.updated'), 'success');
      }
    } else {
      const created = await createGuildEvent('', props.serverId, {
        title: draftTitle.value.trim(),
        description: draftDescription.value.trim(),
        imageUrl: draftImageUrl.value.trim() || undefined,
        startsAt: startsIso,
        endsAt: endsIso,
        timezoneLabel: null,
        ...locationBody,
        maxAttendees: null,
        ...(showDiscordMirrorUi.value && draftMirrorToDiscord.value
          ? { mirrorToDiscord: true }
          : {}),
      });
      if (created.discordMirror && !created.discordMirror.ok) {
        dispatchAppToast(
          created.discordMirror.message ??
            'Event created on Echo, but Discord did not accept a listing.',
          'warning',
        );
      } else {
        dispatchAppToast(echoT('b05.eventsSection.created'), 'success');
      }
    }
    emit('echo-workspace-refresh');
    expandedEventId.value = null;
    closeEditor();
    await load();
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : echoT('b05.eventsSection.saveFailed');
    dispatchAppToast(msg, 'warning');
  } finally {
    saving.value = false;
  }
}

async function onCancelEvent(id: string) {
  cancellingId.value = id;
  try {
    await cancelGuildEvent('', props.serverId, id);
    dispatchAppToast(echoT('b05.eventsSection.cancelledToast'), 'success');
    emit('echo-workspace-refresh');
    await load();
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : echoT('b05.eventsSection.cancelFailed');
    dispatchAppToast(msg, 'warning');
  } finally {
    cancellingId.value = null;
  }
}

function formatExactStart(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function countdownLabel(startsAtIso: string): string {
  const t = new Date(startsAtIso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = t - nowMs.value;
  if (diff <= 0) return echoT('b05.eventsSection.started');
  const sec = Math.floor(diff / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return echoT('b05.eventsSection.startsInDH', { d, h });
  if (h > 0) return echoT('b05.eventsSection.startsInHM', { h, m });
  if (m > 0) return echoT('b05.eventsSection.startsInMS', { m, s });
  return echoT('b05.eventsSection.startingSoon');
}

function eventTimingLabel(row: EchoServerEventManagementRow): string {
  if (row.status === 'cancelled')
    return echoT('b05.eventsSection.cancelledStatus');
  const start = new Date(row.startsAt).getTime();
  const end = new Date(row.endsAt).getTime();
  const n = nowMs.value;
  if (!Number.isNaN(start) && !Number.isNaN(end) && n >= start && n <= end) {
    return echoT('b05.eventsSection.happeningNow');
  }
  if (!Number.isNaN(end) && n > end) return 'Ended';
  return countdownLabel(row.startsAt);
}

function toggleExpandedEvent(id: string) {
  selectEvent(id);
}

function formatWhen(row: EchoServerEventManagementRow): string {
  return formatExactStart(row.startsAt) || row.startsAt;
}

function formatRange(row: EchoServerEventManagementRow): string {
  try {
    const a = new Date(row.startsAt);
    const b = new Date(row.endsAt);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '';
    return `${a.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    })} – ${b.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    })}`;
  } catch {
    return formatWhen(row);
  }
}

function formatLocationSummary(row: EchoServerEventManagementRow): string {
  const c = row.customLocation?.trim();
  if (c) return c;
  const n = row.channelName?.trim();
  if (n) return `#${n}`;
  return '';
}

async function onCoverFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!isValidBrandingImageFile(file)) {
    input.value = '';
    return;
  }
  if (!props.serverId.trim()) {
    input.value = '';
    return;
  }
  coverUploading.value = true;
  try {
    const url =
      !echoSyncCapabilities.isMockDataMode && authSession.isAuthenticated
        ? await uploadBrandingAssetWithInlineFallback({
            file: file!,
            upload: () => uploadServerEventCoverFile('', props.serverId, file!),
          })
        : await readBlobAsDataUrl(file!);
    draftImageUrl.value = url;
    dispatchAppToast(echoT('b05.eventsSection.coverReady'), 'success');
  } catch (e) {
    const detail = extractUploadErrorMessage(e);
    dispatchAppToast(
      detail
        ? echoT('b05.eventsSection.coverUploadFailedDetail', { detail })
        : echoT('b05.eventsSection.coverUploadFailed'),
      'warning',
    );
  } finally {
    coverUploading.value = false;
    input.value = '';
  }
}

function triggerCoverPicker() {
  coverFileInputRef.value?.click();
}

function clearCover() {
  draftImageUrl.value = '';
}
</script>

<template>
  <div class="server-settings-sections--flat server-settings-panel-root pb-8">
    <section class="settings-section-stack">
      <div
        class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
      >
        <div class="min-w-0 flex-1">
          <div class="settings-subtitle">
            {{ echoT('b05.eventsSection.communityEvents') }}
          </div>
          <p class="mt-1.5 text-sm leading-snug text-fg-subtle">
            {{ echoT('b05.eventsSection.intro') }}
          </p>
        </div>
        <button
          type="button"
          class="h-fit shrink-0 self-start rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50 sm:self-center"
          :disabled="saving || !serverId.trim()"
          @click="openCreate"
        >
          {{ echoT('b05.eventsSection.newEvent') }}
        </button>
      </div>
    </section>

    <p v-if="error" class="mt-4 text-sm text-red-400">{{ error }}</p>
    <p v-if="loading" class="mt-4 text-sm text-fg-soft">
      {{ echoT('b05.eventsSection.loading') }}
    </p>

    <section v-if="showEditor" class="settings-section-stack">
      <div class="mb-3 flex items-center justify-between gap-2">
        <h4 class="text-base font-semibold text-foreground">
          {{
            editingEventId
              ? echoT('b05.eventsSection.editEvent')
              : echoT('b05.eventsSection.createEvent')
          }}
        </h4>
        <button
          type="button"
          class="rounded-lg px-2 py-1 text-xs text-fg-soft transition-colors hover:bg-glass-hover hover:text-foreground"
          :disabled="saving"
          @click="closeEditor"
        >
          {{ echoT('b05.eventsSection.close') }}
        </button>
      </div>

      <div class="space-y-8">
        <section class="min-w-0">
          <div class="mb-4 border-b border-border/60 pb-3">
            <h5 class="settings-subtitle">
              {{ echoT('b05.eventsSection.eventDetails') }}
            </h5>
            <p class="mt-1 text-xs leading-relaxed text-fg-soft">
              {{ echoT('b05.eventsSection.eventDetailsHint') }}
            </p>
          </div>
          <div
            class="grid min-w-0 gap-5 lg:grid-cols-12 lg:items-start lg:gap-6"
          >
            <div class="flex min-w-0 flex-col gap-4 lg:col-span-7">
              <div>
                <label class="settings-label">{{
                  echoT('b05.eventsSection.title')
                }}</label>
                <input
                  v-model="draftTitle"
                  type="text"
                  maxlength="200"
                  class="server-input mt-2 w-full"
                  :class="{ 'ring-1 ring-red-400/60': fieldErrors.title }"
                />
                <p v-if="fieldErrors.title" class="mt-1 text-xs text-red-400">
                  {{ fieldErrors.title }}
                </p>
              </div>
              <div>
                <label class="settings-label">{{
                  echoT('b05.eventsSection.descriptionOptional')
                }}</label>
                <textarea
                  v-model="draftDescription"
                  rows="4"
                  maxlength="4000"
                  class="server-input mt-2 min-h-[100px] w-full resize-y"
                />
              </div>
            </div>
            <div class="min-w-0 lg:col-span-5">
              <label class="settings-label">{{
                echoT('b05.eventsSection.coverImage')
              }}</label>
              <p class="mt-1 text-xs text-fg-soft">
                {{ echoT('b05.eventsSection.coverHint') }}
              </p>
              <div
                class="relative mt-3 aspect-[16/9] w-full overflow-hidden rounded-2xl bg-glass-2 ring-1 ring-border/50"
              >
                <img
                  v-if="draftImageUrl.trim()"
                  :src="safeImageUrl(draftImageUrl.trim())"
                  alt=""
                  class="h-full w-full object-cover"
                />
                <div
                  v-else
                  class="flex h-full min-h-[7.5rem] w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-glass-2 to-glass-3 p-4 text-center"
                >
                  <span class="text-sm text-fg-soft">{{
                    echoT('b05.eventsSection.noCover')
                  }}</span>
                </div>
                <div
                  class="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end gap-2 bg-gradient-to-t from-black/50 to-transparent p-3"
                >
                  <span
                    class="pointer-events-auto flex flex-wrap justify-end gap-2"
                  >
                    <button
                      type="button"
                      class="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/25 disabled:opacity-50"
                      :disabled="coverUploading || saving"
                      @click="triggerCoverPicker"
                    >
                      {{
                        coverUploading
                          ? echoT('b05.eventsSection.uploading')
                          : echoT('b05.eventsSection.upload')
                      }}
                    </button>
                    <button
                      v-if="draftImageUrl.trim()"
                      type="button"
                      class="rounded-lg border border-white/30 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/10"
                      :disabled="saving"
                      @click="clearCover"
                    >
                      {{ echoT('b05.eventsSection.remove') }}
                    </button>
                  </span>
                </div>
              </div>
              <input
                ref="coverFileInputRef"
                type="file"
                accept="image/*"
                class="sr-only"
                @change="onCoverFileChange"
              />
            </div>
          </div>
        </section>

        <section class="min-w-0">
          <div class="mb-4 border-b border-border/60 pb-3">
            <h5 class="settings-subtitle">
              {{ echoT('b05.eventsSection.schedule') }}
            </h5>
            <p class="mt-1 text-xs leading-relaxed text-fg-soft">
              {{ echoT('b05.eventsSection.scheduleHint') }}
            </p>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="min-w-0">
              <label class="settings-label">{{
                echoT('b05.eventsSection.starts')
              }}</label>
              <EchoDateTimePicker
                v-model="draftStarts"
                class="mt-2"
                surface="server"
                min-date-time="now"
                :invalid="!!fieldErrors.starts"
              />
              <p v-if="fieldErrors.starts" class="mt-1 text-xs text-red-400">
                {{ fieldErrors.starts }}
              </p>
            </div>
            <div class="min-w-0">
              <label class="settings-label">{{
                echoT('b05.eventsSection.ends')
              }}</label>
              <EchoDateTimePicker
                v-model="draftEnds"
                class="mt-2"
                surface="server"
                :min-date-time="minEndDateTime"
                :min-error-message="echoT('b05.eventsSection.endBeforeStart')"
                :invalid="!!fieldErrors.ends"
              />
              <p v-if="fieldErrors.ends" class="mt-1 text-xs text-red-400">
                {{ fieldErrors.ends }}
              </p>
            </div>
          </div>
        </section>

        <section class="min-w-0">
          <div class="mb-4 border-b border-border/60 pb-3">
            <h5 class="settings-subtitle">
              {{ echoT('b05.eventsSection.location') }}
            </h5>
            <p class="mt-1 text-xs leading-relaxed text-fg-soft">
              {{ echoT('b05.eventsSection.locationHint') }}
            </p>
          </div>
          <div
            class="inline-flex max-w-full flex-wrap rounded-xl border border-border bg-glass-1 p-0.5 text-xs font-semibold"
            role="tablist"
            :aria-label="echoT('b05.eventsSection.locationType')"
          >
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 transition-colors"
              :class="
                locationTab === 'voice'
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-fg-soft hover:text-foreground'
              "
              :disabled="saving"
              @click="locationTab = 'voice'"
            >
              {{ echoT('b05.eventsSection.voice') }}
            </button>
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 transition-colors"
              :class="
                locationTab === 'text'
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-fg-soft hover:text-foreground'
              "
              :disabled="saving"
              @click="locationTab = 'text'"
            >
              {{ echoT('b05.eventsSection.text') }}
            </button>
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 transition-colors"
              :class="
                locationTab === 'custom'
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-fg-soft hover:text-foreground'
              "
              :disabled="saving"
              @click="locationTab = 'custom'"
            >
              {{ echoT('b05.eventsSection.custom') }}
            </button>
          </div>
          <div class="mt-4 min-w-0">
            <EchoDropdown
              v-if="locationTab === 'voice'"
              v-model="draftChannelId"
              :label="echoT('b05.eventsSection.voiceOrStage')"
              :options="voiceLocationOptions"
              surface="server"
              teleport-menu
              searchable
              :disabled="saving"
            />
            <EchoDropdown
              v-else-if="locationTab === 'text'"
              v-model="draftChannelId"
              :label="echoT('b05.eventsSection.textChannel')"
              :options="textLocationOptions"
              surface="server"
              teleport-menu
              searchable
              :disabled="saving"
            />
            <div v-else>
              <label class="settings-label">{{
                echoT('b05.eventsSection.customVenue')
              }}</label>
              <textarea
                v-model="draftCustomLocation"
                rows="3"
                maxlength="2000"
                class="server-input mt-2 min-h-[88px] w-full resize-y"
                :placeholder="echoT('b05.eventsSection.venuePlaceholder')"
                :disabled="saving"
              />
            </div>
          </div>
        </section>

        <section
          v-if="showDiscordMirrorUi"
          class="min-w-0 rounded-xl bg-glass-1/80 p-4"
        >
          <h5 class="settings-subtitle mb-3">Discord</h5>
          <p
            v-if="editingHadDiscordMirror"
            class="text-sm leading-snug text-fg-subtle"
          >
            {{ echoT('b05.eventsSection.mirrorUpdate') }}
          </p>
          <label v-else class="flex cursor-pointer items-start gap-3">
            <input
              v-model="draftMirrorToDiscord"
              type="checkbox"
              class="mt-1 h-4 w-4 shrink-0 rounded border-border"
              :disabled="saving"
            />
            <span class="min-w-0">
              <span class="block text-sm font-semibold text-foreground">
                {{ echoT('b05.eventsSection.mirrorCreate') }}
              </span>
              <span class="mt-0.5 block text-xs leading-snug text-fg-soft">
                {{ echoT('b05.eventsSection.mirrorCreateHint') }}
              </span>
            </span>
          </label>
        </section>

        <div class="flex flex-wrap gap-2 border-t border-border/80 pt-4">
          <button
            type="button"
            class="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            :disabled="saving || coverUploading"
            @click="submitSave"
          >
            {{
              saving
                ? echoT('b05.eventsSection.saving')
                : echoT('b05.eventsSection.saveEvent')
            }}
          </button>
          <button
            type="button"
            class="rounded-xl px-4 py-2.5 text-sm font-medium text-fg-soft transition-colors hover:bg-glass-hover"
            :disabled="saving"
            @click="closeEditor"
          >
            {{ echoT('b05.eventsSection.cancel') }}
          </button>
        </div>
      </div>
    </section>

    <section v-if="!loading && events.length" class="settings-section-stack">
      <div class="settings-subtitle mb-3">
        {{ echoT('b05.eventsSection.scheduledAndPast') }}
      </div>
      <ul class="flex flex-col gap-3">
        <li v-for="ev in events" :key="ev.id" class="events-list-row">
          <button
            type="button"
            class="events-collapsed-card group relative flex min-h-[7.75rem] w-full flex-col justify-end overflow-hidden rounded-2xl text-left transition-[transform,box-shadow] duration-200 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            :aria-expanded="expandedEventId === ev.id"
            :aria-label="
              echoT('b05.eventsSection.cardAria', {
                title: ev.title,
                timing: eventTimingLabel(ev),
                action:
                  expandedEventId === ev.id
                    ? echoT('b05.eventsSection.collapse')
                    : echoT('b05.eventsSection.show'),
              })
            "
            @click="toggleExpandedEvent(ev.id)"
          >
            <img
              v-if="ev.imageUrl?.trim()"
              :src="safeImageUrl(ev.imageUrl.trim())"
              alt=""
              class="pointer-events-none absolute inset-0 h-full w-full object-cover"
            />
            <div
              v-else
              class="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-600/55 via-violet-700/45 to-slate-900/70"
              aria-hidden="true"
            />
            <div
              class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/20"
              aria-hidden="true"
            />
            <div class="relative z-[1] flex w-full flex-col gap-2 p-4 sm:p-5">
              <div class="flex flex-wrap items-center gap-1.5">
                <span
                  v-if="ev.status === 'cancelled'"
                  class="echo-status-pill echo-status-pill--danger shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                >
                  {{ echoT('b05.eventsSection.cancelledStatus') }}
                </span>
                <span
                  v-else
                  class="echo-status-pill echo-status-pill--success shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ring-1 ring-white/25"
                >
                  {{ echoT('b05.eventsSection.scheduledStatus') }}
                </span>
                <span
                  v-if="ev.discordScheduledEventId?.trim()"
                  class="shrink-0 rounded-full bg-indigo-400/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-100 ring-1 ring-indigo-300/30"
                >
                  Discord
                </span>
              </div>
              <h3
                class="line-clamp-2 text-lg font-semibold leading-snug text-white drop-shadow-sm sm:text-xl"
              >
                {{ ev.title }}
              </h3>
              <div class="events-collapsed-card__when min-w-0">
                <p
                  class="text-sm font-semibold text-white/95 drop-shadow-sm"
                  :title="formatExactStart(ev.startsAt)"
                >
                  {{ eventTimingLabel(ev) }}
                </p>
                <p
                  class="events-collapsed-card__when-exact mt-0.5 truncate text-xs text-white/75 drop-shadow-sm"
                  aria-hidden="true"
                >
                  {{ formatExactStart(ev.startsAt) }}
                </p>
              </div>
            </div>
          </button>

          <div
            v-if="expandedEventId === ev.id"
            class="events-expanded-panel mt-3 space-y-3 pl-0.5"
            data-echo-hint-off
          >
            <p class="text-sm text-fg-subtle">{{ formatRange(ev) }}</p>
            <p
              v-if="formatLocationSummary(ev)"
              class="line-clamp-3 text-sm text-fg-soft"
            >
              {{ formatLocationSummary(ev) }}
            </p>
            <p
              v-if="ev.description?.trim()"
              class="line-clamp-4 text-sm leading-relaxed text-fg-soft"
            >
              {{ ev.description.trim() }}
            </p>
            <p class="text-sm text-fg-soft">
              <span class="font-semibold text-foreground">{{
                ev.goingCount
              }}</span>
              {{ echoT('b05.eventsSection.going') }}
            </p>
            <div
              v-if="ev.status === 'scheduled'"
              class="flex flex-wrap gap-2 pt-1"
            >
              <button
                type="button"
                class="rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                :disabled="saving || !!cancellingId"
                @click.stop="openEdit(ev)"
              >
                {{ echoT('b05.eventsSection.editEvent') }}
              </button>
              <button
                type="button"
                class="rounded-xl px-4 py-2 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/10"
                :disabled="!!cancellingId"
                @click.stop="onCancelEvent(ev.id)"
              >
                {{
                  cancellingId === ev.id
                    ? '…'
                    : echoT('b05.eventsSection.cancelEvent')
                }}
              </button>
            </div>
          </div>
        </li>
      </ul>
    </section>

    <section
      v-else-if="!loading && !error"
      class="settings-section-stack py-6 text-center"
    >
      <p class="text-sm text-fg-soft">
        {{ echoT('b05.eventsSection.empty') }}
      </p>
    </section>
  </div>
</template>

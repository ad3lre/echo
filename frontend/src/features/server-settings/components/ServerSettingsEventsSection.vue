<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useEchoWorkspace } from '@/composables/useEchoWorkspace';
import { useAuthSessionStore } from '@/stores/authSession';
import {
  cancelGuildEvent,
  createGuildEvent,
  fetchGuildEventsForManagement,
  updateGuildEvent,
  type EchoServerEventManagementRow,
} from '@/api/echoClient';
import { uploadServerEventCoverFile } from '@/api/echo/uploads';
import EchoDropdown from '@/components/EchoDropdown.vue';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import {
  extractUploadErrorMessage,
  isValidBrandingImageFile,
} from '@/services/domain/brandingUploads';
import {
  readBlobAsDataUrl,
  uploadBrandingAssetWithInlineFallback,
} from '@/services/orchestration/brandingUploadFallback';
import {
  maxAttendeesFromInput,
  parseDateTimeLocalToUtcIso,
  utcIsoToDateTimeLocalValue,
} from '@/features/server-settings/utils/serverEventFormDateTime';

const props = defineProps<{
  serverId: string;
}>();

const emit = defineEmits<{
  'echo-workspace-refresh': [];
}>();

const workspace = useEchoWorkspace();
const authSession = useAuthSessionStore();
const { accessToken } = storeToRefs(authSession);

const events = ref<EchoServerEventManagementRow[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const saving = ref(false);
const cancellingId = ref<string | null>(null);
const coverUploading = ref(false);
const coverFileInputRef = ref<HTMLInputElement | null>(null);

const showEditor = ref(false);
const editingEventId = ref<string | null>(null);

const draftTitle = ref('');
const draftDescription = ref('');
const draftStarts = ref('');
const draftEnds = ref('');
const draftChannelId = ref('');
const draftMax = ref('');
const draftImageUrl = ref('');
const draftTimezoneValue = ref('');

const fieldErrors = ref({
  title: '',
  starts: '',
  ends: '',
  max: '',
});

const flatChannels = computed(() => {
  const cats = workspace.categoriesByServer.value[props.serverId] ?? [];
  const out: { id: string; name: string; type: string }[] = [];
  for (const c of cats) {
    for (const ch of c.channels ?? []) {
      out.push({ id: ch.id, name: ch.name, type: ch.type });
    }
  }
  return out.filter((c) => c.type === 'text' || c.type === 'voice');
});

const channelDropdownOptions = computed(() => {
  const opts = [{ value: '', label: 'No channel' }];
  for (const ch of flatChannels.value) {
    const prefix = ch.type === 'voice' ? 'Voice · ' : '#';
    opts.push({
      value: ch.id,
      label: `${prefix}${ch.name}`,
    });
  }
  return opts;
});

const timezoneDropdownOptions = computed(() => {
  let list: string[] = [];
  try {
    list = Intl.supportedValuesOf('timeZone');
  } catch {
    list = [];
  }
  if (list.length === 0) {
    list = [
      'UTC',
      'America/New_York',
      'America/Los_Angeles',
      'Europe/London',
      'Europe/Paris',
      'Asia/Tokyo',
    ];
  }
  const priority = [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Asia/Tokyo',
    'Australia/Sydney',
  ];
  const seen = new Set<string>();
  const out: { value: string; label: string }[] = [
    { value: '', label: 'Default (browser locale)' },
  ];
  for (const p of priority) {
    if (list.includes(p) && !seen.has(p)) {
      seen.add(p);
      out.push({ value: p, label: p.replace(/_/g, ' ') });
    }
  }
  for (const z of list) {
    if (out.length >= 90) break;
    if (!seen.has(z)) {
      seen.add(z);
      out.push({ value: z, label: z.replace(/_/g, ' ') });
    }
  }
  return out;
});

async function load() {
  const t = accessToken.value?.trim() ?? '';
  if (!t || !props.serverId.trim()) return;
  loading.value = true;
  error.value = null;
  try {
    events.value = await fetchGuildEventsForManagement(t, props.serverId);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load events';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(
  () => props.serverId,
  () => {
    void load();
  },
);

function clearFieldErrors() {
  fieldErrors.value = {
    title: '',
    starts: '',
    ends: '',
    max: '',
  };
}

function resetDraft() {
  editingEventId.value = null;
  draftTitle.value = '';
  draftDescription.value = '';
  draftStarts.value = '';
  draftEnds.value = '';
  draftChannelId.value = '';
  draftMax.value = '';
  draftImageUrl.value = '';
  draftTimezoneValue.value = '';
  clearFieldErrors();
}

function openCreate() {
  resetDraft();
  showEditor.value = true;
}

function openEdit(ev: EchoServerEventManagementRow) {
  clearFieldErrors();
  editingEventId.value = ev.id;
  draftTitle.value = ev.title;
  draftDescription.value = ev.description ?? '';
  draftStarts.value = utcIsoToDateTimeLocalValue(ev.startsAt);
  draftEnds.value = utcIsoToDateTimeLocalValue(ev.endsAt);
  draftChannelId.value = ev.channelId?.trim() ?? '';
  draftMax.value =
    ev.maxAttendees != null && ev.maxAttendees > 0
      ? String(ev.maxAttendees)
      : '';
  draftImageUrl.value = ev.imageUrl?.trim() ?? '';
  draftTimezoneValue.value = ev.timezoneLabel?.trim() ?? '';
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
    fieldErrors.value.title = 'Title is required.';
    ok = false;
  }
  const startsIso = parseDateTimeLocalToUtcIso(draftStarts.value);
  const endsIso = parseDateTimeLocalToUtcIso(draftEnds.value);
  if (!startsIso) {
    fieldErrors.value.starts = 'Pick a valid start date and time.';
    ok = false;
  }
  if (!endsIso) {
    fieldErrors.value.ends = 'Pick a valid end date and time.';
    ok = false;
  }
  if (startsIso && endsIso && new Date(endsIso) <= new Date(startsIso)) {
    fieldErrors.value.ends = 'End must be after start.';
    ok = false;
  }
  if (draftMax.value.trim()) {
    const m = maxAttendeesFromInput(draftMax.value);
    if (m == null) {
      fieldErrors.value.max = 'Enter a positive whole number or leave empty.';
      ok = false;
    }
  }
  return ok;
}

async function submitSave() {
  const t = accessToken.value?.trim() ?? '';
  if (!t) {
    dispatchAppToast('Sign in to save events.', 'warning');
    return;
  }
  if (!validateForm()) {
    dispatchAppToast('Fix the highlighted fields.', 'warning');
    return;
  }
  const startsIso = parseDateTimeLocalToUtcIso(draftStarts.value)!;
  const endsIso = parseDateTimeLocalToUtcIso(draftEnds.value)!;
  const maxA = maxAttendeesFromInput(draftMax.value);
  const tz = draftTimezoneValue.value.trim() || null;

  saving.value = true;
  try {
    if (editingEventId.value) {
      await updateGuildEvent(t, props.serverId, editingEventId.value, {
        title: draftTitle.value.trim(),
        description: draftDescription.value.trim(),
        imageUrl: draftImageUrl.value.trim(),
        startsAt: startsIso,
        endsAt: endsIso,
        timezoneLabel: tz,
        channelId: draftChannelId.value.trim() || null,
        maxAttendees: maxA,
      });
      dispatchAppToast('Event updated.', 'success');
    } else {
      await createGuildEvent(t, props.serverId, {
        title: draftTitle.value.trim(),
        description: draftDescription.value.trim(),
        imageUrl: draftImageUrl.value.trim() || undefined,
        startsAt: startsIso,
        endsAt: endsIso,
        timezoneLabel: tz,
        channelId: draftChannelId.value.trim() || null,
        maxAttendees: maxA,
      });
      dispatchAppToast('Event created.', 'success');
    }
    emit('echo-workspace-refresh');
    closeEditor();
    await load();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not save event';
    dispatchAppToast(msg, 'warning');
  } finally {
    saving.value = false;
  }
}

async function onCancelEvent(id: string) {
  const t = accessToken.value?.trim() ?? '';
  if (!t) return;
  cancellingId.value = id;
  try {
    await cancelGuildEvent(t, props.serverId, id);
    dispatchAppToast('Event cancelled.', 'success');
    emit('echo-workspace-refresh');
    await load();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not cancel';
    dispatchAppToast(msg, 'warning');
  } finally {
    cancellingId.value = null;
  }
}

function formatWhen(row: EchoServerEventManagementRow): string {
  try {
    const a = new Date(row.startsAt);
    return a.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return row.startsAt;
  }
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
    })} – ${b.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })}`;
  } catch {
    return formatWhen(row);
  }
}

async function onCoverFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!isValidBrandingImageFile(file)) {
    input.value = '';
    return;
  }
  const token = accessToken.value?.trim() ?? '';
  if (!token || !props.serverId.trim()) {
    input.value = '';
    return;
  }
  coverUploading.value = true;
  try {
    const url =
      !echoSyncCapabilities.isMockDataMode && authSession.isAuthenticated
        ? await uploadBrandingAssetWithInlineFallback({
            file: file!,
            upload: () =>
              uploadServerEventCoverFile(token, props.serverId, file!),
          })
        : await readBlobAsDataUrl(file!);
    draftImageUrl.value = url;
    dispatchAppToast('Cover image ready.', 'success');
  } catch (e) {
    const detail = extractUploadErrorMessage(e);
    dispatchAppToast(
      detail ? `Could not upload cover: ${detail}` : 'Could not upload cover.',
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
  <div class="server-settings-panel-root space-y-5 pb-8">
    <div class="server-settings-panel rounded-2xl p-5">
      <div class="settings-subtitle">Community events</div>
      <p class="mt-2 text-sm text-fg-subtle">
        Schedule events with optional cover art and location. Members see them in the channel
        sidebar and can RSVP; events they join also appear in DMs.
      </p>
      <div class="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          :disabled="saving || !serverId.trim()"
          @click="openCreate"
        >
          New event
        </button>
      </div>
    </div>

    <p v-if="error" class="text-sm text-red-400">{{ error }}</p>
    <p v-if="loading" class="text-sm text-fg-soft">Loading events…</p>

    <div v-if="showEditor" class="server-settings-panel rounded-2xl p-5">
      <div class="mb-4 flex items-center justify-between gap-2">
        <h4 class="text-base font-semibold text-foreground">
          {{ editingEventId ? 'Edit event' : 'Create event' }}
        </h4>
        <button
          type="button"
          class="rounded-lg px-2 py-1 text-xs text-fg-soft transition-colors hover:bg-glass-hover hover:text-foreground"
          :disabled="saving"
          @click="closeEditor"
        >
          Close
        </button>
      </div>

      <div class="space-y-4">
        <div>
          <label class="settings-label">Cover image</label>
          <p class="mt-1 text-xs text-fg-soft">
            16:9 works best. Uploads are stored on Echo (same security as server branding).
          </p>
          <div
            class="relative mt-3 overflow-hidden rounded-2xl border border-border bg-glass-2"
            :class="draftImageUrl.trim() ? 'aspect-[16/9] max-h-48' : 'aspect-[16/9] max-h-36'"
          >
            <img
              v-if="draftImageUrl.trim()"
              :src="safeImageUrl(draftImageUrl.trim())"
              alt=""
              class="h-full w-full object-cover"
            />
            <div
              v-else
              class="flex h-full min-h-[120px] w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-glass-2 to-glass-3 p-4 text-center"
            >
              <span class="text-sm text-fg-soft">No cover yet</span>
            </div>
            <div
              class="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end gap-2 bg-gradient-to-t from-black/50 to-transparent p-3"
            >
              <span class="pointer-events-auto flex gap-2">
                <button
                  type="button"
                  class="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/25 disabled:opacity-50"
                  :disabled="coverUploading || saving"
                  @click="triggerCoverPicker"
                >
                  {{ coverUploading ? 'Uploading…' : 'Upload' }}
                </button>
                <button
                  v-if="draftImageUrl.trim()"
                  type="button"
                  class="rounded-lg border border-white/30 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/10"
                  :disabled="saving"
                  @click="clearCover"
                >
                  Remove
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
          <label class="settings-label mt-3">Or paste image URL</label>
          <input
            v-model="draftImageUrl"
            type="url"
            class="server-input mt-2 w-full"
            placeholder="https://…"
            autocomplete="off"
          />
        </div>

        <div>
          <label class="settings-label">Title</label>
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
          <label class="settings-label">Description (optional)</label>
          <textarea
            v-model="draftDescription"
            rows="3"
            maxlength="4000"
            class="server-input mt-2 min-h-[88px] w-full resize-y"
          />
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <label class="settings-label">Starts</label>
            <input
              v-model="draftStarts"
              type="datetime-local"
              class="server-input mt-2 w-full"
              :class="{ 'ring-1 ring-red-400/60': fieldErrors.starts }"
            />
            <p v-if="fieldErrors.starts" class="mt-1 text-xs text-red-400">
              {{ fieldErrors.starts }}
            </p>
            <p v-else class="mt-1 text-[11px] text-fg-soft">Local time — stored in UTC.</p>
          </div>
          <div>
            <label class="settings-label">Ends</label>
            <input
              v-model="draftEnds"
              type="datetime-local"
              class="server-input mt-2 w-full"
              :class="{ 'ring-1 ring-red-400/60': fieldErrors.ends }"
            />
            <p v-if="fieldErrors.ends" class="mt-1 text-xs text-red-400">
              {{ fieldErrors.ends }}
            </p>
          </div>
        </div>

        <div class="max-w-xl">
          <EchoDropdown
            v-model="draftTimezoneValue"
            label="Display timezone (optional)"
            :options="timezoneDropdownOptions"
            surface="server"
            teleport-menu
            searchable
            :disabled="saving"
          />
        </div>

        <div class="max-w-xl">
          <EchoDropdown
            v-model="draftChannelId"
            label="Location channel (optional)"
            :options="channelDropdownOptions"
            surface="server"
            teleport-menu
            searchable
            :disabled="saving"
          />
        </div>

        <div class="max-w-xs">
          <label class="settings-label">Max attendees (optional)</label>
          <input
            v-model="draftMax"
            type="number"
            min="1"
            class="server-input mt-2 w-full"
            :class="{ 'ring-1 ring-red-400/60': fieldErrors.max }"
          />
          <p v-if="fieldErrors.max" class="mt-1 text-xs text-red-400">
            {{ fieldErrors.max }}
          </p>
        </div>

        <div class="flex flex-wrap gap-2 border-t border-border/80 pt-4">
          <button
            type="button"
            class="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            :disabled="saving || coverUploading"
            @click="submitSave"
          >
            {{ saving ? 'Saving…' : 'Save event' }}
          </button>
          <button
            type="button"
            class="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-fg-soft transition-colors hover:bg-glass-hover"
            :disabled="saving"
            @click="closeEditor"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="!loading && events.length"
      class="server-settings-panel rounded-2xl p-4 sm:p-5"
    >
      <div class="settings-subtitle mb-3">Scheduled &amp; past</div>
      <ul class="flex flex-col gap-3">
        <li
          v-for="ev in events"
          :key="ev.id"
          class="flex flex-col gap-3 rounded-2xl border border-border/90 bg-glass-1 p-3 sm:flex-row sm:items-stretch"
        >
          <div
            v-if="ev.imageUrl?.trim()"
            class="relative h-28 w-full shrink-0 overflow-hidden rounded-xl border border-border/80 bg-surface sm:h-auto sm:w-40"
          >
            <img
              :src="safeImageUrl(ev.imageUrl.trim())"
              alt=""
              class="h-full w-full object-cover"
            />
          </div>
          <div class="flex min-w-0 flex-1 flex-col justify-center gap-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="truncate text-[15px] font-semibold text-foreground">{{
                ev.title
              }}</span>
              <span
                v-if="ev.status === 'cancelled'"
                class="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-300"
              >
                Cancelled
              </span>
              <span
                v-else
                class="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300"
              >
                Scheduled
              </span>
            </div>
            <p class="text-xs text-fg-subtle">{{ formatRange(ev) }}</p>
            <p v-if="ev.timezoneLabel" class="text-[11px] text-fg-soft">
              {{ ev.timezoneLabel }}
            </p>
            <p class="text-xs text-fg-soft">
              <span class="font-semibold text-foreground">{{ ev.goingCount }}</span>
              going
              <template v-if="ev.maxAttendees != null">
                · cap {{ ev.maxAttendees }}</template
              >
            </p>
          </div>
          <div class="flex shrink-0 flex-row gap-2 sm:flex-col sm:justify-center">
            <button
              v-if="ev.status === 'scheduled'"
              type="button"
              class="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-glass-hover"
              :disabled="saving || !!cancellingId"
              @click="openEdit(ev)"
            >
              Edit
            </button>
            <button
              v-if="ev.status === 'scheduled'"
              type="button"
              class="rounded-xl border border-red-400/40 px-3 py-2 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/10"
              :disabled="!!cancellingId"
              @click="onCancelEvent(ev.id)"
            >
              {{ cancellingId === ev.id ? '…' : 'Cancel' }}
            </button>
          </div>
        </li>
      </ul>
    </div>

    <div
      v-else-if="!loading && !error"
      class="server-settings-panel rounded-2xl p-6 text-center"
    >
      <p class="text-sm text-fg-soft">
        No events yet. Create one to surface it in the channel sidebar carousel.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, toRef, watch } from 'vue';
import type { ChannelSummary } from '@shared/types';
import { useChannelIconResolver } from '@/composables/useChannelIconResolver';
import { useEchoWorkspace } from '@/composables/useEchoWorkspace';
import { useAuthSessionStore } from '@/stores/authSession';
import { uploadServerEventCoverFile } from '@/services/http/echoServerEventCovers';
import {
  cancelGuildEvent,
  createGuildEvent,
  fetchGuildEventsForManagement,
  updateGuildEvent,
  type EchoServerEventManagementRow,
} from '@/services/http/echoServerEventsHttp';
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
  parseDateTimeLocalToUtcIso,
  utcIsoToDateTimeLocalValue,
} from '@/features/server-settings/utils/serverEventFormDateTime';

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
      if (ch.type === 'text' || ch.type === 'voice') out.push(ch);
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
  }[] = [{ value: '', label: 'No voice channel' }];
  for (const ch of flatChannels.value) {
    if (ch.type !== 'voice') continue;
    const iconSrc = channelIconResolver.getIconUrl(ch);
    opts.push({
      value: ch.id,
      label: ch.name,
      iconSrc: iconSrc || undefined,
      iconMono: channelIconResolver.usesSvgInvert(ch.iconKey),
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
  }[] = [{ value: '', label: 'No text channel' }];
  for (const ch of flatChannels.value) {
    if (ch.type !== 'text') continue;
    const iconSrc = channelIconResolver.getIconUrl(ch);
    opts.push({
      value: ch.id,
      label: `#${ch.name}`,
      iconSrc: iconSrc || undefined,
      iconMono: channelIconResolver.usesSvgInvert(ch.iconKey),
    });
  }
  return opts;
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
  return ok;
}

async function submitSave() {
  if (!validateForm()) {
    dispatchAppToast('Fix the highlighted fields.', 'warning');
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
        dispatchAppToast('Event updated.', 'success');
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
        dispatchAppToast('Event created.', 'success');
      }
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
  cancellingId.value = id;
  try {
    await cancelGuildEvent('', props.serverId, id);
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
      timeZoneName: 'short',
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
  <div class="server-settings-panel-root space-y-4 pb-8">
    <div class="server-settings-panel rounded-2xl p-4 sm:p-5">
      <div
        class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
      >
        <div class="min-w-0 flex-1">
          <div class="settings-subtitle">Community events</div>
          <p class="mt-1.5 text-sm leading-snug text-fg-subtle">
            Schedule covers, times, and where it happens: a voice or text
            channel on this server, or a custom venue (address, external link,
            invite, or Echo path). Members see upcoming events in the channel
            sidebar; RSVPs also surface in DMs. Times use each viewer’s local
            timezone.
          </p>
        </div>
        <button
          type="button"
          class="h-fit shrink-0 self-start rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50 sm:self-center"
          :disabled="saving || !serverId.trim()"
          @click="openCreate"
        >
          New event
        </button>
      </div>
    </div>

    <p v-if="error" class="text-sm text-red-400">{{ error }}</p>
    <p v-if="loading" class="text-sm text-fg-soft">Loading events…</p>

    <div v-if="showEditor" class="server-settings-panel rounded-2xl p-4 sm:p-5">
      <div class="mb-3 flex items-center justify-between gap-2">
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

      <div class="space-y-4 lg:grid lg:grid-cols-12 lg:gap-5 lg:space-y-0">
        <div class="lg:col-span-5">
          <label class="settings-label">Cover image</label>
          <p class="mt-1 text-xs text-fg-soft">
            16:9 works best. Upload only — stored like server branding.
          </p>
          <div
            class="relative mt-3 overflow-hidden rounded-2xl border border-border bg-glass-2"
            :class="
              draftImageUrl.trim()
                ? 'aspect-[16/9] max-h-48'
                : 'aspect-[16/9] max-h-36'
            "
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
        </div>

        <div class="space-y-4 lg:col-span-7">
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

          <div class="grid gap-4 sm:grid-cols-2">
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
              <p v-else class="mt-1 text-[11px] text-fg-soft">
                In your device timezone; everyone sees this event in their own
                local time.
              </p>
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

          <div>
            <label class="settings-label">Location</label>
            <p class="mt-1 text-xs text-fg-soft">
              Pick a voice or text channel on this server, or describe anywhere
              else (address, link, invite, or an Echo path like
              <code class="rounded bg-glass-2 px-1">/channels/…</code>).
            </p>
            <div
              class="mt-2 inline-flex rounded-xl border border-border bg-glass-1 p-0.5 text-xs font-semibold"
              role="tablist"
              aria-label="Event location type"
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
                Voice
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
                Text
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
                Custom
              </button>
            </div>
            <div class="mt-3">
              <EchoDropdown
                v-if="locationTab === 'voice'"
                v-model="draftChannelId"
                label="Voice channel"
                :options="voiceLocationOptions"
                surface="server"
                teleport-menu
                searchable
                :disabled="saving"
              />
              <EchoDropdown
                v-else-if="locationTab === 'text'"
                v-model="draftChannelId"
                label="Text channel"
                :options="textLocationOptions"
                surface="server"
                teleport-menu
                searchable
                :disabled="saving"
              />
              <div v-else>
                <textarea
                  v-model="draftCustomLocation"
                  rows="3"
                  maxlength="2000"
                  class="server-input mt-2 min-h-[88px] w-full resize-y"
                  placeholder="Physical address, another site, Discord/Echo invite, or paste an Echo path (/channels/…)"
                  :disabled="saving"
                />
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="showDiscordMirrorUi"
          class="rounded-xl border border-border/90 bg-glass-1 p-3 lg:col-span-12"
        >
          <p
            v-if="editingHadDiscordMirror"
            class="text-sm leading-snug text-fg-subtle"
          >
            This event is listed on Discord; saving updates that listing. The
            Discord description keeps a clear link back to this Echo server for
            RSVPs and full details.
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
                Also create a Discord scheduled event
              </span>
              <span class="mt-0.5 block text-xs leading-snug text-fg-soft">
                Same title and schedule on Discord. The description points
                members to this Echo server as the canonical place for RSVPs and
                details.
              </span>
            </span>
          </label>
        </div>

        <div
          class="flex flex-wrap gap-2 border-t border-border/80 pt-3 lg:col-span-12"
        >
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
              <span
                class="truncate text-[15px] font-semibold text-foreground"
                >{{ ev.title }}</span
              >
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
              <span
                v-if="ev.discordScheduledEventId?.trim()"
                class="shrink-0 rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-200"
              >
                Discord
              </span>
            </div>
            <p class="text-xs text-fg-subtle">{{ formatRange(ev) }}</p>
            <p
              v-if="formatLocationSummary(ev)"
              class="line-clamp-2 text-xs text-fg-soft"
            >
              {{ formatLocationSummary(ev) }}
            </p>
            <p class="text-xs text-fg-soft">
              <span class="font-semibold text-foreground">{{
                ev.goingCount
              }}</span>
              going
            </p>
          </div>
          <div
            class="flex shrink-0 flex-row gap-2 sm:flex-col sm:justify-center"
          >
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

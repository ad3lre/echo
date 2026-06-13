<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useAuthSessionStore } from '@/stores/authSession';
import {
  uploadVcWatchTogetherVideo,
  releaseVcWatchTogetherSessionBytes,
} from '@/api/echo/uploads';
import { EchoApiError } from '@/api/echo/transport';
import {
  ECHO_WATCH_TOGETHER_MAX_SESSION_BYTES,
  ECHO_WATCH_TOGETHER_MAX_VIDEO_BYTES,
} from '@shared/echoPlanLimits';
import type {
  VcActivityUiState,
  WatchTogetherPlaylistEntry,
  WatchTogetherTranscodeStatus,
} from '@/features/voice/vcActivityTypes';
import { useVcWatchTogetherHlsPlayback } from '@/features/voice/composables/useVcWatchTogetherHlsPlayback';
import { randomUuidV4 } from '@/utils/randomUuid';

const props = defineProps<{
  state: VcActivityUiState;
  channelId: string;
  currentUserId: string | null;
  effectiveKingUserId: string;
  liveKitConnected?: boolean;
  setWatchTogetherLobbyRole: (
    role: VcActivityUiState['watchTogetherLobbyRole'],
  ) => void;
  ensureWatchTogetherSessionId: () => string;
  patchWatchTogetherUi: (patch: Partial<VcActivityUiState>) => void;
  startWatchTogetherSession: () => void;
  openActivityPicker: () => void;
}>();

const auth = useAuthSessionStore();

const isEchoPlus = computed(() => {
  const plan = auth.backendUser?.echoPlan ?? auth.planLimits?.plan ?? 'free';
  return plan !== 'free';
});

const isHostRole = computed(
  () => props.state.watchTogetherLobbyRole === 'host',
);
const isChoosing = computed(
  () => props.state.watchTogetherLobbyRole === 'choosing',
);

const followingRemoteHost = computed(() => {
  const king = props.effectiveKingUserId.trim();
  const self = props.currentUserId?.trim() ?? '';
  return !!king && !!self && king !== self;
});

const canHostUploads = computed(
  () =>
    isEchoPlus.value &&
    isHostRole.value &&
    !followingRemoteHost.value &&
    props.liveKitConnected !== false,
);

const channelReady = computed(() => props.channelId.trim().length > 0);

const uploadBusy = ref(false);
const uploadError = ref('');
const uploadProgress = ref<number | null>(null);
const uploadFileName = ref('');
const retryError = ref('');
const retryBusy = ref(false);

const pollSourceUrl = ref('');
const pollEntryId = ref<string | null>(null);
const tokenRef = computed(() => auth.accessToken);
const hlsPoll = useVcWatchTogetherHlsPlayback(pollSourceUrl, {
  token: tokenRef,
});

const sessionBytesLabel = computed(() => {
  const used = props.state.watchTogetherSessionBytesUsed;
  const maxGb = ECHO_WATCH_TOGETHER_MAX_SESSION_BYTES / (1024 * 1024 * 1024);
  const usedGb = (used / (1024 * 1024 * 1024)).toFixed(2);
  return `${usedGb} / ${maxGb} GiB session`;
});

const readyCount = computed(
  () =>
    props.state.watchTogetherPlaylist.filter(
      (r) => r.transcodeStatus === 'ready' && r.hlsManifestUrl,
    ).length,
);

const pendingCount = computed(
  () =>
    props.state.watchTogetherPlaylist.filter(
      (r) => r.transcodeStatus !== 'ready' && r.transcodeStatus !== 'failed',
    ).length,
);

const failedCount = computed(
  () =>
    props.state.watchTogetherPlaylist.filter(
      (r) => r.transcodeStatus === 'failed',
    ).length,
);

const hasSyncedPlaylist = computed(
  () => props.state.watchTogetherPlaylist.length > 0,
);

function transcodeLabel(status: WatchTogetherTranscodeStatus): string {
  switch (status) {
    case 'uploading':
      return 'Uploading…';
    case 'pending':
      return 'Queued for transcode';
    case 'processing':
      return 'Processing…';
    case 'ready':
      return 'Ready';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

function chooseHost() {
  if (followingRemoteHost.value) {
    props.setWatchTogetherLobbyRole('follower');
    return;
  }
  props.ensureWatchTogetherSessionId();
  props.setWatchTogetherLobbyRole('host');
}

function chooseFollower() {
  props.setWatchTogetherLobbyRole('follower');
}

function updatePlaylistEntry(
  id: string,
  patch: Partial<WatchTogetherPlaylistEntry>,
) {
  const playlist = props.state.watchTogetherPlaylist.map((row) =>
    row.id === id ? { ...row, ...patch } : row,
  );
  props.patchWatchTogetherUi({
    watchTogetherPlaylist: playlist,
    watchTogetherSessionBytesUsed: playlist.reduce(
      (n, row) => n + (row.byteLength || 0),
      0,
    ),
  });
}

function syncPollTarget() {
  const next = props.state.watchTogetherPlaylist.find(
    (r) =>
      r.transcodeStatus !== 'ready' &&
      r.transcodeStatus !== 'failed' &&
      r.sourcePublicUrl.trim(),
  );
  pollEntryId.value = next?.id ?? null;
  pollSourceUrl.value = next?.sourcePublicUrl?.trim() ?? '';
}

watch(
  () => props.state.watchTogetherPlaylist,
  () => syncPollTarget(),
  { deep: true, immediate: true },
);

watch(
  () => hlsPoll.state.value,
  (s) => {
    const id = pollEntryId.value;
    if (!id) return;
    const row = props.state.watchTogetherPlaylist.find((r) => r.id === id);
    if (!row) return;
    const status: WatchTogetherTranscodeStatus =
      s.status === 'ready'
        ? 'ready'
        : s.status === 'failed'
          ? 'failed'
          : s.status === 'processing'
            ? 'processing'
            : row.transcodeStatus === 'uploading'
              ? 'uploading'
              : 'pending';
    if (
      row.transcodeStatus !== status ||
      row.hlsManifestUrl !== s.hlsManifestUrl ||
      (row.transcodeError ?? null) !== s.lastError
    ) {
      updatePlaylistEntry(id, {
        transcodeStatus: status,
        hlsManifestUrl: s.hlsManifestUrl,
        transcodeError: s.lastError,
      });
    }
    if (status !== 'ready' && status !== 'failed') syncPollTarget();
  },
  { deep: true },
);

function uploadErrorMessage(e: unknown): string {
  if (e instanceof EchoApiError && e.body.code === 'ECHO_PLUS_REQUIRED') {
    return 'Echo+ is required to host Watch Together uploads.';
  }
  if (e instanceof EchoApiError && e.body.code === 'UPLOAD_SESSION_QUOTA') {
    return (
      e.body.message?.trim() ||
      'Session upload quota exceeded (20 GiB). Remove a video or start with a smaller queue.'
    );
  }
  if (e instanceof EchoApiError && e.body.code === 'UPLOAD_TOO_LARGE') {
    return `File exceeds the ${ECHO_WATCH_TOGETHER_MAX_VIDEO_BYTES / (1024 * 1024 * 1024)} GiB per-video limit.`;
  }
  if (e instanceof EchoApiError && e.body.code === 'UPLOADS_NOT_CONFIGURED') {
    return 'Uploads are not configured on this server. Ask an admin to enable local uploads.';
  }
  if (e instanceof EchoApiError && e.status === 403) {
    return (
      e.body.message?.trim() || "You don't have permission to upload here."
    );
  }
  return e instanceof Error ? e.message : "Couldn't upload that file.";
}

async function onFileInput(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  uploadError.value = '';
  if (!file) return;
  if (!canHostUploads.value) {
    uploadError.value = followingRemoteHost.value
      ? 'Someone else is already hosting this channel. Switch to viewer to follow them.'
      : 'Uploads are unavailable right now.';
    return;
  }
  if (!channelReady.value) {
    uploadError.value = 'Join a voice channel before uploading.';
    return;
  }
  if (file.size > ECHO_WATCH_TOGETHER_MAX_VIDEO_BYTES) {
    uploadError.value = `File exceeds ${ECHO_WATCH_TOGETHER_MAX_VIDEO_BYTES / (1024 * 1024 * 1024)} GiB limit.`;
    return;
  }
  const token = auth.accessToken?.trim() ?? '';
  if (!auth.isAuthenticated) {
    uploadError.value = 'Sign in again to upload videos.';
    return;
  }
  const sessionId = props.ensureWatchTogetherSessionId();
  uploadBusy.value = true;
  uploadFileName.value = file.name;
  uploadProgress.value = 0;
  try {
    const uploaded = await uploadVcWatchTogetherVideo(
      token,
      props.channelId,
      sessionId,
      file,
      {
        onProgress: (p) => {
          uploadProgress.value = p.uploadPercent;
        },
      },
    );
    const entry: WatchTogetherPlaylistEntry = {
      id: randomUuidV4(),
      storageKey: uploaded.storageKey,
      sourcePublicUrl: uploaded.url,
      hlsManifestUrl: null,
      title: file.name.trim() || 'Video',
      transcodeStatus: 'pending',
      transcodeError: null,
      byteLength: uploaded.byteLength,
    };
    const playlist = [...props.state.watchTogetherPlaylist, entry];
    props.patchWatchTogetherUi({
      watchTogetherPlaylist: playlist,
      watchTogetherSessionBytesUsed: playlist.reduce(
        (n, row) => n + (row.byteLength || 0),
        0,
      ),
    });
  } catch (e) {
    uploadError.value = uploadErrorMessage(e);
  } finally {
    uploadBusy.value = false;
    uploadProgress.value = null;
    uploadFileName.value = '';
  }
}

async function retryRow(row: WatchTogetherPlaylistEntry) {
  retryError.value = '';
  retryBusy.value = true;
  pollSourceUrl.value = row.sourcePublicUrl;
  pollEntryId.value = row.id;
  try {
    await hlsPoll.retryTranscode();
  } catch (e) {
    retryError.value =
      e instanceof Error ? e.message : "Couldn't retry transcode.";
  } finally {
    retryBusy.value = false;
  }
}

function removeRow(index: number) {
  const row = props.state.watchTogetherPlaylist[index];
  if (!row) return;
  const playlist = props.state.watchTogetherPlaylist.filter(
    (_, i) => i !== index,
  );
  props.patchWatchTogetherUi({
    watchTogetherPlaylist: playlist,
    watchTogetherSessionBytesUsed: playlist.reduce(
      (n, r) => n + (r.byteLength || 0),
      0,
    ),
  });
  const sessionId = props.state.watchTogetherSessionId?.trim();
  const token = auth.accessToken?.trim() ?? '';
  if (
    sessionId &&
    auth.isAuthenticated &&
    row.byteLength > 0 &&
    canHostUploads.value
  ) {
    void releaseVcWatchTogetherSessionBytes(
      token,
      sessionId,
      row.byteLength,
    ).catch(() => undefined);
  }
}
</script>

<template>
  <div
    class="vc-wt-lobby custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-8"
  >
    <div class="mx-auto w-full max-w-2xl">
      <h2 class="text-lg font-bold tracking-tight text-fg">Watch Together</h2>
      <p class="mt-1 text-[13px] leading-snug text-fg-subtle">
        Upload videos to a shared queue and play them in sync over voice. Host
        drives playback until they leave; everyone else follows automatically.
      </p>

      <div
        v-if="liveKitConnected === false"
        class="mt-4 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-[12px] text-fg-subtle"
      >
        Connect to voice so your session syncs with everyone in the channel.
      </div>

      <div v-if="isChoosing" class="mt-6 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          class="rounded-xl border border-border bg-elevated px-4 py-5 text-left transition hover:border-[color-mix(in_srgb,#6d9fff_45%,var(--border))] hover:bg-glass-hover"
          :disabled="followingRemoteHost"
          @click="chooseHost"
        >
          <div class="text-sm font-semibold text-fg">Host a session</div>
          <p class="mt-1 text-[12px] text-fg-subtle">
            Upload videos and control playback for the channel.
          </p>
          <p v-if="followingRemoteHost" class="mt-2 text-[11px] text-amber-200">
            Someone is already hosting — join as a viewer instead.
          </p>
        </button>
        <button
          type="button"
          class="rounded-xl border border-border bg-elevated px-4 py-5 text-left transition hover:border-[color-mix(in_srgb,#6d9fff_45%,var(--border))] hover:bg-glass-hover"
          @click="chooseFollower"
        >
          <div class="text-sm font-semibold text-fg">Join &amp; wait</div>
          <p class="mt-1 text-[12px] text-fg-subtle">
            Follow someone else&apos;s session when they start.
          </p>
        </button>
      </div>

      <div
        v-else-if="!isEchoPlus && isHostRole"
        class="mt-6 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-4"
      >
        <p class="text-sm font-semibold text-amber-200">Echo+ required</p>
        <p class="mt-1 text-[12px] text-fg-subtle">
          Hosting Watch Together uploads requires Echo+. You can still join as a
          viewer when someone else hosts.
        </p>
        <button
          type="button"
          class="mt-3 rounded-lg bg-elevated px-3 py-1.5 text-[12px] font-semibold text-fg transition hover:bg-glass-hover"
          @click="chooseFollower"
        >
          Switch to viewer
        </button>
      </div>

      <div v-else-if="isHostRole" class="mt-6 space-y-4">
        <div
          v-if="followingRemoteHost"
          class="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3"
        >
          <p class="text-[12px] font-semibold text-amber-200">
            Another host is running Watch Together
          </p>
          <p class="mt-1 text-[11px] text-fg-subtle">
            You can follow their queue as a viewer, or wait until they leave to
            host your own session.
          </p>
          <button
            type="button"
            class="mt-2 rounded-lg bg-elevated px-3 py-1.5 text-[11px] font-semibold text-fg transition hover:bg-glass-hover"
            @click="chooseFollower"
          >
            Switch to viewer
          </button>
        </div>

        <div
          class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-fg-subtle"
        >
          <span>{{ sessionBytesLabel }}</span>
        </div>

        <label
          v-if="canHostUploads"
          class="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-elevated/60 px-4 py-8 transition hover:border-[color-mix(in_srgb,#6d9fff_40%,var(--border))] hover:bg-elevated"
          :class="{ 'pointer-events-none opacity-60': uploadBusy }"
        >
          <span class="text-sm font-semibold text-fg">Add video</span>
          <span class="mt-1 text-[11px] text-fg-subtle">
            MP4, WebM, MKV, and more · up to
            {{ ECHO_WATCH_TOGETHER_MAX_VIDEO_BYTES / (1024 * 1024 * 1024) }}
            GiB per file
          </span>
          <input
            type="file"
            accept="video/*,.mkv"
            class="sr-only"
            :disabled="uploadBusy"
            @change="onFileInput"
          />
        </label>

        <p
          v-if="uploadBusy && uploadFileName"
          class="text-[12px] text-fg-subtle"
        >
          Uploading {{ uploadFileName }}
          <span v-if="uploadProgress != null">· {{ uploadProgress }}%</span>
        </p>
        <p v-if="uploadError" class="text-[12px] text-red-400">
          {{ uploadError }}
        </p>
        <p v-if="retryError" class="text-[12px] text-red-400">
          {{ retryError }}
        </p>

        <ul v-if="state.watchTogetherPlaylist.length" class="space-y-2">
          <li
            v-for="(row, index) in state.watchTogetherPlaylist"
            :key="row.id"
            class="flex items-center gap-3 rounded-lg border border-border/70 bg-elevated/80 px-3 py-2"
          >
            <div class="min-w-0 flex-1">
              <div class="truncate text-[13px] font-medium text-fg">
                {{ row.title }}
              </div>
              <div
                class="text-[11px]"
                :class="
                  row.transcodeStatus === 'failed'
                    ? 'text-red-400'
                    : row.transcodeStatus === 'ready'
                      ? 'text-emerald-400/90'
                      : 'text-fg-subtle'
                "
              >
                {{ transcodeLabel(row.transcodeStatus) }}
                <span v-if="row.transcodeError"
                  >· {{ row.transcodeError }}</span
                >
              </div>
            </div>
            <button
              v-if="row.transcodeStatus === 'failed' && canHostUploads"
              type="button"
              class="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-fg-soft hover:bg-glass-hover hover:text-fg disabled:opacity-50"
              :disabled="retryBusy"
              @click="retryRow(row)"
            >
              Retry
            </button>
            <button
              v-if="canHostUploads"
              type="button"
              class="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-fg-soft hover:bg-glass-hover hover:text-fg"
              aria-label="Remove from queue"
              @click="removeRow(index)"
            >
              Remove
            </button>
          </li>
        </ul>

        <p
          v-else-if="canHostUploads"
          class="text-center text-[12px] text-fg-subtle"
        >
          Add at least one video to start. Each file is transcoded to HLS before
          playback.
        </p>

        <p
          v-if="
            canHostUploads &&
            state.watchTogetherPlaylist.length > 0 &&
            readyCount === 0
          "
          class="rounded-lg border border-border/70 bg-elevated/50 px-3 py-2 text-[11px] text-fg-subtle"
        >
          <span v-if="pendingCount > 0">
            Waiting for {{ pendingCount }} video{{
              pendingCount === 1 ? '' : 's'
            }}
            to finish transcoding before you can start.
          </span>
          <span v-else-if="failedCount > 0">
            All videos failed transcoding. Retry or remove failed items to
            continue.
          </span>
        </p>

        <button
          v-if="canHostUploads && readyCount > 0"
          type="button"
          class="w-full rounded-xl bg-[color-mix(in_srgb,#6d9fff_88%,#1a2744)] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110"
          @click="startWatchTogetherSession"
        >
          Start session
          <span class="font-normal opacity-80">
            ({{ readyCount }} ready<span v-if="pendingCount > 0">
              · {{ pendingCount }} still processing</span
            >)
          </span>
        </button>
      </div>

      <div v-else class="mt-8 space-y-4">
        <div
          class="rounded-xl border border-border bg-elevated/70 px-4 py-8 text-center"
        >
          <p class="text-sm font-semibold text-fg">
            {{
              hasSyncedPlaylist
                ? 'Waiting for the host to start'
                : 'Waiting for host'
            }}
          </p>
          <p class="mt-2 text-[12px] text-fg-subtle">
            {{
              hasSyncedPlaylist
                ? 'The queue below will play automatically once the host starts the session.'
                : "When someone starts a Watch Together session, you'll follow their queue automatically."
            }}
          </p>
        </div>

        <ul v-if="hasSyncedPlaylist" class="space-y-2">
          <li
            v-for="row in state.watchTogetherPlaylist"
            :key="row.id"
            class="flex items-center gap-3 rounded-lg border border-border/70 bg-elevated/80 px-3 py-2"
          >
            <div class="min-w-0 flex-1">
              <div class="truncate text-[13px] font-medium text-fg">
                {{ row.title }}
              </div>
              <div
                class="text-[11px]"
                :class="
                  row.transcodeStatus === 'failed'
                    ? 'text-red-400'
                    : row.transcodeStatus === 'ready'
                      ? 'text-emerald-400/90'
                      : 'text-fg-subtle'
                "
              >
                {{ transcodeLabel(row.transcodeStatus) }}
              </div>
            </div>
          </li>
        </ul>
      </div>

      <button
        type="button"
        class="mt-6 text-[12px] font-semibold text-fg-soft transition hover:text-fg"
        @click="openActivityPicker"
      >
        Back to activities
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.vc-wt-lobby {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--bg) 92%, #1a2744) 0%,
    var(--bg) 100%
  );
}
</style>

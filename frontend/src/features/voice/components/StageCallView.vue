<script setup lang="ts">
import {
  computed,
  inject,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type Ref,
} from 'vue';
import { icons } from '@/assets/icons';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import StreamVideoTile from '@/features/voice/components/StreamVideoTile.vue';
import type { StreamVideoTileTrack } from '@/features/voice/composables/streamVideoTileTrack';
import type { VcModerateAction } from '@/features/voice/components/CallView.vue';
import type { RemoteParticipantTrackInfo } from '@/composables/useLiveKitVoiceRoom';
import { useAuthSessionStore } from '@/stores/authSession';
import { useStageSpeakRequests } from '@/features/voice/composables/useStageSpeakRequests';
import VoiceChannelUserLimitBadge from '@/features/voice/components/VoiceChannelUserLimitBadge.vue';
import { getVoiceChannelUserLimitUi } from '@/features/voice/domain/voiceChannelUserLimit';
import {
  COMPOSER_INSERT_USER_MENTION_KEY,
  type InsertUserMentionFn,
} from '@/features/chat/chatComposerContext';
import { clampMenuToViewport } from '@/features/chat/composables/useContextMenuPosition';
import { resolveCallTileAvatarUrl } from '@/utils/avatarDisplay';
import { voiceMuteDeafenHoverTitle } from '@/features/voice/voiceIndicatorHints';
import {
  getPopoutAnchorRect,
  type PopoutAnchorRect,
} from '@/utils/memberProfiles';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import { isEchoGraphId } from '@/utils/echoIds';
import {
  cancelEchoStageSpeakRequest,
  requestEchoStageSpeak,
} from '@/services/voice/requestStageSpeak';
import { YOUTUBE_INTEGRATION_ENABLED } from '@shared/integrationKillSwitches';
import StageYoutubeLiveBar from '@/features/voice/components/StageYoutubeLiveBar.vue';
import StageActiveEventBanner from '@/features/voice/components/StageActiveEventBanner.vue';
import type { EchoWorkspaceEventSummary } from '@/api/echoClient';

type StageParticipant = {
  id: string;
  name: string;
  pfp: string;
  muted?: boolean;
  deafened?: boolean;
  video?: boolean;
  streaming?: boolean;
  serverMuted?: boolean;
  serverDeafened?: boolean;
  speaking?: boolean;
  audioLevel?: number;
  screenTrack?: unknown;
  cameraTrack?: unknown;
};

const props = withDefaults(
  defineProps<{
    channelName: string;
    stageChannelId: string;
    echoServerId: string;
    participants: StageParticipant[];
    stageSpeakerByUserId: Record<string, boolean>;
    currentUserId?: string;
    onOpenProfile?: (
      userId: string,
      anchorRect: PopoutAnchorRect | null,
    ) => void;
    canModerateParticipant?: (userId: string) => boolean;
    canVcModerateParticipantAction?: (
      userId: string,
      action: VcModerateAction | 'inviteToSpeak' | 'moveToAudience',
    ) => boolean;
    onVcModerate?: (payload: {
      action: VcModerateAction | 'inviteToSpeak' | 'moveToAudience';
      targetUserId: string;
      contextVoiceChannelId?: string;
    }) => void;
    remoteParticipants?: Map<string, unknown>;
    lkRoom?: unknown;
    mirrorLocalCamera?: boolean;
    getLocalScreenTrack?: () => unknown;
    getLocalCameraTrack?: () => unknown;
    onGoToVoiceChannelInSidebar?: () => void;
    voiceChannelUserLimit?: number;
    compactLayout?: boolean;
    activeStageEvent?: EchoWorkspaceEventSummary | null;
    stageEventNowMs?: number;
    canManageStageYoutube?: boolean;
    promptYoutubeLiveForEvent?: boolean;
    stageEventStartedFromLobby?: boolean;
  }>(),
  {
    compactLayout: false,
    stageSpeakerByUserId: () => ({}),
    canManageStageYoutube: false,
    promptYoutubeLiveForEvent: false,
    stageEventStartedFromLobby: false,
  },
);

const emit = defineEmits<{
  dismissStageEvent: [];
  dismissYoutubeLivePrompt: [];
}>();

const showYoutubeLivePrompt = ref(props.promptYoutubeLiveForEvent);

watch(
  () => props.promptYoutubeLiveForEvent,
  (next) => {
    if (next) showYoutubeLivePrompt.value = true;
  },
);

const authSession = useAuthSessionStore();

const composerInsertUserMention =
  inject<Ref<InsertUserMentionFn | null> | null>(
    COMPOSER_INSERT_USER_MENTION_KEY,
    null,
  );

function isSpeaker(userId: string): boolean {
  return !!props.stageSpeakerByUserId[userId];
}

const speakerParticipants = computed(() =>
  props.participants.filter((p) => isSpeaker(p.id)),
);

const audienceParticipants = computed(() =>
  props.participants.filter((p) => !isSpeaker(p.id)),
);

const selfIsSpeaker = computed(
  () => !!props.currentUserId && isSpeaker(props.currentUserId),
);

const canModerateStage = computed(() => {
  const cur = props.currentUserId;
  if (!cur) return false;
  if (props.canVcModerateParticipantAction) {
    return props.canVcModerateParticipantAction(cur, 'inviteToSpeak');
  }
  return props.canModerateParticipant?.(cur) ?? false;
});

const speakRequestsEnabled = computed(
  () =>
    canModerateStage.value &&
    !!props.echoServerId?.trim() &&
    !!props.stageChannelId?.trim() &&
    authSession.isAuthenticated,
);

const {
  pendingUserIds,
  busy: speakRequestsBusy,
  resolve: resolveSpeakRequest,
} = useStageSpeakRequests({
  enabled: speakRequestsEnabled,
  isAuthenticated: computed(() => authSession.isAuthenticated),
  serverId: computed(() => props.echoServerId),
  channelId: computed(() => props.stageChannelId),
});

const selfRequestedSpeakLocal = ref(false);

watch(selfIsSpeaker, (isSpk) => {
  if (isSpk) selfRequestedSpeakLocal.value = false;
});

const selfPendingSpeak = computed(
  () =>
    !!props.currentUserId &&
    (selfRequestedSpeakLocal.value ||
      pendingUserIds.value.includes(props.currentUserId)),
);

const pendingRequestParticipants = computed(() => {
  const byId = new Map(props.participants.map((p) => [p.id, p]));
  return pendingUserIds.value
    .map((id) => byId.get(id))
    .filter((p): p is StageParticipant => !!p);
});

const voiceChannelLimitUi = computed(() =>
  getVoiceChannelUserLimitUi(
    props.participants.length,
    props.voiceChannelUserLimit,
  ),
);

function tileAvatar(p: { id: string; pfp: string }) {
  return resolveCallTileAvatarUrl(p.pfp, p.id);
}

function handleOpenProfile(userId: string, event: MouseEvent) {
  const target = event.currentTarget;
  if (!target || !props.onOpenProfile) return;
  props.onOpenProfile(userId, getPopoutAnchorRect(target, 'generic'));
}

function remoteTrackInfoForParticipant(
  participantId: string,
): RemoteParticipantTrackInfo | null {
  const m = props.remoteParticipants as
    | Map<string, RemoteParticipantTrackInfo>
    | undefined
    | null;
  return m?.get(participantId) ?? null;
}

function resolveParticipantScreenShareTrack(
  p: StageParticipant,
): unknown | null {
  if (p.screenTrack) return p.screenTrack;
  if (p.id === props.currentUserId) {
    return props.getLocalScreenTrack?.() ?? null;
  }
  return remoteTrackInfoForParticipant(p.id)?.screenTrack ?? null;
}

function resolveParticipantCameraTrack(p: StageParticipant): unknown | null {
  if (p.cameraTrack) return p.cameraTrack;
  if (p.id === props.currentUserId) {
    return props.getLocalCameraTrack?.() ?? null;
  }
  return remoteTrackInfoForParticipant(p.id)?.cameraTrack ?? null;
}

type SpeakerMediaTile = {
  tileId: string;
  mediaKind: 'screen' | 'camera';
  id: string;
  name: string;
  pfp: string;
  isLocal: boolean;
  track: StreamVideoTileTrack | null;
};

const speakerMediaTiles = computed<SpeakerMediaTile[]>(() => {
  const tiles: SpeakerMediaTile[] = [];
  for (const p of speakerParticipants.value) {
    if (p.streaming) {
      tiles.push({
        tileId: `screen-${p.id}`,
        mediaKind: 'screen',
        id: p.id,
        name: p.name,
        pfp: p.pfp,
        isLocal: p.id === props.currentUserId,
        track: resolveParticipantScreenShareTrack(
          p,
        ) as StreamVideoTileTrack | null,
      });
    }
    if (p.video) {
      tiles.push({
        tileId: `camera-${p.id}`,
        mediaKind: 'camera',
        id: p.id,
        name: p.name,
        pfp: p.pfp,
        isLocal: p.id === props.currentUserId,
        track: resolveParticipantCameraTrack(p) as StreamVideoTileTrack | null,
      });
    }
  }
  return tiles;
});

const hasSpeakerMedia = computed(() => speakerMediaTiles.value.length > 0);
const focusedStreamParticipantId = ref<string | null>(null);

const stagePrimaryTile = computed(() => {
  const focusId = focusedStreamParticipantId.value;
  const tiles = speakerMediaTiles.value;
  if (!focusId) return tiles[0] ?? null;
  return tiles.find((t) => t.id === focusId) ?? tiles[0] ?? null;
});

const stageSideTiles = computed(() => {
  const primary = stagePrimaryTile.value;
  if (!primary) return [];
  return speakerMediaTiles.value.filter((t) => t.tileId !== primary.tileId);
});

const speakerGridClass = computed(() => {
  const n = speakerParticipants.value.length;
  if (n <= 1) return 'stage-speaker-grid--solo';
  if (n === 2) return 'stage-speaker-grid--duo';
  if (n <= 4) return 'stage-speaker-grid--quad';
  return 'stage-speaker-grid--many';
});

const requestSpeakBusy = ref(false);

async function requestToSpeak() {
  const sid = props.echoServerId?.trim();
  const cid = props.stageChannelId?.trim();
  if (!sid || !cid || !authSession.isAuthenticated || !isEchoGraphId(sid))
    return;
  requestSpeakBusy.value = true;
  try {
    await requestEchoStageSpeak('', sid, cid);
    selfRequestedSpeakLocal.value = true;
    dispatchAppToast(
      'Request to speak sent. A moderator can invite you to the stage.',
      'success',
    );
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Something didn't work. Try again.";
    dispatchAppToast(`Could not request to speak: ${msg}`, 'warning');
  } finally {
    requestSpeakBusy.value = false;
  }
}

async function cancelSpeakRequest() {
  const sid = props.echoServerId?.trim();
  const cid = props.stageChannelId?.trim();
  if (!sid || !cid || !authSession.isAuthenticated) return;
  requestSpeakBusy.value = true;
  try {
    await cancelEchoStageSpeakRequest('', sid, cid);
    selfRequestedSpeakLocal.value = false;
    dispatchAppToast('Speak request cancelled.', 'success');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not cancel';
    dispatchAppToast(msg, 'warning');
  } finally {
    requestSpeakBusy.value = false;
  }
}

function vcModAllowed(
  userId: string,
  action: VcModerateAction | 'inviteToSpeak' | 'moveToAudience',
): boolean {
  if (props.canVcModerateParticipantAction) {
    return props.canVcModerateParticipantAction(userId, action);
  }
  return props.canModerateParticipant?.(userId) ?? false;
}

function emitVcModerate(
  action: VcModerateAction | 'inviteToSpeak' | 'moveToAudience',
  targetUserId: string,
) {
  props.onVcModerate?.({
    action,
    targetUserId,
    contextVoiceChannelId: props.stageChannelId,
  });
  closeVcMenu();
}

const vcMenuOpenForId = ref<string | null>(null);
const vcMenuPos = ref({ left: 0, top: 0 });
const vcMenuRef = ref<HTMLElement | null>(null);

const vcModerationTarget = computed(
  () => props.participants.find((x) => x.id === vcMenuOpenForId.value) ?? null,
);

function onTileContextMenu(p: StageParticipant, e: MouseEvent) {
  e.preventDefault();
  if (p.id === props.currentUserId) return;
  const canMod =
    vcModAllowed(p.id, 'inviteToSpeak') ||
    vcModAllowed(p.id, 'moveToAudience') ||
    vcModAllowed(p.id, 'serverMute') ||
    vcModAllowed(p.id, 'disconnect') ||
    (p.video && vcModAllowed(p.id, 'stopCamera')) ||
    (p.streaming && vcModAllowed(p.id, 'stopScreenShare'));
  const canMention = !!composerInsertUserMention?.value;
  if (!canMod && !canMention) return;
  const estW = 240;
  const estH = 320;
  vcMenuPos.value = clampMenuToViewport(e.clientX, e.clientY, estW, estH);
  vcMenuOpenForId.value = p.id;
  void nextTick(() => {
    requestAnimationFrame(() => {
      const el = vcMenuRef.value;
      if (!el) return;
      const r = el.getBoundingClientRect();
      vcMenuPos.value = clampMenuToViewport(r.left, r.top, r.width, r.height);
    });
  });
}

function closeVcMenu() {
  vcMenuOpenForId.value = null;
}

function mentionFromMenu() {
  const p = vcModerationTarget.value;
  const fn = composerInsertUserMention?.value;
  if (!p || !fn) return;
  closeVcMenu();
  fn({ userId: p.id, displayName: p.name });
}

function onDocumentPointerDown(e: MouseEvent) {
  const menuEl = vcMenuRef.value;
  if (menuEl) {
    const path = e.composedPath();
    if (path.includes(menuEl)) return;
    for (const n of path) {
      if (n instanceof Node && menuEl.contains(n)) return;
    }
  }
  closeVcMenu();
}

onMounted(() => {
  document.addEventListener('mousedown', onDocumentPointerDown, true);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', onDocumentPointerDown, true);
});

watch(
  () => props.stageChannelId,
  () => closeVcMenu(),
);
</script>

<template>
  <div
    class="stage-call-view isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--bg)]"
  >
    <div
      class="stage-call-header flex h-11 min-h-11 w-full min-w-0 shrink-0 items-center border-b border-border"
      :class="compactLayout ? 'gap-2 px-3' : 'gap-3 px-5'"
    >
      <div
        class="stage-call-header-dot shrink-0"
        :class="
          speakerParticipants.length > 0 ? 'bg-emerald-500' : 'bg-glass-active'
        "
      />
      <button
        v-if="onGoToVoiceChannelInSidebar"
        type="button"
        class="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left text-[15px] font-semibold text-foreground transition hover:underline"
        :title="`${channelName} — Go to channel`"
        @click="onGoToVoiceChannelInSidebar()"
      >
        {{ channelName }}
      </button>
      <span
        v-else
        class="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground"
        >{{ channelName }}</span
      >
      <span
        class="ml-auto flex shrink-0 items-center gap-2 text-xs tabular-nums text-fg-subtle"
      >
        <span class="hidden sm:inline"
          >{{ speakerParticipants.length }} speaker{{
            speakerParticipants.length === 1 ? '' : 's'
          }}
          · {{ audienceParticipants.length }} listening</span
        >
        <VoiceChannelUserLimitBadge
          v-if="voiceChannelLimitUi"
          :label="voiceChannelLimitUi.label"
          :tone="voiceChannelLimitUi.tone"
          size="md"
          :title="`${voiceChannelLimitUi.count} of ${voiceChannelLimitUi.limit} users in stage`"
        />
      </span>
    </div>

    <StageYoutubeLiveBar
      v-if="YOUTUBE_INTEGRATION_ENABLED"
      :echo-server-id="echoServerId"
      :stage-channel-id="stageChannelId"
      :can-manage="canManageStageYoutube"
      call-view-header
    />

    <div
      class="stage-call-body custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto"
      :class="
        compactLayout ? 'gap-2 px-2 pb-2 pt-1' : 'gap-3 px-3 pb-3 pt-2 md:px-4'
      "
    >
      <div
        v-if="!selfIsSpeaker && currentUserId"
        class="stage-self-bar flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-elevated px-3 py-2"
      >
        <div class="min-w-0">
          <p class="text-xs font-semibold text-fg">You are in the audience</p>
          <p class="text-[11px] text-fg-subtle">
            Raise your hand to ask moderators for the mic.
          </p>
        </div>
        <button
          v-if="selfPendingSpeak"
          type="button"
          class="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-fg transition hover:bg-glass-hover disabled:opacity-50"
          :disabled="requestSpeakBusy"
          @click="cancelSpeakRequest"
        >
          Cancel request
        </button>
        <button
          v-else
          type="button"
          class="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-contrast-fg)] transition hover:opacity-90 disabled:opacity-50"
          :disabled="requestSpeakBusy"
          @click="requestToSpeak"
        >
          Request to speak
        </button>
      </div>

      <div
        v-if="canModerateStage && pendingRequestParticipants.length > 0"
        class="stage-requests-queue shrink-0 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2"
      >
        <p
          class="mb-2 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-200/90"
        >
          Requests to speak
        </p>
        <div class="flex flex-wrap gap-2">
          <div
            v-for="p in pendingRequestParticipants"
            :key="p.id"
            class="stage-request-chip flex items-center gap-2 rounded-lg border border-border bg-[var(--bg)] py-1 pl-1 pr-2"
          >
            <PausedGifAvatar
              :src="tileAvatar(p)"
              :alt="p.name"
              :session-key="p.id"
              img-class="h-8 w-8 rounded-full object-cover"
            />
            <span class="max-w-[8rem] truncate text-xs font-semibold text-fg">{{
              p.name
            }}</span>
            <button
              type="button"
              class="rounded-md bg-emerald-600/90 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
              :disabled="speakRequestsBusy"
              @click="resolveSpeakRequest(p.id, true)"
            >
              Invite
            </button>
            <button
              type="button"
              class="rounded-md border border-border px-2 py-0.5 text-[10px] font-semibold text-fg-subtle hover:bg-glass-hover disabled:opacity-50"
              :disabled="speakRequestsBusy"
              @click="resolveSpeakRequest(p.id, false)"
            >
              Deny
            </button>
          </div>
        </div>
      </div>

      <StageActiveEventBanner
        v-if="activeStageEvent"
        class="mb-3 shrink-0"
        :event="activeStageEvent"
        :now-ms="stageEventNowMs ?? Date.now()"
        :started-from-lobby="stageEventStartedFromLobby"
        :prompt-youtube-live="
          YOUTUBE_INTEGRATION_ENABLED &&
          showYoutubeLivePrompt &&
          promptYoutubeLiveForEvent
        "
        :can-manage-youtube="
          YOUTUBE_INTEGRATION_ENABLED && canManageStageYoutube
        "
        @dismiss="emit('dismissStageEvent')"
        @dismiss-youtube-prompt="
          () => {
            showYoutubeLivePrompt = false;
            emit('dismissYoutubeLivePrompt');
          }
        "
      />

      <div
        class="stage-broadcast flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-[var(--surface)]"
      >
        <div
          v-if="participants.length === 0"
          class="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-fg-subtle"
        >
          <img :src="icons.sofa" alt="" class="h-10 w-10 opacity-40" />
          <p class="text-sm">Stage is empty</p>
          <p class="text-xs">
            Be the first to join — moderators can go live on YouTube above.
          </p>
        </div>

        <template v-else-if="speakerParticipants.length === 0">
          <div
            class="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-fg-subtle"
          >
            <p class="text-sm font-medium text-fg">No speakers yet</p>
            <p class="max-w-xs text-xs">
              Moderators can invite audience members to speak or start a YouTube
              live stream from the bar above.
            </p>
          </div>
        </template>

        <template v-else>
          <div
            v-if="hasSpeakerMedia"
            class="stage-media-layout flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2 md:flex-row md:p-3"
          >
            <div
              v-if="stagePrimaryTile"
              class="stage-media-primary flex min-h-[12rem] min-w-0 flex-1 md:min-h-[18rem]"
            >
              <StreamVideoTile
                :key="stagePrimaryTile.tileId"
                class="h-full w-full min-h-0 flex-1 overflow-hidden rounded-xl"
                :track="stagePrimaryTile.track ?? null"
                :participant-name="stagePrimaryTile.name"
                :participant-pfp="stagePrimaryTile.pfp"
                :participant-id="stagePrimaryTile.id"
                :is-local="stagePrimaryTile.isLocal"
                :is-screen-share="stagePrimaryTile.mediaKind === 'screen'"
                :is-focused="focusedStreamParticipantId === stagePrimaryTile.id"
                :mirror-video="
                  stagePrimaryTile.mediaKind !== 'screen' &&
                  stagePrimaryTile.isLocal &&
                  mirrorLocalCamera !== false
                "
                @request-focus="
                  focusedStreamParticipantId = stagePrimaryTile.id
                "
              />
            </div>
            <div
              v-if="stageSideTiles.length > 0"
              class="stage-media-side flex shrink-0 gap-2 overflow-x-auto pb-1 md:w-44 md:flex-col md:overflow-y-auto md:overflow-x-hidden"
            >
              <StreamVideoTile
                v-for="t in stageSideTiles"
                :key="t.tileId"
                class="aspect-video h-24 w-36 shrink-0 overflow-hidden rounded-lg md:h-auto md:w-full md:min-h-[5.5rem]"
                :track="t.track ?? null"
                :participant-name="t.name"
                :participant-pfp="t.pfp"
                :participant-id="t.id"
                :is-local="t.isLocal"
                :is-screen-share="t.mediaKind === 'screen'"
                fit-video="cover"
                hide-participant-bar
                :mirror-video="
                  t.mediaKind !== 'screen' &&
                  t.isLocal &&
                  mirrorLocalCamera !== false
                "
                @request-focus="focusedStreamParticipantId = t.id"
              />
            </div>
          </div>

          <div
            class="stage-speaker-grid shrink-0"
            :class="[
              speakerGridClass,
              hasSpeakerMedia
                ? 'stage-speaker-grid--under-media p-2 pt-0 md:px-3'
                : 'p-3 md:p-4',
            ]"
          >
            <div
              v-for="p in speakerParticipants"
              :key="p.id"
              class="stage-tile group relative flex flex-col overflow-hidden"
              :class="{
                'stage-tile--self': currentUserId === p.id,
                'stage-tile--speaking': p.speaking,
              }"
              @contextmenu="onTileContextMenu(p, $event)"
            >
              <img
                :src="tileAvatar(p)"
                aria-hidden="true"
                class="stage-tile-backdrop"
              />
              <span
                v-if="currentUserId === p.id"
                class="stage-tile-badge stage-tile-badge--you"
                >You</span
              >
              <span class="stage-tile-badge stage-tile-badge--speaker"
                >Speaker</span
              >
              <div class="stage-tile-avatar-area">
                <div
                  class="stage-avatar-ring-host rounded-full"
                  :class="{ 'stage-avatar-speaking-ring': p.speaking }"
                  :style="
                    p.speaking
                      ? {
                          '--speak-strength': Math.min(
                            1,
                            (p.audioLevel ?? 0) * 3 + 0.4,
                          ),
                        }
                      : undefined
                  "
                >
                  <button
                    v-if="onOpenProfile"
                    type="button"
                    class="stage-avatar-btn"
                    :aria-label="`Open ${p.name} profile`"
                    @click="handleOpenProfile(p.id, $event)"
                    @contextmenu.stop.prevent="onTileContextMenu(p, $event)"
                  >
                    <PausedGifAvatar
                      :src="tileAvatar(p)"
                      :alt="p.name"
                      :session-key="p.id"
                      img-class="stage-avatar-img rounded-full object-cover"
                    />
                  </button>
                  <template v-else>
                    <PausedGifAvatar
                      :src="tileAvatar(p)"
                      :alt="p.name"
                      :session-key="p.id"
                      img-class="stage-avatar-img rounded-full object-cover"
                      @contextmenu.stop.prevent="onTileContextMenu(p, $event)"
                    />
                  </template>
                  <div
                    v-if="p.muted || p.deafened"
                    class="stage-avatar-badge"
                    :class="{
                      'stage-avatar-badge--server':
                        p.serverMuted || p.serverDeafened,
                    }"
                    :title="
                      voiceMuteDeafenHoverTitle({
                        muted: p.muted,
                        deafened: p.deafened,
                        serverMuted: p.serverMuted,
                        serverDeafened: p.serverDeafened,
                      })
                    "
                  >
                    <img
                      :src="p.deafened ? icons.headphones : icons.mic"
                      alt=""
                      class="stage-avatar-badge-icon"
                    />
                  </div>
                </div>
              </div>
              <div class="stage-tile-bottom">
                <span class="stage-tile-name" :title="p.name">{{
                  p.name
                }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>

      <section
        v-if="audienceParticipants.length > 0"
        class="stage-audience shrink-0"
      >
        <p
          class="mb-2 px-0.5 text-[10px] font-bold uppercase tracking-wider text-fg-subtle"
        >
          Audience · {{ audienceParticipants.length }}
        </p>
        <div
          class="stage-audience-rail custom-scrollbar flex gap-2 overflow-x-auto pb-1"
        >
          <button
            v-for="p in audienceParticipants"
            :key="p.id"
            type="button"
            class="stage-audience-chip group relative flex w-[4.5rem] shrink-0 flex-col items-center gap-1 rounded-xl border border-transparent p-1.5 transition hover:border-border hover:bg-elevated"
            :class="{
              'ring-2 ring-amber-400/70': pendingUserIds.includes(p.id),
            }"
            :title="p.name"
            @click="onOpenProfile ? handleOpenProfile(p.id, $event) : undefined"
            @contextmenu.prevent="onTileContextMenu(p, $event)"
          >
            <div
              class="relative"
              :class="{ 'stage-audience-speaking': p.speaking }"
            >
              <PausedGifAvatar
                :src="tileAvatar(p)"
                :alt="p.name"
                :session-key="p.id"
                img-class="h-11 w-11 rounded-full object-cover opacity-90 group-hover:opacity-100"
              />
              <span
                v-if="pendingUserIds.includes(p.id)"
                class="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-black"
                title="Requested to speak"
                >!</span
              >
              <span
                v-if="p.muted"
                class="absolute -bottom-0.5 -right-0.5 rounded-full bg-scrim-2 p-0.5"
              >
                <img :src="icons.mic" alt="" class="h-2.5 w-2.5 opacity-70" />
              </span>
            </div>
            <span
              class="w-full truncate text-center text-[10px] font-medium text-fg-soft group-hover:text-fg"
              >{{ p.name }}</span
            >
          </button>
        </div>
      </section>
    </div>

    <Teleport to="body">
      <div
        v-if="vcModerationTarget && vcModerationTarget.id !== currentUserId"
        ref="vcMenuRef"
        class="fixed z-[300] min-w-[200px] rounded-lg border border-border bg-[var(--echo-menu-bg)] py-1 shadow-xl"
        :style="{ left: `${vcMenuPos.left}px`, top: `${vcMenuPos.top}px` }"
        role="menu"
        @click.stop
        @mousedown.stop
      >
        <button
          v-if="composerInsertUserMention"
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-glass-hover"
          @click="mentionFromMenu"
        >
          Quick mention
        </button>
        <template v-if="vcModAllowed(vcModerationTarget.id, 'inviteToSpeak')">
          <button
            v-if="!isSpeaker(vcModerationTarget.id)"
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-glass-hover"
            @click="emitVcModerate('inviteToSpeak', vcModerationTarget.id)"
          >
            <img :src="icons.mic" alt="" class="h-4 w-4 opacity-80" />
            Invite to speak
          </button>
          <button
            v-else
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-glass-hover"
            @click="emitVcModerate('moveToAudience', vcModerationTarget.id)"
          >
            <img :src="icons.mic" alt="" class="h-4 w-4 opacity-50" />
            Move to audience
          </button>
        </template>
        <button
          v-if="vcModAllowed(vcModerationTarget.id, 'serverMute')"
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-500/15 dark:text-red-200"
          @click="emitVcModerate('serverMute', vcModerationTarget.id)"
        >
          {{ vcModerationTarget.serverMuted ? 'Unmute' : 'Mute' }}
        </button>
        <button
          v-if="
            vcModerationTarget.video &&
            vcModAllowed(vcModerationTarget.id, 'stopCamera')
          "
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-500/15 dark:text-red-200"
          @click="emitVcModerate('stopCamera', vcModerationTarget.id)"
        >
          Turn off camera
        </button>
        <button
          v-if="
            vcModerationTarget.streaming &&
            vcModAllowed(vcModerationTarget.id, 'stopScreenShare')
          "
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-500/15 dark:text-red-200"
          @click="emitVcModerate('stopScreenShare', vcModerationTarget.id)"
        >
          Stop screen share
        </button>
        <button
          v-if="vcModAllowed(vcModerationTarget.id, 'disconnect')"
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-500/15 dark:text-red-200"
          @click="emitVcModerate('disconnect', vcModerationTarget.id)"
        >
          Disconnect
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.stage-call-header-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.stage-broadcast {
  min-height: min(42dvh, 360px);
  background: color-mix(in srgb, var(--surface) 88%, #0b0a10);
}

.stage-speaker-grid {
  display: grid;
  gap: 10px;
  align-content: center;
  justify-items: stretch;
}

.stage-speaker-grid--solo {
  grid-template-columns: minmax(0, 280px);
  justify-content: center;
}

.stage-speaker-grid--duo {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  max-width: 640px;
  margin-inline: auto;
}

.stage-speaker-grid--quad {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (min-width: 720px) {
  .stage-speaker-grid--quad {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .stage-speaker-grid--many {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.stage-speaker-grid--many {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 9.5rem), 1fr));
}

.stage-speaker-grid--under-media .stage-tile {
  aspect-ratio: 16 / 10;
  max-height: 7.5rem;
}

.stage-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  aspect-ratio: 16 / 9;
  min-height: 0;
  border-radius: 14px;
  border: 1.5px solid rgba(255, 255, 255, 0.08);
  background: color-mix(in srgb, #1a1922 88%, transparent);
  overflow: hidden;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.stage-tile--speaking {
  border-color: #3ba55d;
  box-shadow:
    0 0 0 1px #3ba55d,
    0 0 14px rgba(59, 165, 93, 0.35);
}

.stage-tile--self {
  border-color: rgba(59, 165, 93, 0.45);
}

.stage-tile-backdrop {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: blur(24px) saturate(1.3) brightness(0.5);
  transform: scale(1.08);
  pointer-events: none;
}

.stage-tile::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(
    to bottom,
    transparent 0%,
    rgba(0, 0, 0, 0.2) 45%,
    rgba(0, 0, 0, 0.78) 100%
  );
  pointer-events: none;
}

.stage-tile > *:not(.stage-tile-backdrop) {
  position: relative;
  z-index: 1;
}

.stage-tile-badge {
  position: absolute;
  top: 6px;
  z-index: 2;
  border-radius: 4px;
  padding: 2px 5px;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.stage-tile-badge--speaker {
  right: 6px;
  color: #a7f3d0;
  background: rgba(16, 185, 129, 0.25);
}

.stage-tile-badge--you {
  left: 6px;
  color: #e2e8f0;
  background: rgba(255, 255, 255, 0.12);
}

.stage-tile-avatar-area {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding-top: 8px;
}

.stage-avatar-ring-host {
  position: relative;
  width: clamp(44px, 14cqw, 72px);
  height: clamp(44px, 14cqw, 72px);
}

.stage-avatar-btn {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  padding: 0;
  border-radius: 50%;
  overflow: hidden;
  cursor: pointer;
}

.stage-avatar-img {
  width: 100%;
  height: 100%;
  display: block;
}

.stage-avatar-speaking-ring {
  box-shadow:
    inset 0 0 0 3px
      color-mix(
        in srgb,
        #3ba55d calc(var(--speak-strength, 0.4) * 100%),
        transparent
      ),
    inset 0 0 calc(6px + var(--speak-strength, 0.4) * 10px)
      rgba(59, 165, 93, 0.4);
}

.stage-avatar-badge {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
}

.stage-avatar-badge--server {
  outline: 2px solid rgba(239, 68, 68, 0.55);
}

.stage-avatar-badge-icon {
  width: 40%;
  height: 40%;
  opacity: 0.9;
  filter: invert(1);
}

.stage-tile-bottom {
  width: 100%;
  padding: 4px 8px 8px;
  text-align: center;
}

.stage-tile-name {
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.stage-audience-speaking :deep(img) {
  box-shadow: 0 0 0 2px #3ba55d;
}

[data-theme='light'] .stage-broadcast {
  background: color-mix(in srgb, var(--surface) 96%, #dce3ef);
}

[data-theme='light'] .stage-tile {
  border-color: color-mix(in srgb, var(--border) 80%, transparent);
  background: color-mix(in srgb, var(--elevated) 90%, transparent);
}

[data-theme='light'] .stage-tile-backdrop {
  filter: blur(22px) saturate(1.08) brightness(0.76);
}

[data-theme='light'] .stage-tile::after {
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.04) 0%,
    rgba(0, 0, 0, 0.12) 40%,
    rgba(0, 0, 0, 0.5) 75%,
    rgba(0, 0, 0, 0.72) 100%
  );
}

[data-theme='light'] .stage-tile-badge--you {
  color: color-mix(in srgb, var(--text) 88%, transparent);
  background: color-mix(in srgb, var(--text) 10%, transparent);
}

[data-theme='light'] .stage-tile-badge--speaker {
  color: #047857;
  background: color-mix(in srgb, #10b981 18%, transparent);
}

[data-theme='light'] .stage-avatar-speaking-ring {
  --ring-color: #248045;
  box-shadow:
    inset 0 0 0 3px
      color-mix(
        in srgb,
        #248045 calc(var(--speak-strength, 0.4) * 100%),
        transparent
      ),
    inset 0 0 calc(6px + var(--speak-strength, 0.4) * 10px)
      rgba(36, 128, 69, 0.38);
}

[data-theme='light'] .stage-avatar-badge {
  background: color-mix(in srgb, #0f172a 40%, transparent);
}

[data-theme='light'] .stage-requests-queue {
  border-color: color-mix(in srgb, #d97706 35%, transparent);
  background: color-mix(in srgb, #fbbf24 12%, transparent);
}
</style>

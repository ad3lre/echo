<script setup lang="ts">
import {
  computed,
  inject,
  ref,
  onMounted,
  onUnmounted,
  nextTick,
  watch,
  type Ref,
} from 'vue';
import { CALL_VIEW_FULLSCREEN_STREAM_ID_KEY } from '@/features/layout/layoutInjectionKeys';
import { icons } from '@/assets/icons';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import StreamVideoTile from '@/components/StreamVideoTile.vue';
import type { RemoteParticipantTrackInfo } from '@/composables/useLiveKitVoiceRoom';
import { resolveCallTileAvatarUrl } from '@/utils/avatarDisplay';
import { clampMenuToViewport } from '@/features/chat/composables/useContextMenuPosition';
import { getPopoutAnchorRect } from '@/utils/memberProfiles';
import type { PopoutAnchorRect } from '@/utils/memberProfiles';
import { liveKitRemoteParticipantByIdentity } from '@/services/livekit/liveKitRoomParticipants';
import {
  COMPOSER_INSERT_USER_MENTION_KEY,
  type InsertUserMentionFn,
} from '@/features/chat/chatComposerContext';
import VcActivityPresenceBadges from '@/features/voice/components/VcActivityPresenceBadges.vue';
import VcActivityKingCrown from '@/features/voice/components/VcActivityKingCrown.vue';
import VoiceChannelUserLimitBadge from '@/features/voice/components/VoiceChannelUserLimitBadge.vue';
import { getVoiceChannelUserLimitUi } from '@/features/voice/domain/voiceChannelUserLimit';
import type { VcActivityPresenceKind } from '@/features/voice/vcActivityTypes';

export type VcModerateAction =
  | 'serverMute'
  | 'serverDeafen'
  | 'disconnect'
  | 'move';

const props = withDefaults(
  defineProps<{
    channelName: string;
    participants: {
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
      screenAudioTrack?: unknown;
      cameraTrack?: unknown;
      /** DM / group call: not yet in LiveKit, declined, or signaling accepted only. */
      dmCallPresence?: 'live' | 'ringing' | 'connecting' | 'declined';
      /** Guild VC: YouTube watch-together / activities picker (LiveKit presence). */
      activityPresence?: VcActivityPresenceKind[];
      /** Guild VC: this user drives LiveKit-synced activity until they leave. */
      isVcActivityKing?: boolean;
    }[];
    currentUserId?: string;
    onOpenProfile?: (
      userId: string,
      anchorRect: PopoutAnchorRect | null,
    ) => void;
    canModerateParticipant?: (userId: string) => boolean;
    /** When set, gates each voice moderation action (Echo: MUTE_MEMBERS / DEAFEN_MEMBERS / MODERATE_MEMBERS). */
    canVcModerateParticipantAction?: (
      userId: string,
      action: VcModerateAction,
    ) => boolean;
    onVcModerate?: (payload: {
      action: VcModerateAction;
      targetUserId: string;
      targetChannelId?: string;
      contextVoiceChannelId?: string;
    }) => void;
    remoteParticipants?: Map<string, unknown>;
    lkRoom?: unknown;
    mirrorLocalCamera?: boolean;
    getLocalScreenTrack?: () => unknown;
    getLocalCameraTrack?: () => unknown;
    onRequestFullscreenStream?: (participantId: string) => void;
    /** LiveKit: per-remote-user playback level (0–100). */
    getRemoteParticipantVolume?: (userId: string) => number;
    setRemoteParticipantVolume?: (
      userId: string,
      volumePercent: number,
    ) => void;
    /** When false, only the participant grid / streams are shown (e.g. embedded under DM call chrome). */
    showHeader?: boolean;
    /** Guild mobile tri-pane: tighter padding and gallery gaps for small screens. */
    compactLayout?: boolean;
    /** Guild VC: click channel name to jump to channel in sidebar. */
    onGoToVoiceChannelInSidebar?: () => void;
    /** Guild VC: current voice channel id for moderation API context (mute/disconnect/move). */
    voiceModerationChannelId?: string | null;
    /** Guild VC: max concurrent users; `0` = unlimited. */
    voiceChannelUserLimit?: number;
    /**
     * DM fullscreen: prioritize camera / screen tiles (majority of space) and show
     * participant avatar ring in a side rail (desktop) or compact strip (mobile).
     */
    videoPrimaryDmLayout?: boolean;
  }>(),
  { showHeader: true, compactLayout: false, videoPrimaryDmLayout: false },
);

const composerInsertUserMention =
  inject<Ref<InsertUserMentionFn | null> | null>(
    COMPOSER_INSERT_USER_MENTION_KEY,
    null,
  );

function tileAvatar(p: { id: string; pfp: string }) {
  return resolveCallTileAvatarUrl(p.pfp, p.id);
}

function handleOpenProfile(userId: string, event: MouseEvent) {
  const target = event.currentTarget;
  if (!target || !props.onOpenProfile) return;
  props.onOpenProfile(userId, getPopoutAnchorRect(target, 'generic'));
}

function dmCallPresenceLabel(
  presence: 'live' | 'ringing' | 'connecting' | 'declined' | undefined,
): string {
  switch (presence) {
    case 'ringing':
      return 'Calling…';
    case 'connecting':
      return 'Joining…';
    case 'declined':
      return 'Declined';
    default:
      return '';
  }
}

const focusedStreamParticipantId = ref<string | null>(null);

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
  p: (typeof props.participants)[number],
): unknown | null {
  if (p.screenTrack) return p.screenTrack;
  if (p.id === props.currentUserId) {
    return props.getLocalScreenTrack?.() ?? null;
  }
  return remoteTrackInfoForParticipant(p.id)?.screenTrack ?? null;
}

function resolveParticipantCameraTrack(
  p: (typeof props.participants)[number],
): unknown | null {
  if (p.cameraTrack) return p.cameraTrack;
  if (p.id === props.currentUserId) {
    return props.getLocalCameraTrack?.() ?? null;
  }
  return remoteTrackInfoForParticipant(p.id)?.cameraTrack ?? null;
}

const voiceChannelLimitUi = computed(() =>
  getVoiceChannelUserLimitUi(
    props.participants.length,
    props.voiceChannelUserLimit,
  ),
);

const screenShareTiles = computed(() => {
  const tiles = props.participants
    .filter((p) => !!p.streaming)
    .map((p) => ({
      id: p.id,
      name: p.name,
      pfp: p.pfp,
      isLocal: p.id === props.currentUserId,
      track: resolveParticipantScreenShareTrack(p),
    }));
  const focusId = focusedStreamParticipantId.value;
  if (!focusId) return tiles;
  const idx = tiles.findIndex((t) => t.id === focusId);
  if (idx <= 0) return tiles;
  return [tiles[idx]!, ...tiles.slice(0, idx), ...tiles.slice(idx + 1)];
});

const cameraVideoTiles = computed(() => {
  const tiles = props.participants
    .filter((p) => !!p.video)
    .map((p) => ({
      id: p.id,
      name: p.name,
      pfp: p.pfp,
      isLocal: p.id === props.currentUserId,
      track: resolveParticipantCameraTrack(p),
    }));
  const focusId = focusedStreamParticipantId.value;
  if (!focusId) return tiles;
  const idx = tiles.findIndex((t) => t.id === focusId);
  if (idx <= 0) return tiles;
  return [tiles[idx]!, ...tiles.slice(0, idx), ...tiles.slice(idx + 1)];
});

type VisualMediaTile = {
  tileId: string;
  mediaKind: 'screen' | 'camera';
  id: string;
  name: string;
  pfp: string;
  isLocal: boolean;
  track: unknown | null;
};

const visualMediaTiles = computed<VisualMediaTile[]>(() => {
  const screenMapped = screenShareTiles.value.map((tile) => ({
    tileId: `screen-${tile.id}`,
    mediaKind: 'screen' as const,
    ...tile,
    track: tile.track ?? null,
  }));
  const cameraMapped = cameraVideoTiles.value.map((tile) => ({
    tileId: `camera-${tile.id}`,
    mediaKind: 'camera' as const,
    ...tile,
    track: tile.track ?? null,
  }));
  const cameras = props.videoPrimaryDmLayout
    ? [...cameraMapped].sort(
        (a, b) => Number(!!a.isLocal) - Number(!!b.isLocal),
      )
    : cameraMapped;
  return [...screenMapped, ...cameras];
});

const hasVisualMediaTiles = computed(() => visualMediaTiles.value.length > 0);

/** Meet-style dominant stage + participant rail for media calls (guild + DM). */
const useMeetStageLayout = computed(() => hasVisualMediaTiles.value);

const prioritizedVisualMediaTiles = computed(() => {
  const focusId = focusedStreamParticipantId.value;
  const visualTiles = visualMediaTiles.value;
  if (!focusId) return visualTiles;
  const idx = visualTiles.findIndex((tile) => tile.id === focusId);
  if (idx <= 0) return visualTiles;
  return [
    visualTiles[idx]!,
    ...visualTiles.slice(0, idx),
    ...visualTiles.slice(idx + 1),
  ];
});

const stagePrimaryTile = computed(
  () => prioritizedVisualMediaTiles.value[0] ?? null,
);
const sideRailVisualTiles = computed(() =>
  prioritizedVisualMediaTiles.value.slice(1),
);

function handleStreamTileAutoQuality(payload: {
  participantId: string;
  quality: StreamQuality;
}) {
  if (streamLayerManualByParticipantId.value[payload.participantId]) return;
  const p =
    props.participants.find((x) => x.id === payload.participantId) ?? null;
  applyParticipantStreamQuality(p, payload.quality);
}

function handleStreamTileManualQuality(payload: {
  participantId: string;
  quality: StreamQuality;
}) {
  streamLayerManualByParticipantId.value = {
    ...streamLayerManualByParticipantId.value,
    [payload.participantId]: true,
  };
  const p =
    props.participants.find((x) => x.id === payload.participantId) ?? null;
  applyParticipantStreamQuality(p, payload.quality);
}

const vcMenuOpenForId = ref<string | null>(null);
const vcMenuPos = ref({ left: 0, top: 0 });
const vcMenuRef = ref<HTMLElement | null>(null);
/** Local draft while the call tile menu is open (synced to LiveKit on input). */
const vcMenuVolumeDraft = ref(100);

type StreamQuality = 'high' | 'medium' | 'low';

/** Manual simulcast layer picks (tile menu / call menu); cleared when fullscreen overlay closes. */
const streamLayerManualByParticipantId = ref<Record<string, true>>({});

const fullscreenStreamParticipantIdForLayers = inject(
  CALL_VIEW_FULLSCREEN_STREAM_ID_KEY,
  ref<string | null>(null),
);

watch(fullscreenStreamParticipantIdForLayers, (next, prev) => {
  if (prev && !next) {
    streamLayerManualByParticipantId.value = {};
  }
});

const callMenuStreamQuality = ref<StreamQuality>('high');
const STREAM_QUALITY_LABELS: Record<StreamQuality, string> = {
  high: 'High (Source)',
  medium: 'Medium',
  low: 'Low',
};
const STREAM_QUALITY_ORDER: StreamQuality[] = ['high', 'medium', 'low'];

type RemoteTrackPublicationLike = {
  videoQuality?: number;
  setEnabled: (enabled: boolean) => void;
  setVideoQuality: (quality: number) => void;
};

type RemoteParticipantLike = {
  getTrackPublication: (
    source: 'screen_share' | 'camera',
  ) => RemoteTrackPublicationLike | undefined;
};

function streamQualityToLiveKitValue(q: StreamQuality): number {
  if (q === 'low') return 0;
  if (q === 'medium') return 1;
  return 2;
}

function liveKitValueToStreamQuality(value: number | undefined): StreamQuality {
  if (value === 0) return 'low';
  if (value === 1) return 'medium';
  return 'high';
}

function getParticipantVideoPublication(
  p: (typeof props.participants)[number] | null | undefined,
): RemoteTrackPublicationLike | null {
  if (!p) return null;
  const room = props.lkRoom as
    | Parameters<typeof liveKitRemoteParticipantByIdentity>[0]
    | null
    | undefined;
  if (!room || p.id === props.currentUserId) return null;
  const participant = liveKitRemoteParticipantByIdentity(room, p.id) as
    | RemoteParticipantLike
    | undefined;
  if (!participant) return null;
  if (p.streaming) {
    return participant.getTrackPublication('screen_share') ?? null;
  }
  if (p.video) {
    return participant.getTrackPublication('camera') ?? null;
  }
  return null;
}

function applyParticipantStreamQuality(
  p: (typeof props.participants)[number] | null | undefined,
  quality: StreamQuality,
) {
  const publication = getParticipantVideoPublication(p);
  if (!publication) return;
  publication.setEnabled(true);
  publication.setVideoQuality(streamQualityToLiveKitValue(quality));
}

function callMenuHasVolumeControl(): boolean {
  return typeof props.setRemoteParticipantVolume === 'function';
}

/** True when ChatInput has registered `insertUserMentionAtCursor` on the shell ref. */
const canQuickMentionFromCallMenu = computed(
  () => !!composerInsertUserMention?.value,
);

function remoteStreamVolumeEnabled(participantId: string | undefined): boolean {
  if (!participantId) return false;
  return (
    typeof props.setRemoteParticipantVolume === 'function' &&
    participantId !== props.currentUserId
  );
}

function remoteStreamVolumePercent(participantId: string | undefined): number {
  if (!participantId) return 100;
  return props.getRemoteParticipantVolume?.(participantId) ?? 100;
}

function onRemoteStreamVolume(participantId: string, v: number) {
  props.setRemoteParticipantVolume?.(participantId, v);
}

/** Re-apply stored per-user gain after StreamVideoTile wires muxed video/tab audio into Web Audio. */
function onRemoteVideoPlaybackWired(participantId: string) {
  const setFn = props.setRemoteParticipantVolume;
  const getFn = props.getRemoteParticipantVolume;
  if (!setFn) return;
  const id = participantId.trim();
  if (!id) return;
  setFn(id, getFn?.(id) ?? 100);
}

const vcModerationTarget = computed(
  () => props.participants.find((x) => x.id === vcMenuOpenForId.value) ?? null,
);

function vcModAllowed(userId: string, action: VcModerateAction): boolean {
  if (props.canVcModerateParticipantAction) {
    return props.canVcModerateParticipantAction(userId, action);
  }
  return props.canModerateParticipant?.(userId) ?? false;
}

function vcModSectionVisible(userId: string): boolean {
  if (props.canVcModerateParticipantAction) {
    return (
      vcModAllowed(userId, 'serverMute') ||
      vcModAllowed(userId, 'serverDeafen') ||
      vcModAllowed(userId, 'disconnect')
    );
  }
  return props.canModerateParticipant?.(userId) ?? false;
}

function onTileContextMenu(
  p: (typeof props.participants)[number],
  e: MouseEvent,
) {
  e.preventDefault();
  if (p.id === props.currentUserId) {
    return;
  }
  const canMod = vcModSectionVisible(p.id);
  const canMention = canQuickMentionFromCallMenu.value;
  const hasVolume = callMenuHasVolumeControl();
  const hasStreamQuality = !!getParticipantVideoPublication(p);
  if (!canMod && !canMention && !hasVolume && !hasStreamQuality) return;
  const vol = props.getRemoteParticipantVolume?.(p.id) ?? 100;
  vcMenuVolumeDraft.value = vol;
  callMenuStreamQuality.value = liveKitValueToStreamQuality(
    getParticipantVideoPublication(p)?.videoQuality,
  );
  const estW = 240;
  const estH = 360;
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

function onCallMenuVolumeInput(e: Event) {
  const id = vcMenuOpenForId.value;
  const fn = props.setRemoteParticipantVolume;
  if (!id || !fn) return;
  const v = Number((e.target as HTMLInputElement).value);
  if (!Number.isFinite(v)) return;
  vcMenuVolumeDraft.value = v;
  fn(id, v);
}

function selectCallMenuStreamQuality(q: StreamQuality) {
  callMenuStreamQuality.value = q;
  const id = vcMenuOpenForId.value;
  if (id) {
    streamLayerManualByParticipantId.value = {
      ...streamLayerManualByParticipantId.value,
      [id]: true,
    };
  }
  applyParticipantStreamQuality(vcModerationTarget.value, q);
}

function closeVcMenu() {
  vcMenuOpenForId.value = null;
}

function emitVcModerate(action: VcModerateAction, targetUserId: string) {
  props.onVcModerate?.({
    action,
    targetUserId,
    contextVoiceChannelId: props.voiceModerationChannelId ?? undefined,
  });
  closeVcMenu();
}

function mentionParticipantFromCallMenu() {
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

function handleRequestFullscreen(participantId: string) {
  const participant =
    props.participants.find((candidate) => candidate.id === participantId) ??
    null;
  applyParticipantStreamQuality(participant, 'high');
  props.onRequestFullscreenStream?.(participantId);
}

function onParticipantAvatarDblClick(p: (typeof props.participants)[number]) {
  if (p.streaming || p.video) handleRequestFullscreen(p.id);
}

onMounted(() => {
  document.addEventListener('mousedown', onDocumentPointerDown, true);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', onDocumentPointerDown, true);
});
</script>

<template>
  <div
    class="call-view isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--bg)]"
  >
    <!-- Header bar -->
    <div
      v-if="showHeader"
      class="call-header flex h-11 min-h-11 w-full min-w-0 shrink-0 items-center border-b border-border"
      :class="compactLayout ? 'gap-2 px-3' : 'gap-3 px-5'"
    >
      <div
        class="call-header-dot shrink-0"
        :class="participants.length > 0 ? 'bg-emerald-500' : 'bg-glass-active'"
      />
      <button
        v-if="onGoToVoiceChannelInSidebar"
        type="button"
        class="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left text-[15px] font-semibold text-white transition hover:underline"
        :title="`${channelName} — Go to channel`"
        @click="onGoToVoiceChannelInSidebar()"
      >
        {{ channelName }}
      </button>
      <span
        v-else
        class="min-w-0 flex-1 truncate text-[15px] font-semibold text-white"
        >{{ channelName }}</span
      >
      <span
        class="ml-auto flex shrink-0 items-center gap-2 text-xs tabular-nums"
      >
        <VoiceChannelUserLimitBadge
          v-if="voiceChannelLimitUi"
          :label="voiceChannelLimitUi.label"
          :tone="voiceChannelLimitUi.tone"
          size="md"
          :title="`${voiceChannelLimitUi.count} of ${voiceChannelLimitUi.limit} users in voice`"
        />
        <span v-else class="text-fg-subtle">
          {{ participants.length }}
          {{ participants.length === 1 ? 'person' : 'people' }}
        </span>
      </span>
    </div>

    <!-- Main content area -->
    <div
      class="flex-1 min-h-0 overflow-auto flex flex-col"
      :class="
        compactLayout
          ? 'px-2 pb-2 pt-1'
          : useMeetStageLayout
            ? 'px-2 pb-2 pt-1 md:px-3 md:pb-3'
            : 'px-4 pb-4 pt-2'
      "
    >
      <!-- Empty state -->
      <div
        v-if="participants.length === 0"
        class="flex flex-1 flex-col items-center justify-center gap-3 text-fg-subtle"
      >
        <svg
          class="w-12 h-12 opacity-40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <p class="text-sm">No one here yet</p>
        <p class="text-xs text-fg-subtle">Invite someone to join the channel</p>
      </div>

      <div
        v-else
        class="call-participants-shell flex-1 min-h-0 min-w-0 flex flex-col"
        :class="{
          'call-participants-shell--meet-stage min-h-0 gap-2 md:gap-3':
            useMeetStageLayout,
        }"
      >
        <div
          v-if="useMeetStageLayout"
          class="call-meet-stage-wrap flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          <div
            v-if="stagePrimaryTile"
            class="call-meet-stage flex min-h-0 min-w-0 flex-1 flex-col"
          >
            <StreamVideoTile
              :key="stagePrimaryTile.tileId"
              class="call-meet-stage-tile max-h-none min-h-[14rem] w-full flex-1 md:min-h-[24rem]"
              :track="(stagePrimaryTile.track as any) ?? null"
              :participant-name="stagePrimaryTile.name"
              :participant-pfp="stagePrimaryTile.pfp"
              :participant-id="stagePrimaryTile.id"
              :is-local="stagePrimaryTile.isLocal"
              :is-screen-share="stagePrimaryTile.mediaKind === 'screen'"
              :is-focused="focusedStreamParticipantId === stagePrimaryTile.id"
              :mirror-video="
                stagePrimaryTile.mediaKind !== 'screen' &&
                stagePrimaryTile.isLocal &&
                props.mirrorLocalCamera !== false
              "
              :remote-stream-volume-control="
                remoteStreamVolumeEnabled(stagePrimaryTile.id)
              "
              :remote-stream-volume-percent="
                remoteStreamVolumePercent(stagePrimaryTile.id)
              "
              @request-focus="focusedStreamParticipantId = stagePrimaryTile.id"
              @request-fullscreen="handleRequestFullscreen(stagePrimaryTile.id)"
              @remote-stream-volume-change="
                (v) => onRemoteStreamVolume(stagePrimaryTile.id, v)
              "
              @remote-video-playback-wired="onRemoteVideoPlaybackWired"
              @auto-stream-layer-quality="handleStreamTileAutoQuality"
              @manual-stream-layer-quality="handleStreamTileManualQuality"
            />
          </div>
        </div>
        <div
          class="call-audio-only-gallery flex min-h-0 min-w-0 flex-wrap items-center overflow-auto"
          :class="
            useMeetStageLayout
              ? [
                  'call-participant-rail flex w-full min-h-0 !flex-nowrap items-center gap-2 !overflow-x-auto !overflow-y-hidden overscroll-x-contain touch-pan-x px-2 pb-2 pt-1 custom-scrollbar [scrollbar-gutter:stable]',
                  participants.length >= 5
                    ? 'call-participant-rail--expanded-voice-rail'
                    : '',
                  'max-h-[min(52dvh,48%)] shrink-0 md:max-h-none',
                ]
              : [
                  'call-audio-only-gallery--grid flex-1',
                  participants.length === 1
                    ? 'call-audio-only-gallery--solo'
                    : '',
                  compactLayout
                    ? 'gap-2 px-2 py-3'
                    : 'gap-4 px-4 py-5 sm:gap-5',
                ]
          "
        >
          <div
            v-if="useMeetStageLayout && sideRailVisualTiles.length > 0"
            class="call-participant-rail-media inline-flex shrink-0 flex-nowrap gap-2 pb-1"
          >
            <StreamVideoTile
              v-for="t in sideRailVisualTiles"
              :key="t.tileId"
              :class="[
                'call-participant-rail-media-tile shrink-0 overflow-hidden rounded-xl border-0 bg-black/20',
                participants.length >= 5
                  ? 'aspect-video w-[min(11.25rem,40vw)] min-w-[9.25rem] max-w-[12rem]'
                  : 'aspect-video w-[10rem] min-w-[8.75rem] max-w-[11.5rem]',
              ]"
              :track="(t.track as any) ?? null"
              :participant-name="t.name"
              :participant-pfp="t.pfp"
              :participant-id="t.id"
              :is-local="t.isLocal"
              :is-screen-share="t.mediaKind === 'screen'"
              :is-focused="focusedStreamParticipantId === t.id"
              fit-video="cover"
              hide-participant-bar
              :mirror-video="
                t.mediaKind !== 'screen' &&
                t.isLocal &&
                props.mirrorLocalCamera !== false
              "
              :remote-stream-volume-control="remoteStreamVolumeEnabled(t.id)"
              :remote-stream-volume-percent="remoteStreamVolumePercent(t.id)"
              @request-focus="focusedStreamParticipantId = t.id"
              @request-fullscreen="handleRequestFullscreen(t.id)"
              @remote-stream-volume-change="
                (v) => onRemoteStreamVolume(t.id, v)
              "
              @remote-video-playback-wired="onRemoteVideoPlaybackWired"
              @auto-stream-layer-quality="handleStreamTileAutoQuality"
              @manual-stream-layer-quality="handleStreamTileManualQuality"
            />
          </div>
          <div
            v-for="p in participants"
            :key="p.id"
            class="call-audio-circle call-tile group relative flex flex-col overflow-hidden"
            :class="{
              'call-tile--dm-pending':
                !!p.dmCallPresence && p.dmCallPresence !== 'live',
              'call-audio-circle--self call-tile--self': currentUserId === p.id,
              'call-audio-circle--rail call-tile--rail': useMeetStageLayout,
              'call-tile--speaking': p.speaking,
              'shrink-0': useMeetStageLayout,
            }"
            @contextmenu="onTileContextMenu(p, $event)"
            @dblclick="onParticipantAvatarDblClick(p)"
          >
            <!-- Blurred pfp backdrop -->
            <img
              :src="tileAvatar(p)"
              aria-hidden="true"
              class="call-tile-backdrop"
            />
            <div
              v-if="dmCallPresenceLabel(p.dmCallPresence)"
              class="call-tile-dm-pill"
            >
              {{ dmCallPresenceLabel(p.dmCallPresence) }}
            </div>
            <div
              v-if="p.isVcActivityKing || p.activityPresence?.length"
              class="call-tile-activity-badges flex items-center gap-0.5"
            >
              <VcActivityKingCrown
                v-if="p.isVcActivityKing"
                :icon-class="useMeetStageLayout ? 'h-3 w-3' : 'h-3.5 w-3.5'"
              />
              <VcActivityPresenceBadges
                v-if="p.activityPresence?.length"
                :kinds="p.activityPresence"
                :size="useMeetStageLayout ? 'sm' : 'md'"
              />
            </div>
            <div class="call-tile-avatar-area">
              <div
                class="call-avatar-ring-host rounded-full"
                :class="{
                  'call-avatar-speaking-ring': p.speaking,
                }"
                :style="
                  p.speaking
                    ? ({
                        '--speak-strength': Math.min(
                          1,
                          (p.audioLevel ?? 0) * 3 + 0.4,
                        ),
                      } as any)
                    : undefined
                "
              >
                <button
                  v-if="onOpenProfile"
                  type="button"
                  class="call-audio-circle-avatar-btn border-0 bg-transparent p-0 focus:outline-none focus:ring-2 focus:ring-white/40 rounded-full"
                  aria-label="Open profile"
                  @click="handleOpenProfile(p.id, $event)"
                  @contextmenu.stop.prevent="onTileContextMenu(p, $event)"
                >
                  <PausedGifAvatar
                    :src="tileAvatar(p)"
                    :alt="p.name"
                    :session-key="p.id"
                    img-class="call-audio-circle-avatar rounded-full object-cover"
                  />
                </button>
                <template v-else>
                  <div
                    class="call-audio-circle-avatar-wrap"
                    @contextmenu.stop.prevent="onTileContextMenu(p, $event)"
                  >
                    <PausedGifAvatar
                      :src="tileAvatar(p)"
                      :alt="p.name"
                      :session-key="p.id"
                      img-class="call-audio-circle-avatar rounded-full object-cover"
                    />
                  </div>
                </template>
                <!-- Deafen overlay — sits inside ring-host so inset:0 aligns with the avatar circle -->
                <div
                  v-if="p.deafened"
                  class="call-avatar-badge pointer-events-none"
                  :class="{ 'call-avatar-badge--server': p.serverDeafened }"
                >
                  <div class="call-avatar-badge-bg" />
                  <img
                    :src="icons.headphones"
                    alt=""
                    class="call-avatar-badge-icon"
                  />
                </div>
              </div>
            </div>
            <div class="call-tile-bottom">
              <span class="call-tile-name" :title="p.name">{{ p.name }}</span>
              <div
                class="call-tile-indicators flex items-center gap-1 text-xs text-fg-soft"
              >
                <template v-if="p.serverDeafened">
                  <span
                    class="call-indicator-icon-wrap call-indicator-icon-wrap--server"
                    title="Server deafened"
                  >
                    <img
                      :src="icons.mic"
                      alt=""
                      class="call-indicator-icon !h-2.5 !w-2.5"
                    />
                    <span class="call-indicator-strike" aria-hidden="true" />
                  </span>
                  <span
                    class="call-indicator-icon-wrap call-indicator-icon-wrap--server"
                    title="Server deafened"
                  >
                    <img
                      :src="icons.headphones"
                      alt=""
                      class="call-indicator-icon !h-2.5 !w-2.5"
                    />
                    <span class="call-indicator-strike" aria-hidden="true" />
                  </span>
                </template>
                <template v-else-if="p.deafened">
                  <span
                    class="call-indicator-icon-wrap"
                    :class="{
                      'call-indicator-icon-wrap--server': p.serverMuted,
                    }"
                    :title="p.serverMuted ? 'Server muted' : 'Muted'"
                  >
                    <img
                      :src="icons.mic"
                      alt=""
                      class="call-indicator-icon !h-2.5 !w-2.5"
                    />
                    <span class="call-indicator-strike" aria-hidden="true" />
                  </span>
                  <span class="call-indicator-icon-wrap" title="Deafened">
                    <img
                      :src="icons.headphones"
                      alt=""
                      class="call-indicator-icon !h-2.5 !w-2.5"
                    />
                    <span class="call-indicator-strike" aria-hidden="true" />
                  </span>
                </template>
                <span
                  v-else-if="p.serverMuted"
                  class="call-indicator-icon-wrap call-indicator-icon-wrap--server"
                  title="Server muted"
                >
                  <img
                    :src="icons.mic"
                    alt=""
                    class="call-indicator-icon !h-2.5 !w-2.5"
                  />
                  <span class="call-indicator-strike" aria-hidden="true" />
                </span>
                <span
                  v-else-if="p.muted"
                  class="call-indicator-icon-wrap"
                  title="Muted"
                >
                  <img
                    :src="icons.mic"
                    alt=""
                    class="call-indicator-icon !h-2.5 !w-2.5"
                  />
                  <span class="call-indicator-strike" aria-hidden="true" />
                </span>
              </div>
            </div>
          </div>
        </div>
        <div v-if="!useMeetStageLayout" class="contents">
          <div
            v-if="screenShareTiles.length > 0"
            class="call-stream-stage mb-3 shrink-0 min-h-0"
          >
            <div
              class="call-stream-stage-row flex min-h-0 min-w-0 gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x custom-scrollbar pb-1 [scrollbar-gutter:stable]"
            >
              <StreamVideoTile
                v-for="t in screenShareTiles"
                :key="`screen-${t.id}`"
                class="h-40 max-h-[36dvh] min-h-[10rem] w-[min(18rem,calc(100vw-2.5rem))] min-w-[14rem] max-w-[20rem] shrink-0"
                :track="(t.track as any) ?? null"
                :participant-name="t.name"
                :participant-pfp="t.pfp"
                :participant-id="t.id"
                :is-local="t.isLocal"
                is-screen-share
                :is-focused="focusedStreamParticipantId === t.id"
                :remote-stream-volume-control="remoteStreamVolumeEnabled(t.id)"
                :remote-stream-volume-percent="remoteStreamVolumePercent(t.id)"
                @request-focus="focusedStreamParticipantId = t.id"
                @request-fullscreen="handleRequestFullscreen(t.id)"
                @remote-stream-volume-change="
                  (v) => onRemoteStreamVolume(t.id, v)
                "
                @remote-video-playback-wired="onRemoteVideoPlaybackWired"
                @auto-stream-layer-quality="handleStreamTileAutoQuality"
                @manual-stream-layer-quality="handleStreamTileManualQuality"
              />
            </div>
          </div>
          <div
            v-if="cameraVideoTiles.length > 0"
            class="call-camera-stage mb-3 shrink-0 min-h-0"
          >
            <div
              class="call-camera-stage-row flex min-h-0 min-w-0 gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x custom-scrollbar pb-1 [scrollbar-gutter:stable]"
            >
              <StreamVideoTile
                v-for="t in cameraVideoTiles"
                :key="`cam-${t.id}`"
                class="h-36 max-h-[32dvh] min-h-[9rem] w-[min(14rem,calc(100vw-2.5rem))] min-w-[11rem] max-w-[16rem] shrink-0"
                :track="(t.track as any) ?? null"
                :participant-name="t.name"
                :participant-pfp="t.pfp"
                :participant-id="t.id"
                :is-local="t.isLocal"
                :is-focused="focusedStreamParticipantId === t.id"
                :mirror-video="t.isLocal && props.mirrorLocalCamera !== false"
                :remote-stream-volume-control="remoteStreamVolumeEnabled(t.id)"
                :remote-stream-volume-percent="remoteStreamVolumePercent(t.id)"
                @request-focus="focusedStreamParticipantId = t.id"
                @request-fullscreen="handleRequestFullscreen(t.id)"
                @remote-stream-volume-change="
                  (v) => onRemoteStreamVolume(t.id, v)
                "
                @remote-video-playback-wired="onRemoteVideoPlaybackWired"
                @auto-stream-layer-quality="handleStreamTileAutoQuality"
                @manual-stream-layer-quality="handleStreamTileManualQuality"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Context menu -->
    <Teleport to="body">
      <div
        v-if="vcModerationTarget && vcModerationTarget.id !== currentUserId"
        ref="vcMenuRef"
        class="call-vc-menu fixed z-[300] min-w-[200px] rounded-lg border border-border bg-[var(--echo-menu-bg)] py-1 shadow-xl"
        :style="{ left: `${vcMenuPos.left}px`, top: `${vcMenuPos.top}px` }"
        role="menu"
        @click.stop
        @mousedown.stop
      >
        <div
          v-if="canQuickMentionFromCallMenu"
          class="border-b border-border px-2 py-1"
        >
          <button
            type="button"
            class="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-indigo-500/15"
            role="menuitem"
            :title="
              'Insert @' +
              (vcModerationTarget?.name ?? '') +
              ' in the message box'
            "
            @click="mentionParticipantFromCallMenu"
          >
            <span
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-500/20 text-[13px] font-bold text-indigo-200"
              aria-hidden="true"
              >@</span
            >
            <span class="flex min-w-0 flex-col gap-0.5">
              <span class="font-semibold leading-tight">Quick mention</span>
              <span class="text-[11px] leading-snug text-fg-subtle"
                >Adds to your message input</span
              >
            </span>
          </button>
        </div>
        <div
          v-if="callMenuHasVolumeControl()"
          class="border-b border-border px-3 py-2"
          :class="{ 'border-t border-border': canQuickMentionFromCallMenu }"
          @pointerdown.stop
        >
          <div
            class="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle"
          >
            <img
              :src="icons.volumeUp"
              alt=""
              class="app-inline-icon h-3.5 w-3.5 opacity-80"
            />
            Their volume
          </div>
          <div class="mt-2 flex items-center gap-2">
            <input
              type="range"
              class="call-vc-menu-volume-range h-1.5 min-w-0 flex-1 cursor-pointer accent-violet-400"
              min="0"
              max="200"
              :value="vcMenuVolumeDraft"
              aria-label="Participant volume"
              @input="onCallMenuVolumeInput"
            />
            <span
              class="w-9 shrink-0 text-right text-[11px] tabular-nums text-fg-soft"
              >{{ Math.round(vcMenuVolumeDraft) }}%</span
            >
          </div>
        </div>
        <template
          v-if="
            vcModerationTarget &&
            (vcModerationTarget.video || vcModerationTarget.streaming)
          "
        >
          <div
            class="border-b border-border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle"
          >
            Stream quality
          </div>
          <button
            v-for="sq in STREAM_QUALITY_ORDER"
            :key="sq"
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
            :class="
              callMenuStreamQuality === sq
                ? 'bg-indigo-500/10 text-indigo-300'
                : 'text-gray-200 hover:bg-glass-hover'
            "
            role="menuitem"
            @click="selectCallMenuStreamQuality(sq)"
          >
            <span
              class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border"
              :class="
                callMenuStreamQuality === sq
                  ? 'border-indigo-400 bg-indigo-500'
                  : 'border-border bg-transparent'
              "
            >
              <span
                v-if="callMenuStreamQuality === sq"
                class="block h-1.5 w-1.5 rounded-full bg-white"
              />
            </span>
            {{ STREAM_QUALITY_LABELS[sq] }}
          </button>
        </template>
        <template v-if="vcModSectionVisible(vcModerationTarget.id)">
          <div
            v-if="
              canQuickMentionFromCallMenu ||
              callMenuHasVolumeControl() ||
              !!(vcModerationTarget.video || vcModerationTarget.streaming)
            "
            class="my-1 h-px bg-glass-2"
            role="separator"
          />
          <div
            class="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-red-300/90"
          >
            Moderation
          </div>
          <button
            v-if="vcModAllowed(vcModerationTarget.id, 'serverMute')"
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-200 hover:bg-red-500/15"
            role="menuitem"
            @click="emitVcModerate('serverMute', vcModerationTarget.id)"
          >
            <img
              :src="icons.mic"
              alt=""
              class="app-inline-icon h-4 w-4 opacity-80"
            />
            {{
              vcModerationTarget.serverMuted ? 'Unmute member' : 'Mute member'
            }}
          </button>
          <button
            v-if="vcModAllowed(vcModerationTarget.id, 'serverDeafen')"
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-200 hover:bg-red-500/15"
            role="menuitem"
            @click="emitVcModerate('serverDeafen', vcModerationTarget.id)"
          >
            <img
              :src="icons.headphones"
              alt=""
              class="app-inline-icon h-4 w-4 opacity-80"
            />
            {{
              vcModerationTarget.serverDeafened
                ? 'Undeafen member'
                : 'Deafen member'
            }}
          </button>
          <button
            v-if="vcModAllowed(vcModerationTarget.id, 'disconnect')"
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-200 hover:bg-red-500/15"
            role="menuitem"
            @click="emitVcModerate('disconnect', vcModerationTarget.id)"
          >
            <svg
              class="h-4 w-4 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
              />
            </svg>
            Disconnect
          </button>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.call-header-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.call-tile--dm-pending {
  opacity: 0.82;
}

.call-participants-shell {
  container-type: inline-size;
  container-name: call;
}

/* ========== AUDIO-ONLY VOICE WIDGET - MODERN STAGE LAYOUT ========== */

/*
 * Solo: flex-centered card. Multi: responsive grid so tiles grow with the voice
 * column (compact) instead of staying capped ~220px with empty margins.
 */
.call-audio-only-gallery--grid {
  gap: 12px;
  padding: 12px;
  min-height: 0;
}

.call-audio-only-gallery--grid.call-audio-only-gallery--solo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  align-content: center;
  justify-content: center;
  min-height: 100%;
}

.call-audio-only-gallery--solo .call-tile {
  flex: 0 0 auto;
  width: min(360px, 70vw);
  max-width: 400px;
  aspect-ratio: 16 / 9;
}

.call-audio-only-gallery--solo .call-tile-name {
  font-size: 14px;
}

.call-audio-only-gallery--grid:not(.call-audio-only-gallery--solo) {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 10.25rem), 1fr));
  align-content: center;
  justify-items: stretch;
  align-items: stretch;
}

.call-audio-only-gallery--grid:not(.call-audio-only-gallery--solo) .call-tile {
  width: 100%;
  max-width: none;
  min-width: 0;
}

@container call (min-width: 480px) {
  .call-audio-only-gallery--grid:not(.call-audio-only-gallery--solo) {
    gap: 14px;
    padding: 14px;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
  }
}

@container call (min-width: 720px) {
  .call-audio-only-gallery--grid:not(.call-audio-only-gallery--solo) {
    gap: 16px;
    padding: 16px;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 11.75rem), 1fr));
  }
}

/* ========== PARTICIPANT TILE ========== */

.call-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 0;
  padding: 0;
  border-radius: 16px;
  background: color-mix(in srgb, var(--surface, #1e1f22) 85%, transparent);
  border: 1.5px solid rgba(255, 255, 255, 0.06);
  box-shadow:
    0 2px 12px rgba(0, 0, 0, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  transition:
    transform 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  position: relative;
}

.call-tile:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.14);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.call-tile--speaking {
  border-color: #3ba55d !important;
  box-shadow:
    0 0 0 1px #3ba55d,
    0 0 16px rgba(59, 165, 93, 0.4),
    0 8px 24px rgba(0, 0, 0, 0.45) !important;
}

.call-tile--self {
  border-color: rgba(59, 165, 93, 0.4);
}

/* Blurred pfp fills the whole card as background */
.call-tile-backdrop {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: blur(28px) saturate(1.4) brightness(0.55);
  transform: scale(1.1);
  z-index: 0;
  pointer-events: none;
}

/* Gradient scrim over the backdrop so the avatar + name read clearly */
.call-tile::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: inherit;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.08) 0%,
    rgba(0, 0, 0, 0.18) 40%,
    rgba(0, 0, 0, 0.62) 75%,
    rgba(0, 0, 0, 0.82) 100%
  );
  pointer-events: none;
}

[data-theme='light'] .call-tile::after {
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.04) 0%,
    rgba(0, 0, 0, 0.12) 40%,
    rgba(0, 0, 0, 0.5) 75%,
    rgba(0, 0, 0, 0.72) 100%
  );
}

/* All tile children sit above scrim */
.call-tile > *:not(.call-tile-backdrop) {
  position: relative;
  z-index: 2;
}

/* ========== AVATAR WITH SPEAKING RING ========== */

/*
 * ring-host is always sized to --call-avatar-size so the box-shadow ring and
 * the deafen overlay (inset: 0 inside ring-host) always align with the avatar.
 */
.call-avatar-ring-host {
  position: relative;
  border-radius: 50%;
  line-height: 0;
  transition: box-shadow 0.12s ease-out;
  /* Default size (solo / rail) — overridden per context below */
  width: var(--call-avatar-size, 72px);
  height: var(--call-avatar-size, 72px);
  flex-shrink: 0;
}

/* Avatar button / wrap always fills ring-host exactly */
.call-audio-circle-avatar-wrap,
.call-audio-circle-avatar-btn {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  overflow: hidden;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

/* Multi-participant grid: avatars scale with the wider tiles */
.call-audio-only-gallery--grid:not(.call-audio-only-gallery--solo) .call-tile {
  --call-avatar-size: clamp(48px, 16cqw, 96px);
}

/* compact speaking ring with glow */
.call-avatar-speaking-ring {
  --speak-strength: 0.4;
  --ring-color: #3ba55d;
  --glow-color: rgba(59, 165, 93, 0.5);

  box-shadow:
    0 0 0 3px
      color-mix(
        in srgb,
        var(--ring-color) calc(var(--speak-strength) * 100%),
        transparent
      ),
    0 0 calc(8px + var(--speak-strength) * 16px) var(--glow-color),
    0 0 calc(16px + var(--speak-strength) * 24px)
      color-mix(
        in srgb,
        var(--glow-color) calc(var(--speak-strength) * 60%),
        transparent
      );
}

[data-theme='light'] .call-avatar-speaking-ring {
  --ring-color: #248045;
  --glow-color: rgba(36, 128, 69, 0.4);
}

/* Stronger glow for solo view */
.call-audio-only-gallery--solo .call-avatar-speaking-ring {
  box-shadow:
    0 0 0 4px
      color-mix(
        in srgb,
        var(--ring-color) calc(var(--speak-strength) * 100%),
        transparent
      ),
    0 0 calc(12px + var(--speak-strength) * 24px) var(--glow-color),
    0 0 calc(24px + var(--speak-strength) * 36px)
      color-mix(
        in srgb,
        var(--glow-color) calc(var(--speak-strength) * 70%),
        transparent
      );
}

/* ========== NAME & STATUS ========== */

.call-tile-name {
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
  letter-spacing: 0.01em;
}

.call-tile-avatar-area {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  width: 100%;
  padding-top: 6px;
}

/* Solo: larger avatar */
.call-audio-only-gallery--solo .call-tile {
  --call-avatar-size: clamp(72px, 18cqw, 116px);
}

.call-audio-circle-avatar {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.call-tile-bottom {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 4px 10px 8px;
}

.call-tile-activity-badges {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 2;
}

.call-tile-dm-pill {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 2;
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--fg);
  background: color-mix(
    in srgb,
    var(--scrim-2, rgba(0, 0, 0, 0.55)) 100%,
    transparent
  );
  backdrop-filter: blur(4px);
}

/* ----- Compact rail variant (under the Meet-style stage) ----- */

.call-tile--rail {
  --call-tile-w: 10rem;
  --call-tile-pad: 10px;
  --call-tile-radius: 12px;
  width: var(--call-tile-w);
  max-width: var(--call-tile-w);
  flex: 0 0 var(--call-tile-w);
  aspect-ratio: 16 / 9;
  border-radius: var(--call-tile-radius);
  opacity: 0.85;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease,
    opacity 0.18s ease;
}

/* Meet stage: more people → slightly wider tiles in the horizontal rail. */
.call-participant-rail--expanded-voice-rail .call-tile--rail {
  --call-tile-w: clamp(9.5rem, 28cqw, 11.75rem);
  --call-avatar-size: clamp(2.25rem, 17cqw, 3rem);
}

.call-tile--rail:hover,
.call-tile--rail:focus-within {
  opacity: 1;
}

.call-tile--rail {
  --call-avatar-size: 2.75rem;
}

.call-tile--rail .call-tile-avatar-area {
  padding: 2px 0 4px;
}

.call-tile--rail .call-tile-bottom {
  padding: 2px 6px 6px;
}

.call-tile--rail .call-tile-name {
  font-size: 11px;
}

.call-tile--rail .call-indicator-icon {
  width: 10px;
  height: 10px;
}

.call-tile--rail .call-tile-activity-badges {
  top: 4px;
  right: 4px;
}

.call-tile--rail .call-tile-dm-pill {
  top: 4px;
  left: 4px;
  font-size: 8px;
  padding: 1px 4px;
}

.call-participants-shell--meet-stage {
  .call-participant-rail {
    border: 1px solid transparent;
    border-radius: 0.9rem;
    background: color-mix(in srgb, #0b0a10 72%, transparent);
  }
}

[data-theme='light']
  .call-participants-shell--meet-stage
  .call-participant-rail {
  background: color-mix(in srgb, var(--surface, #f4f4f5) 88%, transparent);
}

[data-theme='light'] .call-tile--rail {
  box-shadow: none;
  border-color: color-mix(in srgb, var(--border) 65%, transparent);
}

.call-participant-rail-media-tile :deep(.stream-video-tile__loading) {
  padding: 0;
}

.call-participant-rail-media-tile
  :deep(.stream-video-tile__loading .relative img),
.call-participant-rail-media-tile :deep(.stream-video-tile__loading .relative) {
  height: 100%;
  width: 100%;
  max-height: 100%;
  max-width: 100%;
}

.call-participant-rail-media-tile :deep(.stream-video-tile__loading img) {
  height: 100% !important;
  width: 100% !important;
  max-height: none !important;
  max-width: none !important;
  border-radius: 0.75rem;
}

.call-tile-indicators {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  pointer-events: none;
}

.call-audio-circle .call-tile-indicators {
  margin-left: 0;
  justify-content: center;
}

.call-indicator-icon {
  width: 14px;
  height: 14px;
  filter: invert(1);
}

.call-indicator-icon-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.call-indicator-icon-wrap--server {
  color: salmon;

  .call-indicator-icon {
    filter: invert(48%) sepia(85%) saturate(2200%) hue-rotate(325deg)
      brightness(1.05);
  }
}

.call-indicator-strike {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 140%;
  height: 1.5px;
  background: currentColor;
  opacity: 0.9;
  transform: translate(-50%, -50%) rotate(-45deg);
  border-radius: 1px;
  pointer-events: none;
}

/* Deafen overlay — absolute inside call-avatar-ring-host, which matches avatar size */
.call-avatar-badge {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3;
}

.call-avatar-badge-bg {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: color-mix(in srgb, black 65%, transparent);
}

.call-avatar-badge-icon {
  position: relative;
  /* Scale icon relative to avatar size so it looks right at any size */
  width: clamp(16px, 40%, 28px);
  height: clamp(16px, 40%, 28px);
  filter: invert(1);
}

.call-avatar-badge--server {
  .call-avatar-badge-bg {
    background: color-mix(in srgb, crimson 50%, transparent);
  }

  .call-avatar-badge-icon {
    filter: invert(48%) sepia(85%) saturate(2200%) hue-rotate(325deg)
      brightness(1.08);
  }
}
</style>

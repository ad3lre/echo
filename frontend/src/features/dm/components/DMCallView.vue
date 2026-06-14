<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  inject,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type Ref,
} from 'vue';
import { storeToRefs } from 'pinia';
import { icons } from '@/assets/icons';
import { resolveCallTileAvatarUrl } from '@/utils/avatarDisplay';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import CallRingtoneControls from '@/features/voice/components/CallRingtoneControls.vue';
import QuarterCallMediaBadges from '@/features/layout/components/QuarterCallMediaBadges.vue';
import { quarterCallMediaBadgesTitle } from '@/features/voice/voiceIndicatorHints';
import { useCallRingtoneStore } from '@/stores/callRingtone';
import { clampMenuToViewport } from '@/features/chat/composables/useContextMenuPosition';
import type { PopoutAnchorRect } from '@/utils/memberProfiles';
import {
  COMPOSER_INSERT_USER_MENTION_KEY,
  type InsertUserMentionFn,
} from '@/features/chat/chatComposerContext';

const CallView = defineAsyncComponent(
  () => import('@/features/voice/components/CallView.vue'),
);

const props = withDefaults(
  defineProps<{
    partnerName: string;
    partnerPfp: string;
    partnerId: string;
    currentUserName: string;
    currentUserPfp: string;
    currentUserId: string;
    muted: boolean;
    deafened: boolean;
    video?: boolean;
    incoming?: boolean;
    /** Optional: show "Calling..." state (ringing). */
    ringing?: boolean;
    /** Amber ring / pulse chrome without implying ringtone (e.g. lobby after self-leave). */
    ringUiChrome?: boolean;
    /** Disconnected locally while the call is still active for others. */
    lobbyAwaitingRejoin?: boolean;
    /** Timed-out ring: peer avatar vanishes before auto hangup. */
    ringRemoteVanishing?: boolean;
    /** When true, full view; when false, quarter view (compact) with chat beside. */
    fullscreen?: boolean;
    /** Pre-accept signaling (`ringing`); false during post-accept ringback / wait music. */
    dmCallAwaitingAccept?: boolean;
    /** Optional: group call participants to show visually (for group DMs). */
    groupMembers?: { id: string; name: string; pfp: string }[];
    /** LiveKit-backed rows for camera / screen tiles (guild CallView parity). */
    callViewParticipants?: {
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
      dmCallPresence?: 'live' | 'ringing' | 'connecting' | 'declined';
    }[];
    remoteParticipants?: Map<string, unknown>;
    lkRoom?: unknown;
    mirrorLocalCamera?: boolean;
    getLocalScreenTrack?: () => unknown;
    getLocalCameraTrack?: () => unknown;
    getRemoteParticipantVolume?: (userId: string) => number;
    setRemoteParticipantVolume?: (
      userId: string,
      volumePercent: number,
    ) => void;
    onRequestFullscreenStream?: (participantId: string) => void;
    /**
     * Opens member profile popout (same as guild `CallView` / message avatars).
     * Without this, audio-grid avatar clicks do not open a profile in DM calls.
     */
    onOpenProfile?: (
      userId: string,
      anchorRect: PopoutAnchorRect | null,
    ) => void;
    screenshare?: boolean;
    /** Guests cannot answer (no LiveKit); Decline remains available. */
    canAnswerIncomingCall?: boolean;
    /**
     * Quarter DM call with chrome in AppLayoutChatHeader — hide header / ringtone strip /
     * bottom controls here so Answer / VC / ringtone are not duplicated.
     */
    suppressQuarterGlassCallChrome?: boolean;
    /** Opens user Settings focused on Voice & Video. */
    onOpenVoiceAudioSettings?: () => void;
  }>(),
  {
    ringing: false,
    ringUiChrome: false,
    lobbyAwaitingRejoin: false,
    incoming: false,
    ringRemoteVanishing: false,
    fullscreen: false,
    dmCallAwaitingAccept: false,
    video: false,
    groupMembers: () => [],
    callViewParticipants: () => [],
    screenshare: false,
    canAnswerIncomingCall: true,
    suppressQuarterGlassCallChrome: false,
  },
);

const suppressQuarterDuplicateChrome = computed(
  () => props.suppressQuarterGlassCallChrome && !props.fullscreen,
);

const callParticipantById = computed(
  () => new Map((props.callViewParticipants ?? []).map((p) => [p.id, p])),
);

/** Quarter / beside-chat call: avatar-level mute & deafen (parity with full-screen CallView tiles). */
function dmCallQuarterBadgesForUser(
  userId: string,
  isLocalSelf: boolean,
): { showDeafened: boolean; showMutedOnly: boolean } {
  if (isLocalSelf) {
    if (props.deafened) return { showDeafened: true, showMutedOnly: false };
    if (props.muted) return { showDeafened: false, showMutedOnly: true };
    return { showDeafened: false, showMutedOnly: false };
  }
  const r = callParticipantById.value.get(userId);
  if (!r) return { showDeafened: false, showMutedOnly: false };
  if ((r.dmCallPresence ?? 'live') !== 'live') {
    return { showDeafened: false, showMutedOnly: false };
  }
  if (r.serverDeafened || r.deafened) {
    return { showDeafened: true, showMutedOnly: false };
  }
  if (r.serverMuted || r.muted) {
    return { showDeafened: false, showMutedOnly: true };
  }
  return { showDeafened: false, showMutedOnly: false };
}

const dmQuarterPeerBadges = computed(() =>
  dmCallQuarterBadgesForUser(props.partnerId, false),
);

function dmQuarterAvatarMediaTitle(
  userId: string,
  isLocalSelf: boolean,
): string | undefined {
  return quarterCallMediaBadgesTitle(
    dmCallQuarterBadgesForUser(userId, isLocalSelf),
  );
}

const dmQuarterMediaBadgeDensity = computed(() =>
  props.fullscreen ? ('default' as const) : ('comfortable' as const),
);

const partnerPfpDisplay = computed(() =>
  resolveCallTileAvatarUrl(props.partnerPfp, props.partnerId),
);
const selfPfpDisplay = computed(() =>
  resolveCallTileAvatarUrl(props.currentUserPfp, props.currentUserId),
);

function memberPfpForCall(pfp: string, id: string) {
  return resolveCallTileAvatarUrl(pfp, id);
}

const emit = defineEmits<{
  leave: [];
  rejoin: [];
  accept: [];
  decline: [];
  'toggle-mute': [];
  'toggle-deafen': [];
  'toggle-video': [];
  'toggle-screenshare': [];
  'toggle-fullscreen': [];
}>();

function exitFullscreen() {
  emit('toggle-fullscreen');
}

function onEscapeKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  if (!props.fullscreen) return;
  e.preventDefault();
  exitFullscreen();
}

const ringVisualActive = computed(
  () => (props.ringing || props.ringUiChrome) && !props.ringRemoteVanishing,
);

const headerTitle = computed(() => {
  if (props.ringRemoteVanishing) return 'No answer';
  if (props.lobbyAwaitingRejoin) return `Call active · ${props.partnerName}`;
  if (props.incoming && props.ringing)
    return `Incoming call from ${props.partnerName}`;
  if (props.ringing) return `Calling ${props.partnerName}…`;
  if (props.fullscreen) return `In a call with ${props.partnerName}`;
  return props.partnerName;
});

const peerRingClasses = computed(() => ({
  'dm-call-peer-visual--ring': ringVisualActive.value,
  'dm-call-peer-visual--vanish': props.ringRemoteVanishing,
}));

const showLiveKitMediaGrid = computed(() => {
  if (props.ringRemoteVanishing) return false;
  if (props.lobbyAwaitingRejoin) return false;
  if ((props.callViewParticipants?.length ?? 0) === 0) return false;
  // After accept, show the same LiveKit tile grid as guild VC even while ringback / wait music is active.
  if (props.dmCallAwaitingAccept) return false;
  return true;
});

const controlsAutoHideEnabled = computed(
  () =>
    showLiveKitMediaGrid.value &&
    !suppressQuarterDuplicateChrome.value &&
    !props.lobbyAwaitingRejoin &&
    !(props.incoming && props.ringing),
);
const controlsVisible = ref(true);
const controlsEngagedByFocus = ref(false);
/** Hovering directly over the dock pins it open (regardless of the surface mouseleave that fires when the
 * cursor crosses from `.dm-call-main` into its absolutely-positioned sibling). Without this pin the dock
 * starts to fade as soon as the pointer reaches it, then falls back through once `pointer-events: none`
 * lands → re-shows → fade loop = visible jitter. */
const controlsEngagedByHover = ref(false);
const controlsRevealMs = computed(() => (props.fullscreen ? 2200 : 1800));
const controlsHideMs = computed(() => (props.fullscreen ? 2400 : 1800));
let controlsHideTimer: ReturnType<typeof setTimeout> | null = null;

function clearControlsHideTimer() {
  if (!controlsHideTimer) return;
  clearTimeout(controlsHideTimer);
  controlsHideTimer = null;
}

function controlsPinned() {
  return controlsEngagedByFocus.value || controlsEngagedByHover.value;
}

function showControlsThenMaybeHide() {
  if (!controlsAutoHideEnabled.value) {
    controlsVisible.value = true;
    clearControlsHideTimer();
    return;
  }
  controlsVisible.value = true;
  clearControlsHideTimer();
  if (controlsPinned()) return;
  controlsHideTimer = setTimeout(() => {
    controlsVisible.value = false;
    controlsHideTimer = null;
  }, controlsHideMs.value);
}

function onCallSurfaceMouseMove() {
  showControlsThenMaybeHide();
}

function onCallSurfaceMouseEnter() {
  showControlsThenMaybeHide();
}

function onCallSurfaceMouseLeave() {
  if (!controlsAutoHideEnabled.value || controlsPinned()) return;
  clearControlsHideTimer();
  controlsHideTimer = setTimeout(() => {
    if (controlsPinned()) return;
    controlsVisible.value = false;
    controlsHideTimer = null;
  }, 420);
}

function onCallSurfaceTap() {
  showControlsThenMaybeHide();
}

function onControlsFocusIn() {
  controlsEngagedByFocus.value = true;
  controlsVisible.value = true;
  clearControlsHideTimer();
}

function onControlsFocusOut(event: FocusEvent) {
  const next = event.relatedTarget as Node | null;
  const current = event.currentTarget as HTMLElement | null;
  if (current && next && current.contains(next)) return;
  controlsEngagedByFocus.value = false;
  showControlsThenMaybeHide();
}

function onControlsMouseEnter() {
  controlsEngagedByHover.value = true;
  controlsVisible.value = true;
  clearControlsHideTimer();
}

function onControlsMouseLeave() {
  controlsEngagedByHover.value = false;
  showControlsThenMaybeHide();
}

watch(
  controlsAutoHideEnabled,
  (enabled) => {
    clearControlsHideTimer();
    controlsVisible.value = true;
    if (!enabled) return;
    controlsHideTimer = setTimeout(() => {
      if (!controlsPinned()) controlsVisible.value = false;
      controlsHideTimer = null;
    }, controlsRevealMs.value);
  },
  { immediate: true },
);

/** Compact self tile when the call is beside chat (not the embedded LiveKit grid). */
const showDmQuarterSelfPip = computed(() => {
  if (props.fullscreen || showLiveKitMediaGrid.value) return false;
  if (props.lobbyAwaitingRejoin || props.ringRemoteVanishing) return false;
  if (props.incoming && props.ringing && !props.dmCallAwaitingAccept) {
    return false;
  }
  return true;
});

/**
 * Quarter + `suppressQuarterGlassCallChrome`: controls + avatars live in AppLayoutChatHeader (ringing-style).
 * Do not reserve a second CallView column under chat — use full screen for the LiveKit grid.
 */
const showQuarterEmbeddedMain = computed(
  () => !suppressQuarterDuplicateChrome.value,
);

/** Without this, `flex-1` competes with chat and reserves ~half the column for an empty shell. */
const dmCallRootFillsColumn = computed(
  () => props.fullscreen || !suppressQuarterDuplicateChrome.value,
);

const ringtoneStore = useCallRingtoneStore();
const {
  selectedEntry,
  volumePercent,
  muted: ringtoneMuted,
  ringtoneCanStepBack,
  ringtoneCanStepForward,
} = storeToRefs(ringtoneStore);
const showInlineRingtonePlayer = computed(() => {
  if (suppressQuarterDuplicateChrome.value) return false;
  return !props.fullscreen && props.ringing && !props.ringRemoteVanishing;
});
const showFullscreenRingtoneControl = computed(() => {
  if (!props.fullscreen) return false;
  if (props.lobbyAwaitingRejoin) return false;
  if (props.ringRemoteVanishing) return false;
  // Only show ringtone controls in pre-join/ringing phases, not active in-call.
  return props.ringing || props.dmCallAwaitingAccept || props.ringUiChrome;
});

function onRingtoneVolumeInput(e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  if (!Number.isFinite(v)) return;
  ringtoneStore.setVolumePercent(v);
}

/** Shown in header (aligned with server CallView participant count). */
const peopleSummary = computed(() => {
  if (props.ringing || props.ringUiChrome || props.ringRemoteVanishing)
    return '';
  const rows = props.callViewParticipants ?? [];
  const live = rows.filter(
    (p) => !p.dmCallPresence || p.dmCallPresence === 'live',
  ).length;
  const pending = rows.length - live;
  if (rows.length > 0) {
    if (pending > 0 && live > 0) {
      return `${live} in call · ${pending} pending`;
    }
    if (pending > 0) {
      return `${pending} pending`;
    }
    return `${live} ${live === 1 ? 'person' : 'people'}`;
  }
  const g = props.groupMembers?.length ?? 0;
  const n = g > 0 ? g + 1 : 2;
  return `${n} ${n === 1 ? 'person' : 'people'}`;
});

const hasDmPeerVolumeControl = computed(
  () => typeof props.setRemoteParticipantVolume === 'function',
);

const composerInsertUserMention =
  inject<Ref<InsertUserMentionFn | null> | null>(
    COMPOSER_INSERT_USER_MENTION_KEY,
    null,
  );

const dmPfpMenuCanComposerMention = computed(
  () => !!composerInsertUserMention?.value,
);

function dmPfpContextMenuCanOpen(remoteUserId: string): boolean {
  const id = remoteUserId?.trim();
  if (!id || id === props.currentUserId) return false;
  return hasDmPeerVolumeControl.value || dmPfpMenuCanComposerMention.value;
}

type DmPfpVolumeTarget = { id: string; name: string };
const dmPfpVolumeMenuTarget = ref<DmPfpVolumeTarget | null>(null);
const dmPfpVolumeMenuPos = ref({ left: 0, top: 0 });
const dmPfpVolumeMenuRef = ref<HTMLElement | null>(null);
const dmPfpVolumeMenuDraft = ref(100);
const dmPfpVolumeLastNonZero = ref(100);

const dmPfpVolumeMenuShowMention = computed(() => {
  const t = dmPfpVolumeMenuTarget.value;
  if (!t?.id || !composerInsertUserMention?.value) return false;
  return t.id !== props.currentUserId;
});

function closeDmPfpVolumeMenu() {
  dmPfpVolumeMenuTarget.value = null;
}

function openDmPfpVolumeMenu(target: DmPfpVolumeTarget, e: MouseEvent) {
  const id = target.id?.trim();
  if (!id || id === props.currentUserId) return;
  if (!dmPfpContextMenuCanOpen(id)) return;
  e.preventDefault();
  e.stopPropagation();
  if (hasDmPeerVolumeControl.value) {
    const getVol = props.getRemoteParticipantVolume;
    const vol = getVol?.(id) ?? 100;
    dmPfpVolumeMenuDraft.value = vol;
    if (vol > 0) dmPfpVolumeLastNonZero.value = vol;
  }
  dmPfpVolumeMenuTarget.value = {
    id,
    name: target.name?.trim() || 'Participant',
  };
  dmPfpVolumeMenuPos.value = clampMenuToViewport(
    e.clientX,
    e.clientY,
    220,
    180,
  );
  void nextTick(() => {
    requestAnimationFrame(() => {
      const el = dmPfpVolumeMenuRef.value;
      if (!el) return;
      const r = el.getBoundingClientRect();
      dmPfpVolumeMenuPos.value = clampMenuToViewport(
        r.left,
        r.top,
        r.width,
        r.height,
      );
    });
  });
}

function onDmPfpVolumeMenuPointerDownOutside(e: MouseEvent) {
  const root = dmPfpVolumeMenuRef.value;
  if (root) {
    const path = e.composedPath();
    if (path.includes(root)) return;
    for (const n of path) {
      if (n instanceof Node && root.contains(n)) return;
    }
  }
  closeDmPfpVolumeMenu();
}

function onDmPfpVolumeInput(ev: Event) {
  const t = dmPfpVolumeMenuTarget.value;
  const setVol = props.setRemoteParticipantVolume;
  if (!t || !setVol) return;
  const next = Number((ev.target as HTMLInputElement).value);
  if (!Number.isFinite(next)) return;
  dmPfpVolumeMenuDraft.value = next;
  if (next > 0) dmPfpVolumeLastNonZero.value = next;
  setVol(t.id, next);
}

function toggleDmPfpVolumeMuteForMe() {
  const t = dmPfpVolumeMenuTarget.value;
  const setVol = props.setRemoteParticipantVolume;
  if (!t || !setVol) return;
  if (dmPfpVolumeMenuDraft.value <= 0) {
    const next =
      dmPfpVolumeLastNonZero.value > 0 ? dmPfpVolumeLastNonZero.value : 100;
    dmPfpVolumeMenuDraft.value = next;
    setVol(t.id, next);
    return;
  }
  dmPfpVolumeLastNonZero.value = dmPfpVolumeMenuDraft.value;
  dmPfpVolumeMenuDraft.value = 0;
  setVol(t.id, 0);
}

const dmPfpVolumeMenuMuted = computed(
  () => dmPfpVolumeMenuDraft.value <= 0 && !!dmPfpVolumeMenuTarget.value,
);

function onGroupMemberPfpContextMenu(
  member: { id: string; name: string },
  e: MouseEvent,
) {
  if (member.id === props.currentUserId) return;
  if (!dmPfpContextMenuCanOpen(member.id)) return;
  openDmPfpVolumeMenu({ id: member.id, name: member.name }, e);
}

function onPartnerPfpContextMenu(e: MouseEvent) {
  if (props.partnerId === props.currentUserId) return;
  if (!dmPfpContextMenuCanOpen(props.partnerId)) return;
  openDmPfpVolumeMenu({ id: props.partnerId, name: props.partnerName }, e);
}

function mentionFromDmPfpVolumeMenu() {
  const t = dmPfpVolumeMenuTarget.value;
  const fn = composerInsertUserMention?.value;
  if (!t?.id || !fn) return;
  closeDmPfpVolumeMenu();
  fn({ userId: t.id, displayName: t.name?.trim() || 'user' });
}

watch(
  () => {
    const t = dmPfpVolumeMenuTarget.value;
    if (!t || !props.getRemoteParticipantVolume) return null;
    return props.getRemoteParticipantVolume(t.id);
  },
  (v) => {
    if (
      typeof v === 'number' &&
      Number.isFinite(v) &&
      dmPfpVolumeMenuTarget.value
    ) {
      dmPfpVolumeMenuDraft.value = v;
    }
  },
);

onMounted(() => {
  window.addEventListener('keydown', onEscapeKey, true);
  document.addEventListener(
    'mousedown',
    onDmPfpVolumeMenuPointerDownOutside,
    true,
  );
});
onUnmounted(() => {
  window.removeEventListener('keydown', onEscapeKey, true);
  document.removeEventListener(
    'mousedown',
    onDmPfpVolumeMenuPointerDownOutside,
    true,
  );
  clearControlsHideTimer();
});
</script>

<template>
  <div
    class="call-view dm-call-view flex min-h-0 min-w-0 flex-col overflow-hidden bg-bg"
    :class="[
      { 'dm-call-view--quarter': !fullscreen },
      dmCallRootFillsColumn ? 'flex-1' : 'shrink-0',
      fullscreen ? 'h-full min-h-0' : '',
    ]"
  >
    <!-- Match server CallView header: dot, title (truncates), actions always visible -->
    <div
      v-if="!suppressQuarterDuplicateChrome"
      class="call-header flex min-w-0 shrink-0 items-center gap-3"
      :class="fullscreen ? 'px-5 pb-2 pt-5' : 'gap-2 px-3 pb-1.5 pt-2'"
    >
      <div
        class="call-header-dot h-2 w-2 shrink-0 rounded-full"
        :class="
          ringRemoteVanishing
            ? 'bg-muted'
            : ringing || ringUiChrome || lobbyAwaitingRejoin
              ? 'animate-pulse bg-amber-400'
              : 'bg-emerald-500'
        "
      />
      <div class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <span
          class="min-w-0 truncate font-semibold text-foreground"
          :class="fullscreen ? 'text-[15px]' : 'text-sm'"
        >
          {{ headerTitle }}
        </span>
        <span
          v-if="peopleSummary"
          class="shrink-0 tabular-nums text-xs text-muted"
        >
          {{ peopleSummary }}
        </span>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <button
          type="button"
          class="call-dm-fs-btn rounded-md p-1.5 text-muted transition-colors hover:bg-glass-tint hover:text-foreground"
          :title="fullscreen ? 'Exit full screen' : 'Full screen'"
          :aria-label="fullscreen ? 'Exit full screen' : 'Full screen'"
          @click="emit('toggle-fullscreen')"
        >
          <svg
            v-if="fullscreen"
            class="h-4 w-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"
            />
          </svg>
          <svg
            v-else
            class="h-4 w-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"
            />
          </svg>
        </button>
      </div>
    </div>

    <div
      v-if="showInlineRingtonePlayer"
      class="dm-call-ringtone-subheader mx-2 mb-2 shrink-0 rounded-xl border border-border bg-glass-tint px-3 py-2"
    >
      <div class="flex items-center gap-2">
        <div class="min-w-0 flex-1">
          <p class="truncate text-[12px] font-semibold text-foreground">
            Waiting music
          </p>
          <p class="truncate text-[11px] text-muted">
            {{ selectedEntry?.label ?? 'Ringtone' }}
          </p>
        </div>
        <button
          type="button"
          class="call-vc-ctrl !h-8 !w-8 disabled:pointer-events-none disabled:opacity-35"
          :title="ringtoneCanStepBack ? 'Previous ringtone' : 'First ringtone'"
          :aria-label="
            ringtoneCanStepBack ? 'Previous ringtone' : 'First ringtone'
          "
          :disabled="!ringtoneCanStepBack"
          @click="ringtoneStore.stepRingtone(-1)"
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          class="call-vc-ctrl !h-8 !w-8"
          :class="{ 'call-vc-ctrl--on': ringtoneMuted }"
          :title="ringtoneMuted ? 'Unmute ringtone' : 'Mute ringtone'"
          aria-label="Mute ringtone"
          @click="ringtoneStore.toggleMuted()"
        >
          <img
            :src="icons.volumeUp"
            alt=""
            class="call-vc-icon h-4 w-4"
            :class="{ 'call-vc-icon--off': ringtoneMuted }"
          />
        </button>
        <button
          type="button"
          class="call-vc-ctrl !h-8 !w-8 disabled:pointer-events-none disabled:opacity-35"
          :title="ringtoneCanStepForward ? 'Next ringtone' : 'Last ringtone'"
          :aria-label="
            ringtoneCanStepForward ? 'Next ringtone' : 'Last ringtone'
          "
          :disabled="!ringtoneCanStepForward"
          @click="ringtoneStore.stepRingtone(1)"
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>
      <div class="mt-2 flex items-center gap-2">
        <span class="w-10 shrink-0 text-[10px] text-muted">Vol</span>
        <input
          type="range"
          class="call-ringtone-inline-range h-1.5 w-full cursor-pointer"
          min="0"
          max="100"
          :value="volumePercent"
          @input="onRingtoneVolumeInput"
        />
        <span
          class="w-10 shrink-0 text-right text-[10px] tabular-nums text-muted"
          >{{ volumePercent }}%</span
        >
      </div>
    </div>

    <!-- Main: LiveKit tiles when in call; ringing / vanish uses avatar layouts below -->
    <div
      v-if="showQuarterEmbeddedMain"
      class="dm-call-main flex flex-1 min-h-0 min-w-0 flex-col relative overflow-hidden"
      :class="{ 'dm-call-main--media-grid': showLiveKitMediaGrid }"
      @mousemove="onCallSurfaceMouseMove"
      @mouseenter="onCallSurfaceMouseEnter"
      @mouseleave="onCallSurfaceMouseLeave"
      @pointerdown="onCallSurfaceTap"
    >
      <CallView
        v-if="showLiveKitMediaGrid"
        class="dm-call-embedded-callview min-h-0 min-w-0 flex-1"
        :show-header="false"
        :video-primary-dm-layout="showLiveKitMediaGrid"
        :channel-name="headerTitle"
        :participants="callViewParticipants ?? []"
        :current-user-id="currentUserId"
        :remote-participants="remoteParticipants"
        :lk-room="lkRoom"
        :mirror-local-camera="mirrorLocalCamera"
        :get-local-screen-track="getLocalScreenTrack"
        :get-local-camera-track="getLocalCameraTrack"
        :get-remote-participant-volume="getRemoteParticipantVolume"
        :set-remote-participant-volume="setRemoteParticipantVolume"
        :on-request-fullscreen-stream="onRequestFullscreenStream"
        :on-open-profile="onOpenProfile"
      />
      <!-- Group call layout: show all group members as participants -->
      <div
        v-else-if="(groupMembers?.length ?? 0) > 0"
        class="dm-call-partner-tile absolute inset-0 flex flex-col items-center justify-center overflow-hidden rounded-xl border border-border bg-glass-tint p-4"
      >
        <div
          class="dm-call-tile-bg absolute inset-0 bg-cover bg-center scale-125 blur-2xl transition-opacity duration-300"
          :class="ringVisualActive ? 'opacity-[0.12]' : 'opacity-20'"
          :style="{ backgroundImage: 'url(' + partnerPfpDisplay + ')' }"
        />
        <div
          class="relative flex flex-col items-center justify-center gap-3 w-full max-w-xl"
        >
          <div class="grid grid-cols-3 gap-3 w-full max-w-md">
            <div
              v-for="member in groupMembers"
              :key="member.id"
              class="relative aspect-square overflow-hidden rounded-xl border border-border bg-glass-tint"
              :title="
                dmQuarterAvatarMediaTitle(
                  member.id,
                  member.id === currentUserId,
                )
              "
              @contextmenu="onGroupMemberPfpContextMenu(member, $event)"
            >
              <div
                class="dm-call-peer-visual h-full w-full"
                :class="peerRingClasses"
              >
                <PausedGifAvatar
                  :src="memberPfpForCall(member.pfp, member.id)"
                  :alt="member.name"
                  :session-key="member.id"
                  :force-active="ringVisualActive"
                  :static-only="!ringVisualActive"
                  img-class="rounded-2xl object-cover h-full w-full"
                />
              </div>
              <QuarterCallMediaBadges
                v-bind="
                  dmCallQuarterBadgesForUser(
                    member.id,
                    member.id === currentUserId,
                  )
                "
                :icons="icons"
                :density="dmQuarterMediaBadgeDensity"
                surface-class="rounded-xl"
              />
            </div>
          </div>
          <div class="text-center">
            <p class="dm-call-partner-name font-semibold text-foreground">
              {{ partnerName }}
            </p>
            <p class="text-xs text-muted">
              Group call with {{ groupMembers?.length }} member{{
                (groupMembers?.length ?? 0) === 1 ? '' : 's'
              }}
            </p>
            <p v-if="ringRemoteVanishing" class="mt-1 text-[11px] text-muted">
              Didn't pick up — ending call…
            </p>
            <p
              v-else-if="lobbyAwaitingRejoin"
              class="mt-1 text-[11px] text-muted"
            >
              You left — others may still be in the call.
            </p>
            <p v-else-if="ringing" class="mt-1 text-[11px] text-muted">
              Calling the whole group...
            </p>
          </div>
        </div>
      </div>
      <!-- 1:1 layout -->
      <div
        v-else
        class="dm-call-partner-tile absolute inset-0 flex flex-col items-center justify-center overflow-hidden rounded-xl border border-border bg-glass-tint p-4"
      >
        <div
          class="dm-call-tile-bg absolute inset-0 bg-cover bg-center scale-125 blur-2xl transition-opacity duration-300"
          :class="ringVisualActive ? 'opacity-[0.12]' : 'opacity-20'"
          :style="{ backgroundImage: 'url(' + partnerPfpDisplay + ')' }"
        />
        <div class="relative flex flex-col items-center justify-center gap-2">
          <div
            class="dm-call-avatar relative overflow-hidden rounded-full ring-4 ring-border"
            :title="dmQuarterAvatarMediaTitle(partnerId, false)"
            @contextmenu="onPartnerPfpContextMenu"
          >
            <div
              class="dm-call-peer-visual h-full w-full rounded-full"
              :class="peerRingClasses"
            >
              <PausedGifAvatar
                :src="partnerPfpDisplay"
                :alt="partnerName"
                :session-key="partnerId"
                :force-active="ringVisualActive"
                :static-only="!ringVisualActive"
                img-class="rounded-full object-cover"
              />
            </div>
            <QuarterCallMediaBadges
              v-bind="dmQuarterPeerBadges"
              :icons="icons"
              :density="dmQuarterMediaBadgeDensity"
            />
          </div>
          <div class="text-center">
            <p class="dm-call-partner-name font-semibold text-foreground">
              {{ partnerName }}
            </p>
            <p v-if="ringRemoteVanishing" class="text-xs text-muted">
              Didn't pick up — ending call…
            </p>
            <p v-else-if="lobbyAwaitingRejoin" class="text-xs text-muted">
              You left — tap Rejoin to return.
            </p>
            <p v-else-if="ringing" class="text-xs text-muted">
              {{
                incoming
                  ? 'Waiting for you to answer...'
                  : 'Waiting for response...'
              }}
            </p>
            <p v-else-if="fullscreen" class="text-sm text-muted">In the call</p>
            <p v-else-if="showDmQuarterSelfPip" class="text-[11px] text-muted">
              In the call
            </p>
          </div>
        </div>
      </div>
      <div
        v-if="showDmQuarterSelfPip"
        class="dm-call-self-tile dm-call-self-tile--quarter absolute bottom-4 right-4 z-10 flex flex-col items-center gap-1"
      >
        <div
          class="dm-call-self-avatar relative overflow-hidden rounded-xl ring-2 ring-border"
          :title="dmQuarterAvatarMediaTitle(currentUserId, true)"
          @contextmenu.prevent
        >
          <PausedGifAvatar
            :src="selfPfpDisplay"
            :alt="currentUserName"
            :session-key="currentUserId"
            img-class="rounded-xl object-cover h-11 w-11"
          />
          <QuarterCallMediaBadges
            v-bind="dmCallQuarterBadgesForUser(currentUserId, true)"
            :icons="icons"
            :density="dmQuarterMediaBadgeDensity"
            surface-class="rounded-xl"
          />
        </div>
        <span
          class="max-w-[88px] truncate text-[10px] font-medium text-foreground"
          >You</span
        >
        <div
          v-if="muted || deafened || !video"
          class="flex max-w-[100px] flex-wrap items-center justify-center gap-0.5 text-center text-muted"
        >
          <template v-if="muted"
            ><span class="text-[9px]">Muted</span></template
          >
          <span v-if="muted && (deafened || !video)">·</span>
          <template v-if="deafened"
            ><span class="text-[9px]">Deafened</span></template
          >
          <span v-if="deafened && !video">·</span>
          <template v-if="!video"
            ><span class="text-[9px]">Camera off</span></template
          >
        </div>
      </div>
      <div
        v-if="fullscreen && !showLiveKitMediaGrid"
        class="dm-call-self-tile absolute bottom-6 right-6 flex flex-col items-center gap-2"
      >
        <div
          class="dm-call-self-avatar overflow-hidden rounded-xl ring-2 ring-border"
          @contextmenu.prevent
        >
          <PausedGifAvatar
            :src="selfPfpDisplay"
            :alt="currentUserName"
            :session-key="currentUserId"
            img-class="rounded-xl object-cover"
          />
        </div>
        <span class="text-xs font-medium text-foreground truncate max-w-[120px]"
          >You</span
        >
        <div
          v-if="muted || deafened || !video"
          class="flex flex-wrap items-center gap-1 text-muted"
        >
          <template v-if="muted"
            ><span class="text-[10px]">Muted</span></template
          >
          <span v-if="muted && (deafened || !video)">·</span>
          <template v-if="deafened"
            ><span class="text-[10px]">Deafened</span></template
          >
          <span v-if="deafened && !video">·</span>
          <template v-if="!video"
            ><span class="text-[10px]">Camera off</span></template
          >
        </div>
      </div>
    </div>

    <!-- Control bar: same tokens as channel voice panel / VC -->
    <div
      v-if="!suppressQuarterDuplicateChrome"
      class="dm-call-controls flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-border bg-overlay-subtle px-2 py-2"
      :class="{
        'dm-call-controls--overlay': controlsAutoHideEnabled,
        'dm-call-controls--hidden': controlsAutoHideEnabled && !controlsVisible,
      }"
      @focusin="onControlsFocusIn"
      @focusout="onControlsFocusOut"
      @mouseenter="onControlsMouseEnter"
      @mouseleave="onControlsMouseLeave"
    >
      <template v-if="incoming && ringing">
        <button
          v-if="canAnswerIncomingCall"
          type="button"
          class="call-vc-accept rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-400"
          title="Answer call"
          aria-label="Answer call"
          @click="emit('accept')"
        >
          Answer
        </button>
        <button
          type="button"
          class="call-vc-leave"
          title="Decline call"
          aria-label="Decline call"
          @click="emit('decline')"
        >
          <img :src="icons.logOut" alt="" class="call-vc-icon h-5 w-5" />
        </button>
      </template>
      <template v-else-if="lobbyAwaitingRejoin">
        <button
          type="button"
          class="call-vc-accept rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-400"
          title="Rejoin voice"
          aria-label="Rejoin voice"
          @click="emit('rejoin')"
        >
          Rejoin
        </button>
        <button
          v-if="fullscreen"
          type="button"
          class="call-vc-ctrl"
          title="Exit full screen — return to chat beside the call"
          aria-label="Exit full screen"
          @click="exitFullscreen"
        >
          <svg
            class="call-vc-exit-fs-icon h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path
              d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"
            />
          </svg>
        </button>
        <button
          type="button"
          class="call-vc-leave"
          title="End call for you"
          aria-label="End call"
          @click="emit('leave')"
        >
          <img :src="icons.logOut" alt="" class="call-vc-icon h-5 w-5" />
        </button>
      </template>
      <template v-else>
        <CallRingtoneControls v-if="showFullscreenRingtoneControl" />
        <button
          type="button"
          class="call-vc-ctrl"
          :class="{
            'call-vc-ctrl--on': video,
            'call-vc-ctrl--video-on': video,
          }"
          :title="video ? 'Turn off camera' : 'Turn on camera'"
          aria-label="Video"
          @click="emit('toggle-video')"
        >
          <img :src="icons.cameraOn" alt="" class="call-vc-icon h-5 w-5" />
        </button>
        <button
          type="button"
          class="call-vc-ctrl"
          :class="{
            'call-vc-ctrl--on': screenshare,
            'call-vc-ctrl--screenshare-on': screenshare,
          }"
          :title="screenshare ? 'Stop sharing' : 'Share screen'"
          aria-label="Share screen"
          @click="emit('toggle-screenshare')"
        >
          <img :src="icons.desktop" alt="" class="call-vc-icon h-5 w-5" />
        </button>
        <button
          type="button"
          class="call-vc-ctrl"
          :class="{ 'call-vc-ctrl--on': muted }"
          :title="muted ? 'Unmute' : 'Mute'"
          aria-label="Mute"
          @click="emit('toggle-mute')"
        >
          <span class="relative inline-flex items-center justify-center">
            <img
              :src="icons.mic"
              alt=""
              class="call-vc-icon h-5 w-5"
              :class="{ 'call-vc-icon--off': muted }"
            />
            <span v-if="muted" class="call-vc-strike" aria-hidden="true" />
          </span>
        </button>
        <button
          type="button"
          class="call-vc-ctrl"
          :class="{ 'call-vc-ctrl--on': deafened }"
          :title="deafened ? 'Undeafen' : 'Deafen'"
          aria-label="Deafen"
          @click="emit('toggle-deafen')"
        >
          <span class="relative inline-flex items-center justify-center">
            <img
              :src="icons.headphones"
              alt=""
              class="call-vc-icon h-5 w-5"
              :class="{ 'call-vc-icon--off': deafened }"
            />
            <span v-if="deafened" class="call-vc-strike" aria-hidden="true" />
          </span>
        </button>
        <button
          v-if="fullscreen"
          type="button"
          class="call-vc-ctrl"
          title="Exit full screen — return to chat beside the call"
          aria-label="Exit full screen"
          @click="exitFullscreen"
        >
          <svg
            class="call-vc-exit-fs-icon h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path
              d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"
            />
          </svg>
        </button>
        <button
          v-if="onOpenVoiceAudioSettings"
          type="button"
          class="call-vc-ctrl"
          title="Audio settings"
          aria-label="Audio settings"
          @click="onOpenVoiceAudioSettings()"
        >
          <img :src="icons.settings" alt="" class="call-vc-icon h-5 w-5" />
        </button>
        <button
          type="button"
          class="call-vc-leave"
          title="Leave call"
          aria-label="Leave call"
          @click="emit('leave')"
        >
          <img :src="icons.logOut" alt="" class="call-vc-icon h-5 w-5" />
        </button>
      </template>
    </div>

    <Teleport to="body">
      <div
        v-if="dmPfpVolumeMenuTarget"
        ref="dmPfpVolumeMenuRef"
        class="dm-call-pfp-volume-menu fixed z-[300] min-w-[220px] rounded-lg border border-border bg-[var(--echo-menu-bg)] px-3 py-2 shadow-xl"
        :style="{
          left: `${dmPfpVolumeMenuPos.left}px`,
          top: `${dmPfpVolumeMenuPos.top}px`,
        }"
        role="menu"
        @click.stop
        @pointerdown.stop
        @mousedown.stop
      >
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-foreground">
            {{ dmPfpVolumeMenuTarget.name }}
          </p>
        </div>
        <button
          v-if="dmPfpVolumeMenuShowMention"
          type="button"
          class="chat-focus-ring mt-2 flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm text-foreground hover:bg-glass-tint"
          role="menuitem"
          @click="mentionFromDmPfpVolumeMenu"
        >
          <span
            class="flex h-4 w-4 shrink-0 items-center justify-center text-[11px] font-bold text-foreground"
            aria-hidden="true"
            >@</span
          >
          Mention
        </button>
        <div
          v-if="hasDmPeerVolumeControl"
          class="mt-2 flex items-center justify-between gap-2"
        >
          <p
            class="flex min-w-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle"
          >
            <img
              :src="icons.volumeUp"
              alt=""
              class="app-inline-icon h-3.5 w-3.5 shrink-0 opacity-80"
            />
            Their volume
          </p>
          <button
            type="button"
            class="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-fg-soft transition-colors hover:bg-glass-hover"
            :class="
              dmPfpVolumeMenuMuted ? 'bg-emerald-500/20 text-emerald-200' : ''
            "
            :aria-pressed="dmPfpVolumeMenuMuted"
            :title="
              dmPfpVolumeMenuMuted
                ? 'Restore their audio for you'
                : 'Mute their audio for you only'
            "
            @click="toggleDmPfpVolumeMuteForMe"
          >
            {{ dmPfpVolumeMenuMuted ? 'Unmute for me' : 'Mute for me' }}
          </button>
        </div>
        <div v-if="hasDmPeerVolumeControl" class="mt-2 flex items-center gap-2">
          <input
            type="range"
            class="h-1.5 min-w-0 flex-1 cursor-pointer accent-violet-400"
            min="0"
            max="200"
            step="1"
            :value="dmPfpVolumeMenuDraft"
            aria-label="Participant volume"
            @input="onDmPfpVolumeInput"
          />
          <span
            class="w-9 shrink-0 text-right text-[11px] tabular-nums text-fg-soft"
            >{{ Math.round(dmPfpVolumeMenuDraft) }}%</span
          >
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
/* VC / channel voice panel control tokens (parity with ChannelPanelVoicePanel) */
.call-vc-ctrl {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--vc-ctrl-bg);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    transform 0.1s ease;
  &:hover {
    background: var(--vc-ctrl-bg-hover);
    transform: scale(1.06);
  }
  &:active {
    transform: scale(0.96);
  }
}
.call-vc-ctrl--on {
  background: var(--vc-ctrl-bg-active);
}
.call-vc-ctrl--video-on {
  background: color-mix(in srgb, mediumseagreen 36%, transparent);
}
.call-vc-ctrl--video-on:hover {
  background: color-mix(in srgb, mediumseagreen 48%, transparent);
}
.call-vc-ctrl--screenshare-on {
  background: color-mix(in srgb, mediumpurple 36%, transparent);
}
.call-vc-ctrl--screenshare-on:hover {
  background: color-mix(in srgb, mediumpurple 48%, transparent);
}
.call-vc-icon {
  filter: invert(1);
  transition: filter 0.2s ease-out;
}

.call-vc-exit-fs-icon {
  color: white;
}
/* Light theme: dock uses white/elevated pills + black icon assets — skip invert (matches channelPanel.scss VC dock). */
[data-theme='light'] .call-vc-icon {
  filter: none;
}
[data-theme='light'] .dm-call-controls--overlay .call-vc-icon {
  filter: invert(1);
}
[data-theme='light'] .call-vc-icon--off {
  filter: invert(40%) sepia(95%) saturate(1200%) hue-rotate(330deg)
    brightness(95%) contrast(95%);
}
[data-theme='light'] .dm-call-controls--overlay .call-vc-icon--off {
  filter: invert(0.4) sepia(0.85) saturate(5) hue-rotate(330deg);
}
[data-theme='light'] .call-vc-exit-fs-icon {
  color: var(--text);
}
[data-theme='light'] .dm-call-controls--overlay .call-vc-exit-fs-icon {
  color: white;
}
.call-vc-icon--off {
  filter: invert(0.4) sepia(0.85) saturate(5) hue-rotate(330deg);
}
.call-vc-strike {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 22px;
  height: 2px;
  border-radius: 1px;
  background: color-mix(in srgb, salmon 95%, transparent);
  transform: translate(-50%, -50%) rotate(-28deg);
  pointer-events: none;
}
.call-vc-leave {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, crimson 38%, transparent);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    transform 0.1s ease;
  &:hover {
    background: color-mix(in srgb, crimson 52%, transparent);
    transform: scale(1.06);
  }
  &:active {
    transform: scale(0.96);
  }
}
.call-vc-accept {
  min-width: 108px;
}

.dm-call-view--quarter {
  .dm-call-main {
    min-height: 0;
  }
  .dm-call-main--media-grid {
    /* Quarter panel: give video/grid a real viewport so tiles are not height-0. */
    min-height: min(42vh, 320px);
  }
  /* Embedded CallView: avoid cropping static avatars when the grid is short (1:1 quarter layout). */
  .dm-call-embedded-callview :deep(.call-tile-avatar) {
    object-fit: contain;
  }
  .dm-call-partner-tile {
    margin: 0.35rem;
    padding: 0.35rem 0.5rem;
  }
  .dm-call-avatar {
    width: 44px;
    height: 44px;
  }
  .dm-call-partner-name {
    font-size: 0.8125rem;
  }
  .dm-call-controls {
    padding: 0.35rem 0.5rem;
    gap: 0.35rem;
  }
  .call-vc-ctrl,
  .call-vc-leave {
    width: 36px;
    height: 36px;
  }
  .call-vc-icon {
    width: 18px;
    height: 18px;
  }
  .call-vc-strike {
    width: 18px;
  }
}

.dm-call-main--media-grid {
  .dm-call-embedded-callview {
    --dm-call-controls-overlay-offset: 0;
  }
}

.dm-call-controls {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease,
    background-color 0.18s ease;
}

.dm-call-controls--overlay {
  position: absolute;
  left: 50%;
  bottom: 0.8rem;
  transform: translateX(-50%);
  z-index: 16;
  width: max-content;
  max-width: calc(100% - 1rem);
  border: 1px solid color-mix(in srgb, white 10%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, #09060f 84%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 10px 30px color-mix(in srgb, black 40%, transparent);
}

.dm-call-controls--hidden {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
  pointer-events: none;
}

.dm-call-avatar {
  width: clamp(140px, 20vw, 200px);
  height: clamp(140px, 20vw, 200px);
}

.dm-call-partner-name {
  font-size: 1.125rem;
}

.dm-call-self-avatar {
  width: 80px;
  height: 80px;
  box-shadow: 0 4px 24px color-mix(in srgb, black 45%, transparent);
}
</style>

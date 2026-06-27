<script setup lang="ts">
import {
  computed,
  onErrorCaptured,
  ref,
  shallowRef,
  unref,
  watch,
  type MaybeRef,
} from 'vue';
import { youtubePrivacyEmbedUrl } from '@/utils/parseYoutubeVideoId';
import {
  fetchEchoVcActivityPopularity,
  postEchoVcActivityOpen,
} from '@/api/echo/vcActivities';
import type {
  EchoCodenamesActivityV1,
  EchoCodenamesAffiliationV1,
  EchoCodenamesRoleAssignmentV1,
  EchoHangmanActivityV1,
  EchoSkrigglesActivityV1,
  EchoSkrigglesCanvasCmdV1,
  EchoSkrigglesCanvasSnapshotV1,
  EchoSkrigglesSettingsV1,
  EchoSkrigglesStrokeBatchV1,
  EchoTicTacToeActivityV1,
  EchoTicTacToeInviteV1,
  EchoYoutubePlaybackSyncV1,
  EchoMediaPlaybackSyncV1,
} from '@/audio/voiceEchoLiveKitData';
import { useAuthSessionStore } from '@/stores/authSession';
import {
  ECHOED_NAMES_VC_ACTIVITY_ENABLED,
  isEchoVcActivityLibraryVisible,
  isEchoNativeVcActivityKey,
  type EchoVcActivityKey,
} from '@shared/vcActivityCatalog';
import { WATCH_TOGETHER_VC_ACTIVITY_ENABLED } from '@shared/integrationKillSwitches';
import { getWebglSupport, describeWebglBlock } from '@/platform/webglSupport';
import { isIosTauriShell } from '@/platform/iosNativeFeedback';
import type {
  VcActivityUiState,
  YoutubePlaylistEntry,
} from '@/features/voice/vcActivityTypes';
import {
  isVcIframeEmbedPhase,
  vcIframeEmbedRequiresWebgl,
  vcIframeEmbedTitle,
  vcIframeEmbedUrl,
  youtubeNowPlaying,
} from '@/features/voice/vcActivityTypes';
import VcWordlineActivity from '@/features/voice/components/VcWordlineActivity.vue';
import VcHangmanGame from '@/features/voice/components/VcHangmanGame.vue';
import VcSkrigglesGame from '@/features/voice/skriggles/components/VcSkrigglesGame.vue';
import VcTicTacToeActivity from '@/features/voice/components/VcTicTacToeActivity.vue';
import VcCodenamesGame from '@/features/voice/components/VcCodenamesGame.vue';
import {
  useVcYoutubeWatchTogetherPlayer,
  type VcYoutubeRemotePlaybackState,
} from '@/features/voice/composables/useVcYoutubeWatchTogetherPlayer';
import type { VcWatchTogetherRemotePlaybackState } from '@/features/voice/composables/useVcWatchTogetherPlayer';
import VcWatchTogetherLobby from '@/features/voice/components/VcWatchTogetherLobby.vue';
import VcWatchTogetherStage from '@/features/voice/components/VcWatchTogetherStage.vue';
import { compareVcActivityLibraryCards } from '@/features/voice/stage/vcActivityLibrarySort';
import {
  buildVcActivityArt,
  VC_ACTIVITY_LIBRARY_CARDS,
  type VcActivityLibraryCardKey,
} from '@/features/voice/stage/vcActivityLibraryCards';
import {
  useVcActivityFullscreen,
  useVcActivityOverflowNarrow,
} from '@/features/voice/composables/useVcActivityStageViewport';
import { useVcYoutubeBrowse } from '@/features/voice/composables/useVcYoutubeBrowse';

const appBase = import.meta.env.BASE_URL || '/';
const vcActivityArt = buildVcActivityArt(appBase);

const props = withDefaults(
  defineProps<{
    state: MaybeRef<VcActivityUiState>;
    voiceChannelLabel: string;
    compactLayout?: boolean;
    /** When side chat is collapsed, show reopen in the activity header instead of the floating pill. */
    voiceSideChatCollapsed?: boolean;
    expandVoiceSideChat?: () => void;
    openVcActivityYoutubeBrowse: () => void;
    openVcActivityWatchTogether: () => void;
    openVcActivityWordle: () => void;
    openVcActivityHangman: () => void;
    openVcActivityTicTacToe: () => void;
    openVcActivityOpenGuessr: () => void;
    openVcActivitySkribblIo: () => void;
    openVcActivityGarticPhone: () => void;
    openVcActivityKrunker: () => void;
    openVcActivityCodenames: () => void;
    openVcActivityRichup: () => void;
    openVcActivityGooberDash: () => void;
    openVcActivitySmashKarts: () => void;
    openVcActivityClusterRush: () => void;
    openVcActivityPicker: () => void;
    setVcActivityYoutubeVideo: (
      videoId: string,
      meta?: Partial<
        Pick<YoutubePlaylistEntry, 'title' | 'channelTitle' | 'thumbnailUrl'>
      >,
    ) => void;
    setVcYoutubeBrowseOpen: (open: boolean) => void;
    addVcYoutubeToQueue: (entry: YoutubePlaylistEntry) => void;
    removeVcYoutubeFromQueue: (index: number) => void;
    moveVcYoutubeInQueue: (from: number, to: number) => void;
    playVcYoutubeAtIndex: (index: number) => void;
    playVcYoutubeNext: () => void;
    playVcYoutubePrevious: () => void;
    closeVcActivity: () => void;
    vcHangmanActivity: MaybeRef<EchoHangmanActivityV1 | null>;
    hangmanRosterUserIds: MaybeRef<readonly string[]>;
    commitVcHangmanWord: (raw: string) => string | null;
    requestVcHangmanGuessLetter: (letter: string) => void;
    requestVcHangmanNextRound: () => void;
    wordlineView?: MaybeRef<
      import('@shared/games/wordline').WordlineView | null
    >;
    submitWordlineGuess?: (guess: string) => void;
    setWordlineMode?: (
      mode: import('@shared/games/wordline/core').GameMode,
    ) => void;
    vcSkrigglesActivity: MaybeRef<EchoSkrigglesActivityV1 | null>;
    skrigglesRosterUserIds: MaybeRef<readonly string[]>;
    skrigglesCanvasEvents: MaybeRef<
      readonly import('@/features/voice/skriggles/skrigglesVoiceSession').SkrigglesCanvasEvent[]
    >;
    commitSkrigglesWordChoice: (word: string) => void;
    submitSkrigglesGuess: (guess: string) => void;
    updateSkrigglesSettings: (
      settings: Partial<EchoSkrigglesSettingsV1>,
    ) => void;
    startSkrigglesGame: () => void;
    advanceSkrigglesRound: () => void;
    publishSkrigglesStrokeBatch: (batch: EchoSkrigglesStrokeBatchV1) => void;
    publishSkrigglesCanvasCmd: (cmd: EchoSkrigglesCanvasCmdV1) => void;
    publishSkrigglesCanvasSnapshot: (
      snapshot: EchoSkrigglesCanvasSnapshotV1,
    ) => void;
    tickSkrigglesTimers: () => void;
    openVcActivitySkriggles: () => void;
    vcTicTacToeActivity: MaybeRef<EchoTicTacToeActivityV1 | null>;
    vcTicTacToePendingInvite: MaybeRef<EchoTicTacToeInviteV1 | null>;
    sendVcTicTacToeChallenge: (toUserId: string) => void;
    respondVcTicTacToeInvite: (accept: boolean) => void;
    dismissVcTicTacToeInvite: () => void;
    requestVcTicTacToeMove: (cellIndex: number) => void;
    requestVcTicTacToeRematch: () => void;
    liveKitConnected?: MaybeRef<boolean>;
    activeVoiceChannelParticipants?: MaybeRef<
      readonly {
        id: string;
        name: string;
        pfp?: string;
        activityPresence?: readonly string[];
      }[]
    >;
    vcCodenamesActivity: MaybeRef<EchoCodenamesActivityV1 | null>;
    codenamesRosterUserIds: MaybeRef<readonly string[]>;
    vcCodenamesSpymasterKey: MaybeRef<EchoCodenamesAffiliationV1[] | null>;
    commitVcCodenamesDeal: () => string | null;
    requestVcCodenamesSetup: (
      assignments: EchoCodenamesRoleAssignmentV1[],
    ) => void;
    requestVcCodenamesClue: (word: string, number: number) => void;
    requestVcCodenamesReveal: (cardIndex: number) => void;
    requestVcCodenamesEndTurn: () => void;
    requestVcCodenamesNewGame: () => void;
    requestVcCodenamesPushKeyToOrchestrator: () => void;
    currentUserId?: string | null;
    /** Jump to owning guild and highlight this VC in the channel list (activity header title). */
    focusGuildVoiceChannelInSidebar?: () => void;
    channelPanelCollapsed?: boolean;
    expandChannels?: () => void;
    /** Guild tri-pane: same action as the floating “Back” control on the voice surface. */
    onMobileBackToChannels?: () => void;
    /** Sub-800px shell — channel column width is not part of the desktop grid. */
    isCompactShell?: boolean;
    /** Desktop: narrows the channel column when activity content still overflows vertically. */
    narrowChannelPanelForActivityOverflowStep?: () => boolean;
    /** Guild VC: LiveKit YouTube playback sync (host publishes; followers apply). */
    publishVcYoutubePlaybackSync?: (sample: EchoYoutubePlaybackSyncV1) => void;
    vcYoutubeRemotePlayback?: MaybeRef<VcYoutubeRemotePlaybackState | null>;
    vcYoutubePlaybackShouldPublish?: MaybeRef<boolean>;
    setWatchTogetherLobbyRole: (
      role: VcActivityUiState['watchTogetherLobbyRole'],
    ) => void;
    ensureWatchTogetherSessionId: () => string;
    patchWatchTogetherUi: (patch: Partial<VcActivityUiState>) => void;
    setWatchTogetherBrowseOpen: (open: boolean) => void;
    startWatchTogetherSession: () => void;
    playWatchTogetherAtIndex: (index: number) => void;
    publishVcWatchTogetherPlaybackSync?: (
      sample: EchoMediaPlaybackSyncV1,
    ) => void;
    vcWatchTogetherRemotePlayback?: MaybeRef<VcWatchTogetherRemotePlaybackState | null>;
    vcWatchTogetherPlaybackShouldPublish?: MaybeRef<boolean>;
    voiceChannelId?: string;
    effectiveVcActivityKingUserId?: string;
  }>(),
  {
    voiceSideChatCollapsed: false,
    expandVoiceSideChat: () => {},
    channelPanelCollapsed: false,
    isCompactShell: false,
    activeVoiceChannelParticipants: () => [],
    liveKitConnected: false,
  },
);

const tttActivity = computed(() => unref(props.vcTicTacToeActivity));
const tttPendingInvite = computed(() => unref(props.vcTicTacToePendingInvite));
const tttLiveKitConnected = computed(() => !!unref(props.liveKitConnected));

const hmActivity = computed(() => unref(props.vcHangmanActivity));
const hmRoster = computed(() => [...(unref(props.hangmanRosterUserIds) ?? [])]);
const skActivity = computed(() => unref(props.vcSkrigglesActivity));
const skRoster = computed(() => [
  ...(unref(props.skrigglesRosterUserIds) ?? []),
]);
const skCanvasEvents = computed(() => [
  ...(unref(props.skrigglesCanvasEvents) ?? []),
]);
const hangmanVoiceParticipants = computed(() => {
  const rows = unref(props.activeVoiceChannelParticipants) ?? [];
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    pfp: p.pfp ?? '',
  }));
});

const ticTacToeVoiceParticipants = computed(() => {
  const rows = unref(props.activeVoiceChannelParticipants) ?? [];
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    pfp: p.pfp ?? '',
    activityPresence: p.activityPresence ?? [],
  }));
});

const cnActivity = computed(() => unref(props.vcCodenamesActivity));
const cnRoster = computed(() => [
  ...(unref(props.codenamesRosterUserIds) ?? []),
]);
const cnSpymasterKey = computed(
  () => unref(props.vcCodenamesSpymasterKey) ?? null,
);

const auth = useAuthSessionStore();

const vcActivityPopularityByKey = ref(
  {} as Partial<Record<EchoVcActivityKey, number>>,
);

/**
 * App Store guidelines 4.7 / 2.5.2 make shipping remote third-party web games
 * impractical in the native iOS app, so non-native (iframe) activities are hidden
 * and blocked in the iOS Tauri shell. The web/desktop builds keep them. First-party
 * activities and the youtube-nocookie embed remain available everywhere.
 */
const hideThirdPartyEmbeds = isIosTauriShell();

const sortedVcActivityLibraryCards = computed(() => {
  const pop = vcActivityPopularityByKey.value;
  return [...VC_ACTIVITY_LIBRARY_CARDS]
    .filter(
      (c) =>
        isEchoVcActivityLibraryVisible(c.key) &&
        (!hideThirdPartyEmbeds || isEchoNativeVcActivityKey(c.key)),
    )
    .sort((a, b) => compareVcActivityLibraryCards(a, b, pop));
});

async function refreshVcActivityLibraryPopularity(): Promise<void> {
  const token = auth.accessToken?.trim();
  if (!token) return;
  try {
    const res = await fetchEchoVcActivityPopularity(token);
    const next: Partial<Record<EchoVcActivityKey, number>> = {};
    for (const row of res.items) {
      if (typeof row.openCount === 'number' && Number.isFinite(row.openCount)) {
        next[row.activityKey] = row.openCount;
      }
    }
    vcActivityPopularityByKey.value = next;
  } catch {
    /* Non-fatal when offline or echo disabled — fall back to stable secondary sort only. */
  }
}

function recordVcActivityOpen(key: EchoVcActivityKey): void {
  const token = auth.accessToken?.trim();
  if (!token) return;
  void postEchoVcActivityOpen(token, key).catch(() => {});
}

function openActivityFromLibrary(key: VcActivityLibraryCardKey): void {
  // Defense in depth: third-party game embeds are not offered on iOS (see
  // hideThirdPartyEmbeds). The CSP frame-src in tauri.ios.conf.json is the final backstop.
  if (hideThirdPartyEmbeds && !isEchoNativeVcActivityKey(key)) return;
  recordVcActivityOpen(key);
  switch (key) {
    case 'youtube':
      props.openVcActivityYoutubeBrowse();
      break;
    case 'watch_together':
      if (WATCH_TOGETHER_VC_ACTIVITY_ENABLED) {
        props.openVcActivityWatchTogether();
      } else {
        props.openVcActivityPicker();
      }
      break;
    case 'wordle':
      props.openVcActivityWordle();
      break;
    case 'hangman':
      props.openVcActivityHangman();
      break;
    case 'skriggles':
      props.openVcActivitySkriggles();
      break;
    case 'tic_tac_toe':
      props.openVcActivityTicTacToe();
      break;
    case 'openguessr':
      props.openVcActivityOpenGuessr();
      break;
    case 'skribbl_io':
      props.openVcActivitySkribblIo();
      break;
    case 'gartic_phone':
      props.openVcActivityGarticPhone();
      break;
    case 'krunker':
      props.openVcActivityKrunker();
      break;
    case 'codenames':
      if (ECHOED_NAMES_VC_ACTIVITY_ENABLED) props.openVcActivityCodenames();
      else props.openVcActivityPicker();
      break;
    case 'richup':
      props.openVcActivityRichup();
      break;
    case 'goober_dash':
      props.openVcActivityGooberDash();
      break;
    case 'smash_karts':
      props.openVcActivitySmashKarts();
      break;
    case 'cluster_rush':
      props.openVcActivityClusterRush();
      break;
    default: {
      const _exhaustive: never = key;
      void _exhaustive;
    }
  }
}

const st = computed(() => unref(props.state));

watch(
  () => st.value.phase,
  (phase) => {
    if (phase === 'pick') void refreshVcActivityLibraryPopularity();
  },
  { immediate: true },
);

const iframeEmbedKey = ref(0);

const stageRootRef = ref<HTMLElement | null>(null);

const { activityFullscreenActive, toggleActivityFullscreen } =
  useVcActivityFullscreen(stageRootRef, () => st.value.phase);

useVcActivityOverflowNarrow(stageRootRef, {
  phase: () => st.value.phase,
  isCompactShell: () => !!props.isCompactShell,
  compactLayout: () => !!props.compactLayout,
  channelPanelCollapsed: () => !!props.channelPanelCollapsed,
  narrowStep: props.narrowChannelPanelForActivityOverflowStep,
});

watch(
  () => st.value.phase,
  (phase) => {
    if (isVcIframeEmbedPhase(phase)) {
      iframeEmbedKey.value += 1;
    }
  },
  { immediate: true },
);

const iframeEmbedPhase = computed(() => {
  // iOS never mounts a third-party game iframe (App Store 4.7 / 2.5.2).
  if (hideThirdPartyEmbeds) return null;
  const p = st.value.phase;
  return isVcIframeEmbedPhase(p) ? p : null;
});

const iframeEmbedSrc = computed(() =>
  iframeEmbedPhase.value ? vcIframeEmbedUrl(iframeEmbedPhase.value) : '',
);

const iframeEmbedTitle = computed(() =>
  iframeEmbedPhase.value ? vcIframeEmbedTitle(iframeEmbedPhase.value) : '',
);

const webglSupport = getWebglSupport();

/** Current iframe game needs hardware WebGL but this device cannot provide it. */
const webglBlockedForCurrentGame = computed(() => {
  const p = iframeEmbedPhase.value;
  return !!p && vcIframeEmbedRequiresWebgl(p) && !webglSupport.ok;
});

/** User explicitly chose to launch a WebGL game despite the capability warning. */
const webglTryAnyway = ref(false);

const showIframeGame = computed(
  () =>
    !!iframeEmbedPhase.value &&
    (!webglBlockedForCurrentGame.value || webglTryAnyway.value),
);

const webglBlockReason = computed(() => describeWebglBlock(webglSupport));

function openWebglGameInNewTab() {
  const url = iframeEmbedSrc.value;
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}

// A fresh embedded game clears the per-game "try anyway" override.
watch(iframeEmbedPhase, () => {
  webglTryAnyway.value = false;
});

/**
 * Error boundary: a native activity component (codenames, tic-tac-toe, hangman, ...) throwing
 * during render/lifecycle previously bubbled up and tore down CallView, disconnecting the user
 * from voice ("crash kick out"). Trap it here, show a recoverable panel, and keep voice intact.
 */
const activityCrash = ref<string | null>(null);
onErrorCaptured((err) => {
  activityCrash.value =
    (err instanceof Error && err.message.trim()) || 'The activity crashed.';
  return false;
});

function reloadCrashedActivity() {
  activityCrash.value = null;
  iframeEmbedKey.value += 1;
}
function closeCrashedActivity() {
  activityCrash.value = null;
  props.closeVcActivity();
}

// Switching phase/game clears any stale crash state.
watch(
  () => st.value.phase,
  () => {
    activityCrash.value = null;
  },
);

const activityRegionLabel = computed(() => {
  const p = st.value.phase;
  if (p === 'pick') return 'Voice activities';
  if (p === 'wordle') return 'Wordline';
  if (p === 'hangman') return 'Hangman';
  if (p === 'skriggles') return 'Skriggles';
  if (p === 'tic_tac_toe') return 'Tic Tac Echo';
  if (p === 'codenames') return 'Echoed Names';
  if (isVcIframeEmbedPhase(p)) return vcIframeEmbedTitle(p);
  if (p === 'watch_together') return 'Watch Together';
  return 'YouTube watch together';
});

const showVcFullscreenControl = computed(
  () =>
    st.value.phase === 'youtube' ||
    st.value.phase === 'watch_together' ||
    st.value.phase === 'wordle' ||
    st.value.phase === 'hangman' ||
    st.value.phase === 'skriggles' ||
    st.value.phase === 'tic_tac_toe' ||
    st.value.phase === 'codenames' ||
    isVcIframeEmbedPhase(st.value.phase),
);

const {
  searchDraft,
  searchLoading,
  searchError,
  searchResults,
  searchHint,
  browseTab,
  popularLoading,
  popularError,
  popularItems,
  popularHint,
  queueSuggestLoading,
  queueSuggestError,
  queueSuggestHint,
  queueSuggestItems,
  primaryFindRows,
  queueSuggestSeedTitle,
  hasQueue,
  QUICK_SEARCH_PRESETS,
  loadPopular,
  loadQueueSuggestions,
  applyPresetSearch,
  submitFindField,
  pickVideo,
  playVideoNow,
  toggleBrowseFind,
  toggleBrowseQueue,
} = useVcYoutubeBrowse({
  state: () => st.value,
  token: () => auth.accessToken?.trim() ?? null,
  setVideo: props.setVcActivityYoutubeVideo,
  setBrowseOpen: props.setVcYoutubeBrowseOpen,
  addToQueue: props.addVcYoutubeToQueue,
});

const nowPlaying = computed(() =>
  st.value.phase === 'youtube' ? youtubeNowPlaying(st.value) : null,
);

const nextInQueue = computed(() => {
  if (st.value.phase !== 'youtube' || !st.value.playlist.length) return null;
  const i = st.value.currentIndex;
  return st.value.playlist[i + 1] ?? null;
});

const embedSrc = computed(() =>
  st.value.phase === 'youtube' && st.value.youtubeVideoId
    ? youtubePrivacyEmbedUrl(st.value.youtubeVideoId)
    : '',
);

const ytWatchPlayerEl = ref<HTMLElement | null>(null);
const youtubeSyncUi = computed(
  () => typeof props.publishVcYoutubePlaybackSync === 'function',
);

const syncYoutubeVideoId = computed(() =>
  youtubeSyncUi.value && st.value.phase === 'youtube' && st.value.youtubeVideoId
    ? st.value.youtubeVideoId
    : null,
);

const remotePlaybackMirror = shallowRef<VcYoutubeRemotePlaybackState | null>(
  null,
);
watch(
  () => unref(props.vcYoutubeRemotePlayback),
  (v) => {
    remotePlaybackMirror.value = v ?? null;
  },
  { immediate: true },
);

const canPublishPlayback = computed(
  () => unref(props.vcYoutubePlaybackShouldPublish) ?? true,
);

function publishPlaybackBridge(sample: EchoYoutubePlaybackSyncV1): void {
  props.publishVcYoutubePlaybackSync?.(sample);
}

const ytWatchPlayerCtl = useVcYoutubeWatchTogetherPlayer({
  containerRef: ytWatchPlayerEl,
  videoId: syncYoutubeVideoId,
  remotePlayback: remotePlaybackMirror,
  publish: publishPlaybackBridge,
  canPublish: canPublishPlayback,
});

watch(syncYoutubeVideoId, (id, prev) => {
  if (id && id !== prev && youtubeSyncUi.value) {
    ytWatchPlayerCtl.publishAfterVideoChange();
  }
});

function onKeydownRoot(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  e.preventDefault();
  if (st.value.phase === 'youtube') {
    if (st.value.youtubeBrowseOpen) {
      props.setVcYoutubeBrowseOpen(false);
    } else if (st.value.youtubeVideoId) {
      props.openVcActivityPicker();
    } else {
      props.openVcActivityPicker();
    }
  } else if (
    st.value.phase === 'wordle' ||
    st.value.phase === 'hangman' ||
    st.value.phase === 'skriggles' ||
    st.value.phase === 'tic_tac_toe'
  ) {
    props.openVcActivityPicker();
  } else if (
    st.value.phase === 'watch_together' ||
    isVcIframeEmbedPhase(st.value.phase)
  ) {
    props.openVcActivityPicker();
  } else {
    props.closeVcActivity();
  }
}

function headerBack() {
  if (
    st.value.phase === 'youtube' ||
    st.value.phase === 'watch_together' ||
    st.value.phase === 'wordle' ||
    st.value.phase === 'hangman' ||
    st.value.phase === 'skriggles' ||
    st.value.phase === 'tic_tac_toe' ||
    isVcIframeEmbedPhase(st.value.phase)
  ) {
    props.openVcActivityPicker();
  } else {
    props.closeVcActivity();
  }
}

const showRevealChannelListInActivityHeader = computed(() => {
  if (props.compactLayout) {
    return typeof props.onMobileBackToChannels === 'function';
  }
  return (
    !!props.channelPanelCollapsed && typeof props.expandChannels === 'function'
  );
});

function revealChannelListFromActivity() {
  if (props.compactLayout) {
    props.onMobileBackToChannels?.();
  } else {
    props.expandChannels?.();
  }
}
</script>

<template>
  <div
    ref="stageRootRef"
    class="vc-act-stage relative flex min-h-0 min-w-0 flex-1 flex-col bg-bg text-fg"
    role="region"
    :aria-label="activityRegionLabel"
    tabindex="-1"
    @keydown="onKeydownRoot"
  >
    <div v-if="activityCrash" class="vc-activity-overlay" role="alert">
      <p class="vc-activity-overlay__title">This activity ran into a problem</p>
      <p class="vc-activity-overlay__body">{{ activityCrash }}</p>
      <div class="vc-activity-overlay__actions">
        <button
          type="button"
          class="vc-activity-btn vc-activity-btn--primary"
          @click="reloadCrashedActivity"
        >
          Reload activity
        </button>
        <button
          type="button"
          class="vc-activity-btn"
          @click="closeCrashedActivity"
        >
          Close
        </button>
      </div>
      <p class="vc-activity-overlay__hint">You're still connected to voice.</p>
    </div>
    <header
      class="vc-act-header flex h-11 min-h-11 w-full min-w-0 shrink-0 items-center gap-1.5 border-b border-border bg-elevated px-2 sm:px-3"
      :class="{
        'vc-act-header--youtube': st.phase === 'youtube',
        'vc-act-header--wordline': st.phase === 'wordle',
        'vc-act-header--echoed-names': st.phase === 'codenames',
      }"
    >
      <button
        type="button"
        class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg"
        aria-label="Back to activities"
        @click="headerBack"
      >
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <button
        v-if="showRevealChannelListInActivityHeader"
        type="button"
        class="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg sm:px-2"
        :aria-label="compactLayout ? 'Show channels' : 'Show channel list'"
        :title="compactLayout ? 'Show channels' : 'Show channel list'"
        @click="revealChannelListFromActivity"
      >
        <span class="hidden sm:inline">Show channel list</span>
        <span class="sm:hidden">Channels</span>
      </button>
      <div
        v-if="st.phase === 'pick'"
        class="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight"
        title="Activities"
      >
        Activities
      </div>
      <button
        v-else-if="focusGuildVoiceChannelInSidebar"
        type="button"
        class="min-w-0 flex-1 truncate rounded-md text-left text-[13px] font-semibold leading-tight text-fg transition hover:bg-glass-hover"
        :title="`${voiceChannelLabel} — Go to channel`"
        @click="focusGuildVoiceChannelInSidebar?.()"
      >
        {{ voiceChannelLabel }}
      </button>
      <div
        v-else
        class="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight"
        :title="voiceChannelLabel"
      >
        {{ voiceChannelLabel }}
      </div>
      <button
        v-if="voiceSideChatCollapsed"
        type="button"
        class="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg sm:px-2"
        aria-label="Reopen chat"
        title="Reopen chat"
        @click="expandVoiceSideChat()"
      >
        <svg
          class="h-4 w-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path
            d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
          />
        </svg>
        <span class="hidden sm:inline">Reopen chat</span>
      </button>
      <button
        v-if="showVcFullscreenControl"
        type="button"
        class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg"
        :aria-label="
          activityFullscreenActive ? 'Exit full screen' : 'Enter full screen'
        "
        :title="activityFullscreenActive ? 'Exit full screen' : 'Full screen'"
        @click="toggleActivityFullscreen"
      >
        <svg
          v-if="!activityFullscreenActive"
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="15 3 21 3 21 9" />
          <polyline points="9 21 3 21 3 15" />
          <line x1="21" y1="3" x2="14" y2="10" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
        <svg
          v-else
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="4 14 10 14 10 20" />
          <polyline points="20 10 14 10 14 4" />
          <line x1="14" y1="10" x2="21" y2="3" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
      </button>
      <button
        v-if="st.phase === 'youtube'"
        type="button"
        class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg"
        :class="
          st.youtubeBrowseOpen && browseTab === 'find'
            ? 'bg-glass-2 text-fg'
            : ''
        "
        :aria-pressed="st.youtubeBrowseOpen && browseTab === 'find'"
        aria-label="Search videos"
        title="Search"
        @click="toggleBrowseFind"
      >
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3-3" stroke-linecap="round" />
        </svg>
      </button>
      <button
        v-if="st.phase === 'youtube' && st.playlist.length"
        type="button"
        class="inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-0.5 rounded-md px-1.5 text-[11px] font-medium text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg"
        :class="
          st.youtubeBrowseOpen && browseTab === 'queue'
            ? 'bg-glass-2 text-fg'
            : ''
        "
        :aria-pressed="st.youtubeBrowseOpen && browseTab === 'queue'"
        :title="`Queue (${st.playlist.length})`"
        @click="toggleBrowseQueue"
      >
        <span class="hidden sm:inline">Queue</span>
        <span class="tabular-nums text-fg-subtle">{{
          st.playlist.length
        }}</span>
      </button>
      <button
        type="button"
        class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg"
        aria-label="Close activities"
        title="Close"
        @click="closeVcActivity"
      >
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </header>

    <!-- Activity library -->
    <div
      v-if="st.phase === 'pick'"
      class="vc-act-library custom-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6"
    >
      <div
        class="vc-act-library__intro mx-auto mb-5 w-full max-w-[min(100%,90rem)]"
      >
        <h2
          class="text-[1.05rem] font-bold leading-tight tracking-tight text-fg sm:text-xl"
        >
          Activity library
        </h2>
        <p
          class="mt-1.5 max-w-xl text-[11px] leading-snug text-fg-subtle sm:text-[13px]"
        >
          Launch something for your voice channel — each card opens in the
          activity panel next to chat.
        </p>
      </div>
      <div class="vc-act-library__grid mx-auto w-full max-w-[min(100%,90rem)]">
        <button
          v-for="card in sortedVcActivityLibraryCards"
          :key="card.key"
          type="button"
          class="vc-act-widget group text-left"
          :class="card.widgetClass"
          :aria-label="card.ariaLabel"
          @click="openActivityFromLibrary(card.key)"
        >
          <div class="vc-act-widget__media">
            <img
              :src="vcActivityArt[card.artKey]"
              alt=""
              width="640"
              height="400"
              class="vc-act-widget__img"
              loading="lazy"
              decoding="async"
            />
            <div class="vc-act-widget__media-scrim" aria-hidden="true" />
          </div>
          <div class="vc-act-widget__body">
            <div class="vc-act-widget__title-row">
              <span class="vc-act-widget__title">{{ card.title }}</span>
              <span class="vc-act-widget__cta" aria-hidden="true">Open</span>
            </div>
            <p class="vc-act-widget__desc">
              {{ card.description }}
            </p>
          </div>
        </button>
      </div>
    </div>

    <div
      v-else-if="st.phase === 'youtube'"
      class="vc-act-youtube-stage relative flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row"
    >
      <!-- Mobile: quick open search (header has same actions) -->
      <button
        v-if="compactLayout && st.phase === 'youtube'"
        type="button"
        class="vc-act-yt-fab-search absolute bottom-3 right-3 z-20 flex h-11 w-11 items-center justify-center rounded-full text-white shadow-lg sm:hidden"
        aria-label="Search"
        @click="toggleBrowseFind"
      >
        <svg
          class="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3-3" stroke-linecap="round" />
        </svg>
      </button>

      <!-- Browse drawer: Search | Queue (compact) -->
      <aside
        v-show="st.youtubeBrowseOpen"
        class="vc-act-browse-drawer flex min-h-0 shrink-0 flex-col border-border lg:relative lg:z-10 lg:max-h-none lg:w-[min(340px,38vw)] lg:border-r"
        :class="
          compactLayout
            ? 'absolute inset-0 z-[15] max-h-none border-r-0'
            : 'max-h-[42vh] border-b lg:max-h-none lg:border-b-0'
        "
      >
        <div
          v-if="compactLayout && st.youtubeBrowseOpen"
          class="flex shrink-0 items-center justify-end border-b border-border px-2 py-1"
        >
          <button
            type="button"
            class="rounded-md px-2.5 py-1 text-[13px] font-medium text-fg-soft hover:bg-glass-hover hover:text-fg"
            @click="setVcYoutubeBrowseOpen(false)"
          >
            Done
          </button>
        </div>
        <div class="flex shrink-0 border-b border-border/80 p-2" role="tablist">
          <div class="vc-act-yt-segment flex min-h-9 w-full gap-0.5 p-0.5">
            <button
              type="button"
              role="tab"
              class="vc-act-yt-segment__tab min-h-8 flex-1 rounded-lg px-2 text-[11px] font-semibold transition-all duration-200"
              :class="
                browseTab === 'find'
                  ? 'vc-act-yt-segment__tab--active text-fg shadow-sm'
                  : 'text-fg-soft hover:text-fg'
              "
              :aria-selected="browseTab === 'find'"
              @click="browseTab = 'find'"
            >
              Search
            </button>
            <button
              type="button"
              role="tab"
              class="vc-act-yt-segment__tab min-h-8 flex-1 rounded-lg px-2 text-[11px] font-semibold transition-all duration-200"
              :class="
                browseTab === 'queue'
                  ? 'vc-act-yt-segment__tab--active text-fg shadow-sm'
                  : 'text-fg-soft hover:text-fg'
              "
              :aria-selected="browseTab === 'queue'"
              @click="browseTab = 'queue'"
            >
              Up next
              <span
                v-if="st.playlist.length"
                class="ml-0.5 tabular-nums text-fg-subtle"
                >{{ st.playlist.length }}</span
              >
            </button>
          </div>
        </div>

        <!-- Find tab -->
        <div
          v-show="browseTab === 'find'"
          class="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          <div class="shrink-0 border-b border-border/80 p-2.5">
            <div class="vc-act-yt-search flex gap-2">
              <input
                v-model="searchDraft"
                type="search"
                class="vc-act-yt-search__input min-w-0 flex-1 rounded-xl border border-border/90 bg-elevated/90 px-3 py-2 text-[13px] text-fg shadow-inner outline-none ring-0 placeholder:text-fg-subtle focus:border-[color-mix(in_srgb,var(--vc-yt-brand,#ff0033)_45%,var(--border))] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--vc-yt-brand,#ff0033)_22%,transparent)]"
                placeholder="Search or paste a link…"
                autocomplete="off"
                @keydown.enter.prevent="submitFindField"
              />
              <button
                type="button"
                class="vc-act-yt-search__go shrink-0 rounded-xl px-3.5 py-2 text-[12px] font-bold text-white shadow-md transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="searchLoading"
                @click="submitFindField"
              >
                {{ searchLoading ? '…' : 'Go' }}
              </button>
            </div>
            <p v-if="searchError" class="vc-act-msg-err mt-1.5 text-[11px]">
              {{ searchError }}
            </p>
            <p
              v-else-if="searchHint"
              class="vc-act-msg-hint mt-1.5 text-[10px] leading-snug"
            >
              {{ searchHint }}
            </p>
          </div>
          <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-1.5">
            <div
              v-if="searchLoading"
              class="py-8 text-center text-[12px] text-fg-subtle"
            >
              Searching…
            </div>
            <template v-else>
              <div
                v-if="!searchResults.length"
                class="mb-2 space-y-2 border-b border-border/80 pb-2"
              >
                <div class="flex flex-wrap gap-1">
                  <button
                    v-for="p in QUICK_SEARCH_PRESETS"
                    :key="p.q"
                    type="button"
                    class="rounded-full border border-border/80 bg-elevated/60 px-2.5 py-1 text-[10px] font-semibold text-fg-soft shadow-sm backdrop-blur-sm transition hover:border-[color-mix(in_srgb,var(--vc-yt-brand,#ff0033)_35%,var(--border))] hover:bg-elevated hover:text-fg"
                    @click="applyPresetSearch(p.q)"
                  >
                    {{ p.label }}
                  </button>
                </div>
                <div class="flex items-center justify-between gap-2 px-0.5">
                  <span
                    class="text-[10px] font-bold uppercase tracking-[0.12em] text-fg-subtle"
                  >
                    Popular on YouTube
                  </span>
                  <button
                    type="button"
                    class="rounded-full px-2 py-0.5 text-[10px] font-bold text-fg-soft transition hover:bg-glass-hover hover:text-fg disabled:opacity-40"
                    :disabled="popularLoading"
                    @click="loadPopular"
                  >
                    Refresh
                  </button>
                </div>
                <p v-if="popularError" class="vc-act-msg-err text-[11px]">
                  {{ popularError }}
                </p>
                <p
                  v-else-if="popularHint"
                  class="vc-act-msg-hint text-[10px] leading-snug"
                >
                  {{ popularHint }}
                </p>
              </div>
              <div
                v-if="
                  popularLoading &&
                  !searchResults.length &&
                  !popularItems.length
                "
                class="py-6 text-center text-[12px] text-fg-subtle"
              >
                Loading suggestions…
              </div>
              <ul v-else-if="primaryFindRows.length" class="space-y-1.5">
                <li v-for="v in primaryFindRows" :key="'vc-find-' + v.id">
                  <div
                    class="vc-act-yt-row group flex w-full gap-1.5 p-1.5 transition-all duration-200"
                    :class="
                      st.youtubeVideoId === v.id
                        ? 'vc-act-yt-row--current ring-1 ring-[color-mix(in_srgb,var(--vc-yt-brand,#ff0033)_42%,var(--border))]'
                        : ''
                    "
                  >
                    <button
                      type="button"
                      class="flex min-w-0 flex-1 gap-2.5 text-left"
                      @click="pickVideo(v)"
                    >
                      <div
                        class="vc-act-yt-thumb relative aspect-video w-[5.25rem] shrink-0 overflow-hidden rounded-lg bg-muted shadow-inner ring-1 ring-black/20"
                      >
                        <img
                          v-if="v.thumbnailUrl"
                          :src="v.thumbnailUrl"
                          alt=""
                          class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                          loading="lazy"
                        />
                        <div
                          v-else
                          class="flex h-full w-full items-center justify-center text-[9px] text-fg-subtle"
                        >
                          ▶
                        </div>
                      </div>
                      <div class="min-w-0 flex-1 py-0.5">
                        <div
                          class="line-clamp-2 text-[12px] font-semibold leading-snug tracking-tight text-fg"
                        >
                          {{ v.title }}
                        </div>
                        <div class="mt-0.5 truncate text-[10px] text-fg-subtle">
                          {{ v.channelTitle }}
                        </div>
                      </div>
                    </button>
                    <button
                      v-if="hasQueue"
                      type="button"
                      class="vc-act-yt-pill-btn shrink-0 self-center rounded-full px-2.5 py-1 text-[10px] font-bold text-fg-soft transition hover:text-fg"
                      title="Play now"
                      @click.stop="playVideoNow(v)"
                    >
                      Now
                    </button>
                  </div>
                </li>
              </ul>
              <p
                v-else
                class="px-1 py-6 text-center text-[11px] text-fg-subtle"
              >
                Results appear here. Try a quick topic above, trending, or paste
                a link.
              </p>
            </template>
          </div>
        </div>

        <!-- Queue tab: suggestions + full playlist (Legacy “Up next”) -->
        <div
          v-show="browseTab === 'queue'"
          class="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div
            v-if="st.playlist.length"
            class="shrink-0 border-b border-border bg-elevated/90 p-2"
          >
            <div class="mb-1.5 flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div
                  class="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle"
                >
                  Suggested next
                </div>
                <div
                  v-if="queueSuggestSeedTitle"
                  class="truncate text-[10px] text-fg-subtle"
                  :title="queueSuggestSeedTitle"
                >
                  Based on · {{ queueSuggestSeedTitle }}
                </div>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-fg-soft hover:bg-glass-hover hover:text-fg disabled:opacity-40"
                :disabled="queueSuggestLoading"
                @click="loadQueueSuggestions"
              >
                Refresh
              </button>
            </div>
            <p v-if="queueSuggestError" class="vc-act-msg-err mb-1 text-[11px]">
              {{ queueSuggestError }}
            </p>
            <div
              v-if="queueSuggestLoading && !queueSuggestItems.length"
              class="py-3 text-center text-[11px] text-fg-subtle"
            >
              Loading ideas…
            </div>
            <ul
              v-else-if="queueSuggestItems.length"
              class="max-h-[36vh] space-y-1 overflow-y-auto rounded-xl border border-border/70 bg-elevated/40 p-1.5 shadow-inner lg:max-h-44"
            >
              <li v-for="v in queueSuggestItems" :key="'vc-q-sug-' + v.id">
                <div
                  class="vc-act-yt-row group flex w-full gap-1 rounded-lg p-1"
                >
                  <button
                    type="button"
                    class="flex min-w-0 flex-1 gap-2.5 text-left"
                    @click="pickVideo(v)"
                  >
                    <div
                      class="vc-act-yt-thumb relative aspect-video w-[4.5rem] shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-black/15"
                    >
                      <img
                        v-if="v.thumbnailUrl"
                        :src="v.thumbnailUrl"
                        alt=""
                        class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
                        loading="lazy"
                      />
                      <div
                        v-else
                        class="flex h-full w-full items-center justify-center text-[8px] text-fg-subtle"
                      >
                        ▶
                      </div>
                    </div>
                    <div class="min-w-0 flex-1 py-0.5">
                      <div
                        class="line-clamp-2 text-[11px] font-semibold leading-snug text-fg"
                      >
                        {{ v.title }}
                      </div>
                      <div class="truncate text-[9px] text-fg-subtle">
                        {{ v.channelTitle }}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    class="vc-act-yt-add shrink-0 self-center rounded-lg px-2.5 py-1 text-[10px] font-bold text-white shadow-sm transition hover:brightness-110 active:scale-[0.97]"
                    @click.stop="pickVideo(v)"
                  >
                    Add
                  </button>
                </div>
              </li>
            </ul>
            <p
              v-else-if="queueSuggestHint && !queueSuggestLoading"
              class="text-[10px] leading-snug text-fg-subtle"
            >
              {{ queueSuggestHint }}
            </p>
          </div>
          <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-1.5">
            <p
              v-if="!st.playlist.length"
              class="px-1 py-8 text-center text-[11px] text-fg-subtle"
            >
              Nothing queued. Add videos from Search or from suggestions.
            </p>
            <ul v-else class="space-y-1">
              <li
                v-for="(row, i) in st.playlist"
                :key="row.id + ':' + i"
                class="vc-act-yt-row group flex items-center gap-1 rounded-xl p-1 transition-all duration-200"
                :class="
                  i === st.currentIndex
                    ? 'vc-act-yt-row--current ring-1 ring-[color-mix(in_srgb,var(--vc-yt-brand,#ff0033)_45%,var(--border))]'
                    : ''
                "
              >
                <button
                  type="button"
                  class="flex min-w-0 flex-1 gap-2.5 text-left"
                  @click="playVcYoutubeAtIndex(i)"
                >
                  <div
                    class="vc-act-yt-thumb relative aspect-video w-[5rem] shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-black/20"
                  >
                    <img
                      v-if="row.thumbnailUrl"
                      :src="row.thumbnailUrl"
                      alt=""
                      class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                      loading="lazy"
                    />
                    <div
                      v-else
                      class="flex h-full w-full items-center justify-center text-[9px] text-fg-subtle"
                    >
                      ▶
                    </div>
                    <span
                      v-if="i === st.currentIndex"
                      class="absolute bottom-0.5 left-0.5 rounded bg-black/75 px-1 py-px text-[7px] font-bold uppercase tracking-wide text-white"
                      >Live</span
                    >
                  </div>
                  <div class="min-w-0 flex-1 py-0.5">
                    <div class="flex items-start gap-1">
                      <span
                        class="line-clamp-2 text-[12px] font-semibold leading-snug tracking-tight text-fg"
                        >{{ row.title }}</span
                      >
                    </div>
                    <div class="mt-0.5 truncate text-[10px] text-fg-subtle">
                      {{ row.channelTitle }}
                    </div>
                  </div>
                </button>
                <div
                  class="flex shrink-0 flex-col gap-px rounded-md bg-elevated/50 p-px ring-1 ring-border/60"
                >
                  <button
                    type="button"
                    class="rounded p-0.5 text-fg-soft transition first:rounded-t-md last:rounded-b-md hover:bg-glass-hover hover:text-fg disabled:opacity-30"
                    aria-label="Move up"
                    :disabled="i === 0"
                    @click="moveVcYoutubeInQueue(i, i - 1)"
                  >
                    <svg
                      class="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M7 14l5-5 5 5H7z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="rounded p-0.5 text-fg-soft transition first:rounded-t-md last:rounded-b-md hover:bg-glass-hover hover:text-fg disabled:opacity-30"
                    aria-label="Move down"
                    :disabled="i >= st.playlist.length - 1"
                    @click="moveVcYoutubeInQueue(i, i + 1)"
                  >
                    <svg
                      class="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M7 10l5 5 5-5H7z" />
                    </svg>
                  </button>
                </div>
                <button
                  type="button"
                  class="shrink-0 rounded-lg p-1.5 text-fg-soft transition hover:bg-red-500/15 hover:text-red-400"
                  aria-label="Remove from queue"
                  @click="removeVcYoutubeFromQueue(i)"
                >
                  <svg
                    class="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </li>
            </ul>
          </div>
        </div>
      </aside>

      <!-- Main + queue -->
      <div
        class="flex min-h-0 min-w-0 flex-1 flex-col"
        :class="st.youtubeBrowseOpen && !compactLayout ? 'lg:pl-0' : ''"
      >
        <div
          class="vc-act-player-pane vc-act-yt-player-pane relative flex min-h-0 min-w-0 flex-1 flex-col p-2 sm:p-2.5"
          :class="compactLayout ? 'min-h-[36vh]' : ''"
        >
          <div
            class="vc-act-yt-player-frame relative min-h-0 flex-1 overflow-hidden rounded-xl ring-1 sm:rounded-2xl"
            :class="
              embedSrc
                ? 'bg-black ring-white/[0.12]'
                : 'bg-elevated/20 ring-border/55'
            "
          >
            <iframe
              v-if="embedSrc && !youtubeSyncUi"
              :key="st.youtubeVideoId ?? ''"
              :src="embedSrc"
              class="absolute inset-0 h-full w-full rounded-xl border-0 sm:rounded-2xl"
              title="YouTube video"
              allow="
                accelerometer;
                autoplay;
                clipboard-write;
                encrypted-media;
                gyroscope;
                picture-in-picture;
                web-share;
              "
              referrerpolicy="strict-origin-when-cross-origin"
              allowfullscreen
            />
            <div
              v-else-if="embedSrc && youtubeSyncUi"
              :key="st.youtubeVideoId ?? ''"
              ref="ytWatchPlayerEl"
              class="absolute inset-0 h-full w-full min-h-0 rounded-xl bg-black sm:rounded-2xl"
              title="YouTube video"
            />
            <div
              v-else
              class="custom-scrollbar absolute inset-0 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4"
            >
              <div class="mb-3 flex items-center justify-between gap-2">
                <span
                  class="text-[10px] font-bold uppercase tracking-[0.14em] text-fg-subtle"
                >
                  Suggested for you
                </span>
                <button
                  type="button"
                  class="rounded-full px-2 py-0.5 text-[10px] font-bold text-fg-soft transition hover:bg-glass-hover hover:text-fg"
                  :disabled="popularLoading"
                  @click="loadPopular"
                >
                  Refresh
                </button>
              </div>
              <p v-if="popularError" class="vc-act-msg-err mb-1.5 text-[11px]">
                {{ popularError }}
              </p>
              <p
                v-else-if="popularHint"
                class="vc-act-msg-hint mb-1.5 text-[10px] leading-snug"
              >
                {{ popularHint }}
              </p>
              <div
                v-if="popularLoading"
                class="py-10 text-center text-[12px] text-fg-subtle"
              >
                Loading…
              </div>
              <ul v-else class="mx-auto max-w-3xl space-y-1.5">
                <li v-for="v in popularItems" :key="v.id">
                  <button
                    type="button"
                    class="vc-act-yt-row group flex w-full gap-2.5 rounded-xl p-1.5 text-left transition-all duration-200"
                    @click="pickVideo(v)"
                  >
                    <div
                      class="vc-act-yt-thumb relative aspect-video w-[6.5rem] shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-black/20 sm:w-[7.5rem]"
                    >
                      <img
                        v-if="v.thumbnailUrl"
                        :src="v.thumbnailUrl"
                        alt=""
                        class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                        loading="lazy"
                      />
                    </div>
                    <div class="min-w-0 flex-1 py-0.5">
                      <div
                        class="line-clamp-2 text-left text-[13px] font-semibold leading-snug tracking-tight text-fg"
                      >
                        {{ v.title }}
                      </div>
                      <div
                        class="mt-0.5 truncate text-left text-[10px] text-fg-subtle"
                      >
                        {{ v.channelTitle }}
                      </div>
                    </div>
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Slim transport: prev/next + now playing + open queue (full list in drawer) -->
        <div
          v-if="st.phase === 'youtube' && st.playlist.length"
          class="vc-act-transport vc-act-yt-transport mx-2 mb-2 mt-0.5 flex shrink-0 items-center gap-2 rounded-xl border border-border/60 px-2 py-1.5 shadow-lg sm:mx-2.5 sm:gap-2.5 sm:px-2.5 sm:py-2"
        >
          <div
            class="flex shrink-0 items-center gap-px rounded-lg bg-elevated/70 p-px ring-1 ring-border/55"
          >
            <button
              type="button"
              class="rounded-md p-1.5 text-fg-soft transition hover:bg-glass-hover hover:text-fg disabled:opacity-35"
              aria-label="Previous in queue"
              :disabled="st.currentIndex <= 0"
              @click="playVcYoutubePrevious"
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
              </svg>
            </button>
            <button
              type="button"
              class="rounded-md p-1.5 text-fg-soft transition hover:bg-glass-hover hover:text-fg disabled:opacity-35"
              aria-label="Next in queue"
              :disabled="st.currentIndex >= st.playlist.length - 1"
              @click="playVcYoutubeNext"
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>
          </div>
          <div
            v-if="nowPlaying?.thumbnailUrl"
            class="vc-act-yt-transport-thumb hidden h-10 w-[4.5rem] shrink-0 overflow-hidden rounded-md ring-1 ring-black/30 sm:block"
          >
            <img
              :src="nowPlaying.thumbnailUrl"
              alt=""
              class="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
          <div class="min-w-0 flex-1 px-0.5">
            <div
              class="truncate text-[11px] font-semibold leading-tight tracking-tight"
              :title="nowPlaying?.title ?? ''"
            >
              {{ nowPlaying?.title ?? '—' }}
            </div>
            <div
              v-if="nextInQueue"
              class="truncate text-[10px] leading-tight text-fg-subtle"
              :title="nextInQueue.title"
            >
              Up next · {{ nextInQueue.title }}
            </div>
          </div>
          <button
            type="button"
            class="vc-act-yt-queue-pill shrink-0 rounded-full border border-border/70 bg-elevated/80 px-2.5 py-1 text-[10px] font-bold tabular-nums text-fg-soft shadow-sm transition hover:border-[color-mix(in_srgb,var(--vc-yt-brand,#ff0033)_40%,var(--border))] hover:text-fg sm:px-3"
            :title="`Up next · ${st.playlist.length} in queue`"
            @click="toggleBrowseQueue"
          >
            <span class="sm:hidden">{{ st.playlist.length }}</span>
            <span class="hidden sm:inline"
              >Queue · {{ st.playlist.length }}</span
            >
          </button>
        </div>
      </div>
    </div>

    <VcWatchTogetherLobby
      v-else-if="
        st.phase === 'watch_together' && !st.watchTogetherSessionStarted
      "
      :state="st"
      :channel-id="voiceChannelId ?? ''"
      :current-user-id="currentUserId ?? null"
      :effective-king-user-id="effectiveVcActivityKingUserId ?? ''"
      :live-kit-connected="tttLiveKitConnected"
      :set-watch-together-lobby-role="setWatchTogetherLobbyRole"
      :ensure-watch-together-session-id="ensureWatchTogetherSessionId"
      :patch-watch-together-ui="patchWatchTogetherUi"
      :start-watch-together-session="startWatchTogetherSession"
      :open-activity-picker="openVcActivityPicker"
    />
    <VcWatchTogetherStage
      v-else-if="
        st.phase === 'watch_together' && st.watchTogetherSessionStarted
      "
      :state="st"
      :compact-layout="compactLayout"
      :live-kit-connected="tttLiveKitConnected"
      :publish-vc-watch-together-playback-sync="
        publishVcWatchTogetherPlaybackSync
      "
      :vc-watch-together-remote-playback="vcWatchTogetherRemotePlayback"
      :vc-watch-together-playback-should-publish="
        vcWatchTogetherPlaybackShouldPublish
      "
      :set-watch-together-browse-open="setWatchTogetherBrowseOpen"
      :play-watch-together-at-index="playWatchTogetherAtIndex"
    />

    <!-- Wordline -->
    <div
      v-else-if="st.phase === 'wordle'"
      class="vc-act-wordline-stage custom-scrollbar flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    >
      <VcWordlineActivity
        class="min-h-0 min-w-0 flex-1"
        :account-user-id="currentUserId"
        :app-base="appBase"
        :wordline-view="props.wordlineView"
        :submit-wordline-guess="props.submitWordlineGuess"
        :set-wordline-mode="props.setWordlineMode"
      />
    </div>

    <!-- Hangman (voice-synced) -->
    <div
      v-else-if="st.phase === 'hangman'"
      class="custom-scrollbar flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    >
      <VcHangmanGame
        class="min-h-0 min-w-0 flex-1"
        :current-user-id="currentUserId ?? undefined"
        :hangman-activity="hmActivity"
        :hangman-roster-user-ids="hmRoster"
        :voice-participants="hangmanVoiceParticipants"
        :commit-word="props.commitVcHangmanWord"
        :guess-letter="props.requestVcHangmanGuessLetter"
        :next-round="props.requestVcHangmanNextRound"
      />
    </div>

    <!-- Skriggles (voice-synced draw & guess) -->
    <div
      v-else-if="st.phase === 'skriggles'"
      class="custom-scrollbar flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    >
      <VcSkrigglesGame
        class="min-h-0 min-w-0 flex-1"
        :current-user-id="currentUserId ?? undefined"
        :skriggles-activity="skActivity"
        :skriggles-roster-user-ids="skRoster"
        :voice-participants="hangmanVoiceParticipants"
        :canvas-events="skCanvasEvents"
        :commit-word-choice="props.commitSkrigglesWordChoice"
        :submit-guess="props.submitSkrigglesGuess"
        :update-settings="props.updateSkrigglesSettings"
        :start-game="props.startSkrigglesGame"
        :advance-round="props.advanceSkrigglesRound"
        :publish-stroke-batch="props.publishSkrigglesStrokeBatch"
        :publish-canvas-cmd="props.publishSkrigglesCanvasCmd"
        :publish-canvas-snapshot="props.publishSkrigglesCanvasSnapshot"
        :tick-timers="props.tickSkrigglesTimers"
      />
    </div>

    <!-- Tic Tac Echo (CPU + voice PvP) -->
    <div
      v-else-if="st.phase === 'tic_tac_toe'"
      class="custom-scrollbar flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    >
      <VcTicTacToeActivity
        class="min-h-0 min-w-0 flex-1"
        :current-user-id="currentUserId ?? ''"
        :live-kit-connected="tttLiveKitConnected"
        :voice-participants="ticTacToeVoiceParticipants"
        :pvp-activity="tttActivity"
        :pending-invite="tttPendingInvite"
        :send-challenge="props.sendVcTicTacToeChallenge"
        :respond-invite="props.respondVcTicTacToeInvite"
        :dismiss-invite="props.dismissVcTicTacToeInvite"
        :request-move="props.requestVcTicTacToeMove"
        :request-rematch="props.requestVcTicTacToeRematch"
      />
    </div>

    <!-- Echoed Names (voice-synced Codenames-style game) -->
    <div
      v-else-if="st.phase === 'codenames' && ECHOED_NAMES_VC_ACTIVITY_ENABLED"
      class="custom-scrollbar flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    >
      <VcCodenamesGame
        class="min-h-0 min-w-0 flex-1"
        :current-user-id="currentUserId ?? undefined"
        :active-voice-channel-participants="hangmanVoiceParticipants"
        :vc-codenames-activity="cnActivity"
        :codenames-roster-user-ids="cnRoster"
        :vc-codenames-spymaster-key="cnSpymasterKey"
        :commit-vc-codenames-deal="props.commitVcCodenamesDeal"
        :request-vc-codenames-setup="props.requestVcCodenamesSetup"
        :request-vc-codenames-clue="props.requestVcCodenamesClue"
        :request-vc-codenames-reveal="props.requestVcCodenamesReveal"
        :request-vc-codenames-end-turn="props.requestVcCodenamesEndTurn"
        :request-vc-codenames-new-game="props.requestVcCodenamesNewGame"
        :request-vc-codenames-push-key-to-orchestrator="
          props.requestVcCodenamesPushKeyToOrchestrator
        "
      />
    </div>

    <!-- Third-party iframe games (OpenGuessr, skribbl.io, Gartic Phone, Krunker, Richup, Goober Dash, Smash Karts, Cluster Rush) -->
    <div
      v-else-if="iframeEmbedPhase"
      class="relative min-h-0 min-w-0 flex-1 bg-black"
    >
      <iframe
        v-if="showIframeGame"
        :key="iframeEmbedKey"
        :src="iframeEmbedSrc"
        class="absolute inset-0 h-full w-full border-0"
        :title="iframeEmbedTitle"
        allow="
          accelerometer;
          autoplay;
          clipboard-write;
          encrypted-media;
          fullscreen;
          gamepad;
          geolocation;
          gyroscope;
          microphone;
          camera;
          payment;
          picture-in-picture;
        "
        referrerpolicy="strict-origin-when-cross-origin"
        allowfullscreen
      />
      <div v-else class="vc-webgl-block">
        <p class="vc-activity-overlay__title">
          This game needs hardware-accelerated graphics
        </p>
        <p class="vc-activity-overlay__body">
          {{ webglBlockReason }}. It may run very slowly or crash on this
          device. Try enabling hardware acceleration, updating your browser or
          GPU drivers, or open the game in its own tab.
        </p>
        <div class="vc-activity-overlay__actions">
          <button
            type="button"
            class="vc-activity-btn vc-activity-btn--primary"
            @click="openWebglGameInNewTab"
          >
            Open in new tab
          </button>
          <button
            type="button"
            class="vc-activity-btn"
            @click="webglTryAnyway = true"
          >
            Try anyway
          </button>
          <button
            type="button"
            class="vc-activity-btn"
            @click="openVcActivityPicker"
          >
            Pick another game
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.vc-activity-overlay,
.vc-webgl-block {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.85rem;
  padding: 1.5rem;
  text-align: center;
  background: color-mix(in srgb, var(--bg) 92%, transparent);
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
}
.vc-activity-overlay__title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
}
.vc-activity-overlay__body {
  max-width: 32rem;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--muted);
}
.vc-activity-overlay__hint {
  font-size: 0.75rem;
  color: color-mix(in srgb, var(--text) 45%, transparent);
}
.vc-activity-overlay__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}
.vc-activity-btn {
  cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  border-radius: 0.6rem;
  padding: 0.45rem 0.9rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text);
  background: color-mix(in srgb, var(--text) 8%, transparent);
  transition:
    background-color 0.14s ease,
    color 0.14s ease,
    filter 0.14s ease;
}
.vc-activity-btn:hover {
  background: color-mix(in srgb, var(--text) 14%, transparent);
}
.vc-activity-btn--primary {
  border-color: transparent;
  color: var(--accent-contrast-fg);
  background: var(--accent);
}
.vc-activity-btn--primary:hover {
  filter: brightness(1.06);
  background: var(--accent);
}

/* Activity library — image-forward grid cards */
.vc-act-library {
  background:
    radial-gradient(
      120% 80% at 50% -10%,
      color-mix(in srgb, var(--elevated) 88%, white 4%) 0%,
      transparent 55%
    ),
    var(--bg);
}

.vc-act-library__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.875rem;
}

@media (min-width: 480px) {
  .vc-act-library__grid {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 15.75rem), 1fr));
    gap: 1rem;
  }
}

@media (min-width: 900px) {
  .vc-act-library__grid {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 17.25rem), 1fr));
    gap: 1.125rem;
  }
}

@media (min-width: 1400px) {
  .vc-act-library__grid {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 18.5rem), 1fr));
    gap: 1.25rem;
  }
}

.vc-act-widget {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 1.125rem;
  border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  background: color-mix(in srgb, var(--elevated) 96%, var(--bg));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 8%, transparent) inset,
    0 14px 36px color-mix(in srgb, black 22%, transparent);
  outline: none;
  transition:
    transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.22s ease,
    border-color 0.2s ease,
    background 0.25s ease;
}

.vc-act-widget:hover {
  transform: translateY(-3px);
  box-shadow:
    0 1px 0 color-mix(in srgb, white 10%, transparent) inset,
    0 22px 48px color-mix(in srgb, black 30%, transparent);
}

.vc-act-widget:focus-visible {
  box-shadow:
    0 0 0 2px color-mix(in srgb, #7dd3fc 45%, transparent),
    0 18px 40px color-mix(in srgb, black 26%, transparent);
}

/* —— Per-activity art direction (card + hero tile) —— */

.vc-act-widget--youtube {
  --vc-act-a1: #ff2d4d;
  --vc-act-a2: #6b1020;
  background:
    radial-gradient(
      125% 95% at 100% -5%,
      color-mix(in srgb, var(--vc-act-a1) 40%, transparent) 0%,
      transparent 52%
    ),
    radial-gradient(
      95% 85% at 0% 100%,
      color-mix(in srgb, var(--vc-act-a2) 32%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      168deg,
      color-mix(in srgb, var(--elevated) 90%, #140608) 0%,
      color-mix(in srgb, var(--elevated) 98%, var(--bg)) 100%
    );
  border-color: color-mix(in srgb, var(--vc-act-a1) 24%, var(--border));
}
.vc-act-widget--youtube .vc-act-widget__media {
  background: linear-gradient(150deg, #100508 0%, #1a0a10 45%, #0a1524 100%);
}
.vc-act-widget--youtube:hover {
  border-color: color-mix(in srgb, var(--vc-act-a1) 44%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 9%, transparent) inset,
    0 24px 56px color-mix(in srgb, var(--vc-act-a1) 16%, black 28%);
}
.vc-act-widget--youtube:focus-visible {
  border-color: color-mix(in srgb, var(--vc-act-a1) 52%, var(--border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--vc-act-a1) 38%, transparent),
    0 20px 48px color-mix(in srgb, black 30%, transparent);
}
.vc-act-widget--youtube .vc-act-widget__cta {
  color: color-mix(in srgb, var(--fg-soft) 78%, var(--vc-act-a1) 22%);
}

.vc-act-widget--wordline {
  --vc-act-a1: #6aaa64;
  --vc-act-a2: #2f4d2c;
  background:
    radial-gradient(
      120% 100% at 12% -8%,
      color-mix(in srgb, var(--vc-act-a1) 36%, transparent) 0%,
      transparent 50%
    ),
    radial-gradient(
      100% 90% at 95% 100%,
      color-mix(in srgb, var(--vc-act-a2) 38%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      175deg,
      color-mix(in srgb, var(--elevated) 88%, #060806) 0%,
      color-mix(in srgb, var(--elevated) 98%, var(--bg)) 100%
    );
  border-color: color-mix(in srgb, var(--vc-act-a1) 22%, var(--border));
}
.vc-act-widget--wordline .vc-act-widget__media {
  background: linear-gradient(155deg, #050806 0%, #0c120c 50%, #0a1410 100%);
}
.vc-act-widget--wordline:hover {
  border-color: color-mix(in srgb, var(--vc-act-a1) 42%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 8%, transparent) inset,
    0 24px 52px color-mix(in srgb, var(--vc-act-a1) 14%, black 26%);
}
.vc-act-widget--wordline:focus-visible {
  border-color: color-mix(in srgb, var(--vc-act-a1) 50%, var(--border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--vc-act-a1) 35%, transparent),
    0 20px 44px color-mix(in srgb, black 28%, transparent);
}
.vc-act-widget--wordline .vc-act-widget__cta {
  color: color-mix(in srgb, var(--fg-soft) 75%, var(--vc-act-a1) 25%);
}

.vc-act-widget--hangman {
  --vc-act-a1: #f59e0b;
  --vc-act-a2: #7c3aed;
  background:
    radial-gradient(
      115% 100% at 12% -5%,
      color-mix(in srgb, var(--vc-act-a1) 32%, transparent) 0%,
      transparent 50%
    ),
    radial-gradient(
      100% 95% at 100% 100%,
      color-mix(in srgb, var(--vc-act-a2) 30%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      172deg,
      color-mix(in srgb, var(--elevated) 90%, #120810) 0%,
      color-mix(in srgb, var(--elevated) 98%, var(--bg)) 100%
    );
  border-color: color-mix(in srgb, var(--vc-act-a1) 22%, var(--border));
}
.vc-act-widget--hangman .vc-act-widget__media {
  background: linear-gradient(150deg, #140c08 0%, #120a18 48%, #0a1018 100%);
}
.vc-act-widget--hangman:hover {
  border-color: color-mix(in srgb, var(--vc-act-a1) 42%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 8%, transparent) inset,
    0 24px 52px color-mix(in srgb, var(--vc-act-a1) 14%, black 26%);
}
.vc-act-widget--hangman:focus-visible {
  border-color: color-mix(in srgb, var(--vc-act-a1) 50%, var(--border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--vc-act-a1) 35%, transparent),
    0 20px 44px color-mix(in srgb, black 28%, transparent);
}
.vc-act-widget--hangman .vc-act-widget__cta {
  color: color-mix(in srgb, var(--fg-soft) 74%, var(--vc-act-a1) 26%);
}

.vc-act-widget--skriggles {
  --vc-act-a1: #f59e0b;
  --vc-act-a2: #ec4899;
  background:
    radial-gradient(
      115% 100% at 10% -5%,
      color-mix(in srgb, var(--vc-act-a1) 34%, transparent) 0%,
      transparent 50%
    ),
    radial-gradient(
      100% 95% at 100% 100%,
      color-mix(in srgb, var(--vc-act-a2) 30%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      172deg,
      color-mix(in srgb, var(--elevated) 90%, #140a06) 0%,
      color-mix(in srgb, var(--elevated) 98%, var(--bg)) 100%
    );
  border-color: color-mix(in srgb, var(--vc-act-a1) 24%, var(--border));
}
.vc-act-widget--skriggles .vc-act-widget__media {
  background: linear-gradient(150deg, #1a0f06 0%, #201208 48%, #120818 100%);
}
.vc-act-widget--skriggles:hover {
  border-color: color-mix(in srgb, var(--vc-act-a1) 42%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 8%, transparent) inset,
    0 24px 52px color-mix(in srgb, var(--vc-act-a1) 14%, black 26%);
}
.vc-act-widget--skriggles:focus-visible {
  border-color: color-mix(in srgb, var(--vc-act-a1) 50%, var(--border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--vc-act-a1) 35%, transparent),
    0 20px 44px color-mix(in srgb, black 28%, transparent);
}
.vc-act-widget--skriggles .vc-act-widget__cta {
  color: color-mix(in srgb, var(--fg-soft) 74%, var(--vc-act-a1) 26%);
}

.vc-act-widget--tictactoe {
  --vc-act-a1: #6366f1;
  --vc-act-a2: #f472b6;
  background:
    radial-gradient(
      115% 100% at 8% -5%,
      color-mix(in srgb, var(--vc-act-a1) 34%, transparent) 0%,
      transparent 50%
    ),
    radial-gradient(
      100% 95% at 100% 100%,
      color-mix(in srgb, var(--vc-act-a2) 28%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      172deg,
      color-mix(in srgb, var(--elevated) 90%, #0c0818) 0%,
      color-mix(in srgb, var(--elevated) 98%, var(--bg)) 100%
    );
  border-color: color-mix(in srgb, var(--vc-act-a1) 22%, var(--border));
}
.vc-act-widget--tictactoe .vc-act-widget__media {
  background: linear-gradient(150deg, #0f0a1a 0%, #120c1c 48%, #081018 100%);
}
.vc-act-widget--tictactoe:hover {
  border-color: color-mix(in srgb, var(--vc-act-a1) 42%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 8%, transparent) inset,
    0 24px 52px color-mix(in srgb, var(--vc-act-a1) 14%, black 26%);
}
.vc-act-widget--tictactoe:focus-visible {
  border-color: color-mix(in srgb, var(--vc-act-a1) 50%, var(--border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--vc-act-a1) 35%, transparent),
    0 20px 44px color-mix(in srgb, black 28%, transparent);
}
.vc-act-widget--tictactoe .vc-act-widget__cta {
  color: color-mix(in srgb, var(--fg-soft) 74%, var(--vc-act-a1) 26%);
}

.vc-act-widget--openguessr {
  --vc-act-a1: #2b8a7a;
  --vc-act-a2: #1e4d7a;
  background:
    radial-gradient(
      115% 95% at 0% 0%,
      color-mix(in srgb, var(--vc-act-a1) 34%, transparent) 0%,
      transparent 48%
    ),
    radial-gradient(
      110% 100% at 100% 100%,
      color-mix(in srgb, var(--vc-act-a2) 36%, transparent) 0%,
      transparent 52%
    ),
    linear-gradient(
      165deg,
      color-mix(in srgb, var(--elevated) 90%, #050c10) 0%,
      color-mix(in srgb, var(--elevated) 98%, var(--bg)) 100%
    );
  border-color: color-mix(in srgb, var(--vc-act-a1) 22%, var(--border));
}
.vc-act-widget--openguessr .vc-act-widget__media {
  background: linear-gradient(145deg, #041016 0%, #0a1a22 45%, #06120f 100%);
}
.vc-act-widget--openguessr:hover {
  border-color: color-mix(in srgb, var(--vc-act-a1) 40%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 8%, transparent) inset,
    0 24px 52px color-mix(in srgb, var(--vc-act-a2) 12%, black 26%);
}
.vc-act-widget--openguessr:focus-visible {
  border-color: color-mix(in srgb, var(--vc-act-a1) 48%, var(--border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--vc-act-a1) 34%, transparent),
    0 20px 44px color-mix(in srgb, black 28%, transparent);
}
.vc-act-widget--openguessr .vc-act-widget__cta {
  color: color-mix(in srgb, var(--fg-soft) 76%, var(--vc-act-a1) 24%);
}

.vc-act-widget--skribblio {
  --vc-act-a1: #22d3ee;
  --vc-act-a2: #0f766e;
  background:
    radial-gradient(
      115% 95% at 8% 0%,
      color-mix(in srgb, var(--vc-act-a1) 36%, transparent) 0%,
      transparent 48%
    ),
    radial-gradient(
      105% 100% at 100% 100%,
      color-mix(in srgb, var(--vc-act-a2) 32%, transparent) 0%,
      transparent 50%
    ),
    linear-gradient(
      168deg,
      color-mix(in srgb, var(--elevated) 88%, #041216) 0%,
      color-mix(in srgb, var(--elevated) 98%, var(--bg)) 100%
    );
  border-color: color-mix(in srgb, var(--vc-act-a1) 24%, var(--border));
}
.vc-act-widget--skribblio .vc-act-widget__media {
  background: linear-gradient(150deg, #041a1c 0%, #0c1e2e 48%, #061814 100%);
}
.vc-act-widget--skribblio:hover {
  border-color: color-mix(in srgb, var(--vc-act-a1) 44%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 8%, transparent) inset,
    0 24px 52px color-mix(in srgb, var(--vc-act-a1) 14%, black 26%);
}
.vc-act-widget--skribblio:focus-visible {
  border-color: color-mix(in srgb, var(--vc-act-a1) 50%, var(--border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--vc-act-a1) 36%, transparent),
    0 20px 44px color-mix(in srgb, black 28%, transparent);
}
.vc-act-widget--skribblio .vc-act-widget__cta {
  color: color-mix(in srgb, var(--fg-soft) 74%, var(--vc-act-a1) 26%);
}

.vc-act-widget--garticphone {
  --vc-act-a1: #c084fc;
  --vc-act-a2: #db2777;
  background:
    radial-gradient(
      120% 100% at 100% 0%,
      color-mix(in srgb, var(--vc-act-a1) 32%, transparent) 0%,
      transparent 50%
    ),
    radial-gradient(
      95% 90% at 0% 100%,
      color-mix(in srgb, var(--vc-act-a2) 28%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      170deg,
      color-mix(in srgb, var(--elevated) 88%, #120818) 0%,
      color-mix(in srgb, var(--elevated) 98%, var(--bg)) 100%
    );
  border-color: color-mix(in srgb, var(--vc-act-a1) 24%, var(--border));
}
.vc-act-widget--garticphone .vc-act-widget__media {
  background: linear-gradient(160deg, #140818 0%, #1a0a16 40%, #0c1020 100%);
}
.vc-act-widget--garticphone:hover {
  border-color: color-mix(in srgb, var(--vc-act-a1) 42%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 9%, transparent) inset,
    0 24px 54px color-mix(in srgb, var(--vc-act-a2) 14%, black 26%);
}
.vc-act-widget--garticphone:focus-visible {
  border-color: color-mix(in srgb, var(--vc-act-a1) 50%, var(--border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--vc-act-a1) 36%, transparent),
    0 20px 46px color-mix(in srgb, black 28%, transparent);
}
.vc-act-widget--garticphone .vc-act-widget__cta {
  color: color-mix(in srgb, var(--fg-soft) 74%, var(--vc-act-a1) 26%);
}

.vc-act-widget--krunker {
  --vc-act-a1: #f97316;
  --vc-act-a2: #0d4d3d;
  background:
    radial-gradient(
      110% 100% at 85% -5%,
      color-mix(in srgb, var(--vc-act-a1) 34%, transparent) 0%,
      transparent 48%
    ),
    radial-gradient(
      100% 95% at 0% 100%,
      color-mix(in srgb, var(--vc-act-a2) 32%, transparent) 0%,
      transparent 50%
    ),
    linear-gradient(
      172deg,
      color-mix(in srgb, var(--elevated) 88%, #0a0c0a) 0%,
      color-mix(in srgb, var(--elevated) 98%, var(--bg)) 100%
    );
  border-color: color-mix(in srgb, var(--vc-act-a1) 22%, var(--border));
}
.vc-act-widget--krunker .vc-act-widget__media {
  background: linear-gradient(150deg, #0a0e0c 0%, #122018 48%, #1a1208 100%);
}
.vc-act-widget--krunker:hover {
  border-color: color-mix(in srgb, var(--vc-act-a1) 44%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 8%, transparent) inset,
    0 24px 54px color-mix(in srgb, var(--vc-act-a1) 15%, black 27%);
}
.vc-act-widget--krunker:focus-visible {
  border-color: color-mix(in srgb, var(--vc-act-a1) 52%, var(--border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--vc-act-a1) 36%, transparent),
    0 20px 46px color-mix(in srgb, black 28%, transparent);
}
.vc-act-widget--krunker .vc-act-widget__cta {
  color: color-mix(in srgb, var(--fg-soft) 72%, var(--vc-act-a1) 28%);
}

.vc-act-widget--gooberdash {
  --vc-act-a1: #e879f9;
  --vc-act-a2: #22d3ee;
  background:
    radial-gradient(
      100% 100% at 10% 0%,
      color-mix(in srgb, var(--vc-act-a1) 38%, transparent) 0%,
      transparent 46%
    ),
    radial-gradient(
      100% 95% at 100% 100%,
      color-mix(in srgb, var(--vc-act-a2) 34%, transparent) 0%,
      transparent 50%
    ),
    linear-gradient(
      168deg,
      color-mix(in srgb, var(--elevated) 88%, #0c0614) 0%,
      color-mix(in srgb, var(--elevated) 98%, var(--bg)) 100%
    );
  border-color: color-mix(in srgb, var(--vc-act-a1) 26%, var(--border));
}
.vc-act-widget--gooberdash .vc-act-widget__media {
  background: linear-gradient(148deg, #12081a 0%, #0a1622 48%, #1a0a18 100%);
}
.vc-act-widget--gooberdash:hover {
  border-color: color-mix(in srgb, var(--vc-act-a1) 44%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 8%, transparent) inset,
    0 24px 54px color-mix(in srgb, var(--vc-act-a2) 18%, black 26%);
}
.vc-act-widget--gooberdash:focus-visible {
  border-color: color-mix(in srgb, var(--vc-act-a1) 52%, var(--border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--vc-act-a1) 38%, transparent),
    0 20px 46px color-mix(in srgb, black 28%, transparent);
}
.vc-act-widget--gooberdash .vc-act-widget__cta {
  color: color-mix(in srgb, var(--fg-soft) 70%, var(--vc-act-a1) 30%);
}

.vc-act-widget--smashkarts {
  --vc-act-a1: #f97316;
  --vc-act-a2: #38bdf8;
  background:
    radial-gradient(
      105% 100% at 90% 0%,
      color-mix(in srgb, var(--vc-act-a1) 38%, transparent) 0%,
      transparent 48%
    ),
    radial-gradient(
      95% 95% at 8% 100%,
      color-mix(in srgb, var(--vc-act-a2) 32%, transparent) 0%,
      transparent 52%
    ),
    linear-gradient(
      168deg,
      color-mix(in srgb, var(--elevated) 88%, #160a04) 0%,
      color-mix(in srgb, var(--elevated) 98%, var(--bg)) 100%
    );
  border-color: color-mix(in srgb, var(--vc-act-a1) 26%, var(--border));
}
.vc-act-widget--smashkarts .vc-act-widget__media {
  background: linear-gradient(150deg, #1c0a04 0%, #122135 52%, #2a1004 100%);
}
.vc-act-widget--smashkarts:hover {
  border-color: color-mix(in srgb, var(--vc-act-a1) 46%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 8%, transparent) inset,
    0 24px 54px color-mix(in srgb, var(--vc-act-a1) 16%, black 26%);
}
.vc-act-widget--smashkarts:focus-visible {
  border-color: color-mix(in srgb, var(--vc-act-a1) 54%, var(--border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--vc-act-a1) 38%, transparent),
    0 20px 46px color-mix(in srgb, black 28%, transparent);
}
.vc-act-widget--smashkarts .vc-act-widget__cta {
  color: color-mix(in srgb, var(--fg-soft) 70%, var(--vc-act-a1) 30%);
}

.vc-act-widget--clusterrush {
  --vc-act-a1: #ff3814;
  --vc-act-a2: #003afa;
  background:
    radial-gradient(
      100% 90% at 14% 12%,
      color-mix(in srgb, var(--vc-act-a1) 34%, transparent) 0%,
      transparent 46%
    ),
    radial-gradient(
      95% 90% at 90% 88%,
      color-mix(in srgb, var(--vc-act-a2) 28%, transparent) 0%,
      transparent 50%
    ),
    linear-gradient(
      168deg,
      color-mix(in srgb, var(--elevated) 90%, #0a0a0a) 0%,
      color-mix(in srgb, var(--elevated) 98%, var(--bg)) 100%
    );
  border-color: color-mix(in srgb, var(--vc-act-a1) 22%, var(--border));
}
.vc-act-widget--clusterrush .vc-act-widget__media {
  background: linear-gradient(152deg, #0a0a0a 0%, #0f172a 45%, #120808 100%);
}
.vc-act-widget--clusterrush:hover {
  border-color: color-mix(in srgb, var(--vc-act-a1) 40%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 8%, transparent) inset,
    0 24px 54px color-mix(in srgb, var(--vc-act-a1) 14%, black 26%);
}
.vc-act-widget--clusterrush:focus-visible {
  border-color: color-mix(in srgb, var(--vc-act-a1) 48%, var(--border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--vc-act-a1) 34%, transparent),
    0 20px 46px color-mix(in srgb, black 28%, transparent);
}
.vc-act-widget--clusterrush .vc-act-widget__cta {
  color: color-mix(in srgb, var(--fg-soft) 70%, var(--vc-act-a1) 30%);
}

.vc-act-widget--echoed-names {
  --vc-act-a1: #b91c1c;
  --vc-act-a2: #1d4ed8;
  background:
    radial-gradient(
      100% 100% at 0% 0%,
      color-mix(in srgb, var(--vc-act-a1) 30%, transparent) 0%,
      transparent 46%
    ),
    radial-gradient(
      100% 100% at 100% 100%,
      color-mix(in srgb, var(--vc-act-a2) 28%, transparent) 0%,
      transparent 46%
    ),
    linear-gradient(
      168deg,
      color-mix(in srgb, var(--elevated) 90%, #061016) 0%,
      color-mix(in srgb, var(--elevated) 98%, var(--bg)) 100%
    );
  border-color: color-mix(in srgb, var(--vc-act-a1) 22%, var(--border));
}
.vc-act-widget--echoed-names .vc-act-widget__media {
  background: linear-gradient(145deg, #1a1410 0%, #14110e 45%, #0f172a 100%);
}
.vc-act-widget--echoed-names:hover {
  border-color: color-mix(in srgb, var(--vc-act-a1) 36%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 8%, transparent) inset,
    0 24px 52px color-mix(in srgb, var(--vc-act-a2) 12%, black 26%);
}
.vc-act-widget--echoed-names:focus-visible {
  border-color: color-mix(in srgb, var(--vc-act-a1) 44%, var(--border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--vc-act-a1) 32%, transparent),
    0 20px 44px color-mix(in srgb, black 28%, transparent);
}
.vc-act-widget--echoed-names .vc-act-widget__cta {
  color: color-mix(in srgb, var(--fg-soft) 78%, var(--vc-act-a1) 22%);
}

.vc-act-widget--richup {
  --vc-act-a1: #059669;
  --vc-act-a2: #ca8a04;
  background:
    radial-gradient(
      115% 100% at 15% -10%,
      color-mix(in srgb, var(--vc-act-a1) 32%, transparent) 0%,
      transparent 48%
    ),
    radial-gradient(
      100% 90% at 100% 100%,
      color-mix(in srgb, var(--vc-act-a2) 26%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      170deg,
      color-mix(in srgb, var(--elevated) 90%, #06120e) 0%,
      color-mix(in srgb, var(--elevated) 98%, var(--bg)) 100%
    );
  border-color: color-mix(in srgb, var(--vc-act-a1) 24%, var(--border));
}
.vc-act-widget--richup .vc-act-widget__media {
  background: linear-gradient(155deg, #051210 0%, #0c1812 45%, #141006 100%);
}
.vc-act-widget--richup:hover {
  border-color: color-mix(in srgb, var(--vc-act-a1) 40%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 8%, transparent) inset,
    0 24px 52px color-mix(in srgb, var(--vc-act-a2) 12%, black 25%);
}
.vc-act-widget--richup:focus-visible {
  border-color: color-mix(in srgb, var(--vc-act-a1) 48%, var(--border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--vc-act-a1) 32%, transparent),
    0 20px 44px color-mix(in srgb, black 27%, transparent);
}
.vc-act-widget--richup .vc-act-widget__cta {
  color: color-mix(in srgb, var(--fg-soft) 74%, var(--vc-act-a1) 26%);
}

/* Light theme: softer washes so cards stay readable */
:global(html[data-theme='light']) .vc-act-widget--youtube {
  background:
    radial-gradient(
      115% 90% at 100% 0%,
      color-mix(in srgb, #ff5c7a 22%, transparent) 0%,
      transparent 50%
    ),
    radial-gradient(
      90% 85% at 0% 100%,
      color-mix(in srgb, #fecdd3 45%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      175deg,
      color-mix(in srgb, var(--elevated) 96%, #fff5f6) 0%,
      var(--elevated) 100%
    );
}
:global(html[data-theme='light'])
  .vc-act-widget--youtube
  .vc-act-widget__media {
  background: linear-gradient(150deg, #fff1f3 0%, #ffe8ec 40%, #f0f4ff 100%);
}

:global(html[data-theme='light']) .vc-act-widget--wordline {
  background:
    radial-gradient(
      110% 95% at 10% 0%,
      color-mix(in srgb, #86c97f 28%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      175deg,
      color-mix(in srgb, var(--elevated) 97%, #ecfdf3) 0%,
      var(--elevated) 100%
    );
}
:global(html[data-theme='light'])
  .vc-act-widget--wordline
  .vc-act-widget__media {
  background: linear-gradient(155deg, #ecfdf3 0%, #e7f6ec 55%, #f0fdf4 100%);
}

:global(html[data-theme='light']) .vc-act-widget--hangman {
  background:
    radial-gradient(
      110% 95% at 10% 0%,
      color-mix(in srgb, #fcd34d 38%, transparent) 0%,
      transparent 48%
    ),
    radial-gradient(
      100% 90% at 100% 100%,
      color-mix(in srgb, #c4b5fd 34%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      175deg,
      color-mix(in srgb, var(--elevated) 96%, #fffbeb) 0%,
      var(--elevated) 100%
    );
}
:global(html[data-theme='light'])
  .vc-act-widget--hangman
  .vc-act-widget__media {
  background: linear-gradient(150deg, #fffbeb 0%, #faf5ff 50%, #f8fafc 100%);
}

:global(html[data-theme='light']) .vc-act-widget--tictactoe {
  background:
    radial-gradient(
      110% 95% at 8% 0%,
      color-mix(in srgb, #a5b4fc 42%, transparent) 0%,
      transparent 48%
    ),
    radial-gradient(
      100% 90% at 100% 100%,
      color-mix(in srgb, #fbcfe8 38%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      175deg,
      color-mix(in srgb, var(--elevated) 96%, #eef2ff) 0%,
      var(--elevated) 100%
    );
}
:global(html[data-theme='light'])
  .vc-act-widget--tictactoe
  .vc-act-widget__media {
  background: linear-gradient(150deg, #eef2ff 0%, #fae8ff 50%, #ecfeff 100%);
}

:global(html[data-theme='light']) .vc-act-widget--openguessr {
  background:
    radial-gradient(
      110% 95% at 0% 0%,
      color-mix(in srgb, #5eead4 22%, transparent) 0%,
      transparent 46%
    ),
    radial-gradient(
      100% 90% at 100% 100%,
      color-mix(in srgb, #93c5fd 28%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      175deg,
      color-mix(in srgb, var(--elevated) 96%, #ecfeff) 0%,
      var(--elevated) 100%
    );
}
:global(html[data-theme='light'])
  .vc-act-widget--openguessr
  .vc-act-widget__media {
  background: linear-gradient(145deg, #ecfeff 0%, #e0f2fe 50%, #f0fdf9 100%);
}

:global(html[data-theme='light']) .vc-act-widget--skribblio {
  background:
    radial-gradient(
      110% 95% at 10% 0%,
      color-mix(in srgb, #67e8f9 30%, transparent) 0%,
      transparent 46%
    ),
    radial-gradient(
      100% 90% at 100% 100%,
      color-mix(in srgb, #5eead4 26%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      175deg,
      color-mix(in srgb, var(--elevated) 96%, #ecfeff) 0%,
      var(--elevated) 100%
    );
}
:global(html[data-theme='light'])
  .vc-act-widget--skribblio
  .vc-act-widget__media {
  background: linear-gradient(148deg, #ecfeff 0%, #cffafe 50%, #f0fdfa 100%);
}

:global(html[data-theme='light']) .vc-act-widget--garticphone {
  background:
    radial-gradient(
      115% 100% at 100% 0%,
      color-mix(in srgb, #e9d5ff 55%, transparent) 0%,
      transparent 50%
    ),
    radial-gradient(
      95% 90% at 0% 100%,
      color-mix(in srgb, #fce7f3 50%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      175deg,
      color-mix(in srgb, var(--elevated) 95%, #fdf4ff) 0%,
      var(--elevated) 100%
    );
}
:global(html[data-theme='light'])
  .vc-act-widget--garticphone
  .vc-act-widget__media {
  background: linear-gradient(160deg, #faf5ff 0%, #fdf2f8 45%, #f5f3ff 100%);
}

:global(html[data-theme='light']) .vc-act-widget--krunker {
  background:
    radial-gradient(
      110% 95% at 90% 0%,
      color-mix(in srgb, #fdba74 35%, transparent) 0%,
      transparent 48%
    ),
    radial-gradient(
      95% 90% at 0% 100%,
      color-mix(in srgb, #6ee7b7 22%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      175deg,
      color-mix(in srgb, var(--elevated) 95%, #fffbeb) 0%,
      var(--elevated) 100%
    );
}
:global(html[data-theme='light'])
  .vc-act-widget--krunker
  .vc-act-widget__media {
  background: linear-gradient(150deg, #fffbeb 0%, #ecfdf5 50%, #fff7ed 100%);
}

:global(html[data-theme='light']) .vc-act-widget--gooberdash {
  background:
    radial-gradient(
      100% 100% at 8% 0%,
      color-mix(in srgb, #f0abfc 42%, transparent) 0%,
      transparent 46%
    ),
    radial-gradient(
      100% 95% at 100% 100%,
      color-mix(in srgb, #67e8f9 32%, transparent) 0%,
      transparent 50%
    ),
    linear-gradient(
      175deg,
      color-mix(in srgb, var(--elevated) 95%, #fdf4ff) 0%,
      var(--elevated) 100%
    );
}
:global(html[data-theme='light'])
  .vc-act-widget--gooberdash
  .vc-act-widget__media {
  background: linear-gradient(152deg, #faf5ff 0%, #ecfeff 48%, #fdf2f8 100%);
}

:global(html[data-theme='light']) .vc-act-widget--echoed-names {
  background:
    radial-gradient(
      100% 100% at 0% 0%,
      color-mix(in srgb, #fecaca 55%, transparent) 0%,
      transparent 46%
    ),
    radial-gradient(
      100% 100% at 100% 100%,
      color-mix(in srgb, #bfdbfe 50%, transparent) 0%,
      transparent 46%
    ),
    linear-gradient(
      175deg,
      var(--elevated) 0%,
      color-mix(in srgb, var(--elevated) 96%, #fafaf9) 100%
    );
}
:global(html[data-theme='light'])
  .vc-act-widget--echoed-names
  .vc-act-widget__media {
  background: linear-gradient(145deg, #fef2f2 0%, #f8fafc 50%, #eff6ff 100%);
}

:global(html[data-theme='light']) .vc-act-widget--richup {
  background:
    radial-gradient(
      110% 95% at 12% 0%,
      color-mix(in srgb, #6ee7b7 30%, transparent) 0%,
      transparent 48%
    ),
    radial-gradient(
      100% 90% at 100% 100%,
      color-mix(in srgb, #fde68a 40%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      175deg,
      color-mix(in srgb, var(--elevated) 96%, #ecfdf5) 0%,
      var(--elevated) 100%
    );
}
:global(html[data-theme='light']) .vc-act-widget--richup .vc-act-widget__media {
  background: linear-gradient(155deg, #ecfdf5 0%, #fffbeb 50%, #f0fdf4 100%);
}

:global(html[data-theme='light']) .vc-act-widget--smashkarts {
  background:
    radial-gradient(
      105% 100% at 92% 0%,
      color-mix(in srgb, #fb923c 38%, transparent) 0%,
      transparent 48%
    ),
    radial-gradient(
      95% 95% at 8% 100%,
      color-mix(in srgb, #7dd3fc 32%, transparent) 0%,
      transparent 52%
    ),
    linear-gradient(
      175deg,
      color-mix(in srgb, var(--elevated) 95%, #fff7ed) 0%,
      var(--elevated) 100%
    );
}
:global(html[data-theme='light'])
  .vc-act-widget--smashkarts
  .vc-act-widget__media {
  background: linear-gradient(150deg, #fff7ed 0%, #e0f2fe 52%, #ffedd5 100%);
}

:global(html[data-theme='light']) .vc-act-widget--clusterrush {
  background:
    radial-gradient(
      100% 90% at 14% 12%,
      color-mix(in srgb, #fca5a5 36%, transparent) 0%,
      transparent 46%
    ),
    radial-gradient(
      95% 90% at 90% 88%,
      color-mix(in srgb, #93c5fd 34%, transparent) 0%,
      transparent 50%
    ),
    linear-gradient(
      175deg,
      color-mix(in srgb, var(--elevated) 96%, #fef2f2) 0%,
      var(--elevated) 100%
    );
}
:global(html[data-theme='light'])
  .vc-act-widget--clusterrush
  .vc-act-widget__media {
  background: linear-gradient(152deg, #fef2f2 0%, #eff6ff 45%, #f8fafc 100%);
}

/* Sunny light variant: warm each game's hover border with an amber (#d97706)
 * wash. Per-variant accent + mix ratios only — shared structure via @each. */
$vc-act-sunny-hover-accents: (
  'youtube': '#fb7185 38%, #d97706 22%',
  'wordline': '#4ade80 36%, #d97706 22%',
  'hangman': '#fbbf24 36%, #d97706 22%',
  'tictactoe': '#818cf8 36%, #d97706 22%',
  'openguessr': '#2dd4bf 34%, #d97706 22%',
  'skribblio': '#22d3ee 36%, #d97706 20%',
  'garticphone': '#c084fc 34%, #d97706 22%',
  'krunker': '#fb923c 38%, #d97706 22%',
  'gooberdash': '#e879f9 34%, #d97706 22%',
  'echoed-names': '#22d3ee 32%, #d97706 24%',
  'richup': '#34d399 34%, #d97706 22%',
  'smashkarts': '#fb923c 38%, #d97706 22%',
  'clusterrush': '#f87171 34%, #d97706 22%',
);

@each $key, $accent in $vc-act-sunny-hover-accents {
  :global(html[data-theme='light'][data-echo-light-variant='sunny'])
    .vc-act-widget.vc-act-widget--#{$key}:hover {
    border-color: color-mix(in srgb, #{$accent}, var(--border));
  }
}

.vc-act-widget__media {
  position: relative;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  background: color-mix(in srgb, var(--bg) 42%, var(--surface) 58%);
}

.vc-act-widget__img {
  display: block;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 0;
  object-fit: cover;
  object-position: center;
  transform: scale(1.02);
  transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}

.vc-act-widget:hover .vc-act-widget__img {
  transform: scale(1.05);
}

.vc-act-widget__media-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    transparent 42%,
    color-mix(in srgb, var(--bg) 55%, black 45%) 100%
  );
  opacity: 0.55;
  pointer-events: none;
}

:global(html[data-theme='light']) .vc-act-widget__media-scrim {
  background: linear-gradient(
    180deg,
    transparent 42%,
    color-mix(in srgb, var(--surface) 40%, var(--text) 60%) 100%
  );
  opacity: 0.28;
}

.vc-act-widget__body {
  padding: 0.7rem 0.85rem 0.85rem;
}

.vc-act-widget__title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.vc-act-widget__title {
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--foreground);
}

.vc-act-widget__cta {
  font-size: 0.625rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: color-mix(in srgb, var(--fg-soft) 92%, #7dd3fc 8%);
  opacity: 0;
  transform: translateX(4px);
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.vc-act-widget:hover .vc-act-widget__cta,
.vc-act-widget:focus-visible .vc-act-widget__cta {
  opacity: 1;
  transform: translateX(0);
}

.vc-act-widget__desc {
  margin-top: 0.25rem;
  font-size: 0.6875rem;
  line-height: 1.35;
  color: var(--fg-subtle);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

@media (prefers-reduced-motion: reduce) {
  .vc-act-widget,
  .vc-act-widget__img {
    transition: none;
  }
  .vc-act-widget:hover {
    transform: none;
  }
  .vc-act-widget:hover .vc-act-widget__img {
    transform: none;
  }
  .vc-act-yt-row:hover {
    transform: none;
  }
}

.vc-act-msg-err {
  color: var(--vc-status-error-fg);
}

.vc-act-msg-hint {
  color: var(--vc-status-warn-fg);
}

/* —— YouTube watch-together: premium panel chrome —— */
.vc-act-youtube-stage {
  --vc-yt-brand: #ff0033;
  --vc-yt-brand-dim: #9f1028;
  background:
    radial-gradient(
      120% 70% at 50% -15%,
      color-mix(in srgb, var(--vc-yt-brand) 16%, transparent) 0%,
      transparent 55%
    ),
    radial-gradient(
      90% 55% at 100% 100%,
      color-mix(in srgb, var(--vc-yt-brand) 7%, transparent) 0%,
      transparent 50%
    ),
    var(--bg);
}

.vc-act-header--youtube {
  border-bottom-color: color-mix(
    in srgb,
    var(--vc-yt-brand) 28%,
    var(--border)
  );
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--elevated) 88%, #0c0406) 0%,
    var(--elevated) 100%
  );
}

.vc-act-header--echoed-names {
  border-bottom-color: color-mix(in srgb, #b91c1c 22%, var(--border));
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--elevated) 88%, #140a0c) 0%,
    var(--elevated) 100%
  );
}

/* —— Wordline: green puzzle chrome —— */
.vc-act-wordline-stage {
  --vc-wordline-brand: #6aaa64;
  --vc-wordline-brand-dim: #2f4d2c;
  background:
    radial-gradient(
      120% 70% at 50% -15%,
      color-mix(in srgb, var(--vc-wordline-brand) 14%, transparent) 0%,
      transparent 55%
    ),
    radial-gradient(
      90% 55% at 100% 100%,
      color-mix(in srgb, var(--vc-wordline-brand-dim) 10%, transparent) 0%,
      transparent 50%
    ),
    var(--bg);
}

.vc-act-header--wordline {
  border-bottom-color: color-mix(
    in srgb,
    var(--vc-wordline-brand) 26%,
    var(--border)
  );
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--elevated) 88%, #060806) 0%,
    var(--elevated) 100%
  );
}

.vc-act-browse-drawer {
  -webkit-backdrop-filter: blur(18px);
  backdrop-filter: blur(18px);
  background: color-mix(in srgb, var(--surface) 82%, transparent);
}

.vc-act-yt-segment {
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--fg) 3.5%, var(--elevated));
  border: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
  box-shadow:
    0 1px 0 color-mix(in srgb, white 5%, transparent) inset,
    0 6px 20px color-mix(in srgb, black 12%, transparent);
}

.vc-act-yt-segment__tab--active {
  background: color-mix(in srgb, var(--elevated) 94%, var(--bg));
  border: 1px solid color-mix(in srgb, var(--vc-yt-brand) 22%, var(--border));
  color: var(--fg);
}

.vc-act-yt-row {
  border: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
  background: color-mix(in srgb, var(--elevated) 52%, transparent);
  box-shadow: 0 1px 0 color-mix(in srgb, white 4%, transparent) inset;
}

.vc-act-yt-row:hover {
  border-color: color-mix(in srgb, var(--vc-yt-brand) 26%, var(--border));
  background: color-mix(in srgb, var(--elevated) 68%, transparent);
  box-shadow:
    0 1px 0 color-mix(in srgb, white 5%, transparent) inset,
    0 10px 28px color-mix(in srgb, black 18%, transparent);
  transform: translateY(-1px);
}

.vc-act-yt-row--current {
  background: color-mix(in srgb, var(--vc-yt-brand) 9%, var(--elevated));
  border-color: color-mix(in srgb, var(--vc-yt-brand) 34%, var(--border));
}

.vc-act-yt-search__go,
.vc-act-yt-add {
  background: linear-gradient(
    165deg,
    color-mix(in srgb, var(--vc-yt-brand) 92%, white) 0%,
    color-mix(in srgb, var(--vc-yt-brand-dim) 88%, black) 100%
  );
  border: 1px solid color-mix(in srgb, var(--vc-yt-brand) 55%, transparent);
}

.vc-act-yt-pill-btn {
  border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  background: color-mix(in srgb, var(--elevated) 70%, transparent);
}

.vc-act-yt-pill-btn:hover {
  border-color: color-mix(in srgb, var(--vc-yt-brand) 35%, var(--border));
  background: color-mix(in srgb, var(--vc-yt-brand) 8%, var(--elevated));
}

.vc-act-yt-fab-search {
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--vc-yt-brand) 95%, white) 0%,
    var(--vc-yt-brand-dim) 100%
  );
  border: 1px solid color-mix(in srgb, white 22%, transparent);
  box-shadow:
    0 0 0 1px color-mix(in srgb, black 35%, transparent),
    0 12px 28px color-mix(in srgb, var(--vc-yt-brand) 35%, black);
}

.vc-act-yt-player-pane {
  min-height: 0;
}

.vc-act-yt-player-frame {
  box-shadow:
    0 0 0 1px color-mix(in srgb, white 6%, transparent) inset,
    0 22px 50px color-mix(in srgb, black 38%, transparent);
}

.vc-act-yt-transport {
  -webkit-backdrop-filter: blur(16px);
  backdrop-filter: blur(16px);
  background: color-mix(in srgb, var(--elevated) 78%, transparent);
}

[data-theme='light'] .vc-act-youtube-stage {
  background:
    radial-gradient(
      120% 65% at 50% -12%,
      color-mix(in srgb, var(--vc-yt-brand) 10%, transparent) 0%,
      transparent 52%
    ),
    var(--bg);
}

[data-theme='light'] .vc-act-header--youtube {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--elevated) 96%, #fff5f5) 0%,
    var(--elevated) 100%
  );
}

[data-theme='light'] .vc-act-header--echoed-names {
  border-bottom-color: color-mix(in srgb, #dc2626 18%, var(--border));
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--elevated) 96%, #fef2f2) 0%,
    var(--elevated) 100%
  );
}

[data-theme='light'] .vc-act-wordline-stage {
  background:
    radial-gradient(
      120% 65% at 50% -12%,
      color-mix(in srgb, var(--vc-wordline-brand) 10%, transparent) 0%,
      transparent 52%
    ),
    var(--bg);
}

[data-theme='light'] .vc-act-header--wordline {
  border-bottom-color: color-mix(
    in srgb,
    var(--vc-wordline-brand) 22%,
    var(--border)
  );
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--elevated) 96%, #f4faf4) 0%,
    var(--elevated) 100%
  );
}

[data-theme='light'] .vc-act-browse-drawer {
  background: color-mix(in srgb, var(--surface) 90%, white);
}

[data-theme='light'] .vc-act-header {
  background: color-mix(in srgb, var(--elevated) 94%, var(--bg));
}

@media (min-width: 1024px) {
  .vc-act-youtube-stage .vc-act-browse-drawer {
    align-self: stretch;
    margin: 0.5rem 0 0.5rem 0.5rem;
    max-height: calc(100% - 1rem);
    border-radius: 1rem;
    border: 1px solid color-mix(in srgb, var(--vc-yt-brand) 14%, var(--border));
    box-shadow:
      0 1px 0 color-mix(in srgb, white 7%, transparent) inset,
      0 18px 46px color-mix(in srgb, black 28%, transparent);
  }
}
</style>

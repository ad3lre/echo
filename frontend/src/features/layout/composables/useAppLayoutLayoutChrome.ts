import { ref, watch, onMounted, onUnmounted, type Ref } from 'vue';
import type {
  VcActivityUiPhase,
  VcActivityUiState,
  YoutubePlaylistEntry,
} from '@/features/voice/vcActivityTypes';
import { syncYoutubeVideoIdFromPlaylist } from '@/features/voice/vcActivityTypes';
import { ECHOED_NAMES_VC_ACTIVITY_ENABLED } from '@shared/vcActivityCatalog';
import { prefetchPasskeyLoginOptions } from '@/utils/passkeyWebCeremony';

const MORE_SERVERS_PINNED_STORAGE_KEY = 'echo-more-servers-panel-pinned-v1';

function readMoreServersPinned(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(MORE_SERVERS_PINNED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMoreServersPinned(pinned: boolean) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(MORE_SERVERS_PINNED_STORAGE_KEY, pinned ? '1' : '0');
  } catch {
    /* quota / private mode */
  }
}
import type {
  MemberProfile,
  ExpandedProfile,
  PopoutAnchorRect,
} from '@/utils/memberProfiles';
import {
  loadProfileNotesMap,
  PROFILE_NOTES_STORAGE_KEY,
} from '@/utils/profileNotesPersistence';
import type { SettingsSection } from '@/features/settings/types';
import type { ServerSettingsSection } from '@/features/server-settings/types';

const DM_PANEL_WIDTH = 360;

/**
 * Modals, collapsible panels, sizes, voice control chrome — must not drive main-pane surface selection.
 */
export function useAppLayoutLayoutChrome(pfpBarExpanded: Ref<boolean>) {
  const isAuthModalOpen = ref(false);
  /** When opening login: start on Echo username/password vs OAuth/passkey hub. */
  const authModalInitialLoginEntry = ref<'social' | 'echo'>('social');
  /** After open, run passkey WebAuthn flow once (welcome gate shortcut). */
  const authModalPasskeyOnOpen = ref(false);
  /** First tab when opening auth modal (welcome create shortcut). */
  const authModalInitialTab = ref<'login' | 'register'>('login');
  /** Optional sub-view (e.g. forgot password) when opening the auth modal. */
  const authModalInitialSubView = ref<null | 'forgot'>(null);

  function openAuthModal(opts?: {
    entry?: 'social' | 'echo';
    passkey?: boolean;
    tab?: 'login' | 'register';
    /** Forgot-password screen (implies login tab, Echo entry). */
    forgot?: boolean;
  }) {
    if (opts?.forgot) {
      authModalInitialSubView.value = 'forgot';
      authModalInitialLoginEntry.value = 'echo';
      authModalInitialTab.value = 'login';
      authModalPasskeyOnOpen.value = false;
    } else {
      authModalInitialSubView.value = null;
      authModalInitialLoginEntry.value = opts?.entry ?? 'social';
      authModalPasskeyOnOpen.value = opts?.passkey ?? false;
      authModalInitialTab.value = opts?.tab ?? 'login';
      if (opts?.passkey) {
        void prefetchPasskeyLoginOptions();
      }
    }
    isAuthModalOpen.value = true;
  }

  watch(
    isAuthModalOpen,
    (open) => {
      if (!open) {
        authModalInitialLoginEntry.value = 'social';
        authModalPasskeyOnOpen.value = false;
        authModalInitialTab.value = 'login';
        authModalInitialSubView.value = null;
      }
    },
    { flush: 'sync' },
  );

  const isAddServerModalOpen = ref(false);
  const addServerInitialView = ref<'initial' | 'create' | 'join'>('initial');
  const isInviteModalOpen = ref(false);
  /** Voice row / VC context menu: invite link includes `?voice=` for deep-link join. */
  const inviteModalVoiceChannelId = ref<string | null>(null);
  const inviteModalVoiceChannelName = ref<string | null>(null);
  watch(isInviteModalOpen, (open) => {
    if (!open) {
      inviteModalVoiceChannelId.value = null;
      inviteModalVoiceChannelName.value = null;
    }
  });
  const isSettingsModalOpen = ref(false);
  /** When opening the modal, navigate to this section once (e.g. Discord OAuth return). */
  const settingsModalInitialSection = ref<SettingsSection | null>(null);
  /** Current settings sidebar section (URL sync + modal). */
  const settingsModalActiveSection = ref<SettingsSection>('Profile');
  const isServerSettingsModalOpen = ref(false);
  const serverSettingsModalInitialSection = ref<ServerSettingsSection | null>(
    null,
  );
  const serverSettingsModalActiveSection =
    ref<ServerSettingsSection>('Overview');
  const isMemberPopoutOpen = ref(false);
  const isSelfProfilePopoutOpen = ref(false);
  const isGroupDMModalOpen = ref(false);
  const isGroupDMSettingsOpen = ref(false);
  /** When opening group settings modal: which control to emphasize (focus). Cleared when modal closes. */
  const groupDmSettingsInitialFocus = ref<'name' | 'icon' | null>(null);
  const activeGroupSettingsId = ref<string | null>(null);
  const isDMPanelOpen = ref(false);
  const isMoreServersPanelOpen = ref(false);
  const isMoreServersCompact = ref(false);
  const isMoreServersPinned = ref(readMoreServersPinned());
  watch(isMoreServersPinned, (v) => writeMoreServersPinned(v));
  const activeMemberProfile = ref<MemberProfile | null>(null);
  const profileNotes = ref<Record<string, string>>(loadProfileNotesMap());
  function onProfileNotesStorage(ev: StorageEvent) {
    if (ev.key !== PROFILE_NOTES_STORAGE_KEY) return;
    profileNotes.value = loadProfileNotesMap();
  }
  onMounted(() => {
    if (typeof window === 'undefined') return;
    window.addEventListener('storage', onProfileNotesStorage);
  });
  onUnmounted(() => {
    if (typeof window === 'undefined') return;
    window.removeEventListener('storage', onProfileNotesStorage);
  });
  const memberPopoutAnchor = ref<PopoutAnchorRect | null>(null);
  /** Member list context menu → Roles: show role panel instead of quick profile card. */
  const memberPopoutOpenRolesPanel = ref(false);
  const selfProfileAnchor = ref<PopoutAnchorRect | null>(null);
  const isExpandedProfileModalOpen = ref(false);
  const isExpandedProfileSidePanel = ref(false);
  const isGroupOverviewOpen = ref(false);
  const expandedProfile = ref<ExpandedProfile | null>(null);
  /** User id the open profile shell is bound to (may load before `expandedProfile` hydrates). */
  const expandedProfileTargetUserId = ref<string | null>(null);
  /** Filled from auth `/me` in the layout controller; drives SelfProfilePopout. */
  const customStatus = ref('');
  const currentVoiceChannelId = ref<string | null>(null);
  const currentVoiceChannelName = ref('');
  const vcMuted = ref(false);
  const vcDeafened = ref(false);
  /**
   * Settings → Voice: mic listen-back routes the mic to speakers. While true, LiveKit
   * applies effective deafen so VC remote audio does not mix with the monitor (feedback).
   */
  const micTestListenDeafenActive = ref(false);

  function setMicTestListenDeafen(active: boolean) {
    micTestListenDeafenActive.value = active;
  }

  /** Mic mute state immediately before the user last turned local deafen on (restored on undeafen). */
  const vcMutedBeforeDeafen = ref(false);

  function applyVcDeafened(next: boolean) {
    if (next) {
      vcMutedBeforeDeafen.value = vcMuted.value;
      vcDeafened.value = true;
      vcMuted.value = true;
    } else {
      vcDeafened.value = false;
      vcMuted.value = vcMutedBeforeDeafen.value;
    }
  }
  const vcVideo = ref(false);
  const vcScreenshare = ref(false);
  const isScreenSharePickerOpen = ref(false);
  const isDesktopStreamingControlOpen = ref(false);
  const desktopStreamingControlMode = ref<'screen' | 'camera'>('screen');
  const fullscreenStreamParticipantId = ref<string | null>(null);

  const vcActivityUi = ref<VcActivityUiState>({
    phase: 'closed',
    youtubeVideoId: null,
    youtubeBrowseOpen: true,
    playlist: [],
    currentIndex: 0,
  });

  function closeVcActivity() {
    vcActivityUi.value = {
      phase: 'closed',
      youtubeVideoId: null,
      youtubeBrowseOpen: true,
      playlist: [],
      currentIndex: 0,
    };
  }

  function openVcActivityPicker() {
    fullscreenStreamParticipantId.value = null;
    vcActivityUi.value = {
      phase: 'pick',
      youtubeVideoId: null,
      youtubeBrowseOpen: true,
      playlist: [],
      currentIndex: 0,
    };
  }

  function openVcActivityYoutubeBrowse() {
    fullscreenStreamParticipantId.value = null;
    vcActivityUi.value = {
      phase: 'youtube',
      youtubeVideoId: null,
      youtubeBrowseOpen: true,
      playlist: [],
      currentIndex: 0,
    };
  }

  function openVcActivityWordle() {
    fullscreenStreamParticipantId.value = null;
    vcActivityUi.value = {
      phase: 'wordle',
      youtubeVideoId: null,
      youtubeBrowseOpen: false,
      playlist: [],
      currentIndex: 0,
    };
  }

  function openVcActivityHangman() {
    fullscreenStreamParticipantId.value = null;
    vcActivityUi.value = {
      phase: 'hangman',
      youtubeVideoId: null,
      youtubeBrowseOpen: false,
      playlist: [],
      currentIndex: 0,
    };
  }

  function openVcActivitySkriggles() {
    fullscreenStreamParticipantId.value = null;
    vcActivityUi.value = {
      phase: 'skriggles',
      youtubeVideoId: null,
      youtubeBrowseOpen: false,
      playlist: [],
      currentIndex: 0,
    };
  }

  function openVcActivityTicTacToe() {
    fullscreenStreamParticipantId.value = null;
    vcActivityUi.value = {
      phase: 'tic_tac_toe',
      youtubeVideoId: null,
      youtubeBrowseOpen: false,
      playlist: [],
      currentIndex: 0,
    };
  }

  function openVcActivityOpenGuessr() {
    fullscreenStreamParticipantId.value = null;
    vcActivityUi.value = {
      phase: 'openguessr',
      youtubeVideoId: null,
      youtubeBrowseOpen: false,
      playlist: [],
      currentIndex: 0,
    };
  }

  function openVcActivitySkribblIo() {
    fullscreenStreamParticipantId.value = null;
    vcActivityUi.value = {
      phase: 'skribbl_io',
      youtubeVideoId: null,
      youtubeBrowseOpen: false,
      playlist: [],
      currentIndex: 0,
    };
  }

  function openVcActivityGarticPhone() {
    fullscreenStreamParticipantId.value = null;
    vcActivityUi.value = {
      phase: 'gartic_phone',
      youtubeVideoId: null,
      youtubeBrowseOpen: false,
      playlist: [],
      currentIndex: 0,
    };
  }

  function openVcActivityKrunker() {
    fullscreenStreamParticipantId.value = null;
    vcActivityUi.value = {
      phase: 'krunker',
      youtubeVideoId: null,
      youtubeBrowseOpen: false,
      playlist: [],
      currentIndex: 0,
    };
  }

  function openVcActivityCodenames() {
    if (!ECHOED_NAMES_VC_ACTIVITY_ENABLED) {
      openVcActivityPicker();
      return;
    }
    fullscreenStreamParticipantId.value = null;
    vcActivityUi.value = {
      phase: 'codenames',
      youtubeVideoId: null,
      youtubeBrowseOpen: false,
      playlist: [],
      currentIndex: 0,
    };
  }

  function openVcActivityRichup() {
    fullscreenStreamParticipantId.value = null;
    vcActivityUi.value = {
      phase: 'richup',
      youtubeVideoId: null,
      youtubeBrowseOpen: false,
      playlist: [],
      currentIndex: 0,
    };
  }

  function openVcActivityGooberDash() {
    fullscreenStreamParticipantId.value = null;
    vcActivityUi.value = {
      phase: 'goober_dash',
      youtubeVideoId: null,
      youtubeBrowseOpen: false,
      playlist: [],
      currentIndex: 0,
    };
  }

  function openVcActivitySmashKarts() {
    fullscreenStreamParticipantId.value = null;
    vcActivityUi.value = {
      phase: 'smash_karts',
      youtubeVideoId: null,
      youtubeBrowseOpen: false,
      playlist: [],
      currentIndex: 0,
    };
  }

  function openVcActivityClusterRush() {
    fullscreenStreamParticipantId.value = null;
    vcActivityUi.value = {
      phase: 'cluster_rush',
      youtubeVideoId: null,
      youtubeBrowseOpen: false,
      playlist: [],
      currentIndex: 0,
    };
  }

  function setVcYoutubeBrowseOpen(open: boolean) {
    const cur = vcActivityUi.value;
    if (cur.phase !== 'youtube') return;
    vcActivityUi.value = { ...cur, youtubeBrowseOpen: open };
  }

  /**
   * Play this video now (replaces queue with a single item). Pass metadata when known
   * so the playlist row and watch-together sync stay rich.
   */
  function setVcActivityYoutubeVideo(
    videoId: string,
    meta?: Partial<
      Pick<YoutubePlaylistEntry, 'title' | 'channelTitle' | 'thumbnailUrl'>
    >,
  ) {
    const id = videoId.trim();
    if (id.length !== 11) return;
    fullscreenStreamParticipantId.value = null;
    const entry: YoutubePlaylistEntry = {
      id,
      title: (meta?.title ?? '').trim() || 'Video',
      channelTitle: (meta?.channelTitle ?? '').trim() || 'YouTube',
      thumbnailUrl: meta?.thumbnailUrl !== undefined ? meta.thumbnailUrl : null,
    };
    vcActivityUi.value = {
      phase: 'youtube',
      youtubeBrowseOpen: false,
      playlist: [entry],
      currentIndex: 0,
      youtubeVideoId: entry.id,
    };
  }

  function addVcYoutubeToQueue(entry: YoutubePlaylistEntry) {
    const cur = vcActivityUi.value;
    if (cur.phase !== 'youtube') return;
    const playlist = [...cur.playlist, entry];
    let { currentIndex } = cur;
    let youtubeVideoId = cur.youtubeVideoId;
    if (cur.playlist.length === 0) {
      currentIndex = 0;
      youtubeVideoId = entry.id;
    }
    vcActivityUi.value = {
      ...cur,
      playlist,
      currentIndex,
      youtubeVideoId,
    };
  }

  function removeVcYoutubeFromQueue(index: number) {
    const cur = vcActivityUi.value;
    if (cur.phase !== 'youtube') return;
    const playlist = cur.playlist.filter((_, i) => i !== index);
    let currentIndex = cur.currentIndex;
    if (index < currentIndex) currentIndex -= 1;
    if (playlist.length === 0) {
      vcActivityUi.value = {
        ...cur,
        playlist,
        currentIndex: 0,
        youtubeVideoId: null,
      };
      return;
    }
    if (currentIndex >= playlist.length) currentIndex = playlist.length - 1;
    const youtubeVideoId = syncYoutubeVideoIdFromPlaylist({
      ...cur,
      playlist,
      currentIndex,
    });
    vcActivityUi.value = {
      ...cur,
      playlist,
      currentIndex,
      youtubeVideoId,
    };
  }

  function moveVcYoutubeInQueue(from: number, to: number) {
    const cur = vcActivityUi.value;
    if (cur.phase !== 'youtube') return;
    const list = [...cur.playlist];
    if (from < 0 || from >= list.length || to < 0 || to >= list.length) return;
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    let currentIndex = cur.currentIndex;
    if (from === currentIndex) currentIndex = to;
    else if (from < currentIndex && to >= currentIndex) currentIndex -= 1;
    else if (from > currentIndex && to <= currentIndex) currentIndex += 1;
    currentIndex = Math.min(Math.max(0, currentIndex), list.length - 1);
    const youtubeVideoId = syncYoutubeVideoIdFromPlaylist({
      ...cur,
      playlist: list,
      currentIndex,
    });
    vcActivityUi.value = {
      ...cur,
      playlist: list,
      currentIndex,
      youtubeVideoId,
    };
  }

  function playVcYoutubeAtIndex(index: number) {
    const cur = vcActivityUi.value;
    if (cur.phase !== 'youtube' || index < 0 || index >= cur.playlist.length)
      return;
    vcActivityUi.value = {
      ...cur,
      currentIndex: index,
      youtubeVideoId: cur.playlist[index].id,
    };
  }

  function playVcYoutubeNext() {
    const cur = vcActivityUi.value;
    if (cur.phase !== 'youtube') return;
    if (cur.currentIndex + 1 >= cur.playlist.length) return;
    playVcYoutubeAtIndex(cur.currentIndex + 1);
  }

  function playVcYoutubePrevious() {
    const cur = vcActivityUi.value;
    if (cur.phase !== 'youtube') return;
    if (cur.currentIndex <= 0) return;
    playVcYoutubeAtIndex(cur.currentIndex - 1);
  }

  /** LiveKit watch-together: merge remote party state. */
  function applyVcYoutubeWatchTogetherRemote(snapshot: {
    playlist: YoutubePlaylistEntry[];
    currentIndex: number;
    youtubeBrowseOpen?: boolean;
    updatedAt: number;
    activityPhase?: VcActivityUiPhase;
  }) {
    void snapshot.updatedAt;
    const ap = snapshot.activityPhase;
    if (ap === 'closed') {
      closeVcActivity();
      return;
    }
    if (ap === 'pick') {
      openVcActivityPicker();
      return;
    }
    if (ap === 'wordle') {
      vcActivityUi.value = {
        phase: 'wordle',
        youtubeVideoId: null,
        youtubeBrowseOpen: false,
        playlist: [],
        currentIndex: 0,
      };
      return;
    }
    if (ap === 'hangman') {
      vcActivityUi.value = {
        phase: 'hangman',
        youtubeVideoId: null,
        youtubeBrowseOpen: false,
        playlist: [],
        currentIndex: 0,
      };
      return;
    }
    if (ap === 'tic_tac_toe') {
      vcActivityUi.value = {
        phase: 'tic_tac_toe',
        youtubeVideoId: null,
        youtubeBrowseOpen: false,
        playlist: [],
        currentIndex: 0,
      };
      return;
    }
    if (ap === 'codenames') {
      if (!ECHOED_NAMES_VC_ACTIVITY_ENABLED) {
        openVcActivityPicker();
        return;
      }
      vcActivityUi.value = {
        phase: 'codenames',
        youtubeVideoId: null,
        youtubeBrowseOpen: false,
        playlist: [],
        currentIndex: 0,
      };
      return;
    }
    if (
      ap === 'openguessr' ||
      ap === 'skribbl_io' ||
      ap === 'gartic_phone' ||
      ap === 'krunker' ||
      ap === 'richup' ||
      ap === 'goober_dash' ||
      ap === 'smash_karts' ||
      ap === 'cluster_rush'
    ) {
      vcActivityUi.value = {
        phase: ap,
        youtubeVideoId: null,
        youtubeBrowseOpen: false,
        playlist: [],
        currentIndex: 0,
      };
      return;
    }
    const playlist = snapshot.playlist;
    if (!playlist.length) {
      vcActivityUi.value = {
        phase: 'youtube',
        youtubeVideoId: null,
        youtubeBrowseOpen: snapshot.youtubeBrowseOpen ?? true,
        playlist: [],
        currentIndex: 0,
      };
      return;
    }
    const ci = Math.min(
      Math.max(0, snapshot.currentIndex),
      playlist.length - 1,
    );
    vcActivityUi.value = {
      phase: 'youtube',
      youtubeBrowseOpen: snapshot.youtubeBrowseOpen ?? false,
      playlist,
      currentIndex: ci,
      youtubeVideoId: playlist[ci].id,
    };
  }

  watch(currentVoiceChannelId, (id) => {
    if (!id) closeVcActivity();
  });

  const groupDMs = ref<
    Record<
      string,
      { id: string; name: string; memberIds: string[]; pfp?: string }
    >
  >({});
  const groupDMPreselectedIds = ref<string[]>([]);
  const groupDMLockedIds = ref<string[]>([]);
  const dmPanelWidth = ref(DM_PANEL_WIDTH);

  function onJoinVoice(payload: { channelId: string; channelName: string }) {
    currentVoiceChannelId.value = payload.channelId;
    currentVoiceChannelName.value = payload.channelName;
  }

  function onLeaveVoice() {
    currentVoiceChannelId.value = null;
    currentVoiceChannelName.value = '';
    vcDeafened.value = false;
    vcMuted.value = false;
    vcMutedBeforeDeafen.value = false;
    vcVideo.value = false;
    vcScreenshare.value = false;
    fullscreenStreamParticipantId.value = null;
    closeVcActivity();
  }

  function toggleMoreServersPanel() {
    const next = !isMoreServersPanelOpen.value;
    isMoreServersPanelOpen.value = next;
    if (next) {
      pfpBarExpanded.value = false;
    }
  }

  function startDmPanelResize(event: MouseEvent) {
    if (!isDMPanelOpen.value) return;
    const startX = event.clientX;
    const startWidth = dmPanelWidth.value;
    const minWidth = DM_PANEL_WIDTH;
    const maxWidth = 520;
    let lastDelta = 0;

    function onMove(e: MouseEvent) {
      const delta = e.clientX - startX;
      lastDelta = delta;
      const next = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));
      dmPanelWidth.value = next;
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (lastDelta < 0 && dmPanelWidth.value <= DM_PANEL_WIDTH) {
        isDMPanelOpen.value = false;
        dmPanelWidth.value = DM_PANEL_WIDTH;
      }
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function resetDmPanelWidth() {
    dmPanelWidth.value = DM_PANEL_WIDTH;
  }

  /** Add-server flow → user links Discord account (settings). */
  function openUserSettingsToDiscordFromAddServer() {
    isAddServerModalOpen.value = false;
    settingsModalInitialSection.value = 'Discord';
    isSettingsModalOpen.value = true;
  }

  return {
    DM_PANEL_WIDTH,
    isAuthModalOpen,
    authModalInitialLoginEntry,
    authModalPasskeyOnOpen,
    authModalInitialTab,
    authModalInitialSubView,
    openAuthModal,
    isAddServerModalOpen,
    addServerInitialView,
    isInviteModalOpen,
    inviteModalVoiceChannelId,
    inviteModalVoiceChannelName,
    isSettingsModalOpen,
    settingsModalInitialSection,
    settingsModalActiveSection,
    isServerSettingsModalOpen,
    serverSettingsModalInitialSection,
    serverSettingsModalActiveSection,
    isMemberPopoutOpen,
    isSelfProfilePopoutOpen,
    isGroupDMModalOpen,
    isGroupDMSettingsOpen,
    groupDmSettingsInitialFocus,
    activeGroupSettingsId,
    isDMPanelOpen,
    isMoreServersPanelOpen,
    isMoreServersCompact,
    isMoreServersPinned,
    activeMemberProfile,
    profileNotes,
    memberPopoutAnchor,
    memberPopoutOpenRolesPanel,
    selfProfileAnchor,
    isExpandedProfileModalOpen,
    isExpandedProfileSidePanel,
    isGroupOverviewOpen,
    expandedProfile,
    expandedProfileTargetUserId,
    customStatus,
    currentVoiceChannelId,
    currentVoiceChannelName,
    vcMuted,
    vcDeafened,
    micTestListenDeafenActive,
    setMicTestListenDeafen,
    applyVcDeafened,
    vcVideo,
    vcScreenshare,
    isScreenSharePickerOpen,
    isDesktopStreamingControlOpen,
    desktopStreamingControlMode,
    fullscreenStreamParticipantId,
    vcActivityUi,
    openVcActivityPicker,
    openVcActivityYoutubeBrowse,
    openVcActivityWordle,
    openVcActivityHangman,
    openVcActivitySkriggles,
    openVcActivityTicTacToe,
    openVcActivityOpenGuessr,
    openVcActivitySkribblIo,
    openVcActivityGarticPhone,
    openVcActivityKrunker,
    openVcActivityCodenames,
    openVcActivityRichup,
    openVcActivityGooberDash,
    openVcActivitySmashKarts,
    openVcActivityClusterRush,
    setVcActivityYoutubeVideo,
    setVcYoutubeBrowseOpen,
    addVcYoutubeToQueue,
    removeVcYoutubeFromQueue,
    moveVcYoutubeInQueue,
    playVcYoutubeAtIndex,
    playVcYoutubeNext,
    playVcYoutubePrevious,
    applyVcYoutubeWatchTogetherRemote,
    closeVcActivity,
    groupDMs,
    groupDMPreselectedIds,
    groupDMLockedIds,
    dmPanelWidth,
    onJoinVoice,
    onLeaveVoice,
    toggleMoreServersPanel,
    startDmPanelResize,
    resetDmPanelWidth,
    openUserSettingsToDiscordFromAddServer,
  };
}

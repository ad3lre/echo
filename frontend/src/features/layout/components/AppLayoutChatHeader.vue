<script setup lang="ts">
import {
  computed,
  inject,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  type ComputedRef,
  type Ref,
} from 'vue';
import type { MainSurface } from '@/features/layout/mainSurface';
import SearchBar from '@/components/chat/SearchBar.vue';
import MobileSearchModal from '@/components/chat/MobileSearchModal.vue';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import StatusIndicator from '@/components/StatusIndicator.vue';
import CallRingtoneControls from '@/components/CallRingtoneControls.vue';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { selectPresence } from '@/services/domain/presence';
import { parseEmojiIconKey } from '@/assets/icons';
import { resolveChannelIconRasterUrl } from '@/utils/channelIconKeys';
import {
  fallbackDiscordCdnCustomEmojiImageUrl,
  safeCustomEmojiUrl,
} from '@/utils/customEmojiUrl';
import { isEchoEmojiTokenResolveMiss } from '@/composables/useGlobalEmojiTokenResolver';
import { useCompactShell } from '@/composables/useCompactShell';
import { getActivePinia, storeToRefs } from 'pinia';
import { useDevSettingsStore } from '@/stores/devSettings';
import { clampMenuToViewport } from '@/features/chat/composables/useContextMenuPosition';
import type { ActiveDmThreadCallUi } from '@/features/layout/dmThreadCallUi';
import type {
  ChatHeaderIntents,
  ChatHeaderModel,
} from '@/features/layout/regionAdapters';
import type { RemoteParticipantTrackInfo } from '@/composables/useLiveKitVoiceRoom';
import type { RemoteTrack } from 'livekit-client';
import StreamVideoTile from '@/components/StreamVideoTile.vue';
import QuarterCallMediaBadges from '@/features/layout/components/QuarterCallMediaBadges.vue';
import { quarterCallMediaBadgesTitle } from '@/features/voice/voiceIndicatorHints';
import {
  COMPOSER_INSERT_USER_MENTION_KEY,
  type InsertUserMentionFn,
} from '@/features/chat/chatComposerContext';
import { isForumPostChannel } from '@/features/forums/domain/forumPostChannel';

const props = defineProps([
  'effectiveActiveChannel',
  'chatHeaderModel',
  'chatHeaderIntents',
  'isViewingVoiceChannel',
  'isInDMMode',
  'isInDMChat',
  'activeDmThreadCallUi',
  'isExpandedProfileSidePanel',
  'isExpandedProfileModalOpen',
  'isGroupOverviewOpen',
  'dmPartnerUser',
  'presenceByUserId',
  'presenceMobileByUserId',
  'openExpandedProfilePanelForUserId',
  'openExtendedProfileModalForUserId',
  'handleExpandedProfileOpenProfile',
  'isGroupDM',
  'activeGroupDM',
  'icons',
  'dmActiveTab',
  'getChannelIcon',
  'getChannelDisplayName',
  'togglePinsDropdown',
  'isRolePreviewActiveForServer',
  'rolePreview',
  'clearRolePreview',
  'channelPanelCollapsed',
  'memberPanelCollapsed',
  'memberPanelCollapsedRaw',
  'compactGuildTriPaneNav',
  'compactGuildSplitNav',
  'expandChannels',
  'expandMembers',
  'memberPanelWidth',
  'searchText',
  'filterChips',
  'allChannels',
  'users',
  'paginatedSearchResults',
  'searchResultMessagesCount',
  'searchResultPage',
  'totalPages',
  'selectedServerName',
  'onSearchInput',
  'addFilter',
  'removeFilter',
  'clearSearch',
  'goToSearchPage',
  'handleGoToMessage',
  'searchLoading',
  'searchError',
  'searchScopeHint',
  'endDmCall',
  'leaveDmCallVoice',
  'rejoinDmCallVoice',
  'answerDmCall',
  'declineDmCall',
  'startDmCall',
  'isPinsDropdownOpen',
  'pinsButtonRefDm',
  'pinsButtonRefServer',
  'openGroupDMModal',
  'openGroupSettingsFromHeader',
  'handleLeaveGroupDm',
  'startGroupCall',
  'openGroupOverviewPanel',
  'activeGroupCallMembers',
  'currentUser',
  'dmCallVideo',
  'dmCallScreenshare',
  'dmCallMuted',
  'dmCallDeafened',
  'onToggleDmCallVideo',
  'onToggleDmCallScreenshare',
  'onToggleDmCallMuted',
  'onToggleDmCallDeafened',
  'onSetDmCallFullscreen',
  'onOpenVoiceAudioSettings',
  'dmCallCallViewParticipants',
  'getRemoteParticipantVolume',
  'setRemoteParticipantVolume',
  'onRequestFullscreenStream',
  'fullscreenStreamParticipantId',
  /** Hide glass header while DM call uses full-surface DMCallView (has its own header). */
  'dmCallFullscreen',
  /** When set, hides this bar on DM hub surfaces so hub UIs (Friends, requests) are not covered by z-20. */
  'mainSurface',
  'getLocalScreenTrack',
  'getLocalCameraTrack',
  'vcMirrorCamera',
  'vcRemoteParticipants',
]);

const composerInsertUserMention =
  inject<Ref<InsertUserMentionFn | null> | null>(
    COMPOSER_INSERT_USER_MENTION_KEY,
    null,
  );

const headerModel = computed<ChatHeaderModel | null>(
  () =>
    (props as { chatHeaderModel?: ChatHeaderModel | null }).chatHeaderModel ??
    null,
);

const headerIntents = computed<ChatHeaderIntents | null>(
  () =>
    (props as { chatHeaderIntents?: ChatHeaderIntents | null })
      .chatHeaderIntents ?? null,
);

const dmPartnerUser = computed(() => {
  const fromAdapter = headerModel.value?.dm.partnerUser;
  if (fromAdapter !== undefined) return fromAdapter;
  return (
    (
      props as {
        dmPartnerUser?: {
          id?: string;
          name?: string;
          pfp?: string;
          status?: string;
        } | null;
      }
    ).dmPartnerUser ?? null
  );
});

type ActiveGroupDm = {
  id?: string;
  name?: string;
  pfp?: string;
  memberIds?: string[];
};

const activeGroupDM = computed(() => {
  const fromAdapter = headerModel.value?.dm.activeGroupDm;
  if (fromAdapter !== undefined) return fromAdapter;
  return (
    (props as { activeGroupDM?: ActiveGroupDm | null }).activeGroupDM ?? null
  );
});

const activeGroupMemberIds = computed(() => {
  const g = activeGroupDM.value as unknown as { memberIds?: unknown } | null;
  const ids = g?.memberIds;
  return Array.isArray(ids)
    ? ids.filter((x): x is string => typeof x === 'string')
    : [];
});

/** Group DM thread: never treat `dmPartnerUser` as the thread identity (avoids 1:1 chrome over group). */
const isGroupDmThread = computed(() => {
  const p = props as { isGroupDM?: boolean };
  return !!(p.isGroupDM && activeGroupDM.value);
});

const isExpandedProfileSidePanel = computed(() => {
  const fromAdapter = headerModel.value?.profile.isExpandedProfileSidePanel;
  if (typeof fromAdapter === 'boolean') return fromAdapter;
  return !!(props as { isExpandedProfileSidePanel?: boolean })
    .isExpandedProfileSidePanel;
});

const isExpandedProfileModalOpen = computed(() => {
  const fromAdapter = headerModel.value?.profile.isExpandedProfileModalOpen;
  if (typeof fromAdapter === 'boolean') return fromAdapter;
  return !!(props as { isExpandedProfileModalOpen?: boolean })
    .isExpandedProfileModalOpen;
});

const hasProfileOverviewAction = computed(() => {
  return !!(
    headerIntents.value?.openProfilePanelForUserId ||
    headerIntents.value?.openProfileModal ||
    (props as { openExpandedProfilePanelForUserId?: (userId: string) => void })
      .openExpandedProfilePanelForUserId ||
    (props as { openExtendedProfileModalForUserId?: (userId: string) => void })
      .openExtendedProfileModalForUserId
  );
});

function callOpenExpandedProfilePanelForUserId(
  userId: string | undefined | null,
) {
  const id = userId?.trim();
  if (!id) return;
  const fn = headerIntents.value?.openProfilePanelForUserId;
  if (fn) {
    fn(id);
    return;
  }
  (
    props as { openExpandedProfilePanelForUserId?: (userId: string) => void }
  ).openExpandedProfilePanelForUserId?.(id);
}

function callOpenExtendedProfileModalForUserId(
  userId: string | undefined | null,
) {
  const id = userId?.trim();
  if (!id) return;
  const fn = headerIntents.value?.openProfileModal;
  if (fn) {
    fn(id);
    return;
  }
  (
    props as { openExtendedProfileModalForUserId?: (userId: string) => void }
  ).openExtendedProfileModalForUserId?.(id);
}

function callOpenGroupOverviewPanel() {
  const groupId = activeGroupDM.value?.id;
  const fn = headerIntents.value?.openGroupOverviewPanel;
  if (fn) {
    fn(groupId);
    return;
  }
  (
    props as { openGroupOverviewPanel?: (groupId?: string) => void }
  ).openGroupOverviewPanel?.(groupId);
}

function callOpenGroupIconSettingsFromHeader() {
  const fn = (
    props as { openGroupSettingsFromHeader?: (f?: 'name' | 'icon') => void }
  ).openGroupSettingsFromHeader;
  if (isCompactShell.value) {
    fn?.('icon');
    return;
  }
  callOpenGroupOverviewPanel();
}

function callOpenGroupNameActionFromHeader() {
  const fn = (
    props as { openGroupSettingsFromHeader?: (f?: 'name' | 'icon') => void }
  ).openGroupSettingsFromHeader;
  if (isCompactShell.value) {
    fn?.('name');
    return;
  }
  callOpenGroupOverviewPanel();
}

/** “View group” pill: overview panel on desktop; group settings modal on compact (overview panel is hidden). */
function callOpenGroupOverviewShortcutFromHeader() {
  const fn = (
    props as { openGroupSettingsFromHeader?: (f?: 'name' | 'icon') => void }
  ).openGroupSettingsFromHeader;
  if (isCompactShell.value) {
    fn?.();
    return;
  }
  callOpenGroupOverviewPanel();
}

const groupEllipsisMenuOpen = ref(false);
const groupEllipsisMenuPos = ref({ left: 0, top: 0 });
const groupEllipsisMenuRef = ref<HTMLElement | null>(null);
const groupEllipsisButtonRef = ref<HTMLElement | null>(null);

function openGroupEllipsisMenu() {
  groupEllipsisMenuOpen.value = true;
  void nextTick(() => {
    requestAnimationFrame(() => {
      const btn = groupEllipsisButtonRef.value;
      const menu = groupEllipsisMenuRef.value;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const menuW = menu?.offsetWidth ?? 160;
      const menuH = menu?.offsetHeight ?? 80;
      const left = Math.min(rect.right - menuW, window.innerWidth - menuW - 8);
      const top = Math.min(rect.bottom + 4, window.innerHeight - menuH - 8);
      groupEllipsisMenuPos.value = {
        left: Math.max(8, left),
        top: Math.max(8, top),
      };
    });
  });
}

function closeGroupEllipsisMenu() {
  groupEllipsisMenuOpen.value = false;
}

function onGroupEllipsisDocMouseDown(event: MouseEvent) {
  const el = event.target as HTMLElement | null;
  if (el?.closest?.('.group-ellipsis-menu')) return;
  if (el?.closest?.('.group-ellipsis-btn')) return;
  closeGroupEllipsisMenu();
}

function callLeaveGroupDm() {
  closeGroupEllipsisMenu();
  const groupId = activeGroupDM.value?.id?.trim();
  if (!groupId) return;
  (
    props as {
      handleLeaveGroupDm?: (payload: {
        groupId: string;
      }) => void | Promise<void>;
    }
  ).handleLeaveGroupDm?.({ groupId });
}

function callOpenGroupSettingsFromEllipsis() {
  closeGroupEllipsisMenu();
  callOpenGroupOverviewShortcutFromHeader();
}

const { isCompactShell } = useCompactShell();
const activePinia = getActivePinia();
const devSettings = activePinia ? useDevSettingsStore(activePinia) : null;
const devModeIdsEnabled = activePinia
  ? storeToRefs(devSettings!).devModeIdsEnabled
  : computed(() => false);
const isServerSearchMobileOpen = ref(false);
const isDmSearchMobileOpen = ref(false);

const dmMobileSearchTitle = computed(() => {
  if (isGroupDmThread.value) {
    const name = activeGroupDM.value?.name?.trim();
    if (name) return `Search ${name}`;
  } else if (dmPartnerUser.value?.name?.trim()) {
    return `Search ${dmPartnerUser.value.name.trim()}`;
  }
  return 'Search conversation';
});

const dmMobileSearchPlaceholder = computed(() => {
  if (isGroupDmThread.value) return 'Search in group';
  return 'Search in conversation';
});

/** Close full-screen mobile search when jumping to a result (modal would otherwise obscure chat). */
function handleGoToMessageFromSearch(channelId: string, messageId: string) {
  isServerSearchMobileOpen.value = false;
  isDmSearchMobileOpen.value = false;
  (
    props as { handleGoToMessage?: (c: string, m: string) => void }
  ).handleGoToMessage?.(channelId, messageId);
}

const isDmHubSurface = computed(() => {
  const s = (props as { mainSurface?: MainSurface }).mainSurface;
  return s?.type === 'dmFriends' || s?.type === 'dmRequests';
});

const activeDmThreadCallUi = computed<ActiveDmThreadCallUi | null>(
  () =>
    (props as { activeDmThreadCallUi?: ActiveDmThreadCallUi | null })
      .activeDmThreadCallUi ?? null,
);

const isGuestSession = computed(() => {
  const u = (props as { currentUser?: { isGuest?: boolean } | null })
    .currentUser;
  return !!u?.isGuest;
});

/** Guests cannot start calls (LiveKit); still show Leave when a call UI is active for this thread. */
const showDmDirectCallButton = computed(() => {
  if (!isGuestSession.value) return true;
  return activeDmThreadCallUi.value?.targetId === dmPartnerUser.value?.id;
});

const showGroupDmCallButton = computed(() => {
  const p = props as { activeGroupDM?: { id?: string } | null };
  if (!isGuestSession.value) return true;
  return !!(
    p.activeGroupDM &&
    activeDmThreadCallUi.value?.targetId === p.activeGroupDM.id
  );
});

const dmCallCanAnswerIncoming = computed(() => !isGuestSession.value);
const localDmCallTargetsDirectThread = computed(() => {
  const partnerId = dmPartnerUser.value?.id;
  return !!(
    partnerId &&
    activeDmThreadCallUi.value?.targetId === partnerId &&
    activeDmThreadCallUi.value?.visualOnly !== true
  );
});

const localDmCallTargetsGroupThread = computed(() => {
  const groupId = (props as { activeGroupDM?: { id?: string } | null })
    .activeGroupDM?.id;
  return !!(
    groupId &&
    activeDmThreadCallUi.value?.targetId === groupId &&
    activeDmThreadCallUi.value?.visualOnly !== true
  );
});

const leadingEmoji = computed(() => {
  const ch = (props as { effectiveActiveChannel?: { iconKey?: string } | null })
    .effectiveActiveChannel;
  return parseEmojiIconKey(ch?.iconKey ?? '');
});

const customEmojiUrlById = inject<ComputedRef<Map<string, string>> | undefined>(
  'customEmojiUrlById',
  undefined,
);

const ensureCustomEmojiId = inject<((id: string) => void) | undefined>(
  'ensureCustomEmojiId',
  undefined,
);

const leadingChannelRasterIconUrl = computed(() => {
  const ch = (props as { effectiveActiveChannel?: { iconKey?: string } | null })
    .effectiveActiveChannel;
  const key = ch?.iconKey ?? '';
  if (!key.trim() || leadingEmoji.value) return '';
  return (
    resolveChannelIconRasterUrl(key, (id) => {
      const url = customEmojiUrlById?.value?.get(id)?.trim();
      if (url) {
        const s = safeCustomEmojiUrl(url);
        if (s) return s;
      }
      if (isEchoEmojiTokenResolveMiss(id)) {
        const cdn = fallbackDiscordCdnCustomEmojiImageUrl(id, false);
        if (cdn) return cdn;
      }
      ensureCustomEmojiId?.(id);
      return undefined;
    }) ?? ''
  );
});

/** Same merge as DM list + profile panel: authoritative socket presence wins over stale row status. */
const dmPartnerPresence = computed(() => {
  const p = props as {
    presenceByUserId?: Record<string, string | undefined>;
    presenceMobileByUserId?: Record<string, true>;
  };
  const u = dmPartnerUser.value;
  if (!u?.id) {
    return selectPresence({
      rowStatus: undefined,
      diagnosticsKey: 'chat-header:dm-partner-empty',
    });
  }
  return selectPresence({
    authoritativeStatus: p.presenceByUserId?.[u.id],
    rowStatus: u.status,
    diagnosticsKey: `chat-header:${u.id}`,
    mobileSurface: !!p.presenceMobileByUserId?.[u.id],
  });
});

const dmCallQuarterPeerRing = computed(() => {
  const localCall = activeDmThreadCallUi.value;
  return !!(localCall && localCall.ringUi && !localCall.ringRemoteVanishing);
});

const dmCallQuarterPeerVanish = computed(() => {
  const localCall = activeDmThreadCallUi.value;
  return !!(localCall && localCall.ringRemoteVanishing);
});

const dmCallQuarterPeerVisualClass = computed(() => ({
  'dm-call-peer-visual--ring': dmCallQuarterPeerRing.value,
  'dm-call-peer-visual--vanish': dmCallQuarterPeerVanish.value,
}));

type QuarterCallParticipantMediaRow = {
  id: string;
  name?: string;
  speaking?: boolean;
  muted?: boolean;
  deafened?: boolean;
  serverMuted?: boolean;
  serverDeafened?: boolean;
  dmCallPresence?: string;
};

const dmCallParticipantById = computed(() => {
  const p = props as {
    dmCallCallViewParticipants?: QuarterCallParticipantMediaRow[];
  };
  return new Map(
    (p.dmCallCallViewParticipants ?? []).map((participant) => [
      participant.id,
      participant,
    ]),
  );
});

function quarterRowForUser(
  userId: string | null | undefined,
): QuarterCallParticipantMediaRow | undefined {
  const id = userId?.trim();
  if (!id) return undefined;
  return dmCallParticipantById.value.get(id);
}

/** Mute/deafen badges for quarter glass avatars (live participants only; avoids ringing placeholder muted). */
function quarterMediaBadgesForUser(
  userId: string | null | undefined,
  isLocalSelf: boolean,
): { showDeafened: boolean; showMutedOnly: boolean } {
  if (isLocalSelf) {
    const p = props as { dmCallMuted?: boolean; dmCallDeafened?: boolean };
    if (p.dmCallDeafened) return { showDeafened: true, showMutedOnly: false };
    if (p.dmCallMuted) return { showDeafened: false, showMutedOnly: true };
    return { showDeafened: false, showMutedOnly: false };
  }
  const r = quarterRowForUser(userId);
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

const quarterOneToOnePeerId = computed(() => {
  if (isGroupDmThread.value) return '';
  return (
    dmPartnerUser.value?.id ??
    activeDmThreadCallUi.value?.glassPeer?.id ??
    ''
  ).trim();
});

const quarterPeerMediaBadges = computed(() =>
  quarterMediaBadgesForUser(quarterOneToOnePeerId.value || null, false),
);

const quarterSelfMediaBadges = computed(() =>
  quarterMediaBadgesForUser(null, true),
);

function quarterAvatarMediaTitle(
  userId: string | null | undefined,
  isLocalSelf: boolean,
): string | undefined {
  return quarterCallMediaBadgesTitle(
    quarterMediaBadgesForUser(userId, isLocalSelf),
  );
}

const quarterGlanceMediaTitle = computed(() =>
  quarterCallMediaBadgesTitle(quarterGlanceMediaBadges.value),
);

function isDmCallParticipantSpeaking(
  userId: string | null | undefined,
): boolean {
  const id = userId?.trim();
  if (!id || dmCallQuarterPeerRing.value || dmCallQuarterPeerVanish.value)
    return false;
  return !!dmCallParticipantById.value.get(id)?.speaking;
}

const dmCallQuarterPeerSpeaking = computed(() => {
  if (isGroupDmThread.value) {
    return isDmCallParticipantSpeaking(
      activeDmThreadCallUi.value?.glassPeer?.id ?? null,
    );
  }
  return isDmCallParticipantSpeaking(
    dmPartnerUser.value?.id ??
      activeDmThreadCallUi.value?.glassPeer?.id ??
      null,
  );
});

const dmCallQuarterSelfSpeaking = computed(() => {
  const p = props as { currentUser?: { id?: string } | null };
  return isDmCallParticipantSpeaking(p.currentUser?.id ?? null);
});

function isPaperChannelOption(ch: unknown): boolean {
  return (
    ch !== null &&
    typeof ch === 'object' &&
    (ch as { type?: unknown }).type === 'paper'
  );
}

type SearchFilterChannel = {
  id: string;
  name: string;
};

function isSearchFilterChannel(ch: unknown): ch is SearchFilterChannel {
  if (ch === null || typeof ch !== 'object') return false;
  const row = ch as { id?: unknown; name?: unknown };
  return typeof row.id === 'string' && typeof row.name === 'string';
}

const searchFilterChannels = computed((): SearchFilterChannel[] => {
  const p = props as { allChannels?: unknown[] };
  return (p.allChannels ?? []).filter(
    (ch): ch is SearchFilterChannel =>
      isSearchFilterChannel(ch) &&
      !isForumPostChannel(ch) &&
      !isPaperChannelOption(ch),
  );
});

function isActiveGroupMemberSpeaking(memberId: string): boolean {
  return isDmCallParticipantSpeaking(memberId);
}

type QuarterCallMenuTarget = {
  id: string;
  name: string;
};

const quarterCallMenuTarget = ref<QuarterCallMenuTarget | null>(null);
const quarterCallMenuPos = ref({ left: 0, top: 0 });
const quarterCallMenuRef = ref<HTMLElement | null>(null);
const quarterCallMenuVolumeDraft = ref(100);
const quarterCallLastNonZeroVolume = ref(100);
/** Invalidate quarter-glance volume slider after writes / playback wiring (LiveKit getters are non-reactive). */
const quarterGlanceRemoteVolumeRev = ref(0);

function quarterCallMenuHasVolumeControl(): boolean {
  return (
    typeof (props as { setRemoteParticipantVolume?: unknown })
      .setRemoteParticipantVolume === 'function'
  );
}

const quarterCallCanComposerMention = computed(
  () => !!composerInsertUserMention?.value,
);

function quarterCallContextMenuCanOpen(targetId: string): boolean {
  const selfId =
    (props as { currentUser?: { id?: string } | null }).currentUser?.id ?? '';
  if (!targetId.trim() || targetId === selfId) return false;
  return (
    quarterCallMenuHasVolumeControl() || quarterCallCanComposerMention.value
  );
}

const quarterCallMenuShowMention = computed(() => {
  const t = quarterCallMenuTarget.value;
  if (!t?.id || !composerInsertUserMention?.value) return false;
  const selfId =
    (props as { currentUser?: { id?: string } | null }).currentUser?.id ?? '';
  return t.id !== selfId;
});

function closeQuarterCallMenu() {
  quarterCallMenuTarget.value = null;
}

function openQuarterCallProfileMenu(
  target: QuarterCallMenuTarget,
  event: MouseEvent,
) {
  event.preventDefault();
  event.stopPropagation();
  if (!target.id?.trim()) return;
  if (!quarterCallContextMenuCanOpen(target.id)) return;
  if (quarterCallMenuHasVolumeControl()) {
    const getRemoteParticipantVolume = (
      props as { getRemoteParticipantVolume?: (userId: string) => number }
    ).getRemoteParticipantVolume;
    const volume = getRemoteParticipantVolume?.(target.id) ?? 100;
    quarterCallMenuVolumeDraft.value = volume;
    if (volume > 0) quarterCallLastNonZeroVolume.value = volume;
  }
  quarterCallMenuTarget.value = target;
  quarterCallMenuPos.value = clampMenuToViewport(
    event.clientX,
    event.clientY,
    240,
    180,
  );
  void nextTick(() => {
    requestAnimationFrame(() => {
      const el = quarterCallMenuRef.value;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      quarterCallMenuPos.value = clampMenuToViewport(
        rect.left,
        rect.top,
        rect.width,
        rect.height,
      );
    });
  });
}

function onQuarterCallVolumeInput(event: Event) {
  const target = quarterCallMenuTarget.value;
  const setRemoteParticipantVolume = (
    props as {
      setRemoteParticipantVolume?: (
        userId: string,
        volumePercent: number,
      ) => void;
    }
  ).setRemoteParticipantVolume;
  if (!target || !setRemoteParticipantVolume) return;
  const next = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(next)) return;
  quarterCallMenuVolumeDraft.value = next;
  if (next > 0) quarterCallLastNonZeroVolume.value = next;
  setRemoteParticipantVolume(target.id, next);
}

function onQuarterCallRemoteVideoPlaybackWired(participantId: string) {
  const setRemoteParticipantVolume = (
    props as {
      setRemoteParticipantVolume?: (
        userId: string,
        volumePercent: number,
      ) => void;
    }
  ).setRemoteParticipantVolume;
  const getRemoteParticipantVolume = (
    props as { getRemoteParticipantVolume?: (userId: string) => number }
  ).getRemoteParticipantVolume;
  if (!setRemoteParticipantVolume) return;
  const id = participantId.trim();
  if (!id) return;
  setRemoteParticipantVolume(id, getRemoteParticipantVolume?.(id) ?? 100);
  quarterGlanceRemoteVolumeRev.value += 1;
}

function toggleQuarterCallMuteForMe() {
  const target = quarterCallMenuTarget.value;
  const setRemoteParticipantVolume = (
    props as {
      setRemoteParticipantVolume?: (
        userId: string,
        volumePercent: number,
      ) => void;
    }
  ).setRemoteParticipantVolume;
  if (!target || !setRemoteParticipantVolume) return;
  if (quarterCallMenuVolumeDraft.value <= 0) {
    const next =
      quarterCallLastNonZeroVolume.value > 0
        ? quarterCallLastNonZeroVolume.value
        : 100;
    quarterCallMenuVolumeDraft.value = next;
    setRemoteParticipantVolume(target.id, next);
    return;
  }
  quarterCallLastNonZeroVolume.value = quarterCallMenuVolumeDraft.value;
  quarterCallMenuVolumeDraft.value = 0;
  setRemoteParticipantVolume(target.id, 0);
}

const quarterCallMenuMuted = computed(
  () => quarterCallMenuVolumeDraft.value <= 0,
);

function mentionFromQuarterCallMenu() {
  const t = quarterCallMenuTarget.value;
  const fn = composerInsertUserMention?.value;
  if (!t?.id || !fn) return;
  closeQuarterCallMenu();
  fn({ userId: t.id, displayName: t.name?.trim() || 'user' });
}

function onDocumentPointerDown(event: MouseEvent) {
  const el = event.target as HTMLElement | null;
  if (el?.closest?.('.dm-call-quarter-menu')) return;
  closeQuarterCallMenu();
}

onMounted(() => {
  document.addEventListener('mousedown', onDocumentPointerDown, true);
  document.addEventListener('mousedown', onGroupEllipsisDocMouseDown, true);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', onDocumentPointerDown, true);
  document.removeEventListener('mousedown', onGroupEllipsisDocMouseDown, true);
});

/** Quarter call row + tall header only on the DM thread that owns the active call. */
const showDmCallQuarterChrome = computed(() => {
  const p = props as {
    isInDMMode?: boolean;
    isInDMChat?: boolean;
    dmActiveTab?: string;
    dmPartnerUser?: unknown;
    isGroupDM?: boolean;
    activeGroupDM?: unknown;
  };
  const localCall = activeDmThreadCallUi.value;
  if (!localCall) return false;
  if (
    !localCall.quarterView ||
    !p.isInDMMode ||
    !p.isInDMChat ||
    p.dmActiveTab !== 'messages'
  ) {
    return false;
  }
  return !!(
    localCall.glassPeer ||
    p.dmPartnerUser ||
    (p.isGroupDM && p.activeGroupDM)
  );
});

type QuarterCallParticipantRow = {
  id: string;
  streaming?: boolean;
  video?: boolean;
  screenTrack?: StreamVideoTrack | null;
  cameraTrack?: StreamVideoTrack | null;
  dmCallPresence?: string;
};

type LocalTrackLike = {
  mediaStreamTrack?: MediaStreamTrack;
  track?: MediaStreamTrack;
};

type StreamVideoTrack = RemoteTrack | LocalTrackLike;

function remoteTrackInfoForQuarter(
  userId: string,
): RemoteParticipantTrackInfo | null {
  const m = (
    props as {
      vcRemoteParticipants?: Map<string, RemoteParticipantTrackInfo> | null;
    }
  ).vcRemoteParticipants;
  return m?.get(userId) ?? null;
}

function resolveQuarterRowScreenTrack(
  r: QuarterCallParticipantRow,
  selfId: string,
): StreamVideoTrack | null {
  if (r.screenTrack) return r.screenTrack;
  if (r.id === selfId) {
    return (
      (
        props as { getLocalScreenTrack?: () => StreamVideoTrack | null }
      ).getLocalScreenTrack?.() ?? null
    );
  }
  return remoteTrackInfoForQuarter(r.id)?.screenTrack ?? null;
}

function resolveQuarterRowCameraTrack(
  r: QuarterCallParticipantRow,
  selfId: string,
): StreamVideoTrack | null {
  if (r.cameraTrack) return r.cameraTrack;
  if (r.id === selfId) {
    return (
      (
        props as { getLocalCameraTrack?: () => StreamVideoTrack | null }
      ).getLocalCameraTrack?.() ?? null
    );
  }
  return remoteTrackInfoForQuarter(r.id)?.cameraTrack ?? null;
}

function quarterRowHasLiveScreen(
  r: QuarterCallParticipantRow,
  selfId: string,
): boolean {
  if ((r.dmCallPresence ?? 'live') !== 'live') return false;
  if (!r.streaming) return false;
  return !!resolveQuarterRowScreenTrack(r, selfId);
}

function quarterRowHasLiveCamera(
  r: QuarterCallParticipantRow,
  selfId: string,
): boolean {
  if ((r.dmCallPresence ?? 'live') !== 'live') return false;
  if (!r.video) return false;
  return !!resolveQuarterRowCameraTrack(r, selfId);
}

/** Best participant to open in the fullscreen stream overlay while the DM call stays in quarter view. */
const dmCallQuarterStreamableParticipantId = computed(() => {
  if (!showDmCallQuarterChrome.value) return null;
  const p = props as {
    dmCallFullscreen?: boolean;
    dmCallCallViewParticipants?: QuarterCallParticipantRow[];
    currentUser?: { id?: string } | null;
  };
  if (p.dmCallFullscreen) return null;
  const rows = p.dmCallCallViewParticipants ?? [];
  const selfId = p.currentUser?.id ?? '';
  const live = rows.filter((r) => (r.dmCallPresence ?? 'live') === 'live');

  const peerScreen = live.find(
    (r) => r.id !== selfId && quarterRowHasLiveScreen(r, selfId),
  );
  if (peerScreen) return peerScreen.id;

  const peerCam = live.find(
    (r) => r.id !== selfId && quarterRowHasLiveCamera(r, selfId),
  );
  if (peerCam) return peerCam.id;

  const self = live.find((r) => r.id === selfId);
  if (self && quarterRowHasLiveScreen(self, selfId)) return selfId;
  if (self && quarterRowHasLiveCamera(self, selfId)) return selfId;

  return null;
});

type DmCallQuarterGlance = {
  id: string;
  isLocal: boolean;
  isScreen: boolean;
  track: StreamVideoTrack;
};

/** PIP / widget stream for half-height DM call (replaces the corresponding avatar). */
const dmCallQuarterGlance = computed((): DmCallQuarterGlance | null => {
  if (!showDmCallQuarterChrome.value) return null;
  const p = props as {
    dmCallFullscreen?: boolean;
    dmCallCallViewParticipants?: QuarterCallParticipantRow[];
    currentUser?: { id?: string } | null;
  };
  if (p.dmCallFullscreen) return null;
  const selfId = p.currentUser?.id ?? '';
  const rows = p.dmCallCallViewParticipants ?? [];
  void (props as { vcRemoteParticipants?: Map<string, unknown> })
    .vcRemoteParticipants?.size;
  const live = rows.filter((r) => (r.dmCallPresence ?? 'live') === 'live');

  const tryScreen = (r: QuarterCallParticipantRow) => {
    if (!r.streaming) return null;
    const track = resolveQuarterRowScreenTrack(r, selfId);
    if (!track) return null;
    return {
      id: r.id,
      isLocal: r.id === selfId,
      isScreen: true as const,
      track,
    };
  };
  const tryCamera = (r: QuarterCallParticipantRow) => {
    if (!r.video) return null;
    const track = resolveQuarterRowCameraTrack(r, selfId);
    if (!track) return null;
    return {
      id: r.id,
      isLocal: r.id === selfId,
      isScreen: false as const,
      track,
    };
  };

  for (const r of live) {
    if (r.id === selfId) continue;
    const s = tryScreen(r);
    if (s) return s;
  }
  for (const r of live) {
    if (r.id === selfId) continue;
    const c = tryCamera(r);
    if (c) return c;
  }
  const self = live.find((r) => r.id === selfId);
  if (self) {
    const s = tryScreen(self);
    if (s) return s;
    const c = tryCamera(self);
    if (c) return c;
  }
  return null;
});

const quarterGlanceMediaBadges = computed(() => {
  const g = dmCallQuarterGlance.value;
  if (!g) return { showDeafened: false, showMutedOnly: false };
  return quarterMediaBadgesForUser(g.id, g.isLocal);
});

const quarterGlanceReplacesPeer = computed(() => {
  const g = dmCallQuarterGlance.value;
  if (!g) return false;
  const selfId = (props as { currentUser?: { id?: string } | null }).currentUser
    ?.id;
  return !!selfId && g.id !== selfId;
});

const quarterGlanceReplacesSelf = computed(() => {
  const g = dmCallQuarterGlance.value;
  if (!g) return false;
  const selfId = (props as { currentUser?: { id?: string } | null }).currentUser
    ?.id;
  return !!selfId && g.id === selfId;
});

const dmCallQuarterGlancePfp = computed(() => {
  const g = dmCallQuarterGlance.value;
  if (!g) return '';
  const p = props as {
    currentUser?: { id?: string; pfp?: string } | null;
    dmPartnerUser?: { id?: string; pfp?: string } | null;
    dmCallCallViewParticipants?: { id: string; pfp?: string }[];
  };
  if (g.id === p.currentUser?.id) return p.currentUser?.pfp ?? '';
  if (g.id === p.dmPartnerUser?.id) return p.dmPartnerUser?.pfp ?? '';
  return p.dmCallCallViewParticipants?.find((r) => r.id === g.id)?.pfp ?? '';
});

const dmCallQuarterGlanceName = computed(() => {
  const g = dmCallQuarterGlance.value;
  if (!g) return '';
  const p = props as {
    currentUser?: { id?: string; name?: string } | null;
    dmPartnerUser?: { id?: string; name?: string } | null;
    dmCallCallViewParticipants?: { id: string; name?: string }[];
  };
  if (g.id === p.currentUser?.id) return p.currentUser?.name ?? 'You';
  if (g.id === p.dmPartnerUser?.id) {
    return p.dmPartnerUser?.name ?? 'Participant';
  }
  return (
    p.dmCallCallViewParticipants?.find((r) => r.id === g.id)?.name ??
    'Participant'
  );
});

const quarterCallStreamOverlayActive = computed(() => {
  const p = props as { fullscreenStreamParticipantId?: string | null };
  const cur = p.fullscreenStreamParticipantId ?? null;
  const pick = dmCallQuarterStreamableParticipantId.value;
  return !!cur && !!pick && cur === pick;
});

function onQuarterCallShowStream() {
  const id = dmCallQuarterStreamableParticipantId.value;
  const fn = (props as { onRequestFullscreenStream?: (pid: string) => void })
    .onRequestFullscreenStream;
  if (!id || !fn) return;
  fn(id);
}

/** Right-click on the quarter widget tile → open the same per-participant menu the avatar uses
 * (volume control for remotes; suppress native browser/video menu for self). */
function onQuarterGlanceContextMenu(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  const g = dmCallQuarterGlance.value;
  if (!g?.id || g.isLocal) return;
  openQuarterCallProfileMenu(
    { id: g.id, name: dmCallQuarterGlanceName.value || 'Participant' },
    event,
  );
}

function onQuarterGlanceRequestFullscreen() {
  const g = dmCallQuarterGlance.value;
  const fn = (props as { onRequestFullscreenStream?: (pid: string) => void })
    .onRequestFullscreenStream;
  if (!g || !fn) return;
  fn(g.id);
}

const quarterGlanceMirrorVideo = computed(() => {
  const g = dmCallQuarterGlance.value;
  if (!g || g.isScreen || !g.isLocal) return false;
  return (props as { vcMirrorCamera?: boolean }).vcMirrorCamera !== false;
});

/** Same rules as CallView: remote-only stream output gain on quarter-glance StreamVideoTile. */
const quarterGlanceRemoteStreamVolumeControl = computed(() => {
  const g = dmCallQuarterGlance.value;
  const setFn = (props as { setRemoteParticipantVolume?: unknown })
    .setRemoteParticipantVolume;
  return !!(g && !g.isLocal && typeof setFn === 'function');
});

const quarterGlanceRemoteStreamVolumePercent = computed(() => {
  void quarterGlanceRemoteVolumeRev.value;
  const g = dmCallQuarterGlance.value;
  const getFn = (
    props as { getRemoteParticipantVolume?: (userId: string) => number }
  ).getRemoteParticipantVolume;
  if (!g?.id) return 100;
  return getFn?.(g.id) ?? 100;
});

function onQuarterGlanceRemoteStreamVolumeChange(v: number) {
  const g = dmCallQuarterGlance.value;
  const setFn = (
    props as {
      setRemoteParticipantVolume?: (
        userId: string,
        volumePercent: number,
      ) => void;
    }
  ).setRemoteParticipantVolume;
  if (!g?.id || !setFn) return;
  setFn(g.id, v);
  quarterGlanceRemoteVolumeRev.value += 1;
}
</script>

<template>
  <div
    v-if="
      !isDmHubSurface &&
      !(isInDMChat && dmCallFullscreen && !!activeDmThreadCallUi) &&
      ((effectiveActiveChannel && !isViewingVoiceChannel && !isInDMMode) ||
        (isInDMChat &&
          effectiveActiveChannel &&
          !isViewingVoiceChannel &&
          dmActiveTab === 'messages'))
    "
    class="chat-header-glass pointer-events-auto absolute top-0 left-0 right-0 z-20 flex min-w-0 flex-shrink-0 flex-col overflow-hidden"
    :class="showDmCallQuarterChrome ? 'min-h-[9rem]' : 'h-12'"
  >
    <div
      class="flex h-12 min-w-0 shrink-0 items-center overflow-hidden px-4"
      :class="isCompactShell ? 'gap-2' : 'gap-4'"
    >
      <button
        v-if="
          isCompactShell &&
          !compactGuildSplitNav &&
          !isViewingVoiceChannel &&
          effectiveActiveChannel
        "
        type="button"
        class="dm-header-action-btn -ml-0.5 shrink-0"
        title="Back to channel list"
        aria-label="Back to channel list"
        @click="expandChannels"
      >
        <img :src="icons.arrowLeft" alt="" class="dm-header-action-icon" />
      </button>
      <button
        v-if="
          isInDMChat &&
          dmPartnerUser &&
          dmActiveTab === 'messages' &&
          !isGroupDmThread &&
          hasProfileOverviewAction
        "
        type="button"
        class="shrink-0 rounded-full focus:outline-none"
        title="Open profile"
        aria-label="Open profile"
        @click="callOpenExtendedProfileModalForUserId(dmPartnerUser.id)"
      >
        <div class="relative h-8 w-8 flex-shrink-0">
          <!-- Clip only the image; status sits in this box above the ring (not inside overflow-hidden). -->
          <div class="relative z-0 h-full w-full overflow-hidden rounded-full">
            <PausedGifAvatar
              :src="safeImageUrl(dmPartnerUser.pfp || icons.usersAvatar)"
              :alt="dmPartnerUser.name || 'User'"
              :session-key="dmPartnerUser.id ?? 'dm-partner'"
              img-class="rounded-full object-cover"
            />
          </div>
          <StatusIndicator
            v-if="dmPartnerPresence.isLoaded"
            :status="dmPartnerPresence.status ?? 'offline'"
            :mobile-surface="dmPartnerPresence.indicatorMobileSurface"
            size="sm"
            class="pointer-events-none z-[5]"
          />
        </div>
      </button>
      <button
        v-else-if="
          isInDMMode && dmActiveTab === 'messages' && isGroupDM && activeGroupDM
        "
        type="button"
        class="shrink-0 rounded-full focus:outline-none"
        title="Change group icon"
        aria-label="Change group icon"
        @click="callOpenGroupIconSettingsFromHeader"
      >
        <div
          class="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-full"
        >
          <PausedGifAvatar
            :src="safeImageUrl(activeGroupDM.pfp || icons.usersAvatar)"
            :alt="activeGroupDM?.name || 'Group DM'"
            :session-key="activeGroupDM?.id ?? 'group-dm'"
            img-class="rounded-full object-cover"
          />
        </div>
      </button>
      <img
        v-else-if="
          isInDMMode &&
          (dmActiveTab === 'friends' || dmActiveTab === 'notifications')
        "
        :src="icons.usersAvatar"
        alt=""
        class="chat-header-leading-icon"
      />
      <span
        v-else-if="leadingEmoji"
        class="chat-header-leading-icon flex items-center justify-center text-[18px] leading-none"
        aria-hidden="true"
        >{{ leadingEmoji }}</span
      >
      <img
        v-else
        :src="
          leadingChannelRasterIconUrl || getChannelIcon(effectiveActiveChannel)
        "
        :alt="
          effectiveActiveChannel?.type === 'voice' ? 'Voice channel' : 'Channel'
        "
        class="chat-header-leading-icon"
        :class="{
          'chat-header-leading-icon--raster': !!leadingChannelRasterIconUrl,
        }"
      />
      <div class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <div class="min-w-0 flex-1 overflow-hidden">
          <button
            v-if="
              isInDMChat &&
              dmPartnerUser &&
              dmActiveTab === 'messages' &&
              !isGroupDmThread &&
              hasProfileOverviewAction
            "
            type="button"
            class="chat-focus-ring block w-full max-w-full min-w-0 min-h-0 truncate text-left font-semibold"
            :class="dmPartnerPresence.isOffline ? 'text-fg-subtle' : ''"
            title="Open profile"
            aria-label="Open profile"
            @click="callOpenExtendedProfileModalForUserId(dmPartnerUser.id)"
          >
            {{
              isInDMMode && dmActiveTab === 'friends'
                ? 'Friends'
                : isInDMMode && dmActiveTab === 'notifications'
                  ? 'Notifications'
                  : effectiveActiveChannel
                    ? getChannelDisplayName(effectiveActiveChannel.name)
                    : ''
            }}
          </button>
          <button
            v-else-if="
              isInDMMode &&
              dmActiveTab === 'messages' &&
              isGroupDM &&
              activeGroupDM
            "
            type="button"
            class="chat-focus-ring block w-full max-w-full min-w-0 min-h-0 truncate text-left font-semibold"
            title="Edit group name"
            aria-label="Edit group name"
            @click="callOpenGroupNameActionFromHeader"
          >
            {{
              isInDMMode && dmActiveTab === 'friends'
                ? 'Friends'
                : isInDMMode && dmActiveTab === 'notifications'
                  ? 'Notifications'
                  : effectiveActiveChannel
                    ? getChannelDisplayName(effectiveActiveChannel.name)
                    : ''
            }}
          </button>
          <span
            v-else
            class="block w-full max-w-full min-w-0 min-h-0 truncate font-semibold"
            :class="
              isInDMMode &&
              dmPartnerPresence.isOffline &&
              dmActiveTab === 'messages'
                ? 'text-fg-subtle'
                : ''
            "
            >{{
              isInDMMode && dmActiveTab === 'friends'
                ? 'Friends'
                : isInDMMode && dmActiveTab === 'notifications'
                  ? 'Notifications'
                  : effectiveActiveChannel
                    ? getChannelDisplayName(effectiveActiveChannel.name)
                    : ''
            }}</span
          >
        </div>
        <div
          v-if="!isInDMMode && isRolePreviewActiveForServer && rolePreview"
          class="flex shrink-0 items-center gap-1.5"
        >
          <span
            class="max-w-[6.5rem] truncate text-[11px] font-semibold sm:max-w-[10rem]"
            :style="{ color: rolePreview.roleColor }"
            :title="`Previewing as ${rolePreview.roleName}`"
            >{{ rolePreview.roleName }}</span
          >
          <button
            type="button"
            class="chat-focus-ring shrink-0 rounded-md bg-glass-2 px-2 py-0.5 text-[10px] font-semibold text-fg transition-colors hover:bg-glass-hover"
            title="Leave role preview"
            aria-label="Leave role preview"
            @click="clearRolePreview"
          >
            Exit
          </button>
        </div>
        <div
          v-if="
            !isInDMMode &&
            !isViewingVoiceChannel &&
            (compactGuildTriPaneNav ||
              memberPanelCollapsedRaw ||
              (channelPanelCollapsed &&
                !isCompactShell &&
                !compactGuildSplitNav &&
                !compactGuildTriPaneNav))
          "
          class="dm-header-actions flex items-center gap-0.5 shrink-0"
        >
          <button
            v-if="
              channelPanelCollapsed &&
              !isCompactShell &&
              !compactGuildSplitNav &&
              !compactGuildTriPaneNav
            "
            type="button"
            class="dm-header-action-btn"
            title="Show channels"
            aria-label="Show channels"
            @click="expandChannels"
          >
            <img :src="icons.list" alt="" class="dm-header-action-icon" />
          </button>
          <button
            v-if="compactGuildTriPaneNav || memberPanelCollapsedRaw"
            type="button"
            class="dm-header-action-btn dm-header-action-btn--member-toggle"
            :title="compactGuildTriPaneNav ? 'Open members' : 'Show members'"
            :aria-label="
              compactGuildTriPaneNav ? 'Open members' : 'Show members'
            "
            @click="expandMembers"
          >
            <img
              :src="icons.usersAvatar"
              alt=""
              class="dm-header-action-icon"
            />
          </button>
        </div>
      </div>
      <button
        v-if="
          isInDMMode && dmActiveTab === 'messages' && isGroupDM && activeGroupDM
        "
        type="button"
        class="ml-1 inline-flex items-center gap-1 rounded-full border border-border bg-glass-1 px-2.5 py-1 text-[11px] font-medium text-fg-soft hover:bg-glass-hover"
        title="View group"
        aria-label="View group"
        @click="callOpenGroupOverviewShortcutFromHeader"
      >
        <img
          :src="icons.community"
          alt=""
          class="h-4 w-4 shrink-0 dm-header-action-icon"
        />
        <span>View group</span>
      </button>

      <!-- Server search: in header only when members column is collapsed on desktop. On compact shell, search lives in the members column only (avoids duplicate header + members search). -->
      <div
        v-if="
          !isInDMMode &&
          !isViewingVoiceChannel &&
          !isCompactShell &&
          memberPanelCollapsed
        "
        class="relative flex min-w-0 items-end"
        :class="
          isCompactShell ? 'shrink-0' : 'search-input-wrapper flex-1 flex-col'
        "
        :style="
          isCompactShell
            ? undefined
            : { maxWidth: 'clamp(10rem, 34vw, 22.5rem)' }
        "
      >
        <SearchBar
          v-if="!isCompactShell"
          :model-value="searchText"
          :filter-chips="filterChips"
          :channels="searchFilterChannels"
          :users="users"
          :search-results="paginatedSearchResults"
          :total-results="searchResultMessagesCount"
          :current-page="searchResultPage"
          :total-pages="totalPages"
          :placeholder="`Search ${selectedServerName ?? ''}`.trim() || 'Search'"
          :reserved-right-px="0"
          @update:model-value="onSearchInput"
          @add-filter="addFilter"
          @remove-filter="removeFilter"
          @clear-search="clearSearch"
          @go-to-page="goToSearchPage"
          @go-to-message="handleGoToMessage"
          :search-loading="searchLoading"
          :search-error="searchError"
          :search-scope-hint="searchScopeHint"
        />

        <button
          v-else
          type="button"
          class="dm-header-action-btn shrink-0"
          title="Search"
          aria-label="Search"
          @click="isServerSearchMobileOpen = true"
        >
          <img :src="icons.search" alt="" class="dm-header-action-icon" />
        </button>
      </div>
      <template
        v-if="
          isInDMChat &&
          dmPartnerUser &&
          dmActiveTab === 'messages' &&
          !isGroupDmThread
        "
      >
        <div class="dm-header-actions flex items-center gap-0.5 shrink-0">
          <button
            v-if="!showDmCallQuarterChrome && showDmDirectCallButton"
            type="button"
            class="dm-header-action-btn dm-header-action-btn--call"
            :title="
              localDmCallTargetsDirectThread ? 'Leave call' : 'Start call'
            "
            :aria-label="
              localDmCallTargetsDirectThread ? 'Leave call' : 'Start call'
            "
            @click="
              localDmCallTargetsDirectThread
                ? leaveDmCallVoice()
                : startDmCall()
            "
          >
            <svg
              class="dm-header-action-icon dm-header-action-icon--svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
              />
              <path d="M14.05 2a9 9 0 0 1 8 8" />
              <path d="M14.05 6A5 5 0 0 1 18 10" />
            </svg>
          </button>
          <button
            :ref="pinsButtonRefDm"
            type="button"
            class="dm-header-action-btn"
            title="Pinned messages"
            aria-label="Pinned messages"
            aria-haspopup="true"
            :aria-expanded="isPinsDropdownOpen"
            @click="togglePinsDropdown"
          >
            <img :src="icons.thumbtack" alt="" class="dm-header-action-icon" />
          </button>
          <button
            type="button"
            class="dm-header-action-btn"
            title="Create group"
            aria-label="Create group"
            @click="() => openGroupDMModal()"
          >
            <img :src="icons.community" alt="" class="dm-header-action-icon" />
          </button>
          <button
            v-if="hasProfileOverviewAction && !isCompactShell"
            type="button"
            class="dm-header-action-btn"
            title="Profile overview"
            aria-label="Profile overview"
            @click="callOpenExpandedProfilePanelForUserId(dmPartnerUser.id)"
          >
            <img
              :src="icons.profileView"
              alt=""
              class="dm-header-action-icon"
            />
          </button>
        </div>
        <div
          v-if="!showDmCallQuarterChrome"
          class="dm-header-search search-input-wrapper relative flex min-w-0 items-end"
          :class="isCompactShell ? 'shrink-0' : 'flex-1 flex-col'"
          style="max-width: clamp(8rem, 24vw, 15rem)"
        >
          <SearchBar
            v-if="!isCompactShell"
            :model-value="searchText"
            :filter-chips="filterChips"
            :channels="[]"
            :users="[]"
            :dm-mode="true"
            :search-results="paginatedSearchResults"
            :total-results="searchResultMessagesCount"
            :current-page="searchResultPage"
            :total-pages="totalPages"
            placeholder="Search in conversation"
            :reserved-right-px="360"
            :dropdown-gap-px="0"
            @update:model-value="onSearchInput"
            @add-filter="addFilter"
            @remove-filter="removeFilter"
            @clear-search="clearSearch"
            @go-to-page="goToSearchPage"
            @go-to-message="handleGoToMessage"
          />

          <button
            v-else
            type="button"
            class="dm-header-action-btn shrink-0"
            title="Search"
            aria-label="Search"
            @click="isDmSearchMobileOpen = true"
          >
            <img :src="icons.search" alt="" class="dm-header-action-icon" />
          </button>
        </div>
      </template>
      <template
        v-else-if="isInDMMode && isGroupDM && dmActiveTab === 'messages'"
      >
        <div class="dm-header-actions flex items-center gap-0.5 shrink-0">
          <button
            v-if="!showDmCallQuarterChrome && showGroupDmCallButton"
            type="button"
            class="dm-header-action-btn dm-header-action-btn--call"
            :title="localDmCallTargetsGroupThread ? 'Leave call' : 'Start call'"
            :aria-label="
              localDmCallTargetsGroupThread ? 'Leave call' : 'Start call'
            "
            @click="
              localDmCallTargetsGroupThread
                ? leaveDmCallVoice()
                : startGroupCall()
            "
          >
            <svg
              class="dm-header-action-icon dm-header-action-icon--svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
              />
              <path d="M14.05 2a9 9 0 0 1 8 8" />
              <path d="M14.05 6A5 5 0 0 1 18 10" />
            </svg>
          </button>
          <button
            :ref="pinsButtonRefDm"
            type="button"
            class="dm-header-action-btn"
            title="Pinned messages"
            aria-label="Pinned messages"
            aria-haspopup="true"
            :aria-expanded="isPinsDropdownOpen"
            @click="togglePinsDropdown"
          >
            <img :src="icons.thumbtack" alt="" class="dm-header-action-icon" />
          </button>
          <button
            v-if="activeGroupDM"
            type="button"
            class="dm-header-action-btn"
            title="Add members"
            aria-label="Add members"
            @click="
              openGroupDMModal({
                preselectedIds: activeGroupMemberIds.filter(
                  (id: string) => id !== currentUser?.id,
                ),
                lockedIds: activeGroupMemberIds.filter(
                  (id: string) => id !== currentUser?.id,
                ),
              })
            "
          >
            <img :src="icons.plus" alt="" class="dm-header-action-icon" />
          </button>
          <button
            v-if="activeGroupDM"
            :ref="
              (el) => {
                groupEllipsisButtonRef = el as HTMLElement | null;
              }
            "
            type="button"
            class="group-ellipsis-btn dm-header-action-btn"
            title="More options"
            aria-label="More options"
            :aria-expanded="groupEllipsisMenuOpen"
            aria-haspopup="true"
            @click.stop="
              groupEllipsisMenuOpen
                ? closeGroupEllipsisMenu()
                : openGroupEllipsisMenu()
            "
          >
            <svg
              class="dm-header-action-icon dm-header-action-icon--svg"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <circle cx="5" cy="12" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="19" cy="12" r="1.5" />
            </svg>
          </button>
        </div>
        <div
          v-if="!showDmCallQuarterChrome"
          class="dm-header-search search-input-wrapper relative flex min-w-0 items-end"
          :class="isCompactShell ? 'shrink-0' : 'flex-1 flex-col'"
          style="max-width: clamp(8rem, 24vw, 15rem)"
        >
          <SearchBar
            v-if="!isCompactShell"
            :model-value="searchText"
            :filter-chips="filterChips"
            :channels="[]"
            :users="[]"
            :dm-mode="true"
            :search-results="paginatedSearchResults"
            :total-results="searchResultMessagesCount"
            :current-page="searchResultPage"
            :total-pages="totalPages"
            placeholder="Search in conversation"
            :reserved-right-px="360"
            :dropdown-gap-px="0"
            @update:model-value="onSearchInput"
            @add-filter="addFilter"
            @remove-filter="removeFilter"
            @clear-search="clearSearch"
            @go-to-page="goToSearchPage"
            @go-to-message="handleGoToMessage"
            :search-loading="searchLoading"
            :search-error="searchError"
            :search-scope-hint="searchScopeHint"
          />

          <button
            v-else
            type="button"
            class="dm-header-action-btn shrink-0"
            title="Search"
            aria-label="Search"
            @click="isDmSearchMobileOpen = true"
          >
            <img :src="icons.search" alt="" class="dm-header-action-icon" />
          </button>
        </div>
      </template>
    </div>
    <div
      v-if="showDmCallQuarterChrome"
      class="dm-call-on-glass flex flex-1 min-w-0 flex-col items-center justify-center gap-2 px-4 pb-3 pt-1"
    >
      <div
        v-if="activeDmThreadCallUi?.voiceE2ee"
        class="rounded-md border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-emerald-700 dark:text-emerald-300"
        title="Voice and shared video use end-to-end encryption for this chat (LiveKit E2EE). Requires a current web browser or Echo desktop with WebRTC insertable streams."
      >
        Encrypted voice
      </div>
      <div
        v-if="isGroupDM && activeGroupCallMembers.length"
        class="dm-call-on-glass-avatars flex max-w-[280px] shrink-0 flex-col items-center justify-center gap-2.5"
      >
        <div
          v-if="dmCallQuarterGlance"
          class="dm-call-quarter-glance relative h-16 w-28 max-w-full shrink-0 overflow-hidden rounded-xl border border-border"
          :title="quarterGlanceMediaTitle"
          @contextmenu="onQuarterGlanceContextMenu"
        >
          <StreamVideoTile
            class="h-full w-full"
            :track="dmCallQuarterGlance.track ?? null"
            :participant-name="dmCallQuarterGlanceName"
            :participant-pfp="dmCallQuarterGlancePfp"
            :participant-id="dmCallQuarterGlance.id"
            :is-local="dmCallQuarterGlance.isLocal"
            :is-screen-share="dmCallQuarterGlance.isScreen"
            :mirror-video="quarterGlanceMirrorVideo"
            :remote-stream-volume-control="
              quarterGlanceRemoteStreamVolumeControl
            "
            :remote-stream-volume-percent="
              quarterGlanceRemoteStreamVolumePercent
            "
            :hide-participant-bar="!quarterGlanceRemoteStreamVolumeControl"
            delegate-context-menu
            @request-fullscreen="onQuarterGlanceRequestFullscreen"
            @remote-stream-volume-change="
              onQuarterGlanceRemoteStreamVolumeChange
            "
            @remote-video-playback-wired="onQuarterCallRemoteVideoPlaybackWired"
          />
          <QuarterCallMediaBadges
            v-bind="quarterGlanceMediaBadges"
            :icons="icons"
            surface-class="rounded-xl"
          />
        </div>
        <div
          class="flex max-w-full flex-wrap items-center justify-center gap-2.5"
        >
          <div
            v-for="member in activeGroupCallMembers"
            :key="member.id"
            class="relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-border"
            :title="
              quarterAvatarMediaTitle(
                member.id,
                member.id === (currentUser?.id ?? ''),
              )
            "
            :class="{
              'ring-emerald-500/70 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]':
                isActiveGroupMemberSpeaking(member.id),
            }"
            @contextmenu="
              openQuarterCallProfileMenu(
                { id: member.id, name: member.name },
                $event,
              )
            "
          >
            <div
              class="dm-call-peer-visual h-full w-full"
              :class="dmCallQuarterPeerVisualClass"
            >
              <PausedGifAvatar
                :src="safeImageUrl(member.pfp)"
                :alt="member.name"
                :session-key="member.id"
                img-class="rounded-full object-cover"
              />
            </div>
            <QuarterCallMediaBadges
              v-bind="
                quarterMediaBadgesForUser(
                  member.id,
                  member.id === (currentUser?.id ?? ''),
                )
              "
              :icons="icons"
            />
          </div>
        </div>
      </div>
      <div
        v-else
        class="dm-call-on-glass-avatars flex shrink-0 items-center justify-center gap-3"
      >
        <div
          v-if="quarterGlanceReplacesPeer && dmCallQuarterGlance"
          class="dm-call-quarter-glance relative h-14 w-24 min-h-[3.5rem] shrink-0 overflow-hidden rounded-xl border border-border"
          :title="quarterGlanceMediaTitle"
          @contextmenu="onQuarterGlanceContextMenu"
        >
          <StreamVideoTile
            class="h-full w-full"
            :track="dmCallQuarterGlance.track ?? null"
            :participant-name="dmCallQuarterGlanceName"
            :participant-pfp="dmCallQuarterGlancePfp"
            :participant-id="dmCallQuarterGlance.id"
            :is-local="dmCallQuarterGlance.isLocal"
            :is-screen-share="dmCallQuarterGlance.isScreen"
            :mirror-video="quarterGlanceMirrorVideo"
            :remote-stream-volume-control="
              quarterGlanceRemoteStreamVolumeControl
            "
            :remote-stream-volume-percent="
              quarterGlanceRemoteStreamVolumePercent
            "
            :hide-participant-bar="!quarterGlanceRemoteStreamVolumeControl"
            delegate-context-menu
            @request-fullscreen="onQuarterGlanceRequestFullscreen"
            @remote-stream-volume-change="
              onQuarterGlanceRemoteStreamVolumeChange
            "
            @remote-video-playback-wired="onQuarterCallRemoteVideoPlaybackWired"
          />
          <QuarterCallMediaBadges
            v-bind="quarterGlanceMediaBadges"
            :icons="icons"
            surface-class="rounded-xl"
          />
        </div>
        <div
          v-else
          class="relative h-11 w-11 shrink-0 overflow-hidden rounded-full ring-2 ring-border"
          :title="quarterAvatarMediaTitle(quarterOneToOnePeerId, false)"
          :class="{
            'ring-emerald-500/70 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]':
              dmCallQuarterPeerSpeaking,
          }"
          @contextmenu="
            openQuarterCallProfileMenu(
              isGroupDmThread
                ? {
                    id: activeDmThreadCallUi?.glassPeer?.id ?? '',
                    name:
                      activeDmThreadCallUi?.glassPeer?.name ?? 'Participant',
                  }
                : {
                    id:
                      dmPartnerUser?.id ??
                      activeDmThreadCallUi?.glassPeer?.id ??
                      '',
                    name:
                      dmPartnerUser?.name ??
                      activeDmThreadCallUi?.glassPeer?.name ??
                      'Participant',
                  },
              $event,
            )
          "
        >
          <div
            class="dm-call-peer-visual h-full w-full rounded-full"
            :class="dmCallQuarterPeerVisualClass"
          >
            <PausedGifAvatar
              :src="
                safeImageUrl(
                  isGroupDmThread && activeGroupDM
                    ? activeGroupDM.pfp || icons.usersAvatar
                    : dmPartnerUser
                      ? dmPartnerUser.pfp
                      : activeDmThreadCallUi?.glassPeer
                        ? activeDmThreadCallUi.glassPeer.pfp
                        : activeGroupDM?.pfp || icons.usersAvatar,
                )
              "
              :alt="
                isGroupDmThread && activeGroupDM
                  ? activeGroupDM.name || 'Group DM'
                  : dmPartnerUser?.name ||
                    activeDmThreadCallUi?.glassPeer?.name ||
                    activeGroupDM?.name ||
                    'Group DM'
              "
              :session-key="
                isGroupDmThread && activeGroupDM
                  ? (activeGroupDM.id ?? 'group-dm-call')
                  : (dmPartnerUser?.id ??
                    activeDmThreadCallUi?.glassPeer?.id ??
                    activeGroupDM?.id ??
                    'dm-call-peer')
              "
              img-class="rounded-full object-cover"
            />
          </div>
          <QuarterCallMediaBadges
            v-bind="quarterPeerMediaBadges"
            :icons="icons"
          />
        </div>
        <div
          v-if="quarterGlanceReplacesSelf && dmCallQuarterGlance"
          class="dm-call-quarter-glance relative h-14 w-24 min-h-[3.5rem] shrink-0 overflow-hidden rounded-xl border border-border"
          :title="quarterGlanceMediaTitle"
          @contextmenu="onQuarterGlanceContextMenu"
        >
          <StreamVideoTile
            class="h-full w-full"
            :track="dmCallQuarterGlance.track ?? null"
            :participant-name="dmCallQuarterGlanceName"
            :participant-pfp="dmCallQuarterGlancePfp"
            :participant-id="dmCallQuarterGlance.id"
            :is-local="dmCallQuarterGlance.isLocal"
            :is-screen-share="dmCallQuarterGlance.isScreen"
            :mirror-video="quarterGlanceMirrorVideo"
            :remote-stream-volume-control="
              quarterGlanceRemoteStreamVolumeControl
            "
            :remote-stream-volume-percent="
              quarterGlanceRemoteStreamVolumePercent
            "
            :hide-participant-bar="!quarterGlanceRemoteStreamVolumeControl"
            delegate-context-menu
            @request-fullscreen="onQuarterGlanceRequestFullscreen"
            @remote-stream-volume-change="
              onQuarterGlanceRemoteStreamVolumeChange
            "
            @remote-video-playback-wired="onQuarterCallRemoteVideoPlaybackWired"
          />
          <QuarterCallMediaBadges
            v-bind="quarterGlanceMediaBadges"
            :icons="icons"
            surface-class="rounded-xl"
          />
        </div>
        <div
          v-else
          class="relative h-11 w-11 shrink-0 overflow-hidden rounded-full ring-2 ring-border"
          :title="quarterAvatarMediaTitle(null, true)"
          :class="{
            'ring-emerald-500/70 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]':
              dmCallQuarterSelfSpeaking,
          }"
          @contextmenu.prevent
        >
          <PausedGifAvatar
            :src="safeImageUrl(currentUser?.pfp)"
            :alt="currentUser?.name ?? ''"
            :session-key="currentUser?.id ?? 'self'"
            img-class="rounded-full object-cover"
          />
          <QuarterCallMediaBadges
            v-bind="quarterSelfMediaBadges"
            :icons="icons"
          />
        </div>
      </div>
      <div
        class="dm-call-on-glass-controls flex shrink-0 flex-wrap items-center justify-center gap-1.5"
      >
        <template
          v-if="activeDmThreadCallUi?.incoming && activeDmThreadCallUi?.ringing"
        >
          <button
            v-if="dmCallCanAnswerIncoming"
            type="button"
            class="rounded-full bg-emerald-500 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-400"
            title="Answer call"
            aria-label="Answer call"
            @click="answerDmCall()"
          >
            Answer
          </button>
          <button
            type="button"
            class="dm-call-on-glass-btn dm-call-on-glass-btn--leave"
            title="Decline call"
            aria-label="Decline call"
            @click="declineDmCall()"
          >
            <img :src="icons.logOut" alt="" class="app-inline-icon h-4 w-4" />
          </button>
          <button
            type="button"
            class="dm-call-on-glass-btn"
            title="Full screen"
            aria-label="Full screen"
            @click="onSetDmCallFullscreen(true)"
          >
            <svg
              class="h-4 w-4 stroke-current"
              viewBox="0 0 24 24"
              fill="none"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"
              />
            </svg>
          </button>
          <CallRingtoneControls variant="glass" />
        </template>
        <template v-else-if="activeDmThreadCallUi?.lobbyAfterSelfLeave">
          <button
            type="button"
            class="rounded-full bg-emerald-500 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-400"
            :title="
              activeDmThreadCallUi?.visualOnly ? 'Join call' : 'Rejoin voice'
            "
            :aria-label="
              activeDmThreadCallUi?.visualOnly ? 'Join call' : 'Rejoin voice'
            "
            @click="rejoinDmCallVoice()"
          >
            {{ activeDmThreadCallUi?.visualOnly ? 'Join' : 'Rejoin' }}
          </button>
          <button
            v-if="activeDmThreadCallUi?.visualOnly !== true"
            type="button"
            class="dm-call-on-glass-btn"
            title="Full screen"
            aria-label="Full screen"
            @click="onSetDmCallFullscreen(true)"
          >
            <svg
              class="h-4 w-4 stroke-current"
              viewBox="0 0 24 24"
              fill="none"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"
              />
            </svg>
          </button>
          <button
            v-if="
              onOpenVoiceAudioSettings &&
              activeDmThreadCallUi?.visualOnly !== true
            "
            type="button"
            class="dm-call-on-glass-btn"
            title="Audio settings"
            aria-label="Audio settings"
            @click="onOpenVoiceAudioSettings()"
          >
            <img :src="icons.settings" alt="" class="app-inline-icon h-4 w-4" />
          </button>
          <button
            v-if="activeDmThreadCallUi?.visualOnly !== true"
            type="button"
            class="dm-call-on-glass-btn dm-call-on-glass-btn--leave"
            title="End call"
            aria-label="End call"
            @click="endDmCall()"
          >
            <img :src="icons.logOut" alt="" class="app-inline-icon h-4 w-4" />
          </button>
        </template>
        <template v-else>
          <CallRingtoneControls
            v-if="
              activeDmThreadCallUi?.ringing &&
              !activeDmThreadCallUi?.ringRemoteVanishing
            "
            variant="glass"
          />
          <button
            type="button"
            class="dm-call-on-glass-btn"
            :class="{
              'dm-call-on-glass-btn--active': dmCallVideo,
              'dm-call-on-glass-btn--video-on': dmCallVideo,
            }"
            title="Video"
            aria-label="Video"
            @click="onToggleDmCallVideo"
          >
            <img :src="icons.cameraOn" alt="" class="app-inline-icon h-4 w-4" />
          </button>
          <button
            type="button"
            class="dm-call-on-glass-btn"
            :class="{
              'dm-call-on-glass-btn--active': dmCallScreenshare,
              'dm-call-on-glass-btn--screenshare-on': dmCallScreenshare,
            }"
            title="Share screen"
            aria-label="Share screen"
            @click="onToggleDmCallScreenshare"
          >
            <img :src="icons.desktop" alt="" class="app-inline-icon h-4 w-4" />
          </button>
          <button
            v-if="dmCallQuarterStreamableParticipantId"
            type="button"
            class="dm-call-on-glass-btn"
            :class="{
              'dm-call-on-glass-btn--active': quarterCallStreamOverlayActive,
            }"
            title="View stream"
            aria-label="View stream"
            @click="onQuarterCallShowStream"
          >
            <img
              :src="icons.stream"
              alt=""
              class="app-inline-icon h-4 w-4 opacity-90"
            />
          </button>
          <button
            type="button"
            class="dm-call-on-glass-btn"
            :class="{ 'dm-call-on-glass-btn--active': dmCallMuted }"
            title="Mute"
            aria-label="Mute"
            @click="onToggleDmCallMuted"
          >
            <span class="relative inline-flex">
              <img
                :src="icons.mic"
                alt=""
                class="app-inline-icon h-4 w-4"
                :class="{ 'opacity-50': dmCallMuted }"
              />
              <span
                v-if="dmCallMuted"
                class="absolute left-1/2 top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 rotate-[-25deg] bg-red-400"
                aria-hidden="true"
              />
            </span>
          </button>
          <button
            type="button"
            class="dm-call-on-glass-btn"
            :class="{ 'dm-call-on-glass-btn--active': dmCallDeafened }"
            title="Deafen"
            aria-label="Deafen"
            @click="onToggleDmCallDeafened"
          >
            <span class="relative inline-flex">
              <img
                :src="icons.headphones"
                alt=""
                class="app-inline-icon h-4 w-4"
                :class="{ 'opacity-50': dmCallDeafened }"
              />
              <span
                v-if="dmCallDeafened"
                class="absolute left-1/2 top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 rotate-[-25deg] bg-red-400"
                aria-hidden="true"
              />
            </span>
          </button>
          <button
            type="button"
            class="dm-call-on-glass-btn"
            title="Full screen"
            aria-label="Full screen"
            @click="onSetDmCallFullscreen(true)"
          >
            <svg
              class="h-4 w-4 stroke-current"
              viewBox="0 0 24 24"
              fill="none"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"
              />
            </svg>
          </button>
          <button
            v-if="onOpenVoiceAudioSettings"
            type="button"
            class="dm-call-on-glass-btn"
            title="Audio settings"
            aria-label="Audio settings"
            @click="onOpenVoiceAudioSettings()"
          >
            <img :src="icons.settings" alt="" class="app-inline-icon h-4 w-4" />
          </button>
          <button
            type="button"
            class="dm-call-on-glass-btn dm-call-on-glass-btn--leave"
            title="Leave call"
            aria-label="Leave call"
            @click="leaveDmCallVoice()"
          >
            <img :src="icons.logOut" alt="" class="app-inline-icon h-4 w-4" />
          </button>
        </template>
      </div>
    </div>
    <Teleport to="body">
      <div
        v-if="groupEllipsisMenuOpen && activeGroupDM"
        ref="groupEllipsisMenuRef"
        class="group-ellipsis-menu ellipsis-menu fixed z-[200] min-w-[160px] py-1"
        :style="{
          left: `${groupEllipsisMenuPos.left}px`,
          top: `${groupEllipsisMenuPos.top}px`,
        }"
        role="menu"
        @click.stop
        @mousedown.stop
      >
        <button
          type="button"
          class="chat-focus-ring flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-muted hover:bg-glass-tint"
          role="menuitem"
          @click="callOpenGroupSettingsFromEllipsis"
        >
          Group settings
        </button>
        <button
          type="button"
          class="chat-focus-ring w-full px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/15 flex items-center gap-2 rounded-sm"
          role="menuitem"
          @click="callLeaveGroupDm"
        >
          Leave group
        </button>
      </div>
    </Teleport>
    <Teleport to="body">
      <div
        v-if="quarterCallMenuTarget"
        ref="quarterCallMenuRef"
        class="dm-call-quarter-menu fixed z-[300] min-w-[220px] rounded-lg border border-border bg-[var(--echo-menu-bg)] px-3 py-2 shadow-xl"
        :style="{
          left: `${quarterCallMenuPos.left}px`,
          top: `${quarterCallMenuPos.top}px`,
        }"
        role="menu"
        @click.stop
        @pointerdown.stop
        @mousedown.stop
      >
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-foreground">
            {{ quarterCallMenuTarget.name }}
          </p>
        </div>
        <button
          v-if="quarterCallMenuShowMention"
          type="button"
          class="chat-focus-ring mt-2 flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm text-foreground hover:bg-glass-tint"
          role="menuitem"
          @click="mentionFromQuarterCallMenu"
        >
          <span
            class="flex h-4 w-4 shrink-0 items-center justify-center text-[11px] font-bold text-foreground"
            aria-hidden="true"
            >@</span
          >
          Mention
        </button>
        <div
          v-if="quarterCallMenuHasVolumeControl()"
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
              quarterCallMenuMuted ? 'bg-emerald-500/20 text-emerald-200' : ''
            "
            :aria-pressed="quarterCallMenuMuted"
            :title="
              quarterCallMenuMuted
                ? 'Restore their audio for you'
                : 'Mute their audio for you only'
            "
            @click="toggleQuarterCallMuteForMe"
          >
            {{ quarterCallMenuMuted ? 'Unmute for me' : 'Mute for me' }}
          </button>
        </div>
        <div
          v-if="quarterCallMenuHasVolumeControl()"
          class="mt-2 flex items-center gap-2"
        >
          <input
            type="range"
            class="h-1.5 min-w-0 flex-1 cursor-pointer accent-violet-400"
            min="0"
            max="200"
            step="1"
            :value="quarterCallMenuVolumeDraft"
            aria-label="Participant volume"
            @input="onQuarterCallVolumeInput"
          />
          <span
            class="w-9 shrink-0 text-right text-[11px] tabular-nums text-fg-soft"
          >
            {{ Math.round(quarterCallMenuVolumeDraft) }}%
          </span>
        </div>
      </div>
    </Teleport>

    <MobileSearchModal
      v-if="isCompactShell && isServerSearchMobileOpen"
      :title="`Search ${selectedServerName ?? ''}`.trim() || 'Search'"
      :model-value="searchText"
      :filter-chips="filterChips"
      :channels="searchFilterChannels"
      :users="users"
      :search-results="paginatedSearchResults"
      :total-results="searchResultMessagesCount"
      :current-page="searchResultPage"
      :total-pages="totalPages"
      :placeholder="`Search ${selectedServerName ?? ''}`.trim() || 'Search'"
      :search-loading="searchLoading"
      :search-error="searchError"
      :search-scope-hint="searchScopeHint"
      @close="isServerSearchMobileOpen = false"
      @update:model-value="onSearchInput"
      @add-filter="addFilter"
      @remove-filter="removeFilter"
      @clear-search="clearSearch"
      @go-to-page="goToSearchPage"
      @go-to-message="handleGoToMessageFromSearch"
    />

    <MobileSearchModal
      v-if="isCompactShell && isDmSearchMobileOpen"
      :title="dmMobileSearchTitle"
      :model-value="searchText"
      :filter-chips="filterChips"
      :channels="[]"
      :users="[]"
      :dm-mode="true"
      :search-results="paginatedSearchResults"
      :total-results="searchResultMessagesCount"
      :current-page="searchResultPage"
      :total-pages="totalPages"
      :placeholder="dmMobileSearchPlaceholder"
      :search-loading="searchLoading"
      :search-error="searchError"
      :search-scope-hint="searchScopeHint"
      @close="isDmSearchMobileOpen = false"
      @update:model-value="onSearchInput"
      @add-filter="addFilter"
      @remove-filter="removeFilter"
      @clear-search="clearSearch"
      @go-to-page="goToSearchPage"
      @go-to-message="handleGoToMessageFromSearch"
    />
  </div>
</template>

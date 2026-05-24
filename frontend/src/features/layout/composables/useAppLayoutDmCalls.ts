/**
 * DM / group call signaling, ringtone, LiveKit DM join/leave, and related UI state.
 * Guild voice session is wired via {@link useAppLayoutDmCalls.bindVoiceSession} after
 * `useAppLayoutShellVoice`; socket DM call submitters via {@link useAppLayoutDmCalls.setDmCallSocketSubmitters}
 * after `useSocket`.
 */
import {
  computed,
  onUnmounted,
  ref,
  shallowRef,
  watch,
  watchEffect,
  type ComputedRef,
  type Ref,
} from 'vue';
import type { useAuthSessionStore } from '@/stores/authSession';
import { useCallRingtoneStore } from '@/stores/callRingtone';
import { useNotificationPreferencesStore } from '@/stores/notificationPreferences';
import { useVoiceLevelsStore } from '@/stores/voiceLevels';
import {
  stopCallRingtone,
  syncCallRingtoneLoop,
} from '@/audio/callRingtonePlayer';
import { propagateActionFailure } from '@/utils/actionFailurePropagation';
import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';
import { createVoiceService } from '@/services/orchestration/voice';
import { deriveCallOverlay } from '@/features/layout/callOverlay';
import { resolveEchoDmWireChannelId } from '@/features/layout/resolveEchoDmWireChannelId';
import { isEchoGraphId } from '@/utils/echoIds';
import { buildVoiceParticipantMediaState } from '@/features/layout/domain/voiceParticipantState';
import type { WorkspaceStateApi } from '@/composables/workspace/types';
import type { MainSurface } from '@/features/layout/mainSurface';
import { syncChannelMessages } from '@/services/realtime/channelMessageAuthority';
import type {
  EchoDmCallEndedReason,
  EchoDmCallEvent,
  EchoDmRealtimeThread,
} from '@shared/types';
import type { Server } from '@shared/types/server';
import type { ActionResult } from '@/types/actionResult';
import type {
  LiveKitRoomState,
  LiveKitVoiceRoomApi,
  ParticipantAudioLevel,
  RemoteParticipantTrackInfo,
} from '@/composables/useLiveKitVoiceRoom';
import { emitDiagnostic, newTraceId } from '@/observability/sessionDiagnostics';
import { getChannelIndex } from '@/features/chat/domain/channelMessageIndex';
import { dispatchAppToastDetail } from '@/utils/controllerMissingAction';
import { runVoiceJoinMediaPreflightInteractive } from '@/features/voice/voiceJoinMediaPreflightFlow';
import { openEchoDirectDmChannel } from '@/features/dm/echoDmCommandFacade';
import { resolveCallTileAvatarUrl } from '@/utils/avatarDisplay';
import { formatTimestamp } from '@/utils/formatTimestamp';
import { UIErrorBus } from '@/utils/uiErrorBus';
import type { ActiveDmThreadCallUi } from '@/features/layout/dmThreadCallUi';
import { playEchoSound } from '@/composables/useEchoSounds';

const MAX_RECENT_DM_CALL_EVENT_KEYS = 64;

/** After this, group members still not in the call are omitted from tiles (not shown as ringing). */
const GROUP_CALL_RING_LIST_HIDE_MS = 30_000;

export type DmCallSocketSubmitters = {
  submitDmCallInvite: (channelId: string) => Promise<ActionResult>;
  submitDmCallAccept: (channelId: string) => Promise<ActionResult>;
  submitDmCallEnd: (
    channelId: string,
    reason: EchoDmCallEndedReason,
  ) => Promise<ActionResult>;
};

export type AppLayoutDmCallsVoiceBinding = {
  liveKitState: ComputedRef<LiveKitRoomState>;
  liveKitVoiceApi: LiveKitVoiceRoomApi | null;
  vcRemoteParticipants: ComputedRef<Map<string, RemoteParticipantTrackInfo>>;
  speakingMap: ComputedRef<Record<string, ParticipantAudioLevel>>;
  localSpeaking: ComputedRef<boolean>;
  localAudioLevel: ComputedRef<number>;
  syncLiveKitAudioFromUiStores: () => void;
  stopVcScreenShare: () => void;
  selectedServerEcho: ComputedRef<Server | undefined>;
  currentVoiceChannelId: Ref<string | null>;
};

type DmCallSignalState = {
  channelId: string;
  targetId: string;
  direction: 'incoming' | 'outgoing';
  status: 'ringing' | 'accepted';
};

export function useAppLayoutDmCalls(deps: {
  workspace: WorkspaceStateApi;
  authSession: ReturnType<typeof useAuthSessionStore>;
  mainSurface: ComputedRef<MainSurface>;
  activeChannelId: Ref<string>;
  selectedDMUserId: Ref<string | null>;
  groupDMs: Ref<
    Record<
      string,
      { id: string; name: string; memberIds: string[]; pfp?: string }
    >
  >;
  echoDmPeerByChannelId: Ref<Map<string, string>>;
  echoDmActiveCallParticipantUserIdsByChannelId: Ref<Map<string, string[]>>;
  mergeRealtimeDmThread: (
    thread: EchoDmRealtimeThread,
    lastActivityId?: string,
  ) => void;
  hydrateEchoFromApi: () => Promise<void>;
  navigateToDmForAnswer: (targetId: string) => void;
  micTestListenDeafenActive: Ref<boolean>;
  /**
   * Leaves guild/server voice (UI + REST + LiveKit) before a DM/group call connects.
   * Wired in `useAppLayoutCallVoiceBridge` to `handleLeaveVoiceNavigation`.
   */
  releaseGuildVoiceIfHeldForDmCall?: () => void;
  getDmVoiceE2eeMediaKey?: (
    channelId: string,
  ) => Promise<
    import('@/services/voice/voiceE2eePrepare').VoiceE2eePrepareResult
  >;
}) {
  const {
    workspace,
    authSession,
    mainSurface,
    activeChannelId,
    selectedDMUserId,
    groupDMs,
    echoDmPeerByChannelId,
    echoDmActiveCallParticipantUserIdsByChannelId,
    mergeRealtimeDmThread,
    hydrateEchoFromApi,
    navigateToDmForAnswer,
    micTestListenDeafenActive,
    releaseGuildVoiceIfHeldForDmCall,
    getDmVoiceE2eeMediaKey,
  } = deps;

  async function releaseGuildVoiceHeldBeforeDmExclusive(): Promise<void> {
    await Promise.resolve(releaseGuildVoiceIfHeldForDmCall?.());
  }

  const notificationPreferences = useNotificationPreferencesStore();
  const callRingtoneStore = useCallRingtoneStore();
  const voiceLevels = useVoiceLevelsStore();

  const dmCallSocketSubmitters = shallowRef<DmCallSocketSubmitters | null>(
    null,
  );

  function setDmCallSocketSubmitters(next: DmCallSocketSubmitters | null) {
    dmCallSocketSubmitters.value = next;
  }

  function dmCallTargetIdFromThread(thread: EchoDmRealtimeThread): string {
    return thread.kind === 'group' ? thread.channelId : thread.peerUserId;
  }

  const recentDmCallEventKeys = ref<string[]>([]);

  function dmCallEventKey(payload: EchoDmCallEvent): string {
    return [
      payload.kind,
      payload.channelId?.trim() ?? '',
      payload.actorUserId?.trim() ?? '',
      payload.correlationId?.trim() ?? '',
      payload.reason ?? '',
    ].join(':');
  }

  function rememberDmCallEventForPresentation(
    payload: EchoDmCallEvent,
  ): boolean {
    const key = dmCallEventKey(payload);
    if (!key || recentDmCallEventKeys.value.includes(key)) return false;
    const next = [...recentDmCallEventKeys.value, key];
    if (next.length > MAX_RECENT_DM_CALL_EVENT_KEYS) {
      next.splice(0, next.length - MAX_RECENT_DM_CALL_EVENT_KEYS);
    }
    recentDmCallEventKeys.value = next;
    return true;
  }

  /**
   * When the user declines or dismisses an incoming ring, `/dm/threads` may still
   * list the caller in `activeCallParticipantUserIds` until LiveKit/DB catches up.
   * Suppress hydrate replay only while that snapshot matches what they dismissed.
   */
  const dismissedIncomingVoiceRingSnapshotByChannel = shallowRef(
    new Map<string, string>(),
  );

  function participantSignature(ids: readonly string[]): string {
    return [...ids]
      .map((x) => x.trim())
      .filter(Boolean)
      .sort()
      .join(',');
  }

  /** True when this Echo DM channel is the one currently open in the main column (messages UI). */
  function isEchoDmChannelCurrentlyOpenInMainUi(channelId: string): boolean {
    const ch = channelId.trim();
    if (!ch) return false;
    const map = echoDmPeerByChannelId.value;
    const ac = activeChannelId.value.trim();
    if (ac === ch) return true;
    const wiredAc = resolveEchoDmWireChannelId(ac, map);
    if (wiredAc === ch) return true;
    const peerForCh = map.get(ch);
    if (peerForCh && ac === `dm-${peerForCh}`) return true;
    if (mainSurface.value.type === 'dmThread') {
      const tid = mainSurface.value.threadId.trim();
      if (tid === ch) return true;
      if (peerForCh && tid === `dm-${peerForCh}`) return true;
      const wiredTid = resolveEchoDmWireChannelId(tid, map);
      if (wiredTid === ch) return true;
    }
    for (const [key, row] of Object.entries(groupDMs.value)) {
      if (key !== ch && row?.id !== ch) continue;
      if (ac === key) return true;
      if (mainSurface.value.type === 'dmThread') {
        if (mainSurface.value.threadId.trim() === key) return true;
      }
    }
    return false;
  }

  function resolveDmCallActorName(actorUserId: string | undefined): string {
    const trimmed = actorUserId?.trim() ?? '';
    if (!trimmed) return 'Someone';
    const known = workspace.users.value.find((u) => u.id === trimmed);
    if (known?.name?.trim()) return known.name.trim();
    if (authSession.backendUser?.id === trimmed) {
      const ownName = authSession.backendUser.username?.trim();
      if (ownName) return ownName;
    }
    return 'Someone';
  }

  function dmCallActorDisplayLabel(
    actorUserId: string | undefined,
    resolvedName: string,
  ): string {
    const selfId = authSession.backendUser?.id?.trim() ?? '';
    const aid = actorUserId?.trim() ?? '';
    if (aid && selfId && aid === selfId) return 'You';
    const n = resolvedName.trim();
    return n || 'Someone';
  }

  /** Group title for toasts / copy — prefers realtime payload, then workspace group DM map. */
  function resolveGroupDmCallDisplayName(payload: EchoDmCallEvent): string {
    const t = payload.thread;
    if (t.kind !== 'group') return '';
    const fromThread = t.name?.trim();
    if (fromThread) return fromThread;
    const cid = payload.channelId?.trim() ?? '';
    const fromStore = cid ? groupDMs.value[cid]?.name?.trim() : '';
    if (fromStore) return fromStore;
    return 'Group chat';
  }

  function buildDmCallLocalLogContent(
    payload: EchoDmCallEvent,
    actorName: string,
    eventIso: string,
  ): string {
    const who = dmCallActorDisplayLabel(payload.actorUserId, actorName);
    const when = formatTimestamp(eventIso);
    const isGroup = payload.thread.kind === 'group';
    const callNoun = isGroup ? 'group call' : 'call';
    const groupWhere = isGroup ? resolveGroupDmCallDisplayName(payload) : '';

    if (payload.kind === 'incoming') {
      return isGroup && groupWhere
        ? `📞 ${who} started a ${callNoun} in ${groupWhere} · ${when}`
        : `📞 ${who} started a ${callNoun} · ${when}`;
    }
    if (payload.kind === 'accepted') {
      return isGroup && groupWhere
        ? `✅ ${who} joined the ${callNoun} in ${groupWhere} · ${when}`
        : `✅ ${who} joined the ${callNoun} · ${when}`;
    }
    if (payload.kind === 'ended') {
      if (payload.reason === 'declined') {
        return isGroup && groupWhere
          ? `📵 ${who} declined the ${callNoun} in ${groupWhere} · ${when}`
          : `📵 ${who} declined the ${callNoun} · ${when}`;
      }
      return isGroup && groupWhere
        ? `📴 ${who} ended the ${callNoun} in ${groupWhere} · ${when}`
        : `📴 ${who} ended the ${callNoun} · ${when}`;
    }
    return `📞 ${who} · ${when}`;
  }

  function resolveDmCallActorPfp(actorUserId: string | undefined): string {
    const trimmed = actorUserId?.trim() ?? '';
    if (!trimmed) return '';
    const known = workspace.users.value.find((u) => u.id === trimmed);
    const fromWorkspace = known?.pfp?.trim();
    if (fromWorkspace) return fromWorkspace;
    if (authSession.backendUser?.id === trimmed) {
      const own = authSession.backendUser.pfp?.trim();
      if (own) return own;
    }
    return '';
  }

  function appendDmCallLocalLog(
    payload: EchoDmCallEvent,
    actorName: string,
  ): void {
    const channelId = payload.channelId?.trim() ?? '';
    if (!channelId) return;
    const eventIso = new Date().toISOString();
    const content = buildDmCallLocalLogContent(payload, actorName, eventIso);
    const id = `local_dm_call_log:${dmCallEventKey(payload)}`;
    const list = workspace.messages.value[channelId] ?? [];
    const index = getChannelIndex(channelId, list);
    if (index.byId.has(id)) return;
    index.insert({
      id,
      authorId: 'system',
      authorDisplayName: 'Call',
      systemMessage: true,
      timestamp: eventIso,
      content,
      contentText: content,
    });
    syncChannelMessages(channelId, index);
  }

  function notifyIncomingDmCall(
    payload: EchoDmCallEvent,
    actorName: string,
    traceId: string,
  ): void {
    const actorId = payload.actorUserId?.trim() ?? '';
    const imageUrl = resolveCallTileAvatarUrl(
      resolveDmCallActorPfp(payload.actorUserId),
      actorId,
    );
    const groupTitle =
      payload.thread.kind === 'group'
        ? resolveGroupDmCallDisplayName(payload)
        : '';
    const body =
      payload.thread.kind === 'group'
        ? `${actorName} is calling · ${groupTitle}`
        : `${actorName} is calling you.`;
    dispatchAppToastDetail({
      message: actorName,
      subtitle:
        payload.thread.kind === 'group'
          ? `is calling · ${groupTitle}`
          : 'is calling you.',
      imageUrl,
      variant: 'incoming_call',
      severity: 'info',
      durationMs: 0,
      actions: [
        {
          id: 'answer',
          label: 'Answer',
          kind: 'primary',
          run: () => {
            void answerDmCall();
          },
        },
        {
          id: 'decline',
          label: 'Decline',
          kind: 'secondary',
          run: () => {
            void declineDmCall();
          },
        },
        {
          id: 'mute_ringtone',
          label: callRingtoneStore.muted ? 'Unmute ringtone' : 'Mute ringtone',
          kind: 'secondary',
          keepOpen: true,
          run: () => {
            callRingtoneStore.toggleMuted();
          },
        },
      ],
    });
    emitDiagnostic({
      level: 'info',
      domain: 'socket',
      event: 'dm_call_toast_shown',
      stage: 'success',
      traceId,
      context: {
        channelId: payload.channelId,
        actorUserId: payload.actorUserId,
        correlationId: payload.correlationId ?? '',
      },
    });
    if (!notificationPreferences.settings.desktopAlerts) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') {
      emitDiagnostic({
        level: 'info',
        domain: 'socket',
        event: 'dm_call_desktop_notification_skipped',
        stage: 'success',
        traceId,
        context: {
          channelId: payload.channelId,
          actorUserId: payload.actorUserId,
          correlationId: payload.correlationId ?? '',
          reason: 'permission_not_granted',
        },
      });
      return;
    }
    try {
      const notification = new Notification(actorName, {
        body,
        icon: imageUrl || '/icons/favicon-32.png',
        tag: `echo-dm-call:${payload.channelId}`,
      });
      notification.onclick = () => {
        try {
          window.focus();
        } catch {
          /* ignore */
        }
        notification.close();
      };
      emitDiagnostic({
        level: 'info',
        domain: 'socket',
        event: 'dm_call_desktop_notification_shown',
        stage: 'success',
        traceId,
        context: {
          channelId: payload.channelId,
          actorUserId: payload.actorUserId,
          correlationId: payload.correlationId ?? '',
        },
      });
    } catch (error) {
      emitDiagnostic({
        level: 'warn',
        domain: 'socket',
        event: 'dm_call_desktop_notification_failed',
        stage: 'fail',
        traceId,
        context: {
          channelId: payload.channelId,
          actorUserId: payload.actorUserId,
          correlationId: payload.correlationId ?? '',
        },
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  async function ensureDirectDmChannelIdForUser(
    userId: string,
  ): Promise<string> {
    for (const [channelId, peerId] of echoDmPeerByChannelId.value) {
      if (peerId === userId && isEchoGraphId(channelId)) return channelId;
    }
    const token = authSession.accessToken?.trim() ?? '';
    const channelId = await openEchoDirectDmChannel(token, userId);
    if (!channelId) return '';
    // Register the channel→peer mapping; do NOT synthesize `lastActivityId` from the
    // channel snowflake. The authoritative `lastActivityAt` arrives from `/dm/threads`
    // or the subsequent `dm:call` / `dm:activity` event.
    mergeRealtimeDmThread({
      channelId,
      kind: 'direct',
      peerUserId: userId,
    });
    return channelId;
  }

  const dmCallWithUserId = ref<string | null>(null);
  const dmCallFullscreen = ref(false);
  const dmCallMuted = ref(false);
  const dmCallDeafened = ref(false);
  const dmCallVideo = ref(false);
  const dmCallScreenshare = ref(false);
  const dmCallMutedBeforeDeafen = ref(false);
  const dmLiveKitJoinChannelId = ref<string | null>(null);
  const dmCallSignal = ref<DmCallSignalState | null>(null);
  const dmCallInviteSentChannelId = ref('');

  /** Group DM: when this client started "dialing" the group; used to hide pending tiles after 30s. */
  const dmGroupCallOutboundRingEpochMs = ref<number | null>(null);
  /** Bumped once when the 30s ring-list window elapses so `dmCallCallViewParticipants` recomputes. */
  const dmGroupCallRingListInvalidateTick = ref(0);
  let dmGroupCallRingListHideTimer: ReturnType<typeof setTimeout> | null = null;

  function clearDmGroupCallRingListHideTimer() {
    if (dmGroupCallRingListHideTimer != null) {
      clearTimeout(dmGroupCallRingListHideTimer);
      dmGroupCallRingListHideTimer = null;
    }
  }

  /** Echo `dm:call` accepted actors (includes self after answering / outgoing seed). */
  const dmCallSignaledAcceptUserIds = ref<string[]>([]);
  /** Echo `dm:call` ended+declined actors seen while this session is active. */
  const dmCallDeclinedUserIds = ref<string[]>([]);

  function resetDmCallParticipantTracking() {
    dmCallSignaledAcceptUserIds.value = [];
    dmCallDeclinedUserIds.value = [];
  }

  function seedDmCallParticipantTrackingForOutgoing(selfId: string) {
    const s = selfId.trim();
    dmCallSignaledAcceptUserIds.value = s ? [s] : [];
    dmCallDeclinedUserIds.value = [];
  }

  function recordDmCallAcceptedActor(actorUserId: string | undefined) {
    const a = actorUserId?.trim();
    if (!a) return;
    if (dmCallSignaledAcceptUserIds.value.includes(a)) return;
    dmCallSignaledAcceptUserIds.value = [
      ...dmCallSignaledAcceptUserIds.value,
      a,
    ];
  }

  function recordDmCallDeclinedActor(actorUserId: string | undefined) {
    const a = actorUserId?.trim();
    if (!a) return;
    if (dmCallDeclinedUserIds.value.includes(a)) return;
    dmCallDeclinedUserIds.value = [...dmCallDeclinedUserIds.value, a];
  }

  const dmPartnerUser = computed<{
    id: string;
    name: string;
    pfp: string;
    status?: string;
  } | null>(() => {
    const callId = dmCallWithUserId.value?.trim() ?? '';
    const oneToOneCallPeer = callId && !groupDMs.value[callId] ? callId : '';
    const selected = selectedDMUserId.value?.trim() ?? '';
    // Thread identity (header, empty/history intro, presence) must follow the
    // open DM, not whoever is in `dmCallWithUserId` — that stays set while you browse.
    const uid = selected || oneToOneCallPeer;
    if (!uid) return null;
    const user = workspace.users.value.find((u) => u.id === uid);
    if (!user) return null;
    return { id: user.id, name: user.name, pfp: user.pfp, status: user.status };
  });

  const activeGroupId = computed(() => {
    const cid = activeChannelId.value;
    if (groupDMs.value[cid]) return cid;
    const callId = dmCallWithUserId.value?.trim() ?? '';
    return callId && groupDMs.value[callId] ? callId : null;
  });

  const activeGroupDM = computed<{
    id: string;
    name: string;
    pfp: string;
    memberIds: string[];
  } | null>(() => {
    const gid = activeGroupId.value;
    if (!gid) return null;
    const group = groupDMs.value[gid];
    if (!group) return null;
    return {
      id: group.id,
      name: group.name,
      pfp: group.pfp ?? '',
      memberIds: group.memberIds ?? [],
    };
  });

  const activeGroupMembersForUi = computed(() => {
    const group = activeGroupDM.value;
    if (!group) return [];
    const seen = new Set<string>();
    const out: { id: string; name: string; pfp: string; status?: string }[] =
      [];
    for (const id of group.memberIds) {
      const uid = id?.trim();
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      const user = workspace.users.value.find((u) => u.id === uid);
      out.push({
        id: uid,
        name: user?.name ?? 'Member',
        pfp: user?.pfp ?? '',
        status: user?.status,
      });
    }
    return out;
  });

  const dmPartnerUserIdForGroupDm = computed(
    () => dmPartnerUser.value?.id ?? null,
  );

  const dmVoiceJoinTargetId = computed(() => {
    const dm = dmCallWithUserId.value?.trim();
    if (!dm) return '';
    if (groupDMs.value[dm]) return dm;

    const ac = activeChannelId.value?.trim() ?? '';
    if (ac.startsWith('dm-') && !ac.startsWith('dm-group-')) {
      const legacyPeer = ac.slice('dm-'.length);
      if (legacyPeer === dm) {
        const wired = resolveEchoDmWireChannelId(
          ac,
          echoDmPeerByChannelId.value,
        );
        if (wired && isEchoGraphId(wired)) return wired;
      }
    }

    for (const [ch, peer] of echoDmPeerByChannelId.value) {
      if (peer === dm && isEchoGraphId(ch)) return ch;
    }
    if (ac && echoDmPeerByChannelId.value.get(ac) === dm && isEchoGraphId(ac)) {
      return ac;
    }
    return '';
  });

  /**
   * True only when a call is active and the open DM/group thread is the one that
   * call belongs to. When there is no call, this is always false so `=== true`
   * gates cannot leak DM call chrome into servers or other conversations.
   */
  const dmCallMatchesActiveChannel = computed(() => {
    const dm = dmCallWithUserId.value?.trim();
    if (!dm) return false;
    const ac = activeChannelId.value?.trim() ?? '';
    if (!ac) return false;
    if (groupDMs.value[dm]) {
      return ac === dm;
    }
    if (ac === `dm-${dm}`) return true;
    if (echoDmPeerByChannelId.value.get(ac) === dm) return true;
    const wired = dmVoiceJoinTargetId.value?.trim();
    if (wired && ac === wired) return true;
    return false;
  });

  function resolveDmCallGlassPeerForTarget(
    targetId: string,
    isGroup: boolean,
  ): ActiveDmThreadCallUi['glassPeer'] {
    const id = targetId.trim();
    if (!id) return null;
    if (isGroup) {
      const g = groupDMs.value[id];
      if (!g) return null;
      return {
        isGroup: true,
        id,
        name: g.name,
        pfp: g.pfp ?? '',
      };
    }
    const u = workspace.users.value.find((x) => x.id === id);
    if (!u) return null;
    return {
      isGroup: false,
      id: u.id,
      name: u.name,
      pfp: u.pfp,
      status: u.status,
    };
  }

  function resolvePersistedActiveDmCallForThread(threadId: string): {
    channelId: string;
    targetId: string;
    isGroup: boolean;
    participantUserIds: string[];
  } | null {
    const resolvedThreadId = resolveEchoDmWireChannelId(
      threadId.trim(),
      echoDmPeerByChannelId.value,
    ).trim();
    if (!resolvedThreadId) return null;
    const participantUserIds =
      echoDmActiveCallParticipantUserIdsByChannelId.value.get(
        resolvedThreadId,
      ) ?? [];
    if (participantUserIds.length <= 0) return null;
    if (groupDMs.value[resolvedThreadId]) {
      return {
        channelId: resolvedThreadId,
        targetId: resolvedThreadId,
        isGroup: true,
        participantUserIds,
      };
    }
    const peerUserId =
      echoDmPeerByChannelId.value.get(resolvedThreadId)?.trim() ?? '';
    if (!peerUserId) return null;
    return {
      channelId: resolvedThreadId,
      targetId: peerUserId,
      isGroup: false,
      participantUserIds,
    };
  }

  function resolvePersistedActiveDmCallForCurrentSurface() {
    const surface = mainSurface.value;
    if (surface.type !== 'dmThread') return null;
    return resolvePersistedActiveDmCallForThread(surface.threadId);
  }

  function dmThreadVoiceE2eeActive(threadId: string): boolean {
    const wire = resolveEchoDmWireChannelId(
      threadId.trim(),
      echoDmPeerByChannelId.value,
    ).trim();
    return wire.length > 0;
  }

  const activeDmThreadCallUi = computed<ActiveDmThreadCallUi | null>(() => {
    const surface = mainSurface.value;
    if (surface.type !== 'dmThread') return null;

    const threadId = surface.threadId.trim();
    if (!threadId) return null;

    const dm = dmCallWithUserId.value?.trim();
    if (!dm) {
      const persisted = resolvePersistedActiveDmCallForThread(threadId);
      if (!persisted) return null;
      return {
        threadId,
        targetId: persisted.targetId,
        isGroup: persisted.isGroup,
        visualOnly: true,
        quarterView: true,
        fullscreen: false,
        ringing: false,
        awaitingAccept: false,
        ringUi: false,
        lobbyAfterSelfLeave: true,
        incoming: false,
        ringRemoteVanishing: false,
        glassPeer: resolveDmCallGlassPeerForTarget(
          persisted.targetId,
          persisted.isGroup,
        ),
        voiceE2ee: dmThreadVoiceE2eeActive(threadId),
      };
    }

    const isGroup = !!groupDMs.value[dm];
    const wired = dmVoiceJoinTargetId.value?.trim() ?? '';
    const matchesThread = isGroup
      ? threadId === dm
      : threadId === `dm-${dm}` ||
        echoDmPeerByChannelId.value.get(threadId) === dm ||
        (!!wired && threadId === wired);

    if (!matchesThread) return null;

    return {
      threadId,
      targetId: dm,
      isGroup,
      visualOnly: false,
      quarterView: dmCallQuarterView.value,
      fullscreen: dmCallFullscreen.value,
      ringing: dmCallRinging.value,
      awaitingAccept: dmCallAwaitingAccept.value,
      ringUi: dmCallRingUi.value,
      lobbyAfterSelfLeave: dmCallLobbyAfterSelfLeave.value,
      incoming: dmCallIncoming.value,
      ringRemoteVanishing: dmCallRingRemoteVanishing.value,
      glassPeer: dmCallGlassPeer.value,
      voiceE2ee: dmThreadVoiceE2eeActive(threadId),
    };
  });

  watch(
    () => dmCallMatchesActiveChannel.value,
    (matches) => {
      if (matches === false && dmCallFullscreen.value) {
        dmCallFullscreen.value = false;
      }
    },
  );

  const dmCallGlassPeer = computed(() => {
    const id = dmCallWithUserId.value?.trim();
    if (!id) return null;
    const g = groupDMs.value[id];
    if (g) {
      return {
        isGroup: true as const,
        id,
        name: g.name,
        pfp: g.pfp ?? '',
      };
    }
    const u = workspace.users.value.find((x) => x.id === id);
    if (u) {
      return {
        isGroup: false as const,
        id: u.id,
        name: u.name,
        pfp: u.pfp,
        status: u.status,
      };
    }
    return null;
  });

  const callOverlay = computed(() =>
    deriveCallOverlay({
      mainSurface: mainSurface.value,
      dmCallWithUserId: dmCallWithUserId.value,
      dmPartnerUserId: dmPartnerUser.value?.id ?? null,
      isGroupDm: !!activeGroupId.value,
      activeGroupDmId: activeGroupId.value,
      dmCallFullscreen: dmCallFullscreen.value,
    }),
  );

  /**
   * Group DM call chrome (header strip, pre-LiveKit ring grid): full member list until
   * {@link GROUP_CALL_RING_LIST_HIDE_MS}, then only people who joined, declined, or self.
   */
  const activeGroupCallMembersVisible = computed(() => {
    const base = activeGroupMembersForUi.value;
    const dm = dmCallWithUserId.value?.trim();
    if (!dm || !groupDMs.value[dm] || callOverlay.value.type !== 'dmCall') {
      return base;
    }
    void dmGroupCallRingListInvalidateTick.value;
    const epoch = dmGroupCallOutboundRingEpochMs.value;
    if (epoch == null || Date.now() - epoch < GROUP_CALL_RING_LIST_HIDE_MS) {
      return base;
    }
    const selfId = authSession.backendUser?.id?.trim();
    const b = voiceBinding.value;
    if (!selfId) return base;
    const remoteMap = b?.vcRemoteParticipants.value;
    return base.filter((m) => {
      const id = m.id.trim();
      if (id === selfId) return true;
      if (remoteMap?.has(id)) return true;
      if (dmCallSignaledAcceptUserIds.value.includes(id)) return true;
      if (dmCallDeclinedUserIds.value.includes(id)) return true;
      return false;
    });
  });

  const isDmVoiceCallUi = ref(false);

  watch(
    () => callOverlay.value.type,
    (t) => {
      isDmVoiceCallUi.value = t === 'dmCall';
    },
    { immediate: true },
  );

  function applyDmCallDeafened(next: boolean) {
    if (next) {
      dmCallMutedBeforeDeafen.value = dmCallMuted.value;
      dmCallDeafened.value = true;
      dmCallMuted.value = true;
    } else {
      dmCallDeafened.value = false;
      dmCallMuted.value = dmCallMutedBeforeDeafen.value;
    }
  }

  function toggleDmCallMuted() {
    if (dmCallDeafened.value) return;
    dmCallMuted.value = !dmCallMuted.value;
  }

  function guestCannotUseDmCallsToast(action: 'start' | 'answer'): void {
    UIErrorBus.emit({
      context: `dm_call.guest_${action}`,
      severity: 'warning',
      userMessage:
        action === 'start'
          ? 'Add an email and password to start calls.'
          : 'Add an email and password to answer calls.',
    });
  }

  async function assertDmCallMediaPreflightOk(
    retry?: () => void | Promise<void>,
  ): Promise<boolean> {
    if (dmCallMuted.value) return true;
    const outcome = await runVoiceJoinMediaPreflightInteractive();
    if (outcome === 'ready') return true;
    if (outcome === 'join_muted') {
      dmCallMuted.value = true;
      return true;
    }
    UIErrorBus.emit({
      context: 'voice.dm_preflight',
      severity: 'warning',
      userMessage:
        'Microphone check cancelled. Tap Retry after you allow the mic or connect a device.',
      ...(retry
        ? {
            retryAction: () => {
              void Promise.resolve(retry());
            },
          }
        : {}),
    });
    return false;
  }

  function startDmCall() {
    const uid = selectedDMUserId.value?.trim();
    if (!uid) return;
    if (authSession.backendUser?.isGuest) {
      guestCannotUseDmCallsToast('start');
      return;
    }
    void (async () => {
      if (!(await assertDmCallMediaPreflightOk(() => startDmCall()))) return;
      await releaseGuildVoiceHeldBeforeDmExclusive();
      dmCallLobbyAfterSelfLeave.value = false;
      dmCallWithUserId.value = uid;
      dmCallFullscreen.value = false;
      seedDmCallParticipantTrackingForOutgoing(
        authSession.backendUser?.id?.trim() ?? '',
      );
      dmCallSignal.value = {
        channelId: '',
        targetId: uid,
        direction: 'outgoing',
        status: 'ringing',
      };
      void ensureDirectDmChannelIdForUser(uid)
        .then((channelId) => {
          if (!channelId || dmCallWithUserId.value !== uid) return;
          if (
            dmCallSignal.value?.direction === 'outgoing' &&
            dmCallSignal.value.targetId === uid
          ) {
            dmCallSignal.value = {
              ...dmCallSignal.value,
              channelId,
            };
          }
        })
        .catch((e) => {
          reportPrimaryFlowFailure(
            'startDmCall.ensureDirectDmChannelIdForUser',
            e,
            {
              userId: uid,
            },
          );
        });
    })();
  }

  function startDmCallWithUserId(userId: string | null) {
    if (!userId?.trim()) return;
    if (authSession.backendUser?.isGuest) {
      guestCannotUseDmCallsToast('start');
      return;
    }
    const trimmed = userId.trim();
    void (async () => {
      if (
        !(await assertDmCallMediaPreflightOk(() =>
          startDmCallWithUserId(trimmed),
        ))
      )
        return;
      await releaseGuildVoiceHeldBeforeDmExclusive();
      dmCallLobbyAfterSelfLeave.value = false;
      dmCallWithUserId.value = trimmed;
      dmCallFullscreen.value = false;
      seedDmCallParticipantTrackingForOutgoing(
        authSession.backendUser?.id?.trim() ?? '',
      );
      dmCallSignal.value = {
        channelId: '',
        targetId: trimmed,
        direction: 'outgoing',
        status: 'ringing',
      };
      void ensureDirectDmChannelIdForUser(trimmed)
        .then((channelId) => {
          if (!channelId || dmCallWithUserId.value !== trimmed) return;
          if (
            dmCallSignal.value?.direction === 'outgoing' &&
            dmCallSignal.value.targetId === trimmed
          ) {
            dmCallSignal.value = {
              ...dmCallSignal.value,
              channelId,
            };
          }
        })
        .catch((e) => {
          reportPrimaryFlowFailure(
            'startDmCallWithUserId.ensureDirectDmChannelIdForUser',
            e,
            {
              userId: trimmed,
            },
          );
        });
    })();
  }

  function startGroupCall() {
    if (authSession.backendUser?.isGuest) {
      guestCannotUseDmCallsToast('start');
      return;
    }
    const gid = activeGroupId.value;
    if (!gid) return;
    void (async () => {
      if (!(await assertDmCallMediaPreflightOk(() => startGroupCall()))) return;
      await releaseGuildVoiceHeldBeforeDmExclusive();
      dmCallLobbyAfterSelfLeave.value = false;
      dmCallWithUserId.value = gid;
      dmCallFullscreen.value = false;
      seedDmCallParticipantTrackingForOutgoing(
        authSession.backendUser?.id?.trim() ?? '',
      );
      dmCallSignal.value = {
        channelId: gid,
        targetId: gid,
        direction: 'outgoing',
        status: 'ringing',
      };
      dmGroupCallOutboundRingEpochMs.value = Date.now();
    })();
  }

  function startGroupCallWithId(groupId: string | null) {
    if (!groupId?.trim()) return;
    if (authSession.backendUser?.isGuest) {
      guestCannotUseDmCallsToast('start');
      return;
    }
    const trimmed = groupId.trim();
    void (async () => {
      if (
        !(await assertDmCallMediaPreflightOk(() =>
          startGroupCallWithId(trimmed),
        ))
      )
        return;
      await releaseGuildVoiceHeldBeforeDmExclusive();
      dmCallLobbyAfterSelfLeave.value = false;
      dmCallWithUserId.value = trimmed;
      dmCallFullscreen.value = false;
      seedDmCallParticipantTrackingForOutgoing(
        authSession.backendUser?.id?.trim() ?? '',
      );
      dmCallSignal.value = {
        channelId: trimmed,
        targetId: trimmed,
        direction: 'outgoing',
        status: 'ringing',
      };
      dmGroupCallOutboundRingEpochMs.value = Date.now();
    })();
  }

  function currentDmCallChannelId(): string {
    return (
      dmCallSignal.value?.channelId?.trim() ||
      dmVoiceJoinTargetId.value?.trim() ||
      ''
    );
  }

  function isCurrentDmCallChannel(channelId: string): boolean {
    const trimmed = channelId.trim();
    if (!trimmed) return false;
    if (currentDmCallChannelId() === trimmed) return true;
    if (!dmCallWithUserId.value?.trim()) return false;
    return (dmVoiceJoinTargetId.value?.trim() ?? '') === trimmed;
  }

  function appendLocalOutgoingCallStartedLog(
    channelId: string,
    targetId: string,
  ): void {
    const selfId = authSession.backendUser?.id?.trim() ?? '';
    if (!selfId || !channelId.trim()) return;
    const group = groupDMs.value[channelId] ?? groupDMs.value[targetId];
    const thread: EchoDmRealtimeThread = group
      ? {
          kind: 'group',
          channelId: channelId.trim(),
          name: group.name,
          memberUserIds: group.memberIds ?? [],
        }
      : {
          kind: 'direct',
          channelId: channelId.trim(),
          peerUserId: targetId.trim(),
        };
    appendDmCallLocalLog(
      {
        kind: 'incoming',
        channelId: channelId.trim(),
        actorUserId: selfId,
        thread,
        correlationId: `local_start:${channelId}:${Date.now().toString(36)}`,
      },
      resolveDmCallActorName(selfId),
    );
  }

  function handleEchoDmCall(
    payload: EchoDmCallEvent,
    presentation: 'default' | 'hydrate_replay' = 'default',
  ) {
    const selfId = authSession.backendUser?.id?.trim() ?? '';
    if (!payload.channelId?.trim()) return;
    const traceId = payload.correlationId?.trim() || newTraceId();
    const actorName = resolveDmCallActorName(payload.actorUserId);
    const shouldPresent =
      presentation === 'hydrate_replay'
        ? true
        : rememberDmCallEventForPresentation(payload);
    emitDiagnostic({
      level: 'info',
      domain: 'socket',
      event: 'dm_call_handled',
      stage: 'attempt',
      traceId,
      context: {
        kind: payload.kind,
        channelId: payload.channelId,
        actorUserId: payload.actorUserId,
        correlationId: payload.correlationId ?? '',
        reason: payload.reason ?? '',
      },
    });
    mergeRealtimeDmThread(payload.thread);
    const targetId = dmCallTargetIdFromThread(payload.thread);
    if (payload.kind === 'incoming') {
      if (payload.actorUserId === selfId) return;
      const ch = payload.channelId.trim();
      const tid = targetId.trim();
      const signal = dmCallSignal.value;
      const sameSession =
        dmCallWithUserId.value?.trim() === tid && isCurrentDmCallChannel(ch);
      if (sameSession) {
        const vb = voiceBinding.value;
        const lkConnected =
          vb?.liveKitState.value === 'connected' &&
          (dmLiveKitJoinChannelId.value?.trim() === ch ||
            currentDmCallChannelId() === ch);
        // Treat duplicate incoming signals like re-opening a VC you are already in:
        // preserve the current call session instead of resetting it back to ringing.
        if (signal?.status === 'accepted' || lkConnected) {
          if (payload.thread.kind === 'group') {
            recordDmCallAcceptedActor(payload.actorUserId);
            if (shouldPresent) {
              appendDmCallLocalLog(payload, actorName);
            }
          }
          return;
        }
        if (signal?.direction === 'incoming' && signal?.status === 'ringing') {
          return;
        }
        if (
          signal?.direction === 'outgoing' &&
          signal?.channelId?.trim() === ch
        ) {
          if (payload.thread.kind === 'group') {
            recordDmCallAcceptedActor(payload.actorUserId);
            if (shouldPresent) {
              appendDmCallLocalLog(payload, actorName);
            }
          }
          return;
        }
      }
      if (payload.thread.kind === 'group') {
        dmGroupCallOutboundRingEpochMs.value = Date.now();
      }
      resetDmCallParticipantTracking();
      // Set incoming call state before showing interactive toast actions.
      // Without this ordering, a fast "Answer" click can run before
      // `dmCallSignal` exists and silently no-op.
      dmCallLobbyAfterSelfLeave.value = false;
      dmCallWithUserId.value = targetId;
      dmCallFullscreen.value = false;
      dmCallSignal.value = {
        channelId: payload.channelId,
        targetId,
        direction: 'incoming',
        status: 'ringing',
      };
      if (shouldPresent) {
        appendDmCallLocalLog(payload, actorName);
        if (!isEchoDmChannelCurrentlyOpenInMainUi(payload.channelId)) {
          notifyIncomingDmCall(payload, actorName, traceId);
        }
      }
      return;
    }
    if (payload.kind === 'accepted') {
      recordDmCallAcceptedActor(payload.actorUserId);
      if (shouldPresent) {
        appendDmCallLocalLog(payload, actorName);
      }
      const signal = dmCallSignal.value;
      if (!signal || !isCurrentDmCallChannel(payload.channelId)) return;
      const shouldPromoteToAccepted =
        (signal.direction === 'outgoing' && payload.actorUserId !== selfId) ||
        (signal.direction === 'incoming' && payload.actorUserId === selfId);
      if (shouldPromoteToAccepted) {
        dmCallSignal.value = {
          ...signal,
          channelId: payload.channelId,
          status: 'accepted',
        };
      }
      return;
    }
    if (
      payload.kind === 'ended' &&
      payload.actorUserId !== selfId &&
      isCurrentDmCallChannel(payload.channelId)
    ) {
      if (payload.reason === 'declined') {
        recordDmCallDeclinedActor(payload.actorUserId);
      }
      if (shouldPresent) {
        appendDmCallLocalLog(payload, actorName);
      }
      // Group DM: another member leaving/declining must not end the call for everyone
      // (1:1 still tears down when the peer ends).
      if (payload.thread.kind !== 'group') {
        void endDmCall({ emitSignal: false });
      }
    }
  }

  function buildEchoDmRealtimeThreadForCallChannel(
    echoChannelId: string,
  ): EchoDmRealtimeThread | null {
    const ch = echoChannelId.trim();
    if (!ch || !isEchoGraphId(ch)) return null;
    const g = groupDMs.value[ch];
    if (g) {
      const pfp = (g.pfp ?? '').trim();
      return {
        channelId: ch,
        kind: 'group',
        name: g.name,
        memberUserIds: [...(g.memberIds ?? [])],
        ...(pfp ? { pfp } : {}),
      };
    }
    const peer = echoDmPeerByChannelId.value.get(ch);
    if (peer) {
      return {
        channelId: ch,
        kind: 'direct',
        peerUserId: peer,
      };
    }
    return null;
  }

  const dmVoicePresenceSnapshotForHydrateReplay = computed(() => {
    const selfId = authSession.backendUser?.id?.trim() ?? '';
    const keys = [
      ...echoDmActiveCallParticipantUserIdsByChannelId.value.keys(),
    ].sort((a, b) => a.localeCompare(b));
    const segments = keys.map((k) => {
      const ids =
        echoDmActiveCallParticipantUserIdsByChannelId.value.get(k) ?? [];
      return `${k}:${participantSignature(ids)}`;
    });
    return `${selfId}|${segments.join(';')}`;
  });

  function maybeReplayIncomingDmCallFromHydratedVoicePresence(): void {
    const selfId = authSession.backendUser?.id?.trim() ?? '';
    if (!selfId || authSession.backendUser?.isGuest) return;

    const voiceMap = echoDmActiveCallParticipantUserIdsByChannelId.value;
    {
      const d = dismissedIncomingVoiceRingSnapshotByChannel.value;
      const next = new Map(d);
      let changed = false;
      for (const k of [...next.keys()]) {
        if (!voiceMap.has(k)) {
          next.delete(k);
          changed = true;
        }
      }
      if (changed) dismissedIncomingVoiceRingSnapshotByChannel.value = next;
    }

    for (const [channelId, rawIds] of voiceMap) {
      const ch = channelId.trim();
      if (!ch || !isEchoGraphId(ch)) continue;
      const ids = rawIds.map((x) => String(x).trim()).filter(Boolean);
      if (!ids.length) continue;
      if (ids.includes(selfId)) continue;
      const others = [...new Set(ids.filter((id) => id !== selfId))].sort(
        (a, b) => a.localeCompare(b),
      );
      if (!others.length) continue;

      const currentSig = participantSignature(ids);
      let dismissed =
        dismissedIncomingVoiceRingSnapshotByChannel.value.get(ch) ?? null;
      if (dismissed != null && dismissed !== currentSig) {
        const next = new Map(dismissedIncomingVoiceRingSnapshotByChannel.value);
        next.delete(ch);
        dismissedIncomingVoiceRingSnapshotByChannel.value = next;
        dismissed = null;
      }
      if (dismissed === currentSig) continue;

      const thread = buildEchoDmRealtimeThreadForCallChannel(ch);
      if (!thread) continue;
      const targetId = dmCallTargetIdFromThread(thread);
      const tid = targetId.trim();
      if (!tid) continue;

      const sig = dmCallSignal.value;
      if (sig?.channelId?.trim() === ch) {
        if (sig.direction === 'outgoing') continue;
        if (sig.status === 'accepted') continue;
        if (
          sig.direction === 'incoming' &&
          sig.status === 'ringing' &&
          dmCallWithUserId.value?.trim() === tid
        ) {
          continue;
        }
      }

      const actorUserId = others[0]!;
      handleEchoDmCall(
        {
          kind: 'incoming',
          channelId: ch,
          actorUserId,
          thread,
          correlationId: `hydrate_vp:${ch}:${currentSig}`,
        },
        'hydrate_replay',
      );
    }
  }

  watch(dmVoicePresenceSnapshotForHydrateReplay, () => {
    maybeReplayIncomingDmCallFromHydratedVoicePresence();
  });

  const voiceBinding = shallowRef<AppLayoutDmCallsVoiceBinding | null>(null);

  function dmLiveKitVoiceService() {
    const b = voiceBinding.value;
    const liveKitVoiceApi = b?.liveKitVoiceApi;
    return createVoiceService({
      authSession,
      workspace,
      workspaceHydrator: { hydrate: hydrateEchoFromApi },
      liveKit: liveKitVoiceApi
        ? {
            connect: liveKitVoiceApi.connect.bind(liveKitVoiceApi),
            disconnect: liveKitVoiceApi.disconnect.bind(liveKitVoiceApi),
          }
        : undefined,
      getDmVoiceE2eeMediaKey,
    });
  }

  async function endDmCall(options?: {
    emitSignal?: boolean;
    reason?: EchoDmCallEndedReason;
  }) {
    const reason = options?.reason ?? 'ended';
    if (reason !== 'declined') {
      playEchoSound('leaveVc');
    }
    clearDmGroupCallRingListHideTimer();
    dmGroupCallOutboundRingEpochMs.value = null;
    resetDmCallParticipantTracking();
    dmCallLobbyAfterSelfLeave.value = false;
    const emitSignal = options?.emitSignal !== false;
    const channelId = currentDmCallChannelId();
    const signalBeforeEnd = dmCallSignal.value;
    const chTrim = channelId.trim();
    const dismissedRingSnapshot =
      chTrim &&
      signalBeforeEnd?.direction === 'incoming' &&
      signalBeforeEnd.status === 'ringing'
        ? participantSignature(
            echoDmActiveCallParticipantUserIdsByChannelId.value.get(chTrim) ??
              [],
          )
        : '';
    dmCallScreenshare.value = false;
    const b = voiceBinding.value;
    if (b?.liveKitVoiceApi && b.liveKitState.value === 'connected') {
      void b.stopVcScreenShare();
    }
    dmCallSignal.value = null;
    dmCallInviteSentChannelId.value = '';
    dmCallWithUserId.value = null;
    dmCallFullscreen.value = false;
    dmCallMuted.value = false;
    dmCallDeafened.value = false;
    dmCallMutedBeforeDeafen.value = false;
    dmCallVideo.value = false;
    dmLiveKitJoinChannelId.value = null;
    if (chTrim && dismissedRingSnapshot) {
      const m = new Map(dismissedIncomingVoiceRingSnapshotByChannel.value);
      m.set(chTrim, dismissedRingSnapshot);
      dismissedIncomingVoiceRingSnapshotByChannel.value = m;
    }
    const submitters = dmCallSocketSubmitters.value;
    if (emitSignal && channelId && submitters) {
      const result = await submitters.submitDmCallEnd(channelId, reason);
      propagateActionFailure(result, {
        flow: 'dm_call_end',
        context: 'dm_call_end',
        extraContext: { channelId, reason },
      });
    }
    try {
      await dmLiveKitVoiceService().onLeaveDmVoice();
    } catch {
      /* best-effort */
    }
  }

  /**
   * Leave DM / group call: always fully ends the call and cleans up UI.
   * UX: one leave action = fully gone, no "lobby" half-state.
   */
  async function leaveDmCallVoice(): Promise<void> {
    await endDmCall();
  }

  function rejoinDmCallVoice(): void {
    if (dmCallLobbyAfterSelfLeave.value) {
      dmCallLobbyAfterSelfLeave.value = false;
      return;
    }
    const persisted = resolvePersistedActiveDmCallForCurrentSurface();
    if (!persisted) return;
    const selfId = authSession.backendUser?.id?.trim() ?? '';
    clearDmGroupCallRingListHideTimer();
    dmGroupCallOutboundRingEpochMs.value = null;
    dmCallWithUserId.value = persisted.targetId;
    dmCallFullscreen.value = false;
    dmCallSignal.value = {
      channelId: persisted.channelId,
      targetId: persisted.targetId,
      direction: 'outgoing',
      status: 'accepted',
    };
    dmCallInviteSentChannelId.value = '';
    dmCallLobbyAfterSelfLeave.value = false;
    dmCallRingRemoteVanishing.value = false;
    dmCallScreenshare.value = false;
    dmCallMuted.value = false;
    dmCallDeafened.value = false;
    dmCallMutedBeforeDeafen.value = false;
    dmCallSignaledAcceptUserIds.value = [
      ...new Set(
        [selfId, ...persisted.participantUserIds]
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ];
    dmCallDeclinedUserIds.value = [];
  }

  async function answerDmCall(): Promise<void> {
    const signal = dmCallSignal.value;
    if (!signal || signal.direction !== 'incoming') return;
    if (authSession.backendUser?.isGuest) {
      guestCannotUseDmCallsToast('answer');
      await endDmCall({ reason: 'declined' });
      return;
    }
    const targetId =
      dmCallWithUserId.value?.trim() || signal.targetId?.trim() || '';
    if (!targetId) return;
    if (!(await assertDmCallMediaPreflightOk(() => answerDmCall()))) return;
    await releaseGuildVoiceHeldBeforeDmExclusive();
    dmCallLobbyAfterSelfLeave.value = false;
    dmCallSignal.value = { ...signal, status: 'accepted' };
    const submitters = dmCallSocketSubmitters.value;
    if (!submitters) return;
    const result = await submitters.submitDmCallAccept(signal.channelId);
    propagateActionFailure(result, {
      flow: 'dm_call_accept',
      context: 'dm_call_accept',
      extraContext: { channelId: signal.channelId },
    });
    if (result.ok) {
      recordDmCallAcceptedActor(authSession.backendUser?.id?.trim());
      navigateToDmForAnswer(targetId);
    }
  }

  async function declineDmCall(): Promise<void> {
    await endDmCall({ reason: 'declined' });
  }

  function bindVoiceSession(binding: AppLayoutDmCallsVoiceBinding) {
    voiceBinding.value = binding;
  }

  const dmCallRemoteCount = computed(() => {
    const b = voiceBinding.value;
    if (!dmCallWithUserId.value?.trim() || !b) return 0;
    return b.vcRemoteParticipants.value.size;
  });

  let dmCallWaitMusicDelayTimer: ReturnType<typeof setTimeout> | null = null;
  const dmCallHadRemoteParticipant = ref(false);
  const dmCallWaitMusicActive = ref(false);

  /**
   * User left the LiveKit room locally while the call is still active for others
   * (compact: keep quarter / glass chrome until rejoin or dismiss).
   */
  const dmCallLobbyAfterSelfLeave = ref(false);

  const dmCallRingUi = computed(
    () => dmCallRinging.value || dmCallLobbyAfterSelfLeave.value,
  );

  watch(
    () =>
      [
        dmCallWithUserId.value?.trim() ?? '',
        callOverlay.value.type,
        voiceBinding.value?.liveKitState.value ?? 'idle',
        dmCallRemoteCount.value,
        dmCallSignal.value?.direction ?? '',
        dmCallSignal.value?.status ?? '',
        dmCallLobbyAfterSelfLeave.value,
      ] as const,
    ([
      callId,
      overlayType,
      state,
      remoteCount,
      direction,
      signalStatus,
      lobbyAfterLeave,
    ]) => {
      if (lobbyAfterLeave) {
        if (dmCallWaitMusicDelayTimer) {
          clearTimeout(dmCallWaitMusicDelayTimer);
          dmCallWaitMusicDelayTimer = null;
        }
        dmCallWaitMusicActive.value = false;
        return;
      }
      if (!callId || overlayType !== 'dmCall' || state === 'error') {
        if (dmCallWaitMusicDelayTimer) {
          clearTimeout(dmCallWaitMusicDelayTimer);
          dmCallWaitMusicDelayTimer = null;
        }
        dmCallHadRemoteParticipant.value = false;
        dmCallWaitMusicActive.value = false;
        return;
      }
      if (signalStatus === 'accepted') {
        if (dmCallWaitMusicDelayTimer) {
          clearTimeout(dmCallWaitMusicDelayTimer);
          dmCallWaitMusicDelayTimer = null;
        }
        if (remoteCount > 0) dmCallHadRemoteParticipant.value = true;
        dmCallWaitMusicActive.value = false;
        return;
      }
      if (direction === 'incoming' && signalStatus === 'ringing') {
        if (dmCallWaitMusicDelayTimer) {
          clearTimeout(dmCallWaitMusicDelayTimer);
          dmCallWaitMusicDelayTimer = null;
        }
        dmCallHadRemoteParticipant.value = false;
        dmCallWaitMusicActive.value = false;
        return;
      }
      if (state !== 'connected') {
        if (dmCallWaitMusicDelayTimer) {
          clearTimeout(dmCallWaitMusicDelayTimer);
          dmCallWaitMusicDelayTimer = null;
        }
        dmCallWaitMusicActive.value = true;
        return;
      }
      if (remoteCount > 0) {
        if (dmCallWaitMusicDelayTimer) {
          clearTimeout(dmCallWaitMusicDelayTimer);
          dmCallWaitMusicDelayTimer = null;
        }
        dmCallHadRemoteParticipant.value = true;
        dmCallWaitMusicActive.value = false;
        return;
      }
      if (!dmCallHadRemoteParticipant.value) {
        dmCallWaitMusicActive.value = true;
        return;
      }
      dmCallWaitMusicActive.value = false;
      if (dmCallWaitMusicDelayTimer) return;
      dmCallWaitMusicDelayTimer = setTimeout(() => {
        dmCallWaitMusicDelayTimer = null;
        if (
          dmCallWithUserId.value?.trim() &&
          callOverlay.value.type === 'dmCall' &&
          voiceBinding.value?.liveKitState.value === 'connected' &&
          dmCallRemoteCount.value === 0
        ) {
          dmCallWaitMusicActive.value = true;
        }
      }, 3000);
    },
    { immediate: true },
  );

  const dmCallRinging = computed(() => {
    if (dmCallSignal.value?.status === 'ringing') return true;
    return dmCallWaitMusicActive.value;
  });

  /** True only while the signaling layer is still in `ringing` (pre-accept). Excludes wait-music / ringback after accept. */
  const dmCallAwaitingAccept = computed(
    () => dmCallSignal.value?.status === 'ringing',
  );

  const dmCallIncoming = computed(
    () =>
      dmCallSignal.value?.direction === 'incoming' &&
      dmCallSignal.value.status === 'ringing',
  );

  const dmCallRingRemoteVanishing = ref(false);
  const dmLiveKitJoinInFlightChannelId = ref<string | null>(null);

  watchEffect(() => {
    const ring = dmCallRinging.value;
    const sfx = notificationPreferences.settings.soundEffects;
    const shouldPlay =
      ring &&
      !dmCallRingRemoteVanishing.value &&
      !dmCallDeafened.value &&
      sfx &&
      !callRingtoneStore.muted &&
      callRingtoneStore.entries.length > 0;
    const url = callRingtoneStore.selectedEntry?.url ?? null;
    const volume01 =
      (callRingtoneStore.volumePercent / 100) * voiceLevels.outputGain;
    syncCallRingtoneLoop(shouldPlay && !!url, url, volume01);
  });

  watch(
    () => dmCallRemoteCount.value,
    (remoteCount) => {
      if (remoteCount <= 0 || !dmCallSignal.value) return;
      if (dmCallSignal.value.status === 'accepted') return;
      dmCallSignal.value = {
        ...dmCallSignal.value,
        status: 'accepted',
      };
    },
  );

  const dmCallQuarterView = computed(
    () => callOverlay.value.type === 'dmCall' && !dmCallFullscreen.value,
  );

  watch(
    () =>
      [
        callOverlay.value.type,
        voiceBinding.value?.liveKitVoiceApi?.isScreenShareEnabled.value ??
          false,
      ] as const,
    ([t, ss]) => {
      if (t !== 'dmCall') {
        dmCallScreenshare.value = false;
        return;
      }
      dmCallScreenshare.value = ss;
    },
    { flush: 'post', immediate: true },
  );

  watch(
    () => ({
      dm: dmCallWithUserId.value?.trim() ?? '',
      epoch: dmGroupCallOutboundRingEpochMs.value,
    }),
    ({ dm, epoch }) => {
      clearDmGroupCallRingListHideTimer();
      if (!dm || !groupDMs.value[dm] || epoch == null) return;
      const elapsed = Date.now() - epoch;
      if (elapsed >= GROUP_CALL_RING_LIST_HIDE_MS) {
        dmGroupCallRingListInvalidateTick.value++;
        return;
      }
      dmGroupCallRingListHideTimer = setTimeout(() => {
        dmGroupCallRingListHideTimer = null;
        dmGroupCallRingListInvalidateTick.value++;
      }, GROUP_CALL_RING_LIST_HIDE_MS - elapsed);
    },
    { flush: 'post' },
  );

  const dmCallCallViewParticipants = computed(() => {
    void dmGroupCallRingListInvalidateTick.value;
    const b = voiceBinding.value;
    const dm = dmCallWithUserId.value?.trim();
    if (!dm || callOverlay.value.type !== 'dmCall' || !b) return [];
    const selfId = authSession.backendUser?.id;
    if (!selfId) return [];

    type DmCallPresence = 'live' | 'ringing' | 'connecting' | 'declined';

    function presenceRank(pr: DmCallPresence): number {
      switch (pr) {
        case 'live':
          return 0;
        case 'connecting':
          return 1;
        case 'ringing':
          return 2;
        case 'declined':
          return 3;
        default:
          return 0;
      }
    }

    const remoteMap = b.vcRemoteParticipants.value;
    const lkConn = b.liveKitState.value === 'connected' && b.liveKitVoiceApi;
    const lkApi = b.liveKitVoiceApi;
    const lkLocal = lkConn
      ? {
          camera: lkApi!.isCameraEnabled.value,
          screen: lkApi!.isScreenShareEnabled.value,
        }
      : null;

    const g = groupDMs.value[dm];

    const resolvePresence = (userId: string): DmCallPresence => {
      if (dmCallDeclinedUserIds.value.includes(userId)) return 'declined';
      const inRoom = userId === selfId || remoteMap.has(userId);
      if (inRoom) return 'live';
      if (dmCallSignaledAcceptUserIds.value.includes(userId))
        return 'connecting';
      return 'ringing';
    };

    const idSet = new Set<string>();
    idSet.add(selfId);
    for (const rid of remoteMap.keys()) {
      if (rid) idSet.add(rid);
    }
    if (g?.memberIds?.length) {
      for (const id of g.memberIds) {
        if (id) idSet.add(id);
      }
    } else {
      idSet.add(dm);
    }

    const ids = [...idSet];

    const participants = ids
      .map((id) => {
        const presence = resolvePresence(id);
        const u = workspace.users.value.find((x) => x.id === id);
        const profile = u ?? { id, name: 'Participant', pfp: '' };
        const pfpForTile = resolveCallTileAvatarUrl(profile.pfp, profile.id);
        const isCurrentUser = id === selfId;

        if (presence !== 'live') {
          return {
            id: profile.id,
            name: profile.name,
            pfp: pfpForTile,
            muted: true,
            deafened: false,
            streaming: false,
            video: false,
            serverMuted: false,
            serverDeafened: false,
            speaking: false,
            audioLevel: 0,
            dmCallPresence: presence,
          };
        }

        const remoteInfo = remoteMap.get(id);
        const hasLiveKitData = isCurrentUser ? !!lkApi : !!remoteInfo;

        const {
          video,
          streaming,
          simMuted,
          simDeafened,
          cameraTrack,
          screenTrack,
          screenAudioTrack,
        } = buildVoiceParticipantMediaState({
          isCurrentUser,
          remoteInfo,
          lkLocalCameraScreen: isCurrentUser ? lkLocal : null,
          vcVideo: dmCallVideo.value,
          vcScreenshare: dmCallScreenshare.value,
        });

        const deafened = isCurrentUser ? dmCallDeafened.value : simDeafened;
        const muted = isCurrentUser
          ? dmCallMuted.value || dmCallDeafened.value
          : simMuted || simDeafened;

        const spk =
          b.speakingMap.value[profile.id] ?? b.speakingMap.value[profile.name];
        const speaking = isCurrentUser
          ? b.localSpeaking.value && !muted
          : (spk?.speaking ?? false) && !muted;
        const audioLevel = isCurrentUser
          ? muted
            ? 0
            : b.localAudioLevel.value
          : muted
            ? 0
            : (spk?.level ?? 0);

        return {
          id: profile.id,
          name: profile.name,
          pfp: pfpForTile,
          muted,
          deafened,
          streaming,
          video,
          serverMuted: false,
          serverDeafened: false,
          speaking,
          audioLevel,
          dmCallPresence: 'live' as const,
          ...(hasLiveKitData
            ? {
                cameraTrack,
                screenTrack,
                screenAudioTrack,
              }
            : {}),
        };
      })
      .filter(Boolean);

    const ringListExpired =
      !!g &&
      dmGroupCallOutboundRingEpochMs.value != null &&
      Date.now() - dmGroupCallOutboundRingEpochMs.value >=
        GROUP_CALL_RING_LIST_HIDE_MS;

    const visible = ringListExpired
      ? participants.filter((p) => {
          if (p.id === selfId) return true;
          return (p.dmCallPresence ?? 'live') !== 'ringing';
        })
      : participants;

    function rank(p: (typeof participants)[number]) {
      if (p.streaming) return 4;
      if (p.video) return 3;
      if (p.deafened) return 0;
      if (p.muted) return 1;
      return 2;
    }

    return visible.sort((a, b) => {
      const pa = (a.dmCallPresence ?? 'live') as DmCallPresence;
      const pb = (b.dmCallPresence ?? 'live') as DmCallPresence;
      const pr = presenceRank(pa) - presenceRank(pb);
      if (pr !== 0) return pr;
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return rb - ra;
      return a.name.localeCompare(b.name);
    });
  });

  let dmCallRingGiveUpTimer: ReturnType<typeof setTimeout> | null = null;
  let dmCallRingVanishDoneTimer: ReturnType<typeof setTimeout> | null = null;

  function clearDmCallRingGiveUpTimers() {
    if (dmCallRingGiveUpTimer != null) {
      clearTimeout(dmCallRingGiveUpTimer);
      dmCallRingGiveUpTimer = null;
    }
    if (dmCallRingVanishDoneTimer != null) {
      clearTimeout(dmCallRingVanishDoneTimer);
      dmCallRingVanishDoneTimer = null;
    }
    dmCallRingRemoteVanishing.value = false;
  }

  watch(
    () => dmCallRinging.value,
    (ring) => {
      clearDmCallRingGiveUpTimers();
      if (!ring) return;
      dmCallRingGiveUpTimer = setTimeout(() => {
        dmCallRingGiveUpTimer = null;
        if (!dmCallRinging.value) return;
        dmCallRingRemoteVanishing.value = true;
        dmCallRingVanishDoneTimer = setTimeout(() => {
          dmCallRingVanishDoneTimer = null;
          void endDmCall();
        }, 480);
      }, 3 * 60_000);
    },
  );

  watch(
    () =>
      [
        dmCallWithUserId.value,
        callOverlay.value.type,
        dmVoiceJoinTargetId.value,
        voiceBinding.value?.currentVoiceChannelId.value ?? '',
        dmCallSignal.value?.direction ?? '',
        dmCallSignal.value?.status ?? '',
        dmCallLobbyAfterSelfLeave.value,
      ] as const,
    async ([
      dm,
      overlay,
      joinId,
      _voiceChannelId,
      direction,
      signalStatus,
      lobbyAfterLeave,
    ]) => {
      const b = voiceBinding.value;
      if (!b) return;
      if (!dm || overlay !== 'dmCall') return;
      if (lobbyAfterLeave) return;
      const cid = (joinId ?? '').trim();
      if (!cid || !isEchoGraphId(cid)) return;
      if (direction === 'incoming' && signalStatus !== 'accepted') return;
      if (
        dmCallSignal.value?.direction === 'outgoing' &&
        dmCallSignal.value.channelId !== cid
      ) {
        dmCallSignal.value = {
          ...dmCallSignal.value,
          channelId: cid,
        };
      }
      if (
        direction === 'outgoing' &&
        dmCallInviteSentChannelId.value !== cid &&
        signalStatus === 'ringing'
      ) {
        if (authSession.backendUser?.isGuest) {
          guestCannotUseDmCallsToast('start');
          void endDmCall({ emitSignal: false });
          return;
        }
        dmCallInviteSentChannelId.value = cid;
        const submitters = dmCallSocketSubmitters.value;
        if (submitters) {
          const inviteResult = await submitters.submitDmCallInvite(cid);
          if (!inviteResult.ok) {
            dmCallInviteSentChannelId.value = '';
            propagateActionFailure(inviteResult, {
              flow: 'dm_call_invite',
              context: 'dm_call_invite',
              extraContext: { channelId: cid },
            });
          } else {
            appendLocalOutgoingCallStartedLog(cid, dm);
          }
        }
      }
      if (
        dmLiveKitJoinChannelId.value === cid &&
        b.liveKitState.value === 'connected'
      ) {
        return;
      }
      if (dmLiveKitJoinInFlightChannelId.value === cid) return;
      dmLiveKitJoinInFlightChannelId.value = cid;
      dmLiveKitJoinChannelId.value = cid;
      await releaseGuildVoiceHeldBeforeDmExclusive();
      try {
        await dmLiveKitVoiceService().onJoinDmVoice(cid);
        b.syncLiveKitAudioFromUiStores();
        if (b.liveKitVoiceApi) {
          void b.liveKitVoiceApi.setCameraEnabled(dmCallVideo.value);
        }
      } catch {
        dmLiveKitJoinChannelId.value = null;
        void endDmCall();
      } finally {
        if (dmLiveKitJoinInFlightChannelId.value === cid) {
          dmLiveKitJoinInFlightChannelId.value = null;
        }
      }
    },
    { flush: 'post' },
  );

  watch(
    () =>
      [
        voiceBinding.value?.liveKitState.value ?? 'idle',
        dmCallMuted.value,
        dmCallDeafened.value,
        micTestListenDeafenActive.value,
        callOverlay.value.type,
      ] as const,
    ([state, muted, deafened, micTestDeafen, overlay]) => {
      const b = voiceBinding.value;
      if (!b?.liveKitVoiceApi) return;
      if (overlay !== 'dmCall' || state !== 'connected') return;
      void b.liveKitVoiceApi.applyVcAudioState({
        muted,
        deafened: deafened || micTestDeafen,
      });
    },
    { flush: 'post' },
  );

  watch(
    () =>
      [
        voiceBinding.value?.liveKitState.value ?? 'idle',
        dmCallVideo.value,
        callOverlay.value.type,
      ] as const,
    ([state, video, overlay]) => {
      const b = voiceBinding.value;
      if (!b?.liveKitVoiceApi) return;
      if (overlay !== 'dmCall' || state !== 'connected') return;
      void b.liveKitVoiceApi.setCameraEnabled(video);
    },
    { flush: 'post' },
  );

  onUnmounted(() => {
    stopCallRingtone();
  });

  return {
    dmCallWithUserId,
    dmCallFullscreen,
    dmCallMuted,
    dmCallDeafened,
    dmCallVideo,
    dmCallScreenshare,
    dmCallMutedBeforeDeafen,
    dmLiveKitJoinChannelId,
    dmCallSignal,
    dmCallInviteSentChannelId,
    applyDmCallDeafened,
    toggleDmCallMuted,
    dmPartnerUser,
    activeGroupId,
    activeGroupDM,
    activeGroupMembersForUi,
    activeGroupCallMembersVisible,
    dmPartnerUserIdForGroupDm,
    dmVoiceJoinTargetId,
    dmCallMatchesActiveChannel,
    dmCallGlassPeer,
    callOverlay,
    isDmVoiceCallUi,
    startDmCall,
    startDmCallWithUserId,
    startGroupCall,
    startGroupCallWithId,
    handleEchoDmCall,
    endDmCall,
    answerDmCall,
    declineDmCall,
    dmCallQuarterView,
    dmCallCallViewParticipants,
    dmCallRinging,
    dmCallAwaitingAccept,
    dmCallRingUi,
    dmCallLobbyAfterSelfLeave,
    dmCallIncoming,
    dmCallRingRemoteVanishing,
    activeDmThreadCallUi,
    leaveDmCallVoice,
    rejoinDmCallVoice,
    bindVoiceSession,
    setDmCallSocketSubmitters,
  };
}

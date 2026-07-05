/**
 * Cross-domain glue: DM calls ↔ guild LiveKit voice ↔ workspace hydrate slot ↔ socket submitters.
 * Does not remove ordering constraints; centralizes mutation points and late-bound registration.
 */
import { computed, shallowRef, type ComputedRef, type Ref } from 'vue';
import type {
  AppLayoutVoiceShellDepsSlice,
  AuthSessionStore,
} from '@/features/layout/composables/appLayoutVoiceNavDeps';
import type { WorkspaceStateApi } from '@/composables/workspace/types';
import type { MainSurface } from '@/features/layout/mainSurface';
import type { EchoDmRealtimeThread } from '@shared/types';
import {
  useAppLayoutDmCalls,
  type DmCallSocketSubmitters,
} from './useAppLayoutDmCalls';
import { useAppLayoutShellVoice } from './useAppLayoutShellVoice';
// `voiceE2eePrepare` pulls in the libsignal crypto stack (~780 KB raw); it is
// dynamically imported at the call site below so that stack stays off the
// first-paint AppLayout chunk and only loads when an encrypted DM call starts.

export type UseAppLayoutCallVoiceBridgeDeps = {
  workspace: WorkspaceStateApi;
  authSession: AuthSessionStore;
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
  /** After answering an incoming DM/group call, open that thread in the DM UI. */
  navigateToDmForAnswer: (targetId: string) => void;
  isCompactShell: Ref<boolean>;
  hasGuildChannelChrome: ComputedRef<boolean>;
} & AppLayoutVoiceShellDepsSlice;

export function useAppLayoutCallVoiceBridge(
  deps: UseAppLayoutCallVoiceBridgeDeps,
) {
  const hydrateSlot = shallowRef<() => Promise<void>>(async () => {});

  function hydrateEchoFromBridge(): Promise<void> {
    return hydrateSlot.value();
  }

  /** Late-bound after `useAppLayoutShellVoice` — leaves guild VC UI + REST so DM calls never overlap server voice. */
  const releaseGuildVoiceIfHeldForDmCallRef = shallowRef<(() => void) | null>(
    null,
  );

  const dmCalls = useAppLayoutDmCalls({
    workspace: deps.workspace,
    authSession: deps.authSession,
    mainSurface: deps.mainSurface,
    activeChannelId: deps.activeChannelId,
    selectedDMUserId: deps.selectedDMUserId,
    groupDMs: deps.groupDMs,
    echoDmPeerByChannelId: deps.echoDmPeerByChannelId,
    echoDmActiveCallParticipantUserIdsByChannelId:
      deps.echoDmActiveCallParticipantUserIdsByChannelId,
    mergeRealtimeDmThread: deps.mergeRealtimeDmThread,
    hydrateEchoFromApi: hydrateEchoFromBridge,
    navigateToDmForAnswer: deps.navigateToDmForAnswer,
    micTestListenDeafenActive: deps.micTestListenDeafenActive,
    releaseGuildVoiceIfHeldForDmCall: () =>
      releaseGuildVoiceIfHeldForDmCallRef.value?.(),
    getDmVoiceE2eeMediaKey: async (channelId) => {
      const token = deps.authSession.accessToken?.trim() ?? '';
      const uid = deps.authSession.backendUser?.id?.trim() ?? '';
      if (!token || !uid) return { mediaKey: null, senderDeviceId: '' };
      const g = deps.groupDMs.value[channelId];
      const peer = deps.echoDmPeerByChannelId.value.get(channelId);
      const activeCall =
        deps.echoDmActiveCallParticipantUserIdsByChannelId.value.get(
          channelId,
        ) ?? [];
      const members: string[] = [
        uid,
        ...(g?.memberIds?.length ? g.memberIds : []),
        ...(peer && peer !== uid ? [peer] : []),
        ...activeCall,
      ];
      const { prepareDmVoiceE2eeMediaKey } =
        await import('@/services/voice/voiceE2eePrepare');
      return prepareDmVoiceE2eeMediaKey({
        channelId,
        token,
        viewerUserId: uid,
        memberUserIds: members,
      });
    },
  });

  const { bindVoiceSession, setDmCallSocketSubmitters, ...dmRest } = dmCalls;

  const isCompactGuildTriPane = computed(
    () => deps.isCompactShell.value && deps.hasGuildChannelChrome.value,
  );

  const shellVoice = useAppLayoutShellVoice({
    authSession: deps.authSession,
    workspace: deps.workspace,
    selectedServerEcho: deps.selectedServerEcho,
    voiceChannelForParticipants: deps.voiceChannelForParticipants,
    currentVoiceChannelId: deps.currentVoiceChannelId,
    currentVoiceChannelName: deps.currentVoiceChannelName,
    vcMuted: deps.vcMuted,
    vcDeafened: deps.vcDeafened,
    micTestListenDeafenActive: deps.micTestListenDeafenActive,
    setMicTestListenDeafen: deps.setMicTestListenDeafen,
    applyVcDeafened: deps.applyVcDeafened,
    vcVideo: deps.vcVideo,
    vcScreenshare: deps.vcScreenshare,
    isScreenSharePickerOpen: deps.isScreenSharePickerOpen,
    isDesktopStreamingControlOpen: deps.isDesktopStreamingControlOpen,
    desktopStreamingControlMode: deps.desktopStreamingControlMode,
    onJoinVoice: deps.onJoinVoice,
    onLeaveVoice: deps.onLeaveVoice,
    hydrateEchoFromApi: hydrateEchoFromBridge,
    isDmVoiceCallUi: dmCalls.isDmVoiceCallUi,
    dmCallIncoming: dmCalls.dmCallIncoming,
    dmCallRinging: dmCalls.dmCallRinging,
    dmCallLobbyAfterSelfLeave: dmCalls.dmCallLobbyAfterSelfLeave,
    leaveDmCallVoice: dmCalls.leaveDmCallVoice,
    dmCallMuted: dmCalls.dmCallMuted,
    dmCallDeafened: dmCalls.dmCallDeafened,
    dmCallVideo: dmCalls.dmCallVideo,
    dmCallScreenshare: dmCalls.dmCallScreenshare,
    dmCallWithUserId: dmCalls.dmCallWithUserId,
    dmVoiceJoinTargetId: dmCalls.dmVoiceJoinTargetId,
    groupDMs: deps.groupDMs,
    applyDmCallDeafened: dmCalls.applyDmCallDeafened,
    endDmCall: dmCalls.endDmCall,
    isDmUiContext: deps.isDmUiContext,
    activeChannelId: deps.activeChannelId,
    voiceSideChatCollapsed: deps.voiceSideChatCollapsed,
    toggleVoiceSideChat: deps.toggleVoiceSideChat,
    categoriesForServer: deps.categoriesForServer,
    getFirstTextChannelId: deps.getFirstTextChannelId,
    findChannelContextById: deps.findChannelContextById,
    roleUi: deps.roleUi,
    resolvePreviewChannelPermission: deps.resolvePreviewChannelPermission,
    isCompactGuildTriPane,
    vcActivityUi: deps.vcActivityUi,
    applyVcYoutubeWatchTogetherRemote: deps.applyVcYoutubeWatchTogetherRemote,
    applyVcWatchTogetherRemote: deps.applyVcWatchTogetherRemote,
    closeVcActivity: deps.closeVcActivity,
  });

  bindVoiceSession(shellVoice.buildVoiceBindingForDmCalls());

  releaseGuildVoiceIfHeldForDmCallRef.value = () => {
    if (!deps.currentVoiceChannelId.value?.trim()) return;
    shellVoice.handleLeaveVoiceNavigation();
  };

  function assignHydrateEchoFromApi(fn: () => Promise<void>): void {
    hydrateSlot.value = fn;
  }

  function wireDmCallSocketSubmitters(
    next: DmCallSocketSubmitters | null,
  ): void {
    setDmCallSocketSubmitters(next);
  }

  return {
    ...dmRest,
    ...shellVoice,
    assignHydrateEchoFromApi,
    wireDmCallSocketSubmitters,
  };
}

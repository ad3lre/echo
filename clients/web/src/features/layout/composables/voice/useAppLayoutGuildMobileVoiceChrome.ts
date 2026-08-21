import {
  computed,
  nextTick,
  ref,
  unref,
  type ComputedRef,
  type Ref,
} from 'vue';
import {
  applyVcActivityUiPhase,
  waitForLiveKitConnected,
} from '@/features/voice/vcActivityJoin';
import type { VcActivityUiPhase } from '@/features/voice/vcActivityTypes';
import { shouldShowGuildMobileVoiceDock } from '@/features/layout/guildMobileVoiceDockVisibility';
import type { MobileBottomTabId } from '@/features/layout/mobileBottomTab';
import type { UserSettingsSection } from '@/features/layout/urlNavigationSettingsIds';

type GuildMobileVcLobby = {
  channelId: string;
  channelName: string;
} | null;

type VoiceChannelLike = {
  id: string;
  type?: string;
  voiceParticipantIds?: string[];
  voiceStageSpeakerByUserId?: Record<string, boolean>;
};

type WorkspaceUserLike = {
  id: string;
  name?: string;
  pfp?: string;
};

export type AppLayoutGuildMobileVoiceChromeDeps = {
  isCompactShell: Ref<boolean> | ComputedRef<boolean>;
  hasGuildChannelChrome: ComputedRef<boolean> | Ref<boolean>;
  isDmUiContext: Ref<boolean> | ComputedRef<boolean>;
  useCompactPhoneTabShell: Ref<boolean> | ComputedRef<boolean>;
  isViewingVoiceChannel: Ref<boolean> | ComputedRef<boolean>;
  isDMPanelOpen: Ref<boolean>;
  currentVoiceChannelId:
    | Ref<string | null | undefined>
    | ComputedRef<string | null | undefined>;
  liveKitState: Ref<string> | ComputedRef<string>;
  guildMobileVcLobby: Ref<GuildMobileVcLobby>;
  categoriesForServer:
    | Ref<{ channels?: VoiceChannelLike[] }[]>
    | ComputedRef<{ channels?: VoiceChannelLike[] }[]>;
  workspaceUsers: Ref<WorkspaceUserLike[]> | ComputedRef<WorkspaceUserLike[]>;
  voiceSideChatCollapsed: Ref<boolean> | ComputedRef<boolean>;
  isSettingsModalOpen: Ref<boolean> | ComputedRef<boolean>;
  isServerSettingsModalOpen: Ref<boolean> | ComputedRef<boolean>;
  forwardModalOpen: Ref<boolean> | ComputedRef<boolean>;
  vcActivityPhase: ComputedRef<VcActivityUiPhase> | Ref<VcActivityUiPhase>;
  mobileChannelSheetOpen: Ref<boolean>;
  mobileMembersOverlayOpen: Ref<boolean>;
  isMemberPopoutOpen: Ref<boolean> | ComputedRef<boolean>;
  isSelfProfilePopoutOpen: Ref<boolean> | ComputedRef<boolean>;
  voiceMobileSheetLevel: Ref<number>;
  compactPagerPane: Ref<number>;
  mobileBottomTab: Ref<MobileBottomTabId>;
  mobileServersStack: Ref<'list' | 'guild'>;
  isRolePreviewActiveForServer: Ref<boolean> | ComputedRef<boolean>;
  previewHasUiPermission: (perm: string) => boolean;
  effectiveActiveChannel:
    | Ref<VoiceChannelLike | null | undefined>
    | ComputedRef<VoiceChannelLike | null | undefined>;
  currentUserId: () => string | undefined;
  openServerSurface: (serverId: string, channelId: string) => void;
  openGuildMobileVcLobby: (lobby: {
    channelId: string;
    channelName: string;
  }) => void;
  closeGuildMobileVcLobby: () => void;
  handleJoinVoiceIfAllowed: (args: {
    channelId: string;
    channelName: string;
  }) => Promise<void> | void;
  handleActiveChannelChange: (channelId: string) => void;
  expandVoiceSideChat: () => void;
  openUserSettingsModal: (section?: UserSettingsSection) => void;
  vcActivityPhaseOpeners: Parameters<typeof applyVcActivityUiPhase>[1];
};

function createPendingVcActivityFollow(
  deps: AppLayoutGuildMobileVoiceChromeDeps,
) {
  const pendingVcActivityPhaseAfterJoin = ref<VcActivityUiPhase | null>(null);

  async function followPendingVcActivityAfterJoin(
    channelId: string,
  ): Promise<void> {
    const phase = pendingVcActivityPhaseAfterJoin.value;
    pendingVcActivityPhaseAfterJoin.value = null;
    if (!phase || phase === 'closed' || phase === 'pick') return;
    const targetId = channelId.trim();
    if (unref(deps.currentVoiceChannelId)?.trim() !== targetId) return;
    if (unref(deps.liveKitState) !== 'connected') {
      await waitForLiveKitConnected(deps.liveKitState as Ref<string>);
    }
    applyVcActivityUiPhase(phase, deps.vcActivityPhaseOpeners);
  }

  function handleDmPanelJoinGuildVoiceActivity(payload: {
    serverId: string;
    channelId: string;
    channelName: string;
    activityPhase?: VcActivityUiPhase | null;
  }) {
    const phase = payload.activityPhase ?? null;
    pendingVcActivityPhaseAfterJoin.value =
      phase && phase !== 'closed' && phase !== 'pick' ? phase : null;
    deps.isDMPanelOpen.value = false;
    deps.openServerSurface(payload.serverId, payload.channelId);
    void nextTick(async () => {
      if (unref(deps.isCompactShell) && unref(deps.hasGuildChannelChrome)) {
        deps.openGuildMobileVcLobby({
          channelId: payload.channelId,
          channelName: payload.channelName,
        });
        return;
      }
      await deps.handleJoinVoiceIfAllowed({
        channelId: payload.channelId,
        channelName: payload.channelName,
      });
      await followPendingVcActivityAfterJoin(payload.channelId);
    });
  }

  return {
    pendingVcActivityPhaseAfterJoin,
    followPendingVcActivityAfterJoin,
    handleDmPanelJoinGuildVoiceActivity,
  };
}

function createGuildMobileLobbyChrome(
  deps: AppLayoutGuildMobileVoiceChromeDeps,
  followPendingVcActivityAfterJoin: (channelId: string) => Promise<void>,
) {
  const guildMobileVcLobbyParticipants = computed(() => {
    const lobby = deps.guildMobileVcLobby.value;
    if (!lobby) return [] as { id: string; name: string; pfp: string }[];
    const uid = lobby.channelId.trim();
    for (const cat of unref(deps.categoriesForServer)) {
      for (const ch of cat.channels ?? []) {
        if (ch.id !== uid || ch.type !== 'voice') continue;
        const ids = ch.voiceParticipantIds ?? [];
        return ids.map((id: string) => {
          const u = unref(deps.workspaceUsers).find((x) => x.id === id);
          return {
            id,
            name: u?.name?.trim() || 'Member',
            pfp: u?.pfp ?? '',
          };
        });
      }
    }
    return [];
  });

  function handleGuildMobileVcLobbyJoin() {
    const lobby = deps.guildMobileVcLobby.value;
    if (!lobby) return;
    deps.closeGuildMobileVcLobby();
    void (async () => {
      await deps.handleJoinVoiceIfAllowed({
        channelId: lobby.channelId,
        channelName: lobby.channelName,
      });
      await followPendingVcActivityAfterJoin(lobby.channelId);
    })();
  }

  function handleGuildMobileVcLobbyChat() {
    const lobby = deps.guildMobileVcLobby.value;
    if (!lobby) return;
    deps.handleActiveChannelChange(lobby.channelId);
    deps.expandVoiceSideChat();
    if (unref(deps.isCompactShell) && unref(deps.hasGuildChannelChrome)) {
      deps.voiceMobileSheetLevel.value = 2;
    }
    deps.closeGuildMobileVcLobby();
    if (unref(deps.isCompactShell) && unref(deps.hasGuildChannelChrome)) {
      if (unref(deps.useCompactPhoneTabShell)) {
        deps.mobileBottomTab.value = 'servers';
        deps.mobileServersStack.value = 'guild';
      } else {
        deps.compactPagerPane.value = 1;
      }
    }
  }

  function handleGuildMobileVcLobbyOpenAudioSettings() {
    deps.closeGuildMobileVcLobby();
    deps.openUserSettingsModal('Voice & Video');
  }

  return {
    guildMobileVcLobbyParticipants,
    handleGuildMobileVcLobbyJoin,
    handleGuildMobileVcLobbyChat,
    handleGuildMobileVcLobbyOpenAudioSettings,
  };
}

function createGuildMobileDockChrome(
  deps: AppLayoutGuildMobileVoiceChromeDeps,
) {
  const guildMobileVoiceConnected = computed(
    () =>
      !!(
        unref(deps.isCompactShell) &&
        !unref(deps.isDmUiContext) &&
        unref(deps.currentVoiceChannelId)?.trim()
      ),
  );

  const showGuildMobileVoiceDock = computed(() =>
    shouldShowGuildMobileVoiceDock({
      connected: guildMobileVoiceConnected.value,
      voiceSideChatCollapsed: unref(deps.voiceSideChatCollapsed),
      isSettingsModalOpen: unref(deps.isSettingsModalOpen),
      isServerSettingsModalOpen: unref(deps.isServerSettingsModalOpen),
      guildMobileVcLobbyOpen: !!deps.guildMobileVcLobby.value,
      forwardModalOpen: unref(deps.forwardModalOpen),
      vcActivityPhase: unref(deps.vcActivityPhase),
      mobileChannelSheetOpen: deps.mobileChannelSheetOpen.value,
      mobileMembersOverlayOpen: deps.mobileMembersOverlayOpen.value,
      memberPopoutOpen:
        unref(deps.isMemberPopoutOpen) || unref(deps.isSelfProfilePopoutOpen),
    }),
  );

  const hideChannelPanelVoiceChromeEffective = computed(() =>
    Boolean(guildMobileVoiceConnected.value),
  );

  const voiceMobileDockReservePxComputed = computed(() => {
    if (!showGuildMobileVoiceDock.value) return 0;
    if (unref(deps.isViewingVoiceChannel)) return 72;
    return 0;
  });

  const mainContentVcDockBottomPadClass = computed(() => {
    if (!showGuildMobileVoiceDock.value) return '';
    if (unref(deps.isViewingVoiceChannel)) return '';
    if (unref(deps.useCompactPhoneTabShell)) {
      return 'main-content-area--phone-voice-dock-reserve';
    }
    return 'pb-[7.5rem]';
  });

  const guildMobileVoiceDockCanUseVideo = computed(() => {
    if (
      unref(deps.isRolePreviewActiveForServer) &&
      !deps.previewHasUiPermission('video')
    ) {
      return false;
    }
    const ch = unref(deps.effectiveActiveChannel);
    const uid = deps.currentUserId();
    if (ch?.type === 'stage' && uid) {
      return !!ch.voiceStageSpeakerByUserId?.[uid];
    }
    return true;
  });

  return {
    guildMobileVoiceConnected,
    showGuildMobileVoiceDock,
    hideChannelPanelVoiceChromeEffective,
    voiceMobileDockReservePxComputed,
    mainContentVcDockBottomPadClass,
    guildMobileVoiceDockCanUseVideo,
  };
}

/**
 * Guild mobile VC lobby join flow, dock visibility, and side-chat chrome.
 */
export function useAppLayoutGuildMobileVoiceChrome(
  deps: AppLayoutGuildMobileVoiceChromeDeps,
) {
  const pending = createPendingVcActivityFollow(deps);
  const lobby = createGuildMobileLobbyChrome(
    deps,
    pending.followPendingVcActivityAfterJoin,
  );
  const dock = createGuildMobileDockChrome(deps);
  return {
    ...pending,
    ...lobby,
    ...dock,
  };
}

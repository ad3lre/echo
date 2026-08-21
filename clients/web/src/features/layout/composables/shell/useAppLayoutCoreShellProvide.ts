/**
 * Remaining AppLayout inject keys that are not info-banners or guild-modals:
 * nav bridge, voice processing, speaking, chat permissions, server-rail
 * actions, main-surface stack, and the Discord profile-import prompt.
 */

import {
  computed,
  nextTick,
  onMounted,
  provide,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue';
import type { AuthUserPublic } from '@/api/authClient';
import type { MeDiscordResponse } from '@/api/meClient';
import {
  createChatPermissions,
  provideChatPermissions,
  type CreateChatPermissionsDeps,
} from '@/features/chat/useChatPermissions';
import {
  provideSpeakingState,
  type SpeakingStateContext,
} from '@/features/layout/composables/voice/useSpeakingState';
import {
  ECHO_VOICE_PROCESSING_KEY,
  type EchoVoiceProcessingApi,
} from '@/features/voice/voiceProcessingInjection';
import {
  CHAT_MESSAGE_NAV_BRIDGE_KEY,
  type ChatMessageNavBridge,
} from '@/features/navigation/chatMessageNavBridge';
import {
  LAYOUT_MAIN_SURFACE_KEY,
  LAYOUT_SERVER_RAIL_ACTIONS_KEY,
  type LayoutMainSurfaceContext,
  type LayoutServerRailActions,
} from '@/features/layout/layoutInjectionKeys';
import {
  hasImportedDiscordProfileFields,
  isDiscordProfileImportPromptDone,
  shouldOfferDiscordProfileImport,
} from '@/features/discord/profileImportFlow';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { resolveDiscordProfileImportPromptOpen } from '@/features/layout/composables/controller/appLayoutProvidePredicates';

type RV<T> = Ref<T> | ComputedRef<T>;

export type AppLayoutCoreShellProvideDeps = {
  chatMessageNavBridge: ChatMessageNavBridge;
  echoChannelHistory: unknown;
  joinEchoServerWithInvite: unknown;
  reapplyVoiceProcessing: EchoVoiceProcessingApi['reapplyVoiceProcessing'];
  setVcVideoQuality: EchoVoiceProcessingApi['setVcVideoQuality'];
  setMicTestListenDeafen: EchoVoiceProcessingApi['setMicTestListenDeafen'];
  speakingMap: SpeakingStateContext['speakingMap'];
  localSpeaking: SpeakingStateContext['localSpeaking'];
  localAudioLevel: SpeakingStateContext['localAudioLevel'];
  currentUser: RV<{ id?: string } | null | undefined>;
  activeChannelId: CreateChatPermissionsDeps['activeChannelId'];
  effectiveActiveChannel: CreateChatPermissionsDeps['activeChannel'];
  rawCategoriesForServer: CreateChatPermissionsDeps['rawCategories'];
  rolePreview: CreateChatPermissionsDeps['rolePreview'];
  selectedServerId: CreateChatPermissionsDeps['selectedServerId'];
  isRolePreviewActiveForServer: CreateChatPermissionsDeps['isRolePreviewActiveForServer'];
  isInDMMode: CreateChatPermissionsDeps['isInDMMode'];
  isGroupDM: CreateChatPermissionsDeps['isGroupDM'];
  liveChannelCapabilities: CreateChatPermissionsDeps['liveChannelCapabilities'];
  railActions: LayoutServerRailActions;
  authSession: {
    isAuthenticated: boolean;
    backendUser?: AuthUserPublic | null;
  };
  linkedDiscordUserId: RV<string | null | undefined>;
  linkedDiscordState: RV<MeDiscordResponse | null>;
  layoutMainSurface: Omit<LayoutMainSurfaceContext, 'onJoinServerFromShell'>;
};

function provideLayoutChatPermissions(
  deps: AppLayoutCoreShellProvideDeps,
): void {
  provideChatPermissions(
    createChatPermissions({
      activeChannelId: deps.activeChannelId,
      activeChannel: deps.effectiveActiveChannel,
      rawCategories: deps.rawCategoriesForServer,
      rolePreview: deps.rolePreview,
      selectedServerId: deps.selectedServerId,
      isRolePreviewActiveForServer: deps.isRolePreviewActiveForServer,
      isInDMMode: deps.isInDMMode,
      isGroupDM: deps.isGroupDM,
      liveChannelCapabilities: deps.liveChannelCapabilities,
    }),
  );
}

function provideVoiceAndChat(deps: AppLayoutCoreShellProvideDeps): void {
  provide(ECHO_VOICE_PROCESSING_KEY, {
    reapplyVoiceProcessing: deps.reapplyVoiceProcessing,
    setVcVideoQuality: deps.setVcVideoQuality,
    setMicTestListenDeafen: deps.setMicTestListenDeafen,
  });
  provideSpeakingState({
    speakingMap: deps.speakingMap,
    localSpeaking: deps.localSpeaking,
    localAudioLevel: deps.localAudioLevel,
    localUserId: computed(() => deps.currentUser.value?.id ?? null),
  });
  provideLayoutChatPermissions(deps);
}

function provideCoreInjections(deps: AppLayoutCoreShellProvideDeps): void {
  provide(CHAT_MESSAGE_NAV_BRIDGE_KEY, deps.chatMessageNavBridge);
  provide('echoChannelHistory', deps.echoChannelHistory);
  provide('joinEchoServerWithInvite', deps.joinEchoServerWithInvite);
  provideVoiceAndChat(deps);
  provide(LAYOUT_SERVER_RAIL_ACTIONS_KEY, deps.railActions);
}

function watchDiscordProfileImportPrompt(
  deps: AppLayoutCoreShellProvideDeps,
  showPrompt: Ref<boolean>,
): void {
  watch(
    () => ({
      authed: deps.authSession.isAuthenticated,
      guest: deps.authSession.backendUser?.isGuest,
      user: deps.authSession.backendUser ?? null,
      discord: deps.linkedDiscordUserId.value,
      discordState: deps.linkedDiscordState.value,
    }),
    (s) => {
      showPrompt.value = resolveDiscordProfileImportPromptOpen({
        authed: s.authed,
        guest: s.guest,
        mockDataMode: echoSyncCapabilities.isMockDataMode,
        promptDone: isDiscordProfileImportPromptDone(),
        hasDiscordLink: !!s.discord,
        alreadyImported: hasImportedDiscordProfileFields(
          s.user,
          s.discordState,
        ),
        shouldOffer: shouldOfferDiscordProfileImport(s.user),
      });
    },
    { immediate: true },
  );
}

function provideMainSurface(deps: AppLayoutCoreShellProvideDeps): void {
  provide(LAYOUT_MAIN_SURFACE_KEY, {
    ...deps.layoutMainSurface,
    onJoinServerFromShell: (inviteLink?: string) => {
      deps.layoutMainSurface.openAddServerModal('join', inviteLink);
    },
  });
}

function clearLegacyDiscordGuestSignupFlag(): void {
  try {
    if (sessionStorage.getItem('echo_discord_guest_signup') === '1') {
      sessionStorage.removeItem('echo_discord_guest_signup');
    }
  } catch {
    /* ignore */
  }
}

/**
 * Core shell inject keys + Discord import prompt. Call from AppLayout setup.
 */
export function useAppLayoutCoreShellProvide(
  deps: AppLayoutCoreShellProvideDeps,
) {
  const showDiscordProfileImportPrompt = ref(false);
  provideCoreInjections(deps);
  watchDiscordProfileImportPrompt(deps, showDiscordProfileImportPrompt);
  provideMainSurface(deps);
  onMounted(() => {
    void nextTick(() => clearLegacyDiscordGuestSignupFlag());
  });
  return { showDiscordProfileImportPrompt };
}

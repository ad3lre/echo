import type { AppLayoutControllerContext } from './appLayoutControllerTypes';
import {
  useAppLayoutContextProfileSlice,
  buildAppLayoutProfileSliceDeps,
} from '../profiles/useAppLayoutContextProfileSlice';
import {
  useAppLayoutContextVoiceSlice,
  buildAppLayoutVoiceSliceDeps,
} from '../voice/useAppLayoutContextVoiceSlice';
import {
  useAppLayoutContextMessagingSlice,
  buildAppLayoutMessagingSliceDeps,
} from '../messaging/useAppLayoutContextMessagingSlice';
import {
  useAppLayoutContextServerRailSlice,
  buildAppLayoutServerRailSliceDeps,
} from '../rail/useAppLayoutContextServerRailSlice';
import {
  useAppLayoutContextShellLayoutSlice,
  buildAppLayoutShellLayoutSliceDeps,
} from '../shell/useAppLayoutContextShellLayoutSlice';
import {
  useAppLayoutContextDmSlice,
  buildAppLayoutDmSliceDeps,
} from '../dm/useAppLayoutContextDmSlice';
import {
  useAppLayoutContextModerationSlice,
  buildAppLayoutModerationSliceDeps,
} from '../moderation/useAppLayoutContextModerationSlice';
import {
  useAppLayoutContextShellChromeSlice,
  buildAppLayoutShellChromeSliceDeps,
} from '../shell/useAppLayoutContextShellChromeSlice';
import { buildAppLayoutControllerContext } from './buildAppLayoutControllerContext';
import {
  buildAppLayoutContextCore,
  type BuildAppLayoutContextCoreDeps,
} from './buildAppLayoutContextCore';
import { useAppLayoutVoiceScreenShareHandlers } from '../voice/useAppLayoutVoiceScreenShareHandlers';
import { useAppLayoutServerChromeCallbacks } from '../shell/useAppLayoutServerChromeCallbacks';
import { useAppLayoutDmGroupFriendsComputed } from '../dm/useAppLayoutDmGroupFriendsComputed';
import { usePreviewCanModerateMembersComputed } from '../moderation/usePreviewCanModerateMembersComputed';
import type { BuildAppLayoutProfileSliceDeps } from '../profiles/useAppLayoutContextProfileSlice';
import type { BuildAppLayoutVoiceSliceDeps } from '../voice/useAppLayoutContextVoiceSlice';
import type { BuildAppLayoutMessagingSliceDeps } from '../messaging/useAppLayoutContextMessagingSlice';
import type { BuildAppLayoutServerRailSliceDeps } from '../rail/useAppLayoutContextServerRailSlice';
import type { BuildAppLayoutShellLayoutSliceDeps } from '../shell/useAppLayoutContextShellLayoutSlice';
import type { BuildAppLayoutDmSliceDeps } from '../dm/useAppLayoutContextDmSlice';
import type { BuildAppLayoutModerationSliceDeps } from '../moderation/useAppLayoutContextModerationSlice';
import type { BuildAppLayoutShellChromeSliceDeps } from '../shell/useAppLayoutContextShellChromeSlice';

type VoiceScreenShareHandlerFields =
  | 'updateVcVideoIfAllowed'
  | 'handleScreenSharePickerConfirm'
  | 'openDesktopStreamingControl'
  | 'closeDesktopStreamingControl'
  | 'handleDesktopStreamingControlConfirm'
  | 'handleToggleScreenshare'
  | 'handleStopScreenShare';

type ServerChromeCallbackFields =
  | 'openServerSettings'
  | 'openServerSettingsIfAllowed'
  | 'openInviteModal'
  | 'onServerSettingsModalUpdate'
  | 'onServerSettingsModalActiveSectionUpdate';

export type AssembleAppLayoutContextDeps = {
  profile: BuildAppLayoutProfileSliceDeps;
  voiceScreenShare: Parameters<typeof useAppLayoutVoiceScreenShareHandlers>[0];
  voice: Omit<BuildAppLayoutVoiceSliceDeps, VoiceScreenShareHandlerFields>;
  messaging: BuildAppLayoutMessagingSliceDeps;
  serverChromeCallbacks: Parameters<
    typeof useAppLayoutServerChromeCallbacks
  >[0];
  serverRail: Omit<
    BuildAppLayoutServerRailSliceDeps,
    ServerChromeCallbackFields
  >;
  shellLayout: BuildAppLayoutShellLayoutSliceDeps;
  dmGroupFriendsInput: Parameters<typeof useAppLayoutDmGroupFriendsComputed>[0];
  dm: Omit<BuildAppLayoutDmSliceDeps, 'dmGroupFriends'>;
  moderation: BuildAppLayoutModerationSliceDeps;
  shellChrome: BuildAppLayoutShellChromeSliceDeps;
  previewCanModerateMembers: Parameters<
    typeof usePreviewCanModerateMembersComputed
  >[0];
  core: Omit<BuildAppLayoutContextCoreDeps, 'previewCanModerateMembers'>;
};

export function assembleAppLayoutControllerContext(
  deps: AssembleAppLayoutContextDeps,
): AppLayoutControllerContext {
  const previewCanModerateMembersComputed =
    usePreviewCanModerateMembersComputed(deps.previewCanModerateMembers);

  const profileSlice = useAppLayoutContextProfileSlice(
    buildAppLayoutProfileSliceDeps(deps.profile),
  );

  const voiceScreenShareHandlers = useAppLayoutVoiceScreenShareHandlers(
    deps.voiceScreenShare,
  );

  const voiceSlice = useAppLayoutContextVoiceSlice(
    buildAppLayoutVoiceSliceDeps({
      ...deps.voice,
      updateVcVideoIfAllowed: voiceScreenShareHandlers.updateVcVideoIfAllowed,
      handleScreenSharePickerConfirm:
        voiceScreenShareHandlers.handleScreenSharePickerConfirm,
      openDesktopStreamingControl:
        voiceScreenShareHandlers.openDesktopStreamingControl,
      closeDesktopStreamingControl:
        voiceScreenShareHandlers.closeDesktopStreamingControl,
      handleDesktopStreamingControlConfirm:
        voiceScreenShareHandlers.handleDesktopStreamingControlConfirm,
      handleToggleScreenshare: voiceScreenShareHandlers.handleToggleScreenshare,
      handleStopScreenShare: voiceScreenShareHandlers.handleStopScreenShare,
    }),
  );

  const messagingSlice = useAppLayoutContextMessagingSlice(
    buildAppLayoutMessagingSliceDeps(deps.messaging),
  );

  const serverChromeCallbacks = useAppLayoutServerChromeCallbacks(
    deps.serverChromeCallbacks,
  );

  const serverRailSlice = useAppLayoutContextServerRailSlice(
    buildAppLayoutServerRailSliceDeps({
      ...deps.serverRail,
      ...serverChromeCallbacks,
    }),
  );

  const shellLayoutSlice = useAppLayoutContextShellLayoutSlice(
    buildAppLayoutShellLayoutSliceDeps(deps.shellLayout),
  );

  const dmGroupFriendsComputed = useAppLayoutDmGroupFriendsComputed(
    deps.dmGroupFriendsInput,
  );

  const dmSlice = useAppLayoutContextDmSlice(
    buildAppLayoutDmSliceDeps({
      ...deps.dm,
      dmGroupFriends: dmGroupFriendsComputed,
    }),
  );

  const moderationSlice = useAppLayoutContextModerationSlice(
    buildAppLayoutModerationSliceDeps(deps.moderation),
  );

  const shellChromeSlice = useAppLayoutContextShellChromeSlice(
    buildAppLayoutShellChromeSliceDeps(deps.shellChrome),
  );

  const context = buildAppLayoutControllerContext(
    {
      profile: profileSlice,
      voice: voiceSlice,
      messaging: messagingSlice,
      serverRail: serverRailSlice,
      shellLayout: shellLayoutSlice,
      dm: dmSlice,
      moderation: moderationSlice,
      shellChrome: shellChromeSlice,
    },
    buildAppLayoutContextCore({
      ...deps.core,
      previewCanModerateMembers: previewCanModerateMembersComputed,
    }),
  );

  return context;
}

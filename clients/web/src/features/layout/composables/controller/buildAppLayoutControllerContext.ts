import type { AppLayoutControllerContext } from './appLayoutControllerTypes';

type ProfileSlice = ReturnType<
  typeof import('../profiles/useAppLayoutContextProfileSlice').useAppLayoutContextProfileSlice
>;
type VoiceSlice = ReturnType<
  typeof import('../voice/useAppLayoutContextVoiceSlice').useAppLayoutContextVoiceSlice
>;
type MessagingSlice = ReturnType<
  typeof import('../messaging/useAppLayoutContextMessagingSlice').useAppLayoutContextMessagingSlice
>;
type ServerRailSlice = ReturnType<
  typeof import('../rail/useAppLayoutContextServerRailSlice').useAppLayoutContextServerRailSlice
>;
type ShellLayoutSlice = ReturnType<
  typeof import('../shell/useAppLayoutContextShellLayoutSlice').useAppLayoutContextShellLayoutSlice
>;
type DmSlice = ReturnType<
  typeof import('../dm/useAppLayoutContextDmSlice').useAppLayoutContextDmSlice
>;
type ModerationSlice = ReturnType<
  typeof import('../moderation/useAppLayoutContextModerationSlice').useAppLayoutContextModerationSlice
>;
type ShellChromeSlice = ReturnType<
  typeof import('../shell/useAppLayoutContextShellChromeSlice').useAppLayoutContextShellChromeSlice
>;

type SliceKey =
  | keyof ProfileSlice
  | keyof VoiceSlice
  | keyof MessagingSlice
  | keyof ServerRailSlice
  | keyof ShellLayoutSlice
  | keyof DmSlice
  | keyof ModerationSlice
  | keyof ShellChromeSlice;

export type AppLayoutControllerContextCore = Omit<
  AppLayoutControllerContext,
  SliceKey
>;

/** Merge regional slices + core fields into the flat layout context. */
export function buildAppLayoutControllerContext(
  slices: {
    profile: ProfileSlice;
    voice: VoiceSlice;
    messaging: MessagingSlice;
    serverRail: ServerRailSlice;
    shellLayout: ShellLayoutSlice;
    dm: DmSlice;
    moderation: ModerationSlice;
    shellChrome: ShellChromeSlice;
  },
  core: AppLayoutControllerContextCore,
): AppLayoutControllerContext {
  return {
    ...slices.profile,
    ...slices.voice,
    ...slices.messaging,
    ...slices.serverRail,
    ...slices.shellLayout,
    ...slices.dm,
    ...slices.moderation,
    ...slices.shellChrome,
    ...core,
  };
}

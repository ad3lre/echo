import type { InjectionKey } from 'vue';
import type { EchoSessionStore } from '@/features/layout/echoSession';
import type { WorkspaceStateApi } from '@/features/layout/echoWorkspace/types';
import type { EchoPageNotificationPreviewMode } from '@/platform/browserCompatibility';
import type { AudioOutputLimitedReason } from '@/platform/browserCompatibility';

export type EchoBrowserCompatibility = {
  readonly isIosLike: boolean;
  readonly isSafariLike: boolean;
  readonly isWebKitDesktop: boolean;
  readonly isStandaloneDisplayMode: boolean;
  readonly supportsAudioOutputSelection: boolean;
  readonly isAudioOutputDeviceSelectionAvailable: boolean;
  readonly audioOutputDeviceLimitedReason: AudioOutputLimitedReason | null;
  readonly supportsAudioContextOutputSelection: boolean;
  readonly supportsScreenShare: boolean;
  readonly prefersPromptingForScreenShareOptions: boolean;
  readonly prefersScreenShareAudioDisabledByDefault: boolean;
  readonly supportsPageNotifications: boolean;
  readonly pageNotificationPreviewMode: EchoPageNotificationPreviewMode;
};

/** Sync reads for Pinia / main.ts — no inject available. */
export type EchoSyncCapabilities = {
  readonly restoreSessionOnAppStart: boolean;
  /** Legacy — always false. */
  readonly isMockDataMode: boolean;
  readonly browser: EchoBrowserCompatibility;
};

/** Runtime platform (provided from `App.vue`). */
export type EchoPlatform = {
  readonly capabilities: EchoSyncCapabilities;
  readonly session: EchoSessionStore;
  /** Workspace state + actions — use `useEchoWorkspace()` to access typed. */
  readonly workspace: WorkspaceStateApi;
  /** Legacy — always false. */
  readonly isMockDataMode: false;
};

export const PLATFORM_KEY: InjectionKey<EchoPlatform> = Symbol('echoPlatform');

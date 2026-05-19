import type { ComputedRef, Ref } from 'vue';
import type { useAuthSessionStore } from '@/stores/authSession';
import type { ChannelCategory } from '@/composables/useChannels';
import type { ChannelPermissionKey, ChannelSummary } from '@shared/types';
import type { PreviewChannelPermission } from '@/domain/chatRolePreviewPermissions';
import type { Server } from '@shared/types/server';
import type {
  VcActivityUiPhase,
  VcActivityUiState,
  YoutubePlaylistEntry,
} from '@/features/voice/vcActivityTypes';

export type AppLayoutVoiceCategoryRow = {
  name: string;
  channels: { id: string; type: string }[];
};

/**
 * Voice + channel navigation inputs shared between `useAppLayoutShellVoice` and
 * `useAppLayoutCallVoiceBridge` (controller wires the same slice into both).
 */
export type AppLayoutVoiceShellDepsSlice = {
  selectedServerEcho: ComputedRef<Server | undefined>;
  voiceChannelForParticipants: ComputedRef<ChannelSummary | null>;
  currentVoiceChannelId: Ref<string | null>;
  currentVoiceChannelName: Ref<string>;
  vcMuted: Ref<boolean>;
  vcDeafened: Ref<boolean>;
  micTestListenDeafenActive: Ref<boolean>;
  applyVcDeafened: (next: boolean) => void;
  vcVideo: Ref<boolean>;
  vcScreenshare: Ref<boolean>;
  isScreenSharePickerOpen: Ref<boolean>;
  isDesktopStreamingControlOpen: Ref<boolean>;
  desktopStreamingControlMode: Ref<'screen' | 'camera'>;
  onJoinVoice: (payload: { channelId: string; channelName: string }) => void;
  onLeaveVoice: () => void;
  isDmUiContext: ComputedRef<boolean>;
  voiceSideChatCollapsed: Ref<boolean>;
  toggleVoiceSideChat: () => void;
  categoriesForServer: ComputedRef<AppLayoutVoiceCategoryRow[]>;
  getFirstTextChannelId: (cats: AppLayoutVoiceCategoryRow[]) => string;
  findChannelContextById: (channelId: string | null | undefined) => {
    channel?: ChannelSummary;
    category: ChannelCategory;
  } | null;
  roleUi: {
    isRolePreviewActiveForServer: ComputedRef<boolean>;
  };
  resolvePreviewChannelPermission: (
    ch: ChannelSummary | null | undefined,
    categoryDefaults:
      | Partial<Record<ChannelPermissionKey, boolean>>
      | undefined,
    permission: PreviewChannelPermission,
  ) => boolean;
  vcActivityUi: Ref<VcActivityUiState>;
  applyVcYoutubeWatchTogetherRemote: (snapshot: {
    playlist: YoutubePlaylistEntry[];
    currentIndex: number;
    youtubeBrowseOpen?: boolean;
    updatedAt: number;
    activityPhase?: VcActivityUiPhase;
    codenamesRoomUrl?: string | null;
  }) => void;
  closeVcActivity: () => void;
};

/** `useAuthSessionStore` type for composable deps (avoids value import cycles). */
export type AuthSessionStore = ReturnType<typeof useAuthSessionStore>;

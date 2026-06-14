import type { StreamVideoTileTrack } from '@/features/voice/composables/streamVideoTileTrack';
import type { PopoutAnchorRect } from '@/utils/memberProfiles';
import type { VcActivityPresenceKind } from '@/features/voice/vcActivityTypes';

export type VcModerateAction =
  | 'serverMute'
  | 'serverDeafen'
  | 'disconnect'
  | 'move'
  | 'stopCamera'
  | 'stopScreenShare';

export type CallViewParticipant = {
  id: string;
  name: string;
  pfp: string;
  muted?: boolean;
  deafened?: boolean;
  video?: boolean;
  streaming?: boolean;
  serverMuted?: boolean;
  serverDeafened?: boolean;
  speaking?: boolean;
  audioLevel?: number;
  screenTrack?: unknown;
  screenAudioTrack?: unknown;
  cameraTrack?: unknown;
  /** DM / group call: not yet in LiveKit, declined, or signaling accepted only. */
  dmCallPresence?: 'live' | 'ringing' | 'connecting' | 'declined';
  /** Guild VC: YouTube watch-together / activities picker (LiveKit presence). */
  activityPresence?: VcActivityPresenceKind[];
  /** Guild VC: this user drives LiveKit-synced activity until they leave. */
  isVcActivityKing?: boolean;
};

export type CallViewProps = {
  channelName: string;
  participants: CallViewParticipant[];
  currentUserId?: string;
  onOpenProfile?: (userId: string, anchorRect: PopoutAnchorRect | null) => void;
  canModerateParticipant?: (userId: string) => boolean;
  /** When set, gates each voice moderation action (Echo: MUTE_MEMBERS / DEAFEN_MEMBERS / MODERATE_MEMBERS). */
  canVcModerateParticipantAction?: (
    userId: string,
    action: VcModerateAction,
  ) => boolean;
  onVcModerate?: (payload: {
    action: VcModerateAction;
    targetUserId: string;
    targetChannelId?: string;
    contextVoiceChannelId?: string;
  }) => void;
  remoteParticipants?: Map<string, unknown>;
  lkRoom?: unknown;
  mirrorLocalCamera?: boolean;
  getLocalScreenTrack?: () => unknown;
  getLocalCameraTrack?: () => unknown;
  onRequestFullscreenStream?: (participantId: string) => void;
  /** LiveKit: per-remote-user playback level (0-100). */
  getRemoteParticipantVolume?: (userId: string) => number;
  setRemoteParticipantVolume?: (userId: string, volumePercent: number) => void;
  /** When false, only the participant grid / streams are shown (e.g. embedded under DM call chrome). */
  showHeader?: boolean;
  /** Guild mobile tri-pane: tighter padding and gallery gaps for small screens. */
  compactLayout?: boolean;
  /** Guild VC: click channel name to jump to channel in sidebar. */
  onGoToVoiceChannelInSidebar?: () => void;
  /** Guild VC: current voice channel id for moderation API context (mute/disconnect/move). */
  voiceModerationChannelId?: string | null;
  /** Guild VC: max concurrent users; `0` = unlimited. */
  voiceChannelUserLimit?: number;
  /**
   * DM fullscreen: prioritize camera / screen tiles (majority of space) and show
   * participant avatar ring in a side rail (desktop) or compact strip (mobile).
   */
  videoPrimaryDmLayout?: boolean;
};

export type StreamQuality = 'high' | 'medium' | 'low';

export const STREAM_QUALITY_LABELS: Record<StreamQuality, string> = {
  high: 'High (Source)',
  medium: 'Medium',
  low: 'Low',
};

export const STREAM_QUALITY_ORDER: StreamQuality[] = ['high', 'medium', 'low'];

export type RemoteTrackPublicationLike = {
  videoQuality?: number;
  setEnabled: (enabled: boolean) => void;
  setVideoQuality: (quality: number) => void;
};

export type RemoteParticipantLike = {
  getTrackPublication: (
    source: 'screen_share' | 'camera',
  ) => RemoteTrackPublicationLike | undefined;
};

export type VisualMediaTile = {
  tileId: string;
  mediaKind: 'screen' | 'camera';
  id: string;
  name: string;
  pfp: string;
  isLocal: boolean;
  track: StreamVideoTileTrack | null;
};

export function dmCallPresenceLabel(
  presence: CallViewParticipant['dmCallPresence'] | undefined,
): string {
  switch (presence) {
    case 'ringing':
      return 'Calling…';
    case 'connecting':
      return 'Joining…';
    case 'declined':
      return 'Declined';
    default:
      return '';
  }
}

export function streamQualityToLiveKitValue(q: StreamQuality): number {
  if (q === 'low') return 0;
  if (q === 'medium') return 1;
  return 2;
}

export function liveKitValueToStreamQuality(
  value: number | undefined,
): StreamQuality {
  if (value === 0) return 'low';
  if (value === 1) return 'medium';
  return 'high';
}

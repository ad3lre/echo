import type { MainSurface } from './mainSurface';

/**
 * Call / voice chrome layered on top of a base MainSurface. Does not replace navigation intent.
 */
export type CallOverlayState =
  | { type: 'none' }
  | {
      type: 'dmCall';
      fullscreen: boolean;
    }
  | { type: 'serverVoice'; channelId: string };

export function deriveCallOverlay(input: {
  mainSurface: MainSurface;
  dmCallWithUserId: string | null;
  dmPartnerUserId: string | null;
  isGroupDm: boolean;
  activeGroupDmId: string | null;
  dmCallFullscreen: boolean;
}): CallOverlayState {
  /**
   * Active DM / group call wins over guild voice main surface so call chrome,
   * `isDmVoiceCallUi`, and leave/rejoin logic stay aligned with LiveKit (matches
   * “call is like a VC”: session persists and stays visible while you browse).
   */
  if (input.dmCallWithUserId != null && input.dmCallWithUserId.trim() !== '') {
    return {
      type: 'dmCall',
      fullscreen: input.dmCallFullscreen,
    };
  }
  if (input.mainSurface.type === 'serverVoice') {
    return { type: 'serverVoice', channelId: input.mainSurface.channelId };
  }
  return { type: 'none' };
}

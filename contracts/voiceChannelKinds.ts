/** Echo channel types that use voice join, LiveKit, and `echo_voice_participants`. */
export type VoiceLikeChannelType = 'voice' | 'stage';

export type EchoChannelType = 'text' | VoiceLikeChannelType | 'forum';

export function isVoiceLikeChannelType(
  type: string | undefined | null,
): type is VoiceLikeChannelType {
  return type === 'voice' || type === 'stage';
}

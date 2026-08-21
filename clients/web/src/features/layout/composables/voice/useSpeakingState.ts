import {
  inject,
  provide,
  readonly,
  ref,
  type DeepReadonly,
  type Ref,
} from 'vue';
import type { ParticipantAudioLevel } from '@/features/voice/useLiveKitVoiceRoom';

const SPEAKING_STATE_KEY = Symbol('speaking-state');

export interface SpeakingStateContext {
  speakingMap: DeepReadonly<Ref<Record<string, ParticipantAudioLevel>>>;
  localSpeaking: DeepReadonly<Ref<boolean>>;
  localAudioLevel: DeepReadonly<Ref<number>>;
  localUserId: DeepReadonly<Ref<string | null>>;
}

/**
 * Provide speaking state at the top of the component tree (AppLayout).
 * Consumed by ChannelPanelVoiceParticipant and CallView
 * without needing to pass through every intermediate component.
 */
export function provideSpeakingState(ctx: SpeakingStateContext) {
  provide(SPEAKING_STATE_KEY, ctx);
}

const EMPTY_MAP = ref<Record<string, ParticipantAudioLevel>>({});
const FALSE_REF = ref(false);
const ZERO_REF = ref(0);
const NULL_REF = ref<string | null>(null);

export function useSpeakingState(): SpeakingStateContext {
  return inject<SpeakingStateContext>(SPEAKING_STATE_KEY, {
    speakingMap: readonly(EMPTY_MAP),
    localSpeaking: readonly(FALSE_REF),
    localAudioLevel: readonly(ZERO_REF),
    localUserId: readonly(NULL_REF),
  });
}

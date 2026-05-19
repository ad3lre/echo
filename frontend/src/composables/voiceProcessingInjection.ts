import type { InjectionKey } from 'vue';
import type { VideoQualityPreset } from '@/composables/useLiveKitVoiceRoom';

export type EchoVoiceProcessingApi = {
  reapplyVoiceProcessing: () => Promise<void>;
  /** Apply outgoing camera capture quality (Voice & Video settings). */
  setVcVideoQuality?: (preset: VideoQualityPreset) => void;
  /**
   * Settings mic listen-back: while true, LiveKit uses effective deafen so VC
   * remote audio does not play over the same output as the mic monitor.
   */
  setMicTestListenDeafen?: (active: boolean) => void;
};

export const ECHO_VOICE_PROCESSING_KEY: InjectionKey<EchoVoiceProcessingApi> =
  Symbol('echoVoiceProcessing');

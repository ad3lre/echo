/** Settings mic-test listen-back must stop before joining voice (LiveKit mic publish). */
export const ECHO_VOICE_JOIN_PREPARE_MIC_TEST_EVENT = 'echo:voice-join-prepare';

export function dispatchVoiceJoinPrepareMicTest(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ECHO_VOICE_JOIN_PREPARE_MIC_TEST_EVENT));
}

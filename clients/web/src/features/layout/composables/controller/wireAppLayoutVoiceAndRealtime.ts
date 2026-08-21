import type { WireAppLayoutDmAndShellResult } from './wireAppLayoutDmAndShell';
import { useAppLayoutVoiceAndRealtimeLifecycle } from './useAppLayoutVoiceAndRealtimeLifecycle';
import { useAppLayoutVoiceAndRealtimeChannels } from './useAppLayoutVoiceAndRealtimeChannels';
import { useAppLayoutVoiceAndRealtimeRailLanding } from './useAppLayoutVoiceAndRealtimeRailLanding';
import { useAppLayoutVoiceAndRealtimeSessionSocial } from './useAppLayoutVoiceAndRealtimeSessionSocial';
import { buildWireAppLayoutVoiceAndRealtimeResult } from './buildWireAppLayoutVoiceAndRealtimeResult';

/**
 * Phase 2 composition root: voice, history, landing, realtime, social.
 * Ordered wiring lives in `useAppLayoutVoiceAndRealtime*` composables.
 */

export type WireAppLayoutVoiceAndRealtimeResult = ReturnType<
  typeof wireAppLayoutVoiceAndRealtime
>;

export function wireAppLayoutVoiceAndRealtime(
  phase1: WireAppLayoutDmAndShellResult,
) {
  const lifecycle = useAppLayoutVoiceAndRealtimeLifecycle(phase1);
  const channels = useAppLayoutVoiceAndRealtimeChannels(phase1, lifecycle);
  const railLanding = useAppLayoutVoiceAndRealtimeRailLanding(
    phase1,
    lifecycle,
  );
  const sessionSocial = useAppLayoutVoiceAndRealtimeSessionSocial(
    phase1,
    lifecycle,
    channels,
    railLanding,
  );
  return buildWireAppLayoutVoiceAndRealtimeResult({
    phase1,
    lifecycle,
    channels,
    railLanding,
    sessionSocial,
  });
}

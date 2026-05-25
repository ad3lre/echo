/** Bounds for client-reported VC network samples (Prometheus aggregation). */

export const VOICE_QOS_LATENCY_MS_MAX = 10_000;
export const VOICE_QOS_JITTER_MS_MAX = 5_000;
export const VOICE_QOS_PACKET_LOSS_PCT_MAX = 100;

export type VoiceQosSampleInput = {
  latencyMs: number;
  jitterMs: number;
  packetLossPct: number;
};

export function normalizeVoiceQosSample(
  raw: unknown,
): VoiceQosSampleInput | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const latencyMs = Number(o.latencyMs);
  const jitterMs = Number(o.jitterMs);
  const packetLossPct = Number(o.packetLossPct);
  if (
    !Number.isFinite(latencyMs) ||
    !Number.isFinite(jitterMs) ||
    !Number.isFinite(packetLossPct)
  ) {
    return null;
  }
  return {
    latencyMs: Math.max(0, Math.min(VOICE_QOS_LATENCY_MS_MAX, latencyMs)),
    jitterMs: Math.max(0, Math.min(VOICE_QOS_JITTER_MS_MAX, jitterMs)),
    packetLossPct: Math.max(
      0,
      Math.min(VOICE_QOS_PACKET_LOSS_PCT_MAX, packetLossPct),
    ),
  };
}

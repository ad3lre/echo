export type OutboundGateMode = 'none' | 'soft' | 'hard';

export function thresholdPercentToRms(percent: number): number {
  const tMin = 0.005;
  const tMax = 0.06;
  const clamped = Math.max(0, Math.min(100, percent));
  return tMin + (clamped / 100) * (tMax - tMin);
}

export function rmsToDbfs(rms: number): number {
  if (rms <= 1e-7) return -100;
  return Math.max(-100, Math.min(0, 20 * Math.log10(rms)));
}

export function gateMultiplierForDbfs(
  dbfs: number,
  thresholdPercent: number,
  mode: OutboundGateMode,
): number {
  const thresholdDbfs = rmsToDbfs(thresholdPercentToRms(thresholdPercent));
  if (mode === 'none') return 1;
  if (dbfs >= thresholdDbfs) return 1;
  if (mode === 'hard') return 0;
  const delta = thresholdDbfs - dbfs;
  const attenuationDb = Math.max(0, Math.min(36, delta * 1.2));
  return Math.pow(10, -attenuationDb / 20);
}

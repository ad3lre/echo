import type { StatusComponentState, StatusDayBucket } from './types';

/** Map a UTC daily aggregate bucket to a Discord-style day status. */
export function dayStateFromBucket(
  bucket: StatusDayBucket | null,
): StatusComponentState {
  if (!bucket || bucket.probeTotal <= 0) return 'no_data';
  const ratio = bucket.probeUp / bucket.probeTotal;
  if (ratio >= 0.995) {
    return bucket.probeDegraded > 0 ? 'degraded' : 'operational';
  }
  if (ratio >= 0.9) return 'degraded';
  if (ratio >= 0.5) return 'partial_outage';
  return 'major_outage';
}

export function uptimePercentFromBuckets(
  buckets: StatusDayBucket[],
): number | null {
  let total = 0;
  let up = 0;
  for (const b of buckets) {
    if (b.probeTotal <= 0) continue;
    total += b.probeTotal;
    up += b.probeUp;
  }
  if (total <= 0) return null;
  return Math.round((up / total) * 10000) / 100;
}

export function worstComponentState(
  states: StatusComponentState[],
): StatusComponentState | 'pending' {
  if (states.length === 0) return 'pending';
  const rank: Record<StatusComponentState, number> = {
    major_outage: 4,
    partial_outage: 3,
    degraded: 2,
    operational: 1,
    no_data: 0,
  };
  let worst: StatusComponentState = 'no_data';
  let worstRank = -1;
  for (const s of states) {
    const r = rank[s];
    if (r > worstRank) {
      worstRank = r;
      worst = s;
    }
  }
  return worst;
}

export function latestStateFromProbe(
  ok: boolean,
  degraded: boolean,
): StatusComponentState {
  if (!ok) return 'major_outage';
  if (degraded) return 'degraded';
  return 'operational';
}

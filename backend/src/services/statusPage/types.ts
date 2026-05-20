/** Monitored component ids (public status page). */
export type StatusComponentId = 'web' | 'api' | 'database' | 'realtime';

export type StatusComponentState =
  | 'operational'
  | 'degraded'
  | 'partial_outage'
  | 'major_outage'
  | 'no_data';

export type StatusOverallState =
  | 'operational'
  | 'degraded'
  | 'partial_outage'
  | 'major_outage'
  | 'pending';

export type StatusProbeResult = {
  componentId: StatusComponentId;
  ok: boolean;
  degraded: boolean;
  latencyMs: number | null;
};

export type StatusDayBucket = {
  dayUtc: string;
  probeTotal: number;
  probeUp: number;
  probeDegraded: number;
};

export type StatusLatestRow = {
  componentId: StatusComponentId;
  probedAt: string;
  ok: boolean;
  degraded: boolean;
  latencyMs: number | null;
};

export type PublicStatusComponent = {
  id: StatusComponentId;
  name: string;
  description: string;
  status: StatusComponentState;
  latencyMs: number | null;
  uptimePercent: number | null;
  /** Oldest → newest; length = configured history window (default 90 days). */
  history: StatusComponentState[];
};

export type PublicStatusPayload = {
  updatedAt: string;
  overall: StatusOverallState;
  historyDays: number;
  probeIntervalSec: number;
  components: PublicStatusComponent[];
  incidents: [];
};

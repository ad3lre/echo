import type { Pool } from 'pg';
import { config } from '../../config';
import {
  dayStateFromBucket,
  latestStateFromProbe,
  uptimePercentFromBuckets,
  worstComponentState,
} from './dayState';
import { loadStatusBuckets, loadStatusLatest } from './store';
import type {
  PublicStatusComponent,
  PublicStatusPayload,
  StatusComponentId,
  StatusComponentState,
  StatusOverallState,
} from './types';

const COMPONENT_META: Record<
  StatusComponentId,
  { name: string; description: string }
> = {
  web: {
    name: 'Echo web app',
    description: 'Primary SPA and static assets on chat-echo.com.',
  },
  api: {
    name: 'Echo API',
    description: 'REST API for chat, auth, uploads, and server data.',
  },
  database: {
    name: 'Database',
    description: 'PostgreSQL backing Echo persistence.',
  },
  realtime: {
    name: 'Real-time messaging',
    description: 'NATS-backed fan-out for live updates across API nodes.',
  },
};

const COMPONENT_ORDER: StatusComponentId[] = [
  'web',
  'api',
  'database',
  'realtime',
];

function listUtcDays(historyDays: number): string[] {
  const days: string[] = [];
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  for (let i = historyDays - 1; i >= 0; i -= 1) {
    const d = new Date(cursor);
    d.setUTCDate(cursor.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function mapOverall(
  worst: StatusComponentState | 'pending',
): StatusOverallState {
  if (worst === 'pending' || worst === 'no_data') return 'pending';
  return worst;
}

export async function buildPublicStatusPayload(
  pool: Pool | null,
): Promise<PublicStatusPayload> {
  const historyDays = config.echoStatusHistoryDays;
  const latest = await loadStatusLatest(pool);
  const dayList = listUtcDays(historyDays);

  const components: PublicStatusComponent[] = [];
  const currentStates: StatusComponentState[] = [];

  for (const id of COMPONENT_ORDER) {
    const buckets = await loadStatusBuckets(pool, id, historyDays);
    const history: StatusComponentState[] = dayList.map((dayUtc) =>
      dayStateFromBucket(buckets.get(dayUtc) ?? null),
    );
    const bucketValues = [...buckets.values()];
    const uptimePercent = uptimePercentFromBuckets(bucketValues);

    const latestRow = latest.get(id);
    let status: StatusComponentState = 'no_data';
    let latencyMs: number | null = null;
    if (latestRow) {
      status = latestStateFromProbe(latestRow.ok, latestRow.degraded);
      latencyMs = latestRow.latencyMs;
    }

    currentStates.push(status);
    const meta = COMPONENT_META[id];
    components.push({
      id,
      name: meta.name,
      description: meta.description,
      status,
      latencyMs,
      uptimePercent,
      history,
    });
  }

  const worst = worstComponentState(currentStates);
  const updatedAt =
    [...latest.values()].sort((a, b) => b.probedAt.localeCompare(a.probedAt))[0]
      ?.probedAt ?? new Date().toISOString();

  return {
    updatedAt,
    overall: mapOverall(worst),
    historyDays,
    probeIntervalSec: Math.round(config.echoStatusProbeIntervalMs / 1000),
    components,
    incidents: [],
  };
}

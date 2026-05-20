import type { Pool } from 'pg';
import { config } from '../../config';
import { getNatsConnection } from '../../db/nats';
import type { StatusComponentId, StatusProbeResult } from './types';

const COMPONENT_DEGRADED_MS: Record<StatusComponentId, number> = {
  web: 2500,
  api: 3500,
  database: 500,
  realtime: 500,
};

function isDegraded(
  latencyMs: number | null,
  componentId: StatusComponentId,
): boolean {
  if (latencyMs == null) return false;
  return latencyMs > COMPONENT_DEGRADED_MS[componentId];
}

export async function probeStatusWeb(): Promise<StatusProbeResult> {
  const url = config.echoStatusWebProbeUrl;
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(config.echoStatusProbeTimeoutMs),
    });
    const latencyMs = Date.now() - t0;
    const ok = res.ok;
    return {
      componentId: 'web',
      ok,
      latencyMs: ok ? latencyMs : null,
      degraded: ok && isDegraded(latencyMs, 'web'),
    };
  } catch {
    return { componentId: 'web', ok: false, latencyMs: null, degraded: false };
  }
}

export async function probeStatusApi(
  pool: Pool | null,
): Promise<StatusProbeResult> {
  const t0 = Date.now();
  try {
    if (config.backendStorageMode === 'memory') {
      const latencyMs = Date.now() - t0;
      return {
        componentId: 'api',
        ok: true,
        latencyMs,
        degraded: isDegraded(latencyMs, 'api'),
      };
    }
    if (!pool) {
      return {
        componentId: 'api',
        ok: false,
        latencyMs: null,
        degraded: false,
      };
    }
    await pool.query('SELECT 1');
    const latencyMs = Date.now() - t0;
    return {
      componentId: 'api',
      ok: true,
      latencyMs,
      degraded: isDegraded(latencyMs, 'api'),
    };
  } catch {
    return { componentId: 'api', ok: false, latencyMs: null, degraded: false };
  }
}

export async function probeStatusDatabase(
  pool: Pool | null,
): Promise<StatusProbeResult> {
  if (config.backendStorageMode === 'memory') {
    return {
      componentId: 'database',
      ok: true,
      latencyMs: 0,
      degraded: false,
    };
  }
  const t0 = Date.now();
  try {
    if (!pool) {
      return {
        componentId: 'database',
        ok: false,
        latencyMs: null,
        degraded: false,
      };
    }
    await pool.query('SELECT 1');
    const latencyMs = Date.now() - t0;
    return {
      componentId: 'database',
      ok: true,
      latencyMs,
      degraded: isDegraded(latencyMs, 'database'),
    };
  } catch {
    return {
      componentId: 'database',
      ok: false,
      latencyMs: null,
      degraded: false,
    };
  }
}

export async function probeStatusRealtime(): Promise<StatusProbeResult> {
  if (!config.natsUrl) {
    return {
      componentId: 'realtime',
      ok: true,
      latencyMs: null,
      degraded: false,
    };
  }
  const t0 = Date.now();
  const nc = getNatsConnection();
  const ok = Boolean(nc && !nc.isClosed());
  const latencyMs = Date.now() - t0;
  return {
    componentId: 'realtime',
    ok,
    latencyMs: ok ? latencyMs : null,
    degraded: ok && isDegraded(latencyMs, 'realtime'),
  };
}

export async function runAllStatusProbes(
  pool: Pool | null,
): Promise<StatusProbeResult[]> {
  const [web, api, database, realtime] = await Promise.all([
    probeStatusWeb(),
    probeStatusApi(pool),
    probeStatusDatabase(pool),
    probeStatusRealtime(),
  ]);
  return [web, api, database, realtime];
}

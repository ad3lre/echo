import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetEchoOutageRecoveryStatsForTests,
  DEFAULT_RECOVERY_ESTIMATE_SEC,
  getEchoOutageRecoveryEstimate,
  recordEchoOutageRecoveryDuration,
} from './echoOutageRecoveryStats';

const memoryStore = new Map<string, string>();

beforeEach(() => {
  memoryStore.clear();
  vi.stubGlobal('localStorage', {
    get length() {
      return memoryStore.size;
    },
    key: (i: number) => [...memoryStore.keys()][i] ?? null,
    getItem: (k: string) => (memoryStore.has(k) ? memoryStore.get(k)! : null),
    setItem: (k: string, v: string) => {
      memoryStore.set(k, v);
    },
    removeItem: (k: string) => {
      memoryStore.delete(k);
    },
    clear: () => {
      memoryStore.clear();
    },
  });
});

afterEach(() => {
  __resetEchoOutageRecoveryStatsForTests();
  vi.unstubAllGlobals();
});

describe('echoOutageRecoveryStats', () => {
  it('returns defaults with no history', () => {
    const e = getEchoOutageRecoveryEstimate();
    expect(e.sampleCount).toBe(0);
    expect(e.averageSeconds).toBeNull();
    expect(e.estimateSeconds).toBe(DEFAULT_RECOVERY_ESTIMATE_SEC);
  });

  it('records and averages durations', () => {
    recordEchoOutageRecoveryDuration(30_000);
    recordEchoOutageRecoveryDuration(90_000);
    const e = getEchoOutageRecoveryEstimate();
    expect(e.sampleCount).toBe(2);
    expect(e.averageSeconds).toBe(60);
    expect(e.estimateSeconds).toBe(60);
  });

  it('respects minimum estimate', () => {
    recordEchoOutageRecoveryDuration(5_000);
    const e = getEchoOutageRecoveryEstimate();
    expect(e.estimateSeconds).toBe(15);
  });

  it('rolls history at MAX_SAMPLES', () => {
    for (let i = 0; i < 25; i++) {
      recordEchoOutageRecoveryDuration(60_000);
    }
    expect(getEchoOutageRecoveryEstimate().sampleCount).toBe(20);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useVoiceLevelsStore } from './voiceLevels';

describe('voiceLevels store', () => {
  beforeEach(() => {
    const storage: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage[k] ?? null,
      setItem: (k: string, v: string) => {
        storage[k] = v;
      },
      removeItem: (k: string) => {
        delete storage[k];
      },
      clear: () => {
        for (const k of Object.keys(storage)) delete storage[k];
      },
      key: (i: number) => Object.keys(storage)[i] ?? null,
      get length() {
        return Object.keys(storage).length;
      },
    });
    setActivePinia(createPinia());
  });

  it('defaults outbound gate mode to soft', () => {
    const store = useVoiceLevelsStore();
    expect(store.outboundGateMode).toBe('soft');
  });

  it('persists outbound gate mode in localStorage payload', async () => {
    vi.useFakeTimers();
    const store = useVoiceLevelsStore();
    store.setOutboundGateMode('hard');
    // Vue watch fires on microtask; flush it so the debounce setTimeout is scheduled
    await vi.advanceTimersByTimeAsync(250);
    vi.useRealTimers();
    const raw = localStorage.getItem('echo-voice-levels-v1');
    expect(raw).toBeTruthy();
    const payload = JSON.parse(raw as string) as { outboundGateMode?: string };
    expect(payload.outboundGateMode).toBe('hard');
  });

  it('accepts none outbound gate mode', async () => {
    const store = useVoiceLevelsStore();
    store.setOutboundGateMode('none');
    await Promise.resolve();
    expect(store.outboundGateMode).toBe('none');
  });
});

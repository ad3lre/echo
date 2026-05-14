/** @vitest-environment happy-dom */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  attachEchoSocketWindowResumeListeners,
  scheduleEchoSocketInitialConnect,
  tryResumeEchoSocketConnection,
} from '../socketClientResumeAndWindow';

describe('tryResumeEchoSocketConnection', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true } as Navigator);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('no-ops when socket transport is off', () => {
    const ensureConnect = vi.fn();
    tryResumeEchoSocketConnection({
      socketOff: () => true,
      getConnected: () => false,
      ensureConnect,
    });
    expect(ensureConnect).not.toHaveBeenCalled();
  });

  it('no-ops when already connected', () => {
    const ensureConnect = vi.fn();
    tryResumeEchoSocketConnection({
      socketOff: () => false,
      getConnected: () => true,
      ensureConnect,
    });
    expect(ensureConnect).not.toHaveBeenCalled();
  });

  it('no-ops when navigator reports offline', () => {
    vi.stubGlobal('navigator', { onLine: false } as Navigator);
    const ensureConnect = vi.fn();
    tryResumeEchoSocketConnection({
      socketOff: () => false,
      getConnected: () => false,
      ensureConnect,
    });
    expect(ensureConnect).not.toHaveBeenCalled();
  });

  it('calls ensureConnect when disconnected (full recycle of stale Socket.IO client)', () => {
    const ensureConnect = vi.fn();
    tryResumeEchoSocketConnection({
      socketOff: () => false,
      getConnected: () => false,
      ensureConnect,
    });
    expect(ensureConnect).toHaveBeenCalledTimes(1);
  });
});

describe('scheduleEchoSocketInitialConnect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses setTimeout fallback when requestIdleCallback missing', () => {
    const ric = globalThis.requestIdleCallback;
    // @ts-expect-error test
    delete globalThis.requestIdleCallback;
    try {
      const onConnect = vi.fn();
      const cancel = scheduleEchoSocketInitialConnect({ onConnect });
      vi.runAllTimers();
      expect(onConnect).toHaveBeenCalledTimes(1);
      cancel();
    } finally {
      globalThis.requestIdleCallback = ric;
    }
  });
});

describe('attachEchoSocketWindowResumeListeners', () => {
  it('detach removes window + document listeners', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const docAdd = vi.spyOn(document, 'addEventListener');
    const docRemove = vi.spyOn(document, 'removeEventListener');

    const detach = attachEchoSocketWindowResumeListeners({
      socketOff: () => false,
      onPersistedPageHide: vi.fn(),
      onPersistedPageShow: vi.fn(),
      onResumeRealtime: vi.fn(),
    });

    expect(addSpy).toHaveBeenCalledWith('pagehide', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('pageshow', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(docAdd).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );
    expect(docAdd).toHaveBeenCalledWith('resume', expect.any(Function));

    detach();

    expect(removeSpy).toHaveBeenCalledWith('pagehide', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('pageshow', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(docRemove).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );
    expect(docRemove).toHaveBeenCalledWith('resume', expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
    docAdd.mockRestore();
    docRemove.mockRestore();
  });
});

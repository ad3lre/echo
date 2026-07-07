// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { invoke, isDesktop } = vi.hoisted(() => ({
  invoke: vi.fn(async () => undefined),
  isDesktop: vi.fn(() => false),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke,
}));

vi.mock('@/platform/desktopBridge', () => ({
  isDesktop,
}));

import { reloadEchoApp } from './reloadEchoApp';

describe('reloadEchoApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isDesktop.mockReturnValue(false);
    vi.spyOn(window.location, 'reload').mockImplementation(() => {});
  });

  it('uses location.reload on web', () => {
    reloadEchoApp();
    expect(invoke).not.toHaveBeenCalled();
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('invokes native hard reload on desktop', async () => {
    isDesktop.mockReturnValue(true);
    reloadEchoApp();
    await Promise.resolve();
    expect(invoke).toHaveBeenCalledWith('desktop_shell_hard_reload');
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('falls back to location.reload when native hard reload fails', async () => {
    isDesktop.mockReturnValue(true);
    invoke.mockRejectedValueOnce(new Error('reload failed'));
    reloadEchoApp();
    await Promise.resolve();
    await Promise.resolve();
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });
});

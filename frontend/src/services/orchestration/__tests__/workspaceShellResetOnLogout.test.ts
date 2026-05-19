import { describe, expect, it, vi } from 'vitest';
import { applyEchoWorkspaceShellResetOnAuthUserCleared } from '../workspaceShellResetOnLogout';

describe('applyEchoWorkspaceShellResetOnAuthUserCleared', () => {
  it('runs reset, explore rail, clear server, and skips roster when prior user had no id', () => {
    const order: string[] = [];
    const remove = vi.fn();

    applyEchoWorkspaceShellResetOnAuthUserCleared({
      previousBackendUser: {},
      resetEchoSessionState: () => order.push('reset'),
      setExploreRailTab: () => order.push('explore'),
      clearSelectedServer: () => order.push('clearServer'),
      removeRosterUserById: remove,
    });

    expect(order).toEqual(['reset', 'explore', 'clearServer']);
    expect(remove).not.toHaveBeenCalled();
  });

  it('removes roster row when prior user id is known', () => {
    const remove = vi.fn();
    applyEchoWorkspaceShellResetOnAuthUserCleared({
      previousBackendUser: { id: 'u-gone' },
      resetEchoSessionState: () => {},
      setExploreRailTab: () => {},
      clearSelectedServer: () => {},
      removeRosterUserById: remove,
    });
    expect(remove).toHaveBeenCalledWith('u-gone');
  });
});

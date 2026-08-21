import { describe, expect, it, vi, beforeEach } from 'vitest';
import { applyEchoWorkspaceRetargetAfterServerDeletion } from '@/features/layout/echoWorkspace/workspaceServerDeletionNav';
import {
  pickNextServerIdAfterDeletion,
  shouldRetargetServerAfterServerDeletion,
} from '@/features/layout/echoWorkspace/workspaceShellSelection';
import * as shellNav from '@/features/layout/shellNavDebugLog';

describe('shouldRetargetServerAfterServerDeletion', () => {
  it('is true when selection is the deleted server', () => {
    expect(shouldRetargetServerAfterServerDeletion('s1', 's1', ['s2'])).toBe(
      true,
    );
  });

  it('is true when selection is not in remaining list', () => {
    expect(shouldRetargetServerAfterServerDeletion('s1', 'gone', ['s2'])).toBe(
      true,
    );
  });

  it('is false when selection still valid', () => {
    expect(
      shouldRetargetServerAfterServerDeletion('s1', 's2', ['s2', 's3']),
    ).toBe(false);
  });

  it('is false when nothing selected', () => {
    expect(shouldRetargetServerAfterServerDeletion('s1', null, ['s2'])).toBe(
      false,
    );
  });
});

describe('pickNextServerIdAfterDeletion', () => {
  it('uses preferred id when provided', () => {
    const pick = vi.fn(() => 'pref');
    expect(pickNextServerIdAfterDeletion(['a', 'b'], pick)).toBe('pref');
    expect(pick).toHaveBeenCalledOnce();
  });

  it('falls back to first remaining then echo', () => {
    expect(pickNextServerIdAfterDeletion(['z'], () => null)).toBe('z');
    expect(pickNextServerIdAfterDeletion([], () => null)).toBe('echo');
  });
});

describe('applyEchoWorkspaceRetargetAfterServerDeletion', () => {
  beforeEach(() => {
    vi.spyOn(shellNav, 'logShellNav').mockImplementation(() => {});
  });

  it('returns false and does not call selectServer when selection still valid', () => {
    const selectServer = vi.fn();
    const setChannel = vi.fn();
    const out = applyEchoWorkspaceRetargetAfterServerDeletion({
      deletedServerId: 's-del',
      selectedServerId: 's2',
      remainingServerRows: [{ id: 's2' }, { id: 's3' }],
      pickPreferredGuildServerId: () => null,
      categoriesByServer: {},
      getFirstTextChannelId: () => '',
      selectServer,
      setActiveChannelId: setChannel,
      activeChannelIdBefore: 'ch0',
    });
    expect(out).toBe(false);
    expect(selectServer).not.toHaveBeenCalled();
    expect(setChannel).not.toHaveBeenCalled();
  });

  it('selects echo home and jumps to general when next server is echo', () => {
    const selectServer = vi.fn();
    const setChannel = vi.fn();
    const out = applyEchoWorkspaceRetargetAfterServerDeletion({
      deletedServerId: 's1',
      selectedServerId: 's1',
      remainingServerRows: [],
      pickPreferredGuildServerId: () => null,
      categoriesByServer: {},
      getFirstTextChannelId: () => '',
      selectServer,
      setActiveChannelId: setChannel,
      activeChannelIdBefore: 'ch-old',
    });
    expect(out).toBe(true);
    expect(selectServer).toHaveBeenCalledWith('echo');
    expect(setChannel).toHaveBeenCalledWith('general');
    expect(shellNav.logShellNav).toHaveBeenCalledWith(
      'useEchoWorkspaceLifecycle',
      'handleServerDeleted_echo_general',
      expect.objectContaining({ deletedServerId: 's1', from: 'ch-old' }),
    );
  });

  it('selects next guild and first text channel when available', () => {
    const selectServer = vi.fn();
    const setChannel = vi.fn();
    const getFirst = vi.fn(() => 'text-1');
    const out = applyEchoWorkspaceRetargetAfterServerDeletion({
      deletedServerId: 's1',
      selectedServerId: 's1',
      remainingServerRows: [{ id: 's2' }],
      pickPreferredGuildServerId: () => 's2',
      categoriesByServer: {
        s2: [
          {
            id: 'c1',
            name: 'Cat',
            channels: [{ id: 'text-1', type: 'text', name: 't' }],
          },
        ],
      },
      getFirstTextChannelId: getFirst,
      selectServer,
      setActiveChannelId: setChannel,
      activeChannelIdBefore: 'x',
    });
    expect(out).toBe(true);
    expect(selectServer).toHaveBeenCalledWith('s2');
    expect(getFirst).toHaveBeenCalled();
    expect(setChannel).toHaveBeenCalledWith('text-1');
    expect(shellNav.logShellNav).toHaveBeenCalledWith(
      'useEchoWorkspaceLifecycle',
      'handleServerDeleted_next_server_first',
      expect.objectContaining({
        deletedServerId: 's1',
        nextServerId: 's2',
        first: 'text-1',
      }),
    );
  });
});

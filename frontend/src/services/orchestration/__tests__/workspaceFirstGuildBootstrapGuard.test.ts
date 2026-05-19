import { beforeEach, describe, expect, it, vi } from 'vitest';
import { workspaceFirstGuildBootstrapGuard } from '../workspaceFirstGuildBootstrapGuard';

const isDmThreadId = vi.fn<(id: string) => boolean>();

describe('workspaceFirstGuildBootstrapGuard', () => {
  beforeEach(() => {
    isDmThreadId.mockReset();
  });

  it('does not skip when on servers rail, general channel, no call', () => {
    isDmThreadId.mockReturnValue(false);
    const r = workspaceFirstGuildBootstrapGuard({
      activeRailTab: 'servers',
      activeChannelId: 'general',
      echoDmThreadIds: new Set(),
      dmCallWithUserId: null,
      isDmThreadId,
    });
    expect(r.skipFirstGuildBootstrap).toBe(false);
    expect(r.inDmRail).toBe(false);
    expect(r.legacyDmShell).toBe(false);
    expect(r.inEchoDmSet).toBe(false);
    expect(r.inDmCall).toBe(false);
  });

  it('skips when DM rail is active', () => {
    isDmThreadId.mockReturnValue(false);
    const r = workspaceFirstGuildBootstrapGuard({
      activeRailTab: 'dm',
      activeChannelId: '',
      isDmThreadId,
    });
    expect(r.skipFirstGuildBootstrap).toBe(true);
    expect(r.inDmRail).toBe(true);
  });

  it('skips when active channel is a legacy DM thread id', () => {
    isDmThreadId.mockReturnValue(true);
    const r = workspaceFirstGuildBootstrapGuard({
      activeRailTab: 'servers',
      activeChannelId: 'dm:123',
      isDmThreadId,
    });
    expect(r.skipFirstGuildBootstrap).toBe(true);
    expect(r.legacyDmShell).toBe(true);
    expect(isDmThreadId).toHaveBeenCalledWith('dm:123');
  });

  it('skips when channel id is in echo DM thread set', () => {
    isDmThreadId.mockReturnValue(false);
    const r = workspaceFirstGuildBootstrapGuard({
      activeRailTab: 'servers',
      activeChannelId: '9876543210',
      echoDmThreadIds: new Set(['9876543210']),
      isDmThreadId,
    });
    expect(r.skipFirstGuildBootstrap).toBe(true);
    expect(r.inEchoDmSet).toBe(true);
  });

  it('skips when a DM call target is set', () => {
    isDmThreadId.mockReturnValue(false);
    const r = workspaceFirstGuildBootstrapGuard({
      activeRailTab: 'servers',
      activeChannelId: 'general',
      dmCallWithUserId: 'user-1',
      isDmThreadId,
    });
    expect(r.skipFirstGuildBootstrap).toBe(true);
    expect(r.inDmCall).toBe(true);
  });

  it('trims channel id and call user id for checks', () => {
    isDmThreadId.mockImplementation((id) => id === 'x');
    const r = workspaceFirstGuildBootstrapGuard({
      activeRailTab: 'servers',
      activeChannelId: '  x  ',
      echoDmThreadIds: new Set(['x']),
      dmCallWithUserId: '  u ',
      isDmThreadId,
    });
    expect(r.cid).toBe('x');
    expect(r.inEchoDmSet).toBe(true);
    expect(r.inDmCall).toBe(true);
    expect(r.skipFirstGuildBootstrap).toBe(true);
  });
});

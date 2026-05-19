import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWorkspaceSocketEventHandler,
  ECHO_WORKSPACE_SOCKET_REFRESH_KINDS,
} from '../workspaceSocketEventHandler';

describe('createWorkspaceSocketEventHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes social only for friend_requests_changed', () => {
    const refreshSocial = vi.fn(async () => undefined);
    const hydrate = vi.fn(async () => undefined);
    const bump = vi.fn();
    const handler = createWorkspaceSocketEventHandler({
      noteWorkspaceEventVersion: () => true,
      bumpLiveChannelCapabilities: bump,
      hydrateEchoFromApi: hydrate,
      refreshEchoSocialFromApi: refreshSocial,
    });

    handler({ kind: 'friend_requests_changed', version: '1' });

    expect(refreshSocial).toHaveBeenCalledTimes(1);
    expect(bump).not.toHaveBeenCalled();
    expect(hydrate).not.toHaveBeenCalled();
  });

  it('returns early when version is stale', () => {
    const hydrate = vi.fn(async () => undefined);
    const bump = vi.fn();
    const handler = createWorkspaceSocketEventHandler({
      noteWorkspaceEventVersion: () => false,
      bumpLiveChannelCapabilities: bump,
      hydrateEchoFromApi: hydrate,
      refreshEchoSocialFromApi: vi.fn(async () => undefined),
    });

    handler({
      kind: 'workspace_invalidated',
      version: '9',
    });

    expect(bump).not.toHaveBeenCalled();
    expect(hydrate).not.toHaveBeenCalled();
  });

  it('ignores kinds outside the refresh set', () => {
    const hydrate = vi.fn(async () => undefined);
    const bump = vi.fn();
    const handler = createWorkspaceSocketEventHandler({
      noteWorkspaceEventVersion: () => true,
      bumpLiveChannelCapabilities: bump,
      hydrateEchoFromApi: hydrate,
      refreshEchoSocialFromApi: vi.fn(async () => undefined),
    });

    handler({ kind: 'role_graph_changed', version: '1' });

    expect(bump).not.toHaveBeenCalled();
    expect(hydrate).not.toHaveBeenCalled();
  });

  it('bumps capabilities and debounces hydrate for refresh kinds', () => {
    const hydrate = vi.fn(async () => undefined);
    const bump = vi.fn();
    const handler = createWorkspaceSocketEventHandler({
      noteWorkspaceEventVersion: () => true,
      bumpLiveChannelCapabilities: bump,
      hydrateEchoFromApi: hydrate,
      refreshEchoSocialFromApi: vi.fn(async () => undefined),
      debounceMs: 200,
    });

    handler({ kind: 'workspace_invalidated', version: '1' });
    handler({ kind: 'workspace_invalidated', version: '2' });

    expect(bump).toHaveBeenCalledTimes(2);
    expect(hydrate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(199);
    expect(hydrate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(hydrate).toHaveBeenCalledTimes(1);
  });

  it('invokes onWorkspaceInvalidated immediately for workspace_invalidated', () => {
    const hydrate = vi.fn(async () => undefined);
    const bump = vi.fn();
    const onInv = vi.fn();
    const handler = createWorkspaceSocketEventHandler({
      noteWorkspaceEventVersion: () => true,
      bumpLiveChannelCapabilities: bump,
      hydrateEchoFromApi: hydrate,
      refreshEchoSocialFromApi: vi.fn(async () => undefined),
      onWorkspaceInvalidated: onInv,
      debounceMs: 200,
    });

    handler({ kind: 'workspace_invalidated', version: '1' });

    expect(onInv).toHaveBeenCalledTimes(1);
    expect(hydrate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(hydrate).toHaveBeenCalledTimes(1);
  });

  it('applies discord_voice_mirror_roster without hydrate', () => {
    const hydrate = vi.fn(async () => undefined);
    const bump = vi.fn();
    const mirror = vi.fn();
    const handler = createWorkspaceSocketEventHandler({
      noteWorkspaceEventVersion: () => true,
      bumpLiveChannelCapabilities: bump,
      hydrateEchoFromApi: hydrate,
      refreshEchoSocialFromApi: vi.fn(async () => undefined),
      onDiscordVoiceMirrorRoster: mirror,
    });

    handler({
      kind: 'discord_voice_mirror_roster',
      version: '1',
      discordVoiceMirror: { channels: [] },
    });

    expect(mirror).toHaveBeenCalledTimes(1);
    expect(bump).not.toHaveBeenCalled();
    expect(hydrate).not.toHaveBeenCalled();
  });

  it('does not invoke onWorkspaceInvalidated for other refresh kinds', () => {
    const hydrate = vi.fn(async () => undefined);
    const onInv = vi.fn();
    const handler = createWorkspaceSocketEventHandler({
      noteWorkspaceEventVersion: () => true,
      bumpLiveChannelCapabilities: vi.fn(),
      hydrateEchoFromApi: hydrate,
      refreshEchoSocialFromApi: vi.fn(async () => undefined),
      onWorkspaceInvalidated: onInv,
      debounceMs: 200,
    });

    handler({ kind: 'channel_tree_changed', version: '1' });
    expect(onInv).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(hydrate).toHaveBeenCalledTimes(1);
  });

  it('ECHO_WORKSPACE_SOCKET_REFRESH_KINDS covers expected strings', () => {
    expect(
      ECHO_WORKSPACE_SOCKET_REFRESH_KINDS.has('workspace_invalidated'),
    ).toBe(true);
    expect(
      ECHO_WORKSPACE_SOCKET_REFRESH_KINDS.has('channel_tree_changed'),
    ).toBe(true);
    expect(
      ECHO_WORKSPACE_SOCKET_REFRESH_KINDS.has('permission_invalidated'),
    ).toBe(true);
    expect(ECHO_WORKSPACE_SOCKET_REFRESH_KINDS.has('server_updated')).toBe(
      true,
    );
    expect(ECHO_WORKSPACE_SOCKET_REFRESH_KINDS.has('membership_changed')).toBe(
      true,
    );
  });
});

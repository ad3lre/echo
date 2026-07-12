import type { ChannelCategory } from '@/composables/useChannels';
import type { EchoChannelType } from '@shared/types';
import { describe, expect, it } from 'vitest';
import {
  channelExistsInRawCategories,
  getFirstTextChannelIdFromCategories,
  isGuildChannelTreeLoaded,
  isGuildRailContext,
  isGuildShellSettling,
} from './guildShellSettling';

describe('guildShellSettling', () => {
  it('isGuildRailContext is false for explore or echo server', () => {
    expect(isGuildRailContext('explore', 's1')).toBe(false);
    expect(isGuildRailContext('servers', 'echo')).toBe(false);
    expect(isGuildRailContext('servers', 'guild-1')).toBe(true);
  });

  it('isGuildChannelTreeLoaded requires own key on categoriesByServer', () => {
    expect(isGuildChannelTreeLoaded({}, 's1')).toBe(false);
    expect(isGuildChannelTreeLoaded({ s1: [] }, 's1')).toBe(true);
  });

  it('isGuildShellSettling during initial load in flight without cached tree', () => {
    expect(
      isGuildShellSettling({
        rail: 'servers',
        selectedServerId: 's1',
        activeChannelId: '',
        categoriesByServer: {},
        workspaceLoading: false,
        workspaceFromApi: true,
        initialLoadInFlight: true,
      }),
    ).toBe(true);
  });

  it('isGuildShellSettling false during initial load when cached tree and channel resolve', () => {
    const categories: Record<string, ChannelCategory[]> = {
      s1: [
        {
          id: 'cat',
          name: 'General',
          channels: [
            { id: 'ch1', name: 'chat', type: 'text' as EchoChannelType },
          ],
        },
      ],
    };
    expect(
      isGuildShellSettling({
        rail: 'servers',
        selectedServerId: 's1',
        activeChannelId: 'ch1',
        categoriesByServer: categories,
        workspaceLoading: false,
        workspaceFromApi: true,
        initialLoadInFlight: true,
      }),
    ).toBe(false);
  });

  it('isGuildShellSettling false when tree loaded empty and no channel to pick', () => {
    expect(
      isGuildShellSettling({
        rail: 'servers',
        selectedServerId: 's1',
        activeChannelId: '',
        categoriesByServer: { s1: [] },
        workspaceLoading: false,
        workspaceFromApi: true,
        initialLoadInFlight: false,
      }),
    ).toBe(false);
  });

  it('isGuildShellSettling keeps an empty guild tree loading during first hydrate', () => {
    expect(
      isGuildShellSettling({
        rail: 'servers',
        selectedServerId: 's1',
        activeChannelId: '',
        categoriesByServer: { s1: [] },
        workspaceLoading: false,
        workspaceFromApi: true,
        initialLoadInFlight: true,
      }),
    ).toBe(true);
  });

  it('isGuildShellSettling until active channel exists in tree', () => {
    const categories: Record<string, ChannelCategory[]> = {
      s1: [
        {
          id: 'cat',
          name: 'General',
          channels: [
            { id: 'ch1', name: 'chat', type: 'text' as EchoChannelType },
          ],
        },
      ],
    };
    expect(
      isGuildShellSettling({
        rail: 'servers',
        selectedServerId: 's1',
        activeChannelId: '',
        categoriesByServer: categories,
        workspaceLoading: false,
        workspaceFromApi: true,
        initialLoadInFlight: false,
      }),
    ).toBe(true);
    expect(channelExistsInRawCategories(categories.s1, 'ch1')).toBe(true);
    expect(
      isGuildShellSettling({
        rail: 'servers',
        selectedServerId: 's1',
        activeChannelId: 'ch1',
        categoriesByServer: categories,
        workspaceLoading: false,
        workspaceFromApi: true,
        initialLoadInFlight: false,
      }),
    ).toBe(false);
  });

  it('getFirstTextChannelIdFromCategories prefers text', () => {
    expect(
      getFirstTextChannelIdFromCategories([
        {
          channels: [
            { id: 'v1', type: 'voice' as EchoChannelType },
            { id: 't1', type: 'text' as EchoChannelType },
          ],
        },
      ]),
    ).toBe('t1');
  });
});

import { describe, expect, it } from 'vitest';
import {
  isServerEmptyOnboarding,
  shouldRetargetServerAfterServerDeletion,
  pickNextServerIdAfterDeletion,
  pickFirstGuildToBootstrap,
} from '../workspaceShellSelection';

describe('workspaceShellSelection', () => {
  describe('isServerEmptyOnboarding', () => {
    it('returns false if not on servers rail', () => {
      expect(
        isServerEmptyOnboarding({
          activeRailTab: 'explore',
          serverCount: 0,
          selectedServerId: 'server1',
          categoriesForServer: [],
        }),
      ).toBe(false);
    });

    it('returns true if server count is 0 on servers rail', () => {
      expect(
        isServerEmptyOnboarding({
          activeRailTab: 'servers',
          serverCount: 0,
          selectedServerId: null,
          categoriesForServer: [],
        }),
      ).toBe(true);
    });

    it('returns false when workspace is not ready (loading / failed sync)', () => {
      expect(
        isServerEmptyOnboarding({
          activeRailTab: 'servers',
          serverCount: 0,
          selectedServerId: null,
          categoriesForServer: [],
          workspaceReady: false,
        }),
      ).toBe(false);
    });

    it('returns false if selected server is null or echo', () => {
      expect(
        isServerEmptyOnboarding({
          activeRailTab: 'servers',
          serverCount: 1,
          selectedServerId: 'echo',
          categoriesForServer: [],
        }),
      ).toBe(false);
    });

    it('returns false when a server is selected but empty', () => {
      expect(
        isServerEmptyOnboarding({
          activeRailTab: 'servers',
          serverCount: 1,
          selectedServerId: 'server1',
          categoriesForServer: [],
        }),
      ).toBe(false);

      expect(
        isServerEmptyOnboarding({
          activeRailTab: 'servers',
          serverCount: 1,
          selectedServerId: 'server1',
          categoriesForServer: [{ id: 'cat1', name: 'Cat1', channels: [] }],
        }),
      ).toBe(false);
    });

    it('returns false if there is at least one channel', () => {
      expect(
        isServerEmptyOnboarding({
          activeRailTab: 'servers',
          serverCount: 1,
          selectedServerId: 'server1',
          categoriesForServer: [
            { id: 'cat1', name: 'Cat1', channels: [] },
            {
              id: 'cat2',
              name: 'Cat2',
              channels: [{ id: 'ch1', name: 'general', type: 'text' }],
            },
          ],
        }),
      ).toBe(false);
    });
  });

  describe('shouldRetargetServerAfterServerDeletion', () => {
    it('returns true if the deleted server was selected', () => {
      expect(
        shouldRetargetServerAfterServerDeletion('server1', 'server1', []),
      ).toBe(true);
    });

    it('returns true if selected server is no longer in remaining servers', () => {
      expect(
        shouldRetargetServerAfterServerDeletion('server1', 'server2', [
          'server3',
        ]),
      ).toBe(true);
    });

    it('returns false if selected server is still in remaining servers', () => {
      expect(
        shouldRetargetServerAfterServerDeletion('server1', 'server2', [
          'server2',
        ]),
      ).toBe(false);
    });
  });

  describe('pickNextServerIdAfterDeletion', () => {
    it('returns preferred guild if available', () => {
      expect(pickNextServerIdAfterDeletion(['server1'], () => 'pref1')).toBe(
        'pref1',
      );
    });

    it('returns first remaining server if no preferred guild', () => {
      expect(pickNextServerIdAfterDeletion(['server1'], () => null)).toBe(
        'server1',
      );
    });

    it('returns echo if no remaining servers', () => {
      expect(pickNextServerIdAfterDeletion([], () => null)).toBe('echo');
    });
  });

  describe('pickFirstGuildToBootstrap', () => {
    it('returns preferred guild if available', () => {
      expect(
        pickFirstGuildToBootstrap([{ id: 'server1' }], () => 'pref1'),
      ).toBe('pref1');
    });

    it('returns first server if no preferred guild', () => {
      expect(
        pickFirstGuildToBootstrap(
          [{ id: 'server1' }, { id: 'server2' }],
          () => null,
        ),
      ).toBe('server1');
    });

    it('returns null if no servers', () => {
      expect(pickFirstGuildToBootstrap([], () => null)).toBe(null);
    });
  });
});

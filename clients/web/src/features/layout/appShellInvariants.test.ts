import { describe, expect, it } from 'vitest';
import { collectShellInvariantIssues } from './appShellInvariants';
import type { MainSurface, NavState } from './mainSurface';

describe('collectShellInvariantIssues', () => {
  it('empty when server text matches nav', () => {
    const nav: NavState = {
      rail: 'servers',
      dmSubView: 'messages',
      activeChannelId: 'c1',
      selectedServerId: 's1',
    };
    const surface: MainSurface = { type: 'serverText', channelId: 'c1' };
    expect(collectShellInvariantIssues({ mainSurface: surface, nav })).toEqual(
      [],
    );
  });

  it('flags server surface vs wrong activeChannelId', () => {
    const nav: NavState = {
      rail: 'servers',
      dmSubView: 'messages',
      activeChannelId: 'c2',
      selectedServerId: 's1',
    };
    const surface: MainSurface = { type: 'serverText', channelId: 'c1' };
    const issues = collectShellInvariantIssues({ mainSurface: surface, nav });
    expect(issues.some((i) => i.code === 'server_surface_nav_mismatch')).toBe(
      true,
    );
  });
});

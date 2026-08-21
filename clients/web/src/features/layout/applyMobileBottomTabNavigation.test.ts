import { describe, expect, it } from 'vitest';
import { planMobileBottomTabNavigation } from '@/features/layout/applyMobileBottomTabNavigation';

describe('planMobileBottomTabNavigation', () => {
  it('servers tab selects servers rail and resets stack to list when no channel', () => {
    const plan = planMobileBottomTabNavigation('servers', {
      activeRailTab: 'dm',
      isDmThreadSurface: true,
      selectedServerId: null,
      activeChannelId: '',
      mobileServersStack: 'list',
    });

    expect(plan.invokeSelectServersTab).toBe(true);
    expect(plan.invokeSelectDmTab).toBe(false);
    expect(plan.mobileServersStack).toBe('list');
    expect(plan.mobileHomeStack).toBeUndefined();
  });

  it('servers tab opens guild when server and channel are selected', () => {
    const plan = planMobileBottomTabNavigation('servers', {
      activeRailTab: 'servers',
      isDmThreadSurface: false,
      selectedServerId: 'srv-1',
      activeChannelId: 'ch-1',
      mobileServersStack: 'list',
    });

    expect(plan.invokeSelectServersTab).toBe(false);
    expect(plan.mobileServersStack).toBe('guild');
  });

  it('home tab lands on thread when DM thread surface is active', () => {
    const plan = planMobileBottomTabNavigation('home', {
      activeRailTab: 'dm',
      isDmThreadSurface: true,
      selectedServerId: null,
      activeChannelId: 'dm-1',
      mobileServersStack: 'list',
    });

    expect(plan.invokeSelectDmTab).toBe(true);
    expect(plan.mobileHomeStack).toBe('thread');
  });
});

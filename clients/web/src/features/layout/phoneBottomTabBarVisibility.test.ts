import { describe, expect, it } from 'vitest';
import { shouldShowPhoneBottomTabBar } from './phoneBottomTabBarVisibility';

const base = {
  mobileBottomTab: 'home' as const,
  mobileHomeStack: 'hub' as const,
  mobileServersStack: 'list' as const,
  mobileChannelSheetOpen: false,
  mobileMembersOverlayOpen: false,
};

describe('shouldShowPhoneBottomTabBar', () => {
  it('shows on Home hub (DM inbox / friends lists)', () => {
    expect(shouldShowPhoneBottomTabBar(base)).toBe(true);
  });

  it('hides on Home DM thread chat', () => {
    expect(
      shouldShowPhoneBottomTabBar({ ...base, mobileHomeStack: 'thread' }),
    ).toBe(false);
  });

  it('shows on Servers list', () => {
    expect(
      shouldShowPhoneBottomTabBar({
        ...base,
        mobileBottomTab: 'servers',
      }),
    ).toBe(true);
  });

  it('hides on guild chat surface', () => {
    expect(
      shouldShowPhoneBottomTabBar({
        ...base,
        mobileBottomTab: 'servers',
        mobileServersStack: 'guild',
      }),
    ).toBe(false);
  });

  it('shows on guild chat when channel or members list overlay is open', () => {
    expect(
      shouldShowPhoneBottomTabBar({
        ...base,
        mobileBottomTab: 'servers',
        mobileServersStack: 'guild',
        mobileChannelSheetOpen: true,
      }),
    ).toBe(true);
    expect(
      shouldShowPhoneBottomTabBar({
        ...base,
        mobileBottomTab: 'servers',
        mobileServersStack: 'guild',
        mobileMembersOverlayOpen: true,
      }),
    ).toBe(true);
  });

  it('shows on Explore', () => {
    expect(
      shouldShowPhoneBottomTabBar({
        ...base,
        mobileBottomTab: 'explore',
      }),
    ).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  planMobileShellBack,
  type MobileShellBackSnapshot,
} from '@/features/layout/mobileShellBackReducer';

const phoneIdle: Pick<
  MobileShellBackSnapshot,
  | 'useCompactPhoneTabShell'
  | 'mobileBottomTab'
  | 'mobileHomeStack'
  | 'mobileServersStack'
  | 'mobileChannelSheetOpen'
  | 'mobileMembersOverlayOpen'
> = {
  useCompactPhoneTabShell: false,
  mobileBottomTab: 'home',
  mobileHomeStack: 'hub',
  mobileServersStack: 'list',
  mobileChannelSheetOpen: false,
  mobileMembersOverlayOpen: false,
};

describe('planMobileShellBack', () => {
  it('desktop compact off: servers rail only', () => {
    expect(
      planMobileShellBack(
        {
          ...phoneIdle,
          useCompactTriPaneShell: false,
          useCompactGuildSplitShell: false,
          memberPanelCollapsed: true,
          useCompactExploreShell: false,
          useCompactDmShell: false,
          useCompactStackShell: false,
          isExploreView: false,
          compactPagerPane: 1,
          compactExplorePane: 0,
          compactDmPane: 0,
          compactGuildTriPaneChannelPanelOpen: false,
        },
        { isCompactShell: false, historyLength: 3 },
      ),
    ).toEqual({ kind: 'noop_desktop', action: 'servers_rail_only' });
  });

  it('phone tab: home thread -> hub', () => {
    expect(
      planMobileShellBack(
        {
          ...phoneIdle,
          useCompactPhoneTabShell: true,
          mobileHomeStack: 'thread',
          useCompactTriPaneShell: false,
          useCompactGuildSplitShell: false,
          memberPanelCollapsed: true,
          useCompactExploreShell: false,
          useCompactDmShell: false,
          useCompactStackShell: false,
          isExploreView: false,
          compactPagerPane: 1,
          compactExplorePane: 0,
          compactDmPane: 0,
          compactGuildTriPaneChannelPanelOpen: false,
        },
        { isCompactShell: true, historyLength: 3 },
      ),
    ).toEqual({ kind: 'phone_home_thread' });
  });

  it('phone tab: servers guild -> list', () => {
    expect(
      planMobileShellBack(
        {
          ...phoneIdle,
          useCompactPhoneTabShell: true,
          mobileBottomTab: 'servers',
          mobileServersStack: 'guild',
          useCompactTriPaneShell: false,
          useCompactGuildSplitShell: false,
          memberPanelCollapsed: true,
          useCompactExploreShell: false,
          useCompactDmShell: false,
          useCompactStackShell: false,
          isExploreView: false,
          compactPagerPane: 1,
          compactExplorePane: 0,
          compactDmPane: 0,
          compactGuildTriPaneChannelPanelOpen: false,
        },
        { isCompactShell: true, historyLength: 3 },
      ),
    ).toEqual({ kind: 'phone_servers_guild' });
  });

  it('phone tab: channel sheet -> close sheet', () => {
    expect(
      planMobileShellBack(
        {
          ...phoneIdle,
          useCompactPhoneTabShell: true,
          mobileBottomTab: 'servers',
          mobileServersStack: 'guild',
          mobileChannelSheetOpen: true,
          useCompactTriPaneShell: false,
          useCompactGuildSplitShell: false,
          memberPanelCollapsed: true,
          useCompactExploreShell: false,
          useCompactDmShell: false,
          useCompactStackShell: false,
          isExploreView: false,
          compactPagerPane: 1,
          compactExplorePane: 0,
          compactDmPane: 0,
          compactGuildTriPaneChannelPanelOpen: false,
        },
        { isCompactShell: true, historyLength: 3 },
      ),
    ).toEqual({ kind: 'phone_channel_sheet' });
  });

  it('tri-pane: members -> chat', () => {
    expect(
      planMobileShellBack(
        {
          ...phoneIdle,
          useCompactTriPaneShell: true,
          useCompactGuildSplitShell: false,
          memberPanelCollapsed: true,
          useCompactExploreShell: false,
          useCompactDmShell: false,
          useCompactStackShell: false,
          isExploreView: false,
          compactPagerPane: 2,
          compactExplorePane: 0,
          compactDmPane: 0,
          compactGuildTriPaneChannelPanelOpen: false,
        },
        { isCompactShell: true, historyLength: 3 },
      ),
    ).toEqual({ kind: 'tri_pane_pager', next: 1 });
  });

  it('tri-pane: channels + stack open -> collapse stack', () => {
    expect(
      planMobileShellBack(
        {
          ...phoneIdle,
          useCompactTriPaneShell: true,
          useCompactGuildSplitShell: false,
          memberPanelCollapsed: true,
          useCompactExploreShell: false,
          useCompactDmShell: false,
          useCompactStackShell: false,
          isExploreView: false,
          compactPagerPane: 0,
          compactExplorePane: 0,
          compactDmPane: 0,
          compactGuildTriPaneChannelPanelOpen: true,
        },
        { isCompactShell: true, historyLength: 3 },
      ),
    ).toEqual({ kind: 'tri_pane_collapse_channel_stack' });
  });

  it('explore dual: main -> rail', () => {
    expect(
      planMobileShellBack(
        {
          ...phoneIdle,
          useCompactTriPaneShell: false,
          useCompactGuildSplitShell: false,
          memberPanelCollapsed: true,
          useCompactExploreShell: true,
          useCompactDmShell: false,
          useCompactStackShell: false,
          isExploreView: true,
          compactPagerPane: 1,
          compactExplorePane: 0,
          compactDmPane: 0,
          compactGuildTriPaneChannelPanelOpen: false,
        },
        { isCompactShell: true, historyLength: 3 },
      ),
    ).toEqual({ kind: 'explore_pane', next: 1 });
  });

  it('explore dual: rail + no history -> servers rail', () => {
    expect(
      planMobileShellBack(
        {
          ...phoneIdle,
          useCompactTriPaneShell: false,
          useCompactGuildSplitShell: false,
          memberPanelCollapsed: true,
          useCompactExploreShell: true,
          useCompactDmShell: false,
          useCompactStackShell: false,
          isExploreView: true,
          compactPagerPane: 1,
          compactExplorePane: 1,
          compactDmPane: 0,
          compactGuildTriPaneChannelPanelOpen: false,
        },
        { isCompactShell: true, historyLength: 1 },
      ),
    ).toEqual({ kind: 'servers_rail_only' });
  });

  it('DM dual: chat -> rail', () => {
    expect(
      planMobileShellBack(
        {
          ...phoneIdle,
          useCompactTriPaneShell: false,
          useCompactGuildSplitShell: false,
          memberPanelCollapsed: true,
          useCompactExploreShell: false,
          useCompactDmShell: true,
          useCompactStackShell: false,
          isExploreView: false,
          compactPagerPane: 1,
          compactExplorePane: 0,
          compactDmPane: 0,
          compactGuildTriPaneChannelPanelOpen: false,
        },
        { isCompactShell: true, historyLength: 3 },
      ),
    ).toEqual({ kind: 'dm_pane', next: 1 });
  });

  it('guild split: members open -> collapse members', () => {
    expect(
      planMobileShellBack(
        {
          ...phoneIdle,
          useCompactTriPaneShell: false,
          useCompactGuildSplitShell: true,
          memberPanelCollapsed: false,
          useCompactExploreShell: false,
          useCompactDmShell: false,
          useCompactStackShell: false,
          isExploreView: false,
          compactPagerPane: 1,
          compactExplorePane: 0,
          compactDmPane: 0,
          compactGuildTriPaneChannelPanelOpen: false,
        },
        { isCompactShell: true, historyLength: 3 },
      ),
    ).toEqual({ kind: 'split_collapse_members' });
  });

  it('DM dual: rail -> close dm panel', () => {
    expect(
      planMobileShellBack(
        {
          ...phoneIdle,
          useCompactTriPaneShell: false,
          useCompactGuildSplitShell: false,
          memberPanelCollapsed: true,
          useCompactExploreShell: false,
          useCompactDmShell: true,
          useCompactStackShell: false,
          isExploreView: false,
          compactPagerPane: 1,
          compactExplorePane: 0,
          compactDmPane: 1,
          compactGuildTriPaneChannelPanelOpen: false,
        },
        { isCompactShell: true, historyLength: 3 },
      ),
    ).toEqual({ kind: 'close_dm_panel' });
  });
});

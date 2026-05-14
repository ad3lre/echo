import { describe, expect, it } from 'vitest';
import {
  deriveHasGuildChannelChrome,
  deriveMainSurface,
  type DeriveContext,
  type MainSurface,
  type NavState,
} from './mainSurface';

const ctxNoOnboarding = (
  getInfo: DeriveContext['getServerChannelInfo'],
): DeriveContext => ({
  isServerEmptyOnboarding: false,
  getServerChannelInfo: getInfo,
});

describe('deriveMainSurface', () => {
  it('DM rail + friends => dmFriends (panel open state must not matter)', () => {
    const nav: NavState = {
      rail: 'dm',
      dmSubView: 'friends',
      activeChannelId: 'general',
      selectedServerId: 'srv-1',
    };
    expect(
      deriveMainSurface(
        nav,
        ctxNoOnboarding(() => ({ type: 'text' })),
      ),
    ).toEqual({ type: 'dmFriends' });
  });

  it('DM rail + notifications => dmNotifications', () => {
    const nav: NavState = {
      rail: 'dm',
      dmSubView: 'notifications',
      activeChannelId: 'general',
      selectedServerId: 'srv-1',
    };
    expect(
      deriveMainSurface(
        nav,
        ctxNoOnboarding(() => ({ type: 'text' })),
      ),
    ).toEqual({ type: 'dmNotifications' });
  });

  it('DM rail + messages + pending message request => dmRequests before DM thread', () => {
    const nav: NavState = {
      rail: 'dm',
      dmSubView: 'messages',
      activeChannelId: '1234567890123456789',
      selectedServerId: 'srv-1',
    };
    const ctx: DeriveContext = {
      isServerEmptyOnboarding: false,
      getServerChannelInfo: () => null,
      isPersistedEchoDmThread: (id) => id === '1234567890123456789',
      selectedMessageRequestId: 'req-1',
    };
    expect(deriveMainSurface(nav, ctx)).toEqual({ type: 'dmRequests' });
  });

  it('DM rail + messages + dm thread id => dmThread', () => {
    const nav: NavState = {
      rail: 'dm',
      dmSubView: 'messages',
      activeChannelId: 'dm-u2',
      selectedServerId: 'srv-1',
    };
    expect(
      deriveMainSurface(
        nav,
        ctxNoOnboarding(() => null),
      ),
    ).toEqual({
      type: 'dmThread',
      threadId: 'dm-u2',
    });
  });

  it('DM rail + messages + persisted Echo DM snowflake => dmThread', () => {
    const nav: NavState = {
      rail: 'dm',
      dmSubView: 'messages',
      activeChannelId: '1234567890123456789',
      selectedServerId: 'srv-1',
    };
    const ctx: DeriveContext = {
      isServerEmptyOnboarding: false,
      getServerChannelInfo: () => null,
      isPersistedEchoDmThread: (id) => id === '1234567890123456789',
    };
    expect(deriveMainSurface(nav, ctx)).toEqual({
      type: 'dmThread',
      threadId: '1234567890123456789',
    });
  });

  it('DM rail + messages + group dm => dmThread', () => {
    const nav: NavState = {
      rail: 'dm',
      dmSubView: 'messages',
      activeChannelId: 'dm-group-abc',
      selectedServerId: 'srv-1',
    };
    expect(
      deriveMainSurface(
        nav,
        ctxNoOnboarding(() => null),
      ),
    ).toEqual({
      type: 'dmThread',
      threadId: 'dm-group-abc',
    });
  });

  it('DM rail + messages + server channel id still selected => dmMessagesIdle not server chat', () => {
    const nav: NavState = {
      rail: 'dm',
      dmSubView: 'messages',
      activeChannelId: 'general',
      selectedServerId: 'srv-1',
    };
    expect(
      deriveMainSurface(
        nav,
        ctxNoOnboarding(() => ({ type: 'text' })),
      ),
    ).toEqual({ type: 'dmMessagesIdle' });
  });

  it('explore rail => explore', () => {
    const nav: NavState = {
      rail: 'explore',
      dmSubView: 'messages',
      activeChannelId: 'general',
      selectedServerId: null,
    };
    expect(
      deriveMainSurface(
        nav,
        ctxNoOnboarding(() => ({ type: 'text' })),
      ),
    ).toEqual({ type: 'explore' });
  });

  it('servers rail + text channel => serverText', () => {
    const nav: NavState = {
      rail: 'servers',
      dmSubView: 'messages',
      activeChannelId: 'ch-1',
      selectedServerId: 'srv-1',
    };
    expect(
      deriveMainSurface(
        nav,
        ctxNoOnboarding((id) => (id === 'ch-1' ? { type: 'text' } : null)),
      ),
    ).toEqual({
      type: 'serverText',
      channelId: 'ch-1',
    });
  });

  it('servers rail + voice channel => serverVoice', () => {
    const nav: NavState = {
      rail: 'servers',
      dmSubView: 'messages',
      activeChannelId: 'vc-1',
      selectedServerId: 'srv-1',
    };
    expect(
      deriveMainSurface(
        nav,
        ctxNoOnboarding((id) => (id === 'vc-1' ? { type: 'voice' } : null)),
      ),
    ).toEqual({
      type: 'serverVoice',
      channelId: 'vc-1',
    });
  });

  it('servers rail + no resolvable channel id => serverText empty shell', () => {
    const nav: NavState = {
      rail: 'servers',
      dmSubView: 'messages',
      activeChannelId: '',
      selectedServerId: 'srv-1',
    };
    expect(
      deriveMainSurface(
        nav,
        ctxNoOnboarding(() => null),
      ),
    ).toEqual({
      type: 'serverText',
      channelId: '',
    });
  });

  it('servers rail + DM thread id still selected => dmThread not server chat', () => {
    const nav: NavState = {
      rail: 'servers',
      dmSubView: 'messages',
      activeChannelId: 'dm-u2',
      selectedServerId: 'srv-1',
    };
    expect(
      deriveMainSurface(
        nav,
        ctxNoOnboarding(() => ({ type: 'text' })),
      ),
    ).toEqual({
      type: 'dmThread',
      threadId: 'dm-u2',
    });
  });

  it('servers rail + empty onboarding flag => serverEmptyOnboarding', () => {
    const nav: NavState = {
      rail: 'servers',
      dmSubView: 'messages',
      activeChannelId: 'general',
      selectedServerId: 'srv-1',
    };
    const ctx: DeriveContext = {
      isServerEmptyOnboarding: true,
      getServerChannelInfo: () => ({ type: 'text' }),
    };
    expect(deriveMainSurface(nav, ctx)).toEqual({
      type: 'serverEmptyOnboarding',
    });
  });
});

describe('deriveHasGuildChannelChrome', () => {
  const t = (surface: MainSurface, expected: boolean) =>
    expect(deriveHasGuildChannelChrome(surface)).toBe(expected);

  it('true for server text and voice surfaces', () => {
    t({ type: 'serverText', channelId: 'c1' }, true);
    t({ type: 'serverVoice', channelId: 'c1' }, true);
    t({ type: 'serverForum', forumChannelId: 'c1' }, true);
  });

  it('false for non-guild main surfaces', () => {
    t({ type: 'explore' }, false);
    t({ type: 'dmFriends' }, false);
    t({ type: 'dmNotifications' }, false);
    t({ type: 'dmRequests' }, false);
    t({ type: 'dmMessagesIdle' }, false);
    t({ type: 'dmThread', threadId: 'dm-x' }, false);
    t({ type: 'unknown', reason: 'x', channelId: '' }, false);
    t({ type: 'serverEmptyOnboarding' }, false);
  });
});

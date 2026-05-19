import { describe, expect, it } from 'vitest';
import { resolveSendTarget, resolvedSendChannelId } from './resolveSendTarget';
import type { MainSurface, NavState } from './mainSurface';

const nav = (activeChannelId: string): NavState => ({
  rail: 'servers',
  dmSubView: 'messages',
  activeChannelId,
  selectedServerId: 'srv-1',
});

describe('resolveSendTarget', () => {
  it('dmFriends => none', () => {
    const surface: MainSurface = { type: 'dmFriends' };
    expect(resolveSendTarget(surface, nav('general'))).toEqual({
      type: 'none',
      reason: 'dmFriends',
    });
    expect(resolvedSendChannelId(surface, nav('general'))).toBeNull();
  });

  it('dmNotifications => none', () => {
    const surface: MainSurface = { type: 'dmNotifications' };
    expect(resolveSendTarget(surface, nav('general'))).toEqual({
      type: 'none',
      reason: 'dmNotifications',
    });
    expect(resolvedSendChannelId(surface, nav('general'))).toBeNull();
  });

  it('dmThread => channel with threadId', () => {
    const surface: MainSurface = { type: 'dmThread', threadId: 'dm-u1' };
    expect(resolveSendTarget(surface, nav('dm-u1'))).toEqual({
      type: 'channel',
      channelId: 'dm-u1',
    });
  });

  it('serverText => channel', () => {
    const surface: MainSurface = { type: 'serverText', channelId: 'ch-1' };
    expect(resolveSendTarget(surface, nav('ch-1'))).toEqual({
      type: 'channel',
      channelId: 'ch-1',
    });
  });

  it('serverVoice => channel', () => {
    const surface: MainSurface = { type: 'serverVoice', channelId: 'vc-1' };
    expect(resolveSendTarget(surface, nav('vc-1'))).toEqual({
      type: 'channel',
      channelId: 'vc-1',
    });
  });

  it('explore => none', () => {
    const surface: MainSurface = { type: 'explore' };
    expect(resolveSendTarget(surface, nav('general')).type).toBe('none');
  });

  it('serverEmptyOnboarding => channel from nav when not dm id', () => {
    const surface: MainSurface = { type: 'serverEmptyOnboarding' };
    expect(resolveSendTarget(surface, nav('general'))).toEqual({
      type: 'channel',
      channelId: 'general',
    });
  });

  it('serverEmptyOnboarding => none when nav is dm thread id', () => {
    const surface: MainSurface = { type: 'serverEmptyOnboarding' };
    expect(resolveSendTarget(surface, nav('dm-u1')).type).toBe('none');
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  getOutgoingBlockReasonForShellAttempt,
  isSendChannelShapeConsistentWithSurface,
  validateSendChannelForSurface,
} from './sendSurfaceContract';
import type { MainSurface, NavState } from './mainSurface';

const nav = (activeChannelId: string): NavState => ({
  rail: 'servers',
  dmSubView: 'messages',
  activeChannelId,
  selectedServerId: 'srv-1',
});

describe('validateSendChannelForSurface', () => {
  it('dmFriends + any channelId => not ok', () => {
    const surface: MainSurface = { type: 'dmFriends' };
    expect(
      validateSendChannelForSurface(surface, 'general', nav('general')).ok,
    ).toBe(false);
  });

  it('dmThread + matching thread => ok', () => {
    const surface: MainSurface = { type: 'dmThread', threadId: 'dm-u1' };
    expect(
      validateSendChannelForSurface(surface, 'dm-u1', nav('dm-u1')),
    ).toEqual({ ok: true });
  });

  it('dmThread + wrong id => not ok', () => {
    const surface: MainSurface = { type: 'dmThread', threadId: 'dm-u1' };
    expect(
      validateSendChannelForSurface(surface, 'dm-u2', nav('dm-u1')).ok,
    ).toBe(false);
  });

  it('serverText + server channel => ok', () => {
    const surface: MainSurface = { type: 'serverText', channelId: 'ch-1' };
    expect(validateSendChannelForSurface(surface, 'ch-1', nav('ch-1'))).toEqual(
      { ok: true },
    );
  });

  it('serverText + dm id => not ok', () => {
    const surface: MainSurface = { type: 'serverText', channelId: 'ch-1' };
    expect(
      validateSendChannelForSurface(surface, 'dm-u1', nav('ch-1')).ok,
    ).toBe(false);
  });
});

describe('getOutgoingBlockReasonForShellAttempt', () => {
  it('delegates to inner gate with same channelId', () => {
    const inner = vi.fn(() => 'blocked');
    const out = getOutgoingBlockReasonForShellAttempt(inner, {
      surface: { type: 'serverText', channelId: 'c1' },
      nav: nav('c1'),
      channelId: 'c1',
      contentTypes: ['text'],
    });
    expect(out).toBe('blocked');
    expect(inner).toHaveBeenCalledWith({
      channelId: 'c1',
      contentTypes: ['text'],
      context: { source: 'shell_executeSend' },
    });
  });
});

describe('isSendChannelShapeConsistentWithSurface', () => {
  it.each<[MainSurface, string, boolean]>([
    [{ type: 'dmFriends' }, 'general', false],
    [{ type: 'dmNotifications' }, 'general', false],
    [{ type: 'dmThread', threadId: 'dm-x' }, 'dm-x', true],
    [{ type: 'dmThread', threadId: 'dm-x' }, 'ch-1', false],
    [{ type: 'serverText', channelId: 'c1' }, 'c1', true],
    [{ type: 'serverText', channelId: 'c1' }, 'dm-u1', false],
    [{ type: 'serverVoice', channelId: 'v1' }, 'v1', true],
    [{ type: 'serverEmptyOnboarding' }, 'general', true],
    [{ type: 'serverEmptyOnboarding' }, 'dm-u1', false],
  ])('surface %j channel %s => %s', (surface, channelId, expected) => {
    expect(isSendChannelShapeConsistentWithSurface(surface, channelId)).toBe(
      expected,
    );
  });
});

import { describe, expect, it } from 'vitest';
import {
  shouldApplyRemoteChannelTyping,
  type RemoteChannelTypingPayload,
} from '@/features/layout/realtime/socketChannelTypingIngest';

describe('shouldApplyRemoteChannelTyping', () => {
  const p: RemoteChannelTypingPayload = {
    channelId: 'c1',
    userId: 'u1',
    displayName: 'a',
    avatarUrl: '',
  };

  it('rejects missing channel or user', () => {
    expect(shouldApplyRemoteChannelTyping(undefined, undefined)).toBe(false);
    expect(shouldApplyRemoteChannelTyping({ ...p, channelId: '' }, 'me')).toBe(
      false,
    );
    expect(shouldApplyRemoteChannelTyping({ ...p, userId: '' }, 'me')).toBe(
      false,
    );
  });

  it('rejects self', () => {
    expect(shouldApplyRemoteChannelTyping(p, 'u1')).toBe(false);
  });

  it('accepts other users', () => {
    expect(shouldApplyRemoteChannelTyping(p, 'u2')).toBe(true);
    expect(shouldApplyRemoteChannelTyping(p, undefined)).toBe(true);
  });
});

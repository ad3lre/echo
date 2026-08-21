import { describe, expect, it } from 'vitest';
import { decideMessageListChannelWarm } from './messageListWarmCold';

describe('decideMessageListChannelWarm', () => {
  it('is cold when window still belongs to the previous channel', () => {
    const d = decideMessageListChannelWarm({
      channelId: 'ch-b',
      windowChannelId: 'ch-a',
      orderedIds: ['m1', 'm2', 'm3'],
      savedViewport: null,
    });
    expect(d.warm).toBe(false);
    expect(d.reason).toBe('window_channel_mismatch');
  });

  it('is cold when the window is empty', () => {
    const d = decideMessageListChannelWarm({
      channelId: 'ch-a',
      windowChannelId: 'ch-a',
      orderedIds: [],
      savedViewport: null,
    });
    expect(d.warm).toBe(false);
    expect(d.reason).toBe('empty_window');
  });

  it('is cold when mid-history memory anchor is not in the window', () => {
    const d = decideMessageListChannelWarm({
      channelId: 'ch-a',
      windowChannelId: 'ch-a',
      orderedIds: ['m1', 'm2'],
      savedViewport: {
        anchorMessageId: 'm-missing',
        anchorTop: 12,
        followNewMessages: false,
        updatedAt: 1,
      },
    });
    expect(d.warm).toBe(false);
    expect(d.reason).toBe('mid_history_anchor_missing');
  });

  it('is warm when follow-tail with a usable window', () => {
    const d = decideMessageListChannelWarm({
      channelId: 'ch-a',
      windowChannelId: 'ch-a',
      orderedIds: ['m1', 'm2', 'm3'],
      savedViewport: {
        anchorMessageId: 'm3',
        anchorTop: 0,
        followNewMessages: true,
        updatedAt: 1,
      },
    });
    expect(d.warm).toBe(true);
    expect(d.reason).toBe('warm_follow_tail');
  });

  it('is warm when mid-history anchor is present', () => {
    const d = decideMessageListChannelWarm({
      channelId: 'ch-a',
      windowChannelId: 'ch-a',
      orderedIds: ['m1', 'm2', 'm3'],
      savedViewport: {
        anchorMessageId: 'm2',
        anchorTop: 40,
        followNewMessages: false,
        updatedAt: 1,
      },
    });
    expect(d.warm).toBe(true);
    expect(d.reason).toBe('warm_anchor_in_window');
  });
});

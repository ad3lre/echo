import { describe, expect, it, vi } from 'vitest';
import {
  MessageNavigator,
  resolveAndScroll,
  MESSAGE_NAVIGATOR_MAX_RETRY_ATTEMPTS,
} from './messageNavigator';

describe('MessageNavigator', () => {
  it('returns ok when memory strategy finds message and scroll succeeds', async () => {
    const scrollToMessage = vi.fn().mockResolvedValue(true);
    const flashHighlight = vi.fn();
    const result = await resolveAndScroll({
      channelId: 'c1',
      messageId: 'm1',
      strategy: ['memory', 'retry-dom'],
      deps: {
        getChannelMessages: () => [{ id: 'm1' }],
        activeChannelId: () => 'c1',
        scrollToMessage,
        flashHighlight,
      },
    });
    expect(result).toEqual({ ok: true });
    expect(scrollToMessage).toHaveBeenCalledWith('c1', 'm1');
    expect(flashHighlight).toHaveBeenCalledWith('m1');
  });

  it('invokes prefetch then scroll when memory misses first', async () => {
    const lists: Record<string, { id: string }[]> = { c1: [] };
    const prefetchMessage = vi.fn().mockImplementation(async () => {
      lists.c1 = [{ id: 'm1' }];
    });
    const scrollToMessage = vi.fn().mockResolvedValue(true);
    const result = await MessageNavigator.resolveAndScroll({
      channelId: 'c1',
      messageId: 'm1',
      strategy: ['memory', 'fetch', 'paginate', 'retry-dom'],
      deps: {
        getChannelMessages: (cid) => lists[cid] ?? [],
        activeChannelId: () => 'c1',
        scrollToMessage,
        prefetchMessage,
        flashHighlight: vi.fn(),
      },
    });
    expect(result).toEqual({ ok: true });
    expect(prefetchMessage).toHaveBeenCalledWith('c1', 'm1');
    expect(scrollToMessage).toHaveBeenCalled();
  });

  it('retry-dom succeeds within cap when scroll eventually works', async () => {
    let calls = 0;
    const scrollToMessage = vi.fn().mockImplementation(async () => {
      calls += 1;
      return calls >= 2;
    });
    const result = await resolveAndScroll({
      channelId: 'c1',
      messageId: 'm1',
      strategy: ['memory', 'retry-dom'],
      deps: {
        getChannelMessages: () => [{ id: 'm1' }],
        activeChannelId: () => 'c1',
        scrollToMessage,
      },
    });
    expect(result).toEqual({ ok: true });
    expect(scrollToMessage.mock.calls.length).toBeLessThanOrEqual(
      MESSAGE_NAVIGATOR_MAX_RETRY_ATTEMPTS + 1,
    );
  });

  it('returns message_not_found when message never appears', async () => {
    const result = await resolveAndScroll({
      channelId: 'c1',
      messageId: 'missing',
      strategy: ['memory', 'retry-dom'],
      deps: {
        getChannelMessages: () => [],
        activeChannelId: () => 'c1',
        scrollToMessage: vi.fn().mockResolvedValue(false),
      },
    });
    expect(result).toEqual({ ok: false, reason: 'message_not_found' });
  });
});

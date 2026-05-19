// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { effectScope, nextTick } from 'vue';
import { useEchoAttentionStore } from '@/stores/echoAttention';
import { useBrowserTabAttention } from './useBrowserTabAttention';

describe('useBrowserTabAttention', () => {
  const originalTitle = 'Echo';
  let restoreHead: string;

  beforeEach(() => {
    setActivePinia(createPinia());
    restoreHead = document.head.innerHTML;
    document.head.innerHTML =
      '<link rel="icon" type="image/png" href="/echo-rounded-logo.png">';
    document.title = originalTitle;
  });

  afterEach(() => {
    document.head.innerHTML = restoreHead;
    document.title = originalTitle;
  });

  it('switches title and favicon to ping state and restores when cleared', async () => {
    const scope = effectScope();
    const store = useEchoAttentionStore();
    scope.run(() => useBrowserTabAttention());

    store.replaceSnapshot({
      channelAttentionByChannelId: {
        ch1: {
          channelId: 'ch1',
          kind: 'server',
          serverId: 'srv1',
          unreadCount: 1,
          pingKind: 'personal',
          lastReadMessageId: null,
        },
      },
      serverAttentionByServerId: {
        srv1: { unread: true, pingKind: 'personal' },
      },
      serverNotificationLevelByServerId: {},
    });
    await nextTick();

    const icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    expect(document.title).toBe('Echo (Ping)');
    expect(icon?.getAttribute('href')).toBe('/favicon-ping.svg');

    store.replaceSnapshot({
      channelAttentionByChannelId: {},
      serverAttentionByServerId: {},
      serverNotificationLevelByServerId: {},
    });
    await nextTick();

    expect(document.title).toBe(originalTitle);
    expect(icon?.getAttribute('href')).toBe('/echo-rounded-logo.png');
    scope.stop();
  });

  it('uses ping title when a DM has mention-tier unread', async () => {
    const scope = effectScope();
    const store = useEchoAttentionStore();
    scope.run(() => useBrowserTabAttention());

    store.replaceSnapshot({
      channelAttentionByChannelId: {
        dm1: {
          channelId: 'dm1',
          kind: 'dm',
          unreadCount: 1,
          pingKind: 'personal',
          lastReadMessageId: null,
          latestUnreadMessageId: '900',
        },
      },
      serverAttentionByServerId: {},
      serverNotificationLevelByServerId: {},
    });
    await nextTick();

    const icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    expect(document.title).toBe('Echo (Ping)');
    expect(icon?.getAttribute('href')).toBe('/favicon-ping.svg');

    scope.stop();
  });

  it('keeps default title and favicon for unread without ping', async () => {
    const scope = effectScope();
    const store = useEchoAttentionStore();
    scope.run(() => useBrowserTabAttention());

    store.replaceSnapshot({
      channelAttentionByChannelId: {
        ch2: {
          channelId: 'ch2',
          kind: 'dm',
          unreadCount: 2,
          lastReadMessageId: null,
          latestUnreadMessageId: '200',
        },
      },
      serverAttentionByServerId: {},
      serverNotificationLevelByServerId: {},
    });
    await nextTick();

    const icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    expect(document.title).toBe(originalTitle);
    expect(icon?.getAttribute('href')).toBe('/echo-rounded-logo.png');

    scope.stop();
  });

  it('restores title and favicon on scope dispose', async () => {
    const scope = effectScope();
    const store = useEchoAttentionStore();
    scope.run(() => useBrowserTabAttention());

    store.replaceSnapshot({
      channelAttentionByChannelId: {
        ch3: {
          channelId: 'ch3',
          kind: 'server',
          serverId: 'srv3',
          unreadCount: 1,
          pingKind: 'role',
          lastReadMessageId: null,
        },
      },
      serverAttentionByServerId: { srv3: { unread: true, pingKind: 'role' } },
      serverNotificationLevelByServerId: {},
    });
    await nextTick();

    scope.stop();

    const icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    expect(document.title).toBe(originalTitle);
    expect(icon?.getAttribute('href')).toBe('/echo-rounded-logo.png');
  });
});

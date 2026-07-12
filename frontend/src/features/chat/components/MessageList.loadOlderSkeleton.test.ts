// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';
import type { MessageWithAuthor } from '@shared/types';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { messageWindowAuthority } from '@/features/chat/domain/messageWindowAuthority';
import { applyEchoHistoryInitialPageFromApi } from '@/services/realtime/echoHistoryChannelApply';

const scrollToIndexMock = vi.fn();

vi.mock('@tanstack/vue-virtual', async () => {
  const vue = await import('vue');
  return {
    useVirtualizer: (options: { value: { count: number } }) =>
      vue.computed(() => ({
        getVirtualItems: () =>
          Array.from({ length: options.value.count }, (_, index) => ({
            index,
            start: index * 88,
          })),
        getTotalSize: () => options.value.count * 88,
        scrollToIndex: scrollToIndexMock,
        measureElement: () => {},
        scrollDirection: null,
      })),
  };
});

vi.mock('./MessageBubble.vue', async () => {
  const vue = await import('vue');
  return {
    default: vue.defineComponent({
      name: 'MessageBubble',
      props: {
        row: {
          type: Object,
          required: true,
        },
      },
      render() {
        const row = this.row as { message?: { id?: string } };
        const id = row.message?.id ?? 'unknown';
        return vue.h('div', {
          id: `message-${id}`,
          class: 'message-bubble-stub',
          style: { minHeight: '72px' },
        });
      },
    }),
  };
});

vi.mock('./MessageRowShell.vue', async () => {
  const vue = await import('vue');
  return {
    default: vue.defineComponent({
      name: 'MessageRowShell',
      props: {
        row: { type: Object, required: true },
        authorName: { type: String, required: true },
      },
      render() {
        const row = this.row as { message?: { id?: string } };
        const id = row.message?.id ?? 'unknown';
        return vue.h('div', {
          id: `message-${id}`,
          class: 'message-row-shell-stub',
        });
      },
    }),
  };
});

vi.mock('./MessageListJumpFab.vue', () => ({
  default: { name: 'MessageListJumpFab', render: () => null },
}));

vi.mock('@/features/chat/components/DiscordChannelImportWidget.vue', () => ({
  default: { name: 'DiscordChannelImportWidget', render: () => null },
}));

import MessageList from './MessageList.vue';

function makeRawMessage(id: string, authorId = 'u1'): RawMessage {
  return {
    id,
    authorId,
    authorDisplayName: 'Ada',
    authorAvatar: '',
    timestamp: '2026-04-12T10:29:31.021Z',
    content: 'hello from history',
  };
}

function makeMessageWithAuthor(id: string, authorId = 'u1'): MessageWithAuthor {
  return {
    ...makeRawMessage(id, authorId),
    author: {
      id: authorId,
      name: 'Ada',
      avatar: '',
    },
  };
}

function defineScrollMetrics(
  el: HTMLElement,
  metrics: {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
  },
): void {
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => metrics.scrollTop,
    set: (v: number) => {
      metrics.scrollTop = v;
    },
  });
  Object.defineProperty(el, 'scrollHeight', {
    configurable: true,
    get: () => metrics.scrollHeight,
  });
  Object.defineProperty(el, 'clientHeight', {
    configurable: true,
    get: () => metrics.clientHeight,
  });
}

describe('MessageList load-older skeleton placeholders', () => {
  let app: App<Element> | null = null;
  let container: HTMLDivElement | null = null;
  let resolveLoadOlder: (() => void) | null = null;

  beforeEach(() => {
    messageWindowAuthority.orderedIds.value = [];
    messageWindowAuthority.entitiesById.value = new Map();
    messageWindowAuthority.hasMoreOlder.value = true;
    scrollToIndexMock.mockReset();
    resolveLoadOlder = null;

    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.stubGlobal('matchMedia', ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia);
  });

  afterEach(() => {
    app?.unmount();
    container?.remove();
    app = null;
    container = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    messageWindowAuthority.orderedIds.value = [];
    messageWindowAuthority.entitiesById.value = new Map();
    document.body.innerHTML = '';
  });

  it('shows virtualizer skeleton rows while loadOlder is in flight', async () => {
    const channelId = '1492135186257805999';
    const ids = Array.from({ length: 12 }, (_, i) => `m${i + 1}`);
    const rawMessages = ids.map((id) => makeRawMessage(id));
    const bucket = ref<Record<string, RawMessage[]>>({
      [channelId]: rawMessages,
    });
    messageWindowAuthority.bindMessages(bucket);
    messageWindowAuthority.setActiveChannel(channelId);
    applyEchoHistoryInitialPageFromApi(
      channelId,
      rawMessages,
      rawMessages.length,
      channelId,
      rawMessages.length,
    );
    messageWindowAuthority.setHasMoreOlder(channelId, true);

    const messages = ref(
      new Map(ids.map((id) => [id, makeMessageWithAuthor(id)] as const)),
    );

    let loadOlderStarted = false;
    const loadOlder = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          loadOlderStarted = true;
          resolveLoadOlder = () => resolve(true);
        }),
    );

    const Wrapper = defineComponent({
      name: 'MessageListLoadOlderHarness',
      setup() {
        return () =>
          h(MessageList, {
            channelId,
            messages: messages.value,
            loadOlder,
            loadingOlder: loadOlderStarted,
            currentUserId: 'u1',
            initialHistoryLoading: false,
          });
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Wrapper);
    app.directive('scrollbar-on-scroll', {});
    app.mount(container);

    for (let i = 0; i < 6; i++) {
      await nextTick();
      await Promise.resolve();
    }

    const scrollEl = container.querySelector(
      '[data-cy="message-list"]',
    ) as HTMLElement | null;
    expect(scrollEl).not.toBeNull();
    if (!scrollEl) return;

    const metrics = { scrollTop: 0, scrollHeight: 4000, clientHeight: 320 };
    defineScrollMetrics(scrollEl, metrics);

    vi.spyOn(scrollEl, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      left: 0,
      right: 400,
      bottom: 320,
      width: 400,
      height: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    for (const stub of scrollEl.querySelectorAll(
      '.message-bubble-stub, .message-row-shell-stub',
    )) {
      vi.spyOn(stub, 'getBoundingClientRect').mockReturnValue({
        top: 40,
        left: 16,
        right: 384,
        bottom: 112,
        width: 368,
        height: 72,
        x: 16,
        y: 40,
        toJSON: () => ({}),
      } as DOMRect);
    }

    expect(scrollEl.querySelector('#message-m12')).not.toBeNull();
    expect(scrollEl.querySelector('.message-bubble-stub')).not.toBeNull();

    scrollEl.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -1, bubbles: true }),
    );

    for (let i = 0; i < 4; i++) {
      await nextTick();
      await Promise.resolve();
    }

    expect(loadOlder).toHaveBeenCalledTimes(1);

    const skeletonStatus = scrollEl.querySelector(
      '[role="status"][aria-label="Loading older messages"]',
    );
    expect(skeletonStatus).not.toBeNull();

    expect(scrollEl.textContent?.includes('Loading older messages')).toBe(true);

    const skeletonPulses = scrollEl.querySelectorAll(
      '.message-list-skeleton-pulse',
    );
    expect(skeletonPulses.length).toBeGreaterThan(0);

    resolveLoadOlder?.();
    for (let i = 0; i < 4; i++) {
      await nextTick();
      await Promise.resolve();
    }

    expect(
      scrollEl.querySelector(
        '[role="status"][aria-label="Loading older messages"]',
      ),
    ).toBeNull();
  });
});

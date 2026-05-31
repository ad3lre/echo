// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';
import type { MessageWithAuthor } from '@shared/types';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { messageWindowAuthority } from '@/features/chat/domain/messageWindowAuthority';

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
      render: () => null,
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
    content: 'hello',
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

describe('MessageList runtime row synchronization', () => {
  let app: App<Element> | null = null;
  let container: HTMLDivElement | null = null;
  let consoleWarn: ReturnType<typeof vi.spyOn>;
  let consoleError: ReturnType<typeof vi.spyOn>;
  let warnings: string[];
  let errors: string[];

  beforeEach(() => {
    warnings = [];
    errors = [];
    messageWindowAuthority.orderedIds.value = [];
    messageWindowAuthority.entitiesById.value = new Map();
    messageWindowAuthority.topCursor.value = null;
    messageWindowAuthority.bottomCursor.value = null;
    messageWindowAuthority.hasMoreOlder.value = true;
    messageWindowAuthority.hasMoreNewer.value = false;
    messageWindowAuthority.anchorId.value = null;
    messageWindowAuthority.retainedLoadedRange.value = null;
    scrollToIndexMock.mockReset();

    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
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

  it('does not render a bubble before its row view model exists', async () => {
    const messages = ref<Map<string, MessageWithAuthor>>(new Map());

    const Wrapper = defineComponent({
      name: 'MessageListRuntimeHarness',
      setup() {
        return () =>
          h(MessageList, {
            messages: messages.value,
            messageScrollAnchor: 'bottom',
          });
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Wrapper);
    app.directive('scrollbar-on-scroll', {});
    app.config.warnHandler = (msg) => {
      warnings.push(String(msg));
    };
    app.config.errorHandler = (err) => {
      errors.push(err instanceof Error ? err.message : String(err));
    };
    app.mount(container);

    await nextTick();

    const raw = makeRawMessage('m1');
    messages.value = new Map([['m1', makeMessageWithAuthor('m1')]]);
    messageWindowAuthority.entitiesById.value = new Map([['m1', raw]]);
    messageWindowAuthority.orderedIds.value = ['m1'];

    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(warnings).toEqual([]);
    expect(errors).toEqual([]);
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('defers initial scroll anchor on optimistic dm open shell ids', async () => {
    const peerId = '11111111-1111-4111-8111-111111111111';
    const shellId = `dm-${peerId}`;
    const realChannelId = '1492135186257805999';
    const channelId = ref(shellId);
    const initialHistoryLoading = ref(false);
    const ids = ['m1', 'm2'];
    const mapEntries = ids.map(
      (id) => [id, makeMessageWithAuthor(id)] as const,
    );
    const rawEntries = ids.map((id) => [id, makeRawMessage(id)] as const);
    const messages = ref<Map<string, MessageWithAuthor>>(new Map(mapEntries));
    messageWindowAuthority.entitiesById.value = new Map(rawEntries);
    messageWindowAuthority.orderedIds.value = ids.slice();

    const Wrapper = defineComponent({
      name: 'MessageListDmShellHarness',
      setup() {
        return () =>
          h(MessageList, {
            channelId: channelId.value,
            messages: messages.value,
            messageScrollAnchor: 'bottom',
            initialHistoryLoading: initialHistoryLoading.value,
          });
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Wrapper);
    app.directive('scrollbar-on-scroll', {});
    app.mount(container);

    await nextTick();
    await nextTick();
    expect(scrollToIndexMock).not.toHaveBeenCalled();

    channelId.value = realChannelId;
    await nextTick();
    await nextTick();

    expect(scrollToIndexMock).toHaveBeenCalledWith(1, {
      align: 'end',
      behavior: 'auto',
    });
  });

  it('anchors to top on initial open when messageScrollAnchor is top', async () => {
    const channelId = ref<string | undefined>(undefined);
    const ids = ['m1', 'm2', 'm3'];
    const mapEntries = ids.map(
      (id) => [id, makeMessageWithAuthor(id)] as const,
    );
    const rawEntries = ids.map((id) => [id, makeRawMessage(id)] as const);
    const messages = ref<Map<string, MessageWithAuthor>>(new Map(mapEntries));
    messageWindowAuthority.entitiesById.value = new Map(rawEntries);
    messageWindowAuthority.orderedIds.value = ids.slice();

    const Wrapper = defineComponent({
      name: 'MessageListTopAnchorHarness',
      setup() {
        return () =>
          h(MessageList, {
            channelId: channelId.value,
            messages: messages.value,
            messageScrollAnchor: 'top',
            initialHistoryLoading: false,
          });
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Wrapper);
    app.directive('scrollbar-on-scroll', {});
    app.mount(container);

    await nextTick();
    expect(scrollToIndexMock).not.toHaveBeenCalled();

    channelId.value = 'ch-top';
    await nextTick();
    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(scrollToIndexMock).toHaveBeenCalledWith(0, {
      align: 'start',
      behavior: 'auto',
    });
  });

  it('does not paint a blocking busy mask during a DM-to-server switch', async () => {
    const queuedRafs: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      queuedRafs.push(cb);
      return queuedRafs.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});

    const channelId = ref('dm1');
    const messages = ref<Map<string, MessageWithAuthor>>(
      new Map([['dm-m1', makeMessageWithAuthor('dm-m1')]]),
    );

    messageWindowAuthority.entitiesById.value = new Map([
      ['dm-m1', makeRawMessage('dm-m1')],
    ]);
    messageWindowAuthority.orderedIds.value = ['dm-m1'];

    const Wrapper = defineComponent({
      name: 'MessageListChannelSwitchHarness',
      setup() {
        return () =>
          h(MessageList, {
            channelId: channelId.value,
            messages: messages.value,
            messageScrollAnchor: 'bottom',
          });
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Wrapper);
    app.directive('scrollbar-on-scroll', {});
    app.mount(container);

    await nextTick();
    await nextTick();

    channelId.value = 'server1';
    messages.value = new Map([['sv-m1', makeMessageWithAuthor('sv-m1')]]);
    messageWindowAuthority.entitiesById.value = new Map([
      ['sv-m1', makeRawMessage('sv-m1')],
    ]);
    messageWindowAuthority.orderedIds.value = ['sv-m1'];

    await nextTick();

    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('forces scroll to latest when current user sends while away', async () => {
    const channelId = ref('ch1');
    const currentUserId = ref('u1');
    const ids = Array.from({ length: 40 }, (_, i) => `m${i + 1}`);
    const mapEntries = ids.map(
      (id) => [id, makeMessageWithAuthor(id)] as const,
    );
    const rawEntries = ids.map((id) => [id, makeRawMessage(id)] as const);
    const messages = ref<Map<string, MessageWithAuthor>>(new Map(mapEntries));
    messageWindowAuthority.entitiesById.value = new Map(rawEntries);
    messageWindowAuthority.orderedIds.value = ids.slice();

    const Wrapper = defineComponent({
      name: 'MessageListOwnSendScrollHarness',
      setup() {
        return () =>
          h(MessageList, {
            channelId: channelId.value,
            currentUserId: currentUserId.value,
            messages: messages.value,
            messageScrollAnchor: 'bottom',
          });
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Wrapper);
    app.directive('scrollbar-on-scroll', {});
    app.mount(container);

    await nextTick();
    await nextTick();

    const scrollEl = container.querySelector(
      '[data-cy="message-list"]',
    ) as HTMLElement | null;
    expect(scrollEl).not.toBeNull();
    if (!scrollEl) return;
    Object.defineProperty(scrollEl, 'clientHeight', {
      configurable: true,
      value: 300,
    });
    scrollEl.scrollTop = 0;
    scrollEl.dispatchEvent(new Event('scroll'));
    await nextTick();

    const ownId = 'm41';
    messages.value = new Map([
      ...messages.value.entries(),
      [ownId, makeMessageWithAuthor(ownId, 'u1')],
    ]);
    messageWindowAuthority.entitiesById.value = new Map([
      ...messageWindowAuthority.entitiesById.value.entries(),
      [ownId, makeRawMessage(ownId, 'u1')],
    ]);
    messageWindowAuthority.orderedIds.value = [
      ...messageWindowAuthority.orderedIds.value,
      ownId,
    ];

    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(scrollToIndexMock).toHaveBeenCalledWith(40, {
      align: 'end',
      behavior: 'auto',
    });
  });
});

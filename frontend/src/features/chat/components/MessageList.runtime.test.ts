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
      render() {
        const row = this.row as { message?: { id?: string } };
        const id = row.message?.id ?? 'unknown';
        return vue.h('div', {
          id: `message-${id}`,
          class: 'message-bubble-stub',
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
        row: {
          type: Object,
          required: true,
        },
        authorName: {
          type: String,
          required: true,
        },
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
import {
  readMessageListViewport,
  resetMessageListViewportStorageForTests,
  writeMessageListViewport,
} from '@/features/chat/composables/messageListViewportStorage';

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
    resetMessageListViewportStorageForTests();
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
    const ids = Array.from({ length: 40 }, (_, i) => `m${i + 1}`);
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
    await Promise.resolve();
    await nextTick();

    // Bottom anchor may skip scrollToIndex when already near bottom (DOM snap only).
    expect(scrollToIndexMock.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('does not override an explicit user scroll with the initial anchor', async () => {
    // Regression: opening a channel must not yank the viewport back to the
    // anchor if the user has already started scrolling during history load.
    const channelId = ref('ch-user-owned');
    const initialHistoryLoading = ref(true);
    const ids = ['m1', 'm2', 'm3'];
    const mapEntries = ids.map(
      (id) => [id, makeMessageWithAuthor(id)] as const,
    );
    const rawEntries = ids.map((id) => [id, makeRawMessage(id)] as const);
    const messages = ref<Map<string, MessageWithAuthor>>(new Map(mapEntries));
    messageWindowAuthority.entitiesById.value = new Map(rawEntries);
    messageWindowAuthority.orderedIds.value = ids.slice();

    const Wrapper = defineComponent({
      name: 'MessageListUserOwnedInitHarness',
      setup() {
        return () =>
          h(MessageList, {
            channelId: channelId.value,
            messages: messages.value,
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

    const scrollEl = container.querySelector(
      '[data-cy="message-list"]',
    ) as HTMLElement | null;
    expect(scrollEl).not.toBeNull();
    if (!scrollEl) return;

    // User flicks the wheel while history is still streaming in.
    scrollEl.dispatchEvent(new Event('wheel'));

    // History finishes loading — the one-shot anchor would normally fire here.
    initialHistoryLoading.value = false;
    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(scrollToIndexMock).not.toHaveBeenCalled();
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

  it('skips scrollToIndex on initial bottom anchor when already near DOM bottom', async () => {
    const channelId = ref<string | undefined>(undefined);
    const ids = ['m1', 'm2'];
    const mapEntries = ids.map(
      (id) => [id, makeMessageWithAuthor(id)] as const,
    );
    const rawEntries = ids.map((id) => [id, makeRawMessage(id)] as const);
    const messages = ref<Map<string, MessageWithAuthor>>(new Map(mapEntries));
    messageWindowAuthority.entitiesById.value = new Map(rawEntries);
    messageWindowAuthority.orderedIds.value = ids.slice();

    const Wrapper = defineComponent({
      name: 'MessageListNearBottomHarness',
      setup() {
        return () =>
          h(MessageList, {
            channelId: channelId.value,
            messages: messages.value,
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

    const scrollEl = container.querySelector(
      '[data-cy="message-list"]',
    ) as HTMLElement | null;
    expect(scrollEl).not.toBeNull();
    if (!scrollEl) return;
    Object.defineProperty(scrollEl, 'clientHeight', {
      configurable: true,
      value: 300,
    });
    Object.defineProperty(scrollEl, 'scrollHeight', {
      configurable: true,
      value: 476,
    });
    scrollEl.scrollTop = 174;

    channelId.value = 'ch-near-bottom';
    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(scrollToIndexMock).not.toHaveBeenCalled();
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
    await Promise.resolve();
    await nextTick();
    await Promise.resolve();
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
    await Promise.resolve();
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
    await Promise.resolve();
    await nextTick();

    expect(scrollToIndexMock).toHaveBeenCalledWith(40, {
      align: 'end',
      behavior: 'auto',
    });
  });

  it('restores saved viewport memory when returning to a channel', async () => {
    const channelId = ref('ch-restore');
    const ids = Array.from({ length: 40 }, (_, i) => `m${i + 1}`);
    const mapEntries = ids.map(
      (id) => [id, makeMessageWithAuthor(id)] as const,
    );
    const rawEntries = ids.map((id) => [id, makeRawMessage(id)] as const);
    const messages = ref<Map<string, MessageWithAuthor>>(new Map(mapEntries));
    messageWindowAuthority.entitiesById.value = new Map(rawEntries);
    messageWindowAuthority.orderedIds.value = ids.slice();

    writeMessageListViewport('ch-restore', {
      anchorMessageId: 'm20',
      anchorTop: 48,
      followNewMessages: false,
    });

    const Wrapper = defineComponent({
      name: 'MessageListViewportRestoreHarness',
      setup() {
        return () =>
          h(MessageList, {
            channelId: channelId.value,
            messages: messages.value,
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
    await nextTick();

    const scrollEl = container.querySelector(
      '[data-cy="message-list"]',
    ) as HTMLElement | null;
    if (scrollEl) {
      vi.spyOn(scrollEl, 'getBoundingClientRect').mockReturnValue({
        top: 0,
        left: 0,
        right: 400,
        bottom: 300,
        width: 400,
        height: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);
      for (const stub of scrollEl.querySelectorAll(
        '.message-row-shell-stub, .message-bubble-stub',
      )) {
        const match = stub.id.match(/^message-m(\d+)$/);
        const index = match ? Number(match[1]) - 1 : 0;
        const top = index === 19 ? 60 : 2000 + index;
        vi.spyOn(stub, 'getBoundingClientRect').mockReturnValue({
          top,
          left: 16,
          right: 384,
          bottom: top + 72,
          width: 368,
          height: 72,
          x: 16,
          y: top,
          toJSON: () => ({}),
        } as DOMRect);
      }
    }

    await Promise.resolve();
    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(scrollToIndexMock).toHaveBeenCalledWith(19, {
      align: 'start',
      behavior: 'auto',
    });
    expect(readMessageListViewport('ch-restore')?.anchorMessageId).toBe('m20');
  });

  it('restores bottom when returning to a channel saved with followNewMessages', async () => {
    const channelId = ref('ch-bottom');
    const ids = Array.from({ length: 40 }, (_, i) => `m${i + 1}`);
    const mapEntries = ids.map(
      (id) => [id, makeMessageWithAuthor(id)] as const,
    );
    const rawEntries = ids.map((id) => [id, makeRawMessage(id)] as const);
    const messages = ref<Map<string, MessageWithAuthor>>(new Map(mapEntries));
    messageWindowAuthority.entitiesById.value = new Map(rawEntries);
    messageWindowAuthority.orderedIds.value = ids.slice();

    writeMessageListViewport('ch-bottom', {
      anchorMessageId: 'm40',
      anchorTop: 120,
      followNewMessages: true,
    });

    const Wrapper = defineComponent({
      name: 'MessageListBottomRestoreHarness',
      setup() {
        return () =>
          h(MessageList, {
            channelId: channelId.value,
            messages: messages.value,
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
    await nextTick();
    await Promise.resolve();
    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(scrollToIndexMock).toHaveBeenCalledWith(39, {
      align: 'end',
      behavior: 'auto',
    });
    expect(readMessageListViewport('ch-bottom')?.followNewMessages).toBe(true);
  });

  it('does not jump to bottom when mid-history restore cannot measure anchor', async () => {
    const channelId = ref('ch-restore-fail');
    const ids = Array.from({ length: 40 }, (_, i) => `m${i + 1}`);
    const mapEntries = ids.map(
      (id) => [id, makeMessageWithAuthor(id)] as const,
    );
    const rawEntries = ids.map((id) => [id, makeRawMessage(id)] as const);
    const messages = ref<Map<string, MessageWithAuthor>>(new Map(mapEntries));
    messageWindowAuthority.entitiesById.value = new Map(rawEntries);
    messageWindowAuthority.orderedIds.value = ids.slice();

    writeMessageListViewport('ch-restore-fail', {
      anchorMessageId: 'm20',
      anchorTop: 48,
      followNewMessages: false,
    });

    const Wrapper = defineComponent({
      name: 'MessageListViewportRestoreFailHarness',
      setup() {
        return () =>
          h(MessageList, {
            channelId: channelId.value,
            messages: messages.value,
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
    await nextTick();
    await Promise.resolve();
    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(scrollToIndexMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ align: 'end' }),
    );
  });

  it('does not fall back to default anchor after user scroll aborts viewport restore', async () => {
    const channelId = ref('ch-restore-gesture');
    const ids = Array.from({ length: 40 }, (_, i) => `m${i + 1}`);
    const mapEntries = ids.map(
      (id) => [id, makeMessageWithAuthor(id)] as const,
    );
    const rawEntries = ids.map((id) => [id, makeRawMessage(id)] as const);
    const messages = ref<Map<string, MessageWithAuthor>>(new Map(mapEntries));
    messageWindowAuthority.entitiesById.value = new Map(rawEntries);
    messageWindowAuthority.orderedIds.value = ids.slice();

    writeMessageListViewport('ch-restore-gesture', {
      anchorMessageId: 'm20',
      anchorTop: 48,
      followNewMessages: false,
    });

    const Wrapper = defineComponent({
      name: 'MessageListViewportRestoreGestureHarness',
      setup() {
        return () =>
          h(MessageList, {
            channelId: channelId.value,
            messages: messages.value,
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
    await nextTick();

    const scrollEl = container.querySelector(
      '[data-cy="message-list"]',
    ) as HTMLElement | null;
    expect(scrollEl).not.toBeNull();
    if (!scrollEl) return;

    // User scrolls before restore / fallback anchor can commit.
    scrollEl.dispatchEvent(new Event('wheel'));

    await Promise.resolve();
    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(scrollToIndexMock).not.toHaveBeenCalled();
  });

  it('renders lightweight row shells before hydration completes', async () => {
    const ids = ['m1', 'm2'];
    const mapEntries = ids.map(
      (id) => [id, makeMessageWithAuthor(id)] as const,
    );
    const rawEntries = ids.map((id) => [id, makeRawMessage(id)] as const);
    const messages = ref<Map<string, MessageWithAuthor>>(new Map(mapEntries));
    messageWindowAuthority.entitiesById.value = new Map(rawEntries);
    messageWindowAuthority.orderedIds.value = ids.slice();

    const Wrapper = defineComponent({
      name: 'MessageListShellHarness',
      setup() {
        return () =>
          h(MessageList, {
            channelId: 'ch-shell',
            messages: messages.value,
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
    await nextTick();

    expect(container.querySelector('.message-row-shell-stub')).not.toBeNull();
    expect(container.querySelector('.message-bubble-stub')).toBeNull();
  });
});

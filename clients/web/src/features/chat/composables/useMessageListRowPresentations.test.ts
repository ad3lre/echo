// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';
import type { MessageWithAuthor } from '@shared/types';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { useMessageListRowPresentations } from './useMessageListRowPresentations';

function raw(id: string, content = 'hello'): RawMessage {
  return {
    id,
    authorId: 'u1',
    authorDisplayName: 'Ada',
    authorAvatar: '',
    timestamp: '2026-04-12T10:29:31.021Z',
    content,
  };
}

function message(id: string, content = 'hello'): MessageWithAuthor {
  return {
    ...raw(id, content),
    author: { id: 'u1', name: 'Ada', avatar: '' },
  };
}

function mapsFor(
  ids: readonly string[],
  contentById: Record<string, string> = {},
) {
  const messages = new Map<string, MessageWithAuthor>();
  const entities = new Map<string, RawMessage>();
  for (const id of ids) {
    const body = contentById[id] ?? 'hello';
    messages.set(id, message(id, body));
    entities.set(id, raw(id, body));
  }
  return { messages, entities };
}

describe('useMessageListRowPresentations', () => {
  let app: App<Element> | null = null;

  afterEach(() => {
    app?.unmount();
    app = null;
    document.body.innerHTML = '';
  });

  function mountHarness(args: {
    ids: string[];
    compactTop?: boolean;
    userScrollActive?: boolean;
    contentById?: Record<string, string>;
  }) {
    const ids = ref(args.ids);
    const compactTop = ref(!!args.compactTop);
    const userScrollActive = ref(!!args.userScrollActive);
    const initial = mapsFor(args.ids, args.contentById);
    const messages = ref(initial.messages);
    const entities = ref(initial.entities);
    const patched: string[][] = [];
    let api!: ReturnType<typeof useMessageListRowPresentations>;

    const Host = defineComponent({
      setup() {
        api = useMessageListRowPresentations({
          displayOrderedIds: ids,
          mergedEntitiesForList: entities,
          mergedMessagesForList: messages,
          compactTop: () => compactTop.value,
          firstUnreadMessageId: () => null,
          lastReadMessageId: () => null,
          showUnreadSeparator: () => true,
          isUserScrollActive: () => userScrollActive.value,
          onPatchedRows: (messageIds) => patched.push([...messageIds]),
        });
        return () => h('div');
      },
    });

    const el = document.createElement('div');
    document.body.appendChild(el);
    app = createApp(Host);
    app.mount(el);
    return {
      api,
      ids,
      compactTop,
      userScrollActive,
      messages,
      entities,
      patched,
    };
  }

  it('builds row view models immediately from ordered ids', async () => {
    const { api } = mountHarness({ ids: ['m1', 'm2'] });
    await nextTick();
    expect(
      api.messageListRowPresentations.value.map((r) => r.message.id),
    ).toEqual(['m1', 'm2']);
  });

  it('rebuilds all rows when compactTop changes', async () => {
    const { api, compactTop } = mountHarness({ ids: ['m1', 'm2'] });
    await nextTick();
    const before = api.messageListRowPresentations.value;
    compactTop.value = true;
    await nextTick();
    const after = api.messageListRowPresentations.value;
    expect(after).not.toBe(before);
    expect(after).toHaveLength(2);
    expect(after[0]?.isCompact).toBe(true);
  });

  it('patches in place when a message fingerprint changes', async () => {
    const { api, messages, entities } = mountHarness({
      ids: ['m1', 'm2'],
    });
    await nextTick();
    const before = api.messageListRowPresentations.value;
    const next = mapsFor(['m1', 'm2'], { m1: 'edited', m2: 'hello' });
    messages.value = next.messages;
    entities.value = next.entities;
    await nextTick();
    expect(api.messageListRowPresentations.value).toBe(before);
    expect(api.messageListRowPresentations.value[0]?.message.content).toBe(
      'edited',
    );
  });

  it('defers entity fingerprint changes while the user is scrolling', async () => {
    const { api, messages, entities, userScrollActive, patched } = mountHarness(
      {
        ids: ['m1', 'm2'],
        userScrollActive: true,
      },
    );
    await nextTick();
    const before = api.messageListRowPresentations.value[0]?.message.content;
    const next = mapsFor(['m1', 'm2'], { m1: 'edited', m2: 'hello' });
    messages.value = next.messages;
    entities.value = next.entities;
    await nextTick();
    expect(api.messageListRowPresentations.value[0]?.message.content).toBe(
      before,
    );
    expect(patched).toEqual([]);

    userScrollActive.value = false;
    api.flushPendingRowFactsAfterScrollSettle();
    expect(api.messageListRowPresentations.value[0]?.message.content).toBe(
      'edited',
    );
    expect(patched.length).toBeGreaterThan(0);
    expect(patched[0]).toContain('m1');
  });
});

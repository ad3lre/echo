// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';
import type { MessageWithAuthor } from '@shared/types';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import {
  DM_CALL_LOG_HISTORY_VISIBLE_CAP,
  DM_CALL_ROLLUP_MESSAGE_ID_PREFIX,
  isDmCallRollupCollapseMessageId,
} from '@/features/chat/domain/dmCallLogHistoryCollapse';
import { messageWindowAuthority } from '@/features/chat/domain/messageWindowAuthority';
import { buildMessageWithAuthor } from '@/features/chat/domain/messageWithAuthor';
import { useMessageListDmCallRollup } from './useMessageListDmCallRollup';

function rawCallLog(id: string, ts: string): RawMessage {
  return {
    id,
    authorId: 'system',
    systemMessage: true,
    authorDisplayName: 'Call',
    timestamp: ts,
    content: '📞 test',
    contentText: '📞 test',
  };
}

describe('useMessageListDmCallRollup', () => {
  let app: App<Element> | null = null;

  afterEach(() => {
    app?.unmount();
    app = null;
    messageWindowAuthority.orderedIds.value = [];
    messageWindowAuthority.entitiesById.value = new Map();
    document.body.innerHTML = '';
  });

  function seedRun(count: number) {
    const ids: string[] = [];
    const entities = new Map<string, RawMessage>();
    const messages = new Map<
      string,
      MessageWithAuthor & { channelName?: string }
    >();
    for (let i = 0; i < count; i++) {
      const id = `local_dm_call_log:r${i}`;
      ids.push(id);
      const raw = rawCallLog(id, `2025-01-01T00:0${i}:00.000Z`);
      entities.set(id, raw);
      messages.set(id, buildMessageWithAuthor(raw, new Map(), {}));
    }
    messageWindowAuthority.orderedIds.value = ids;
    messageWindowAuthority.entitiesById.value = entities;
    return { ids, messages };
  }

  function mountRollup(
    channelId: string,
    messages: Map<string, MessageWithAuthor & { channelName?: string }>,
  ) {
    const channel = ref(channelId);
    const msgs = ref(messages);
    let api!: ReturnType<typeof useMessageListDmCallRollup>;
    const Host = defineComponent({
      setup() {
        api = useMessageListDmCallRollup({
          channelId: () => channel.value,
          messages: () => msgs.value,
        });
        return () => h('div');
      },
    });
    app = createApp(Host);
    app.mount(document.createElement('div'));
    return { api, channel };
  }

  it('collapses a long DM call-log run until expand', () => {
    const { ids, messages } = seedRun(7);
    const { api } = mountRollup('dm-ch-1', messages);
    expect(api.displayOrderedIds.value.length).toBe(
      1 + DM_CALL_LOG_HISTORY_VISIBLE_CAP,
    );
    const rollupId = api.displayOrderedIds.value[0]!;
    expect(isDmCallRollupCollapseMessageId(rollupId)).toBe(true);
    expect(rollupId.startsWith(DM_CALL_ROLLUP_MESSAGE_ID_PREFIX)).toBe(true);

    api.handleExpandDmCallRollFromBubble(rollupId);
    expect(api.displayOrderedIds.value).toEqual(ids);
  });

  it('clears reveal keys when the channel changes', async () => {
    const { messages } = seedRun(7);
    const { api, channel } = mountRollup('dm-ch-1', messages);
    api.handleExpandDmCallRollFromBubble(api.displayOrderedIds.value[0]!);
    expect(api.displayOrderedIds.value.length).toBe(7);
    channel.value = 'dm-ch-2';
    await nextTick();
    expect(api.displayOrderedIds.value.length).toBe(
      1 + DM_CALL_LOG_HISTORY_VISIBLE_CAP,
    );
  });
});

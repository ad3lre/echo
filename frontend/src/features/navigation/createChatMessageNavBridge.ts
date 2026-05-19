import type {
  ActiveChatMessageNavApi,
  ChatMessageNavBridge,
} from './chatMessageNavBridge';

export function createChatMessageNavBridge(): ChatMessageNavBridge {
  let slot: { id: number; api: ActiveChatMessageNavApi } | null = null;

  return {
    register(id: number, api: ActiveChatMessageNavApi) {
      slot = { id, api };
    },
    unregister(id: number) {
      if (slot?.id === id) slot = null;
    },
    getActiveApi(): ActiveChatMessageNavApi | null {
      return slot?.api ?? null;
    },
  };
}

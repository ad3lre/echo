import type { InjectionKey } from 'vue';

/** Scroll + highlight for the active chat surface (virtualized MessageList). */
export type ActiveChatMessageNavApi = {
  scrollToMessage: (messageId: string) => Promise<boolean>;
  flashHighlight: (messageId: string) => void;
};

export type ChatMessageNavBridge = {
  register: (id: number, api: ActiveChatMessageNavApi) => void;
  unregister: (id: number) => void;
  getActiveApi: () => ActiveChatMessageNavApi | null;
};

export const CHAT_MESSAGE_NAV_BRIDGE_KEY: InjectionKey<ChatMessageNavBridge> =
  Symbol('chatMessageNavBridge');

export type MessageScrollStrategy =
  | 'memory'
  | 'fetch'
  | 'paginate'
  | 'retry-dom';

export type MessageNavigateResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'channel_mismatch' | 'message_not_found' | 'scroll_failed';
    };

export type MessageNavigationDeps = {
  getChannelMessages: (channelId: string) => Array<{ id?: string | null }>;
  activeChannelId: () => string;
  scrollToMessage: (channelId: string, messageId: string) => Promise<boolean>;
  prefetchMessage?: (channelId: string, messageId: string) => Promise<void>;
  flashHighlight?: (messageId: string) => void;
};

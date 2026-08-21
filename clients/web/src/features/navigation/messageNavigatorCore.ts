import type {
  MessageNavigateResult,
  MessageNavigationDeps,
  MessageScrollStrategy,
} from './messageNavigatorTypes';

export const DEFAULT_MESSAGE_SCROLL_STRATEGY: MessageScrollStrategy[] = [
  'memory',
  'fetch',
  'paginate',
  'retry-dom',
];

const RETRY_DELAYS_MS = [0, 50, 120, 280, 450];
export const MESSAGE_NAVIGATOR_MAX_RETRY_ATTEMPTS = RETRY_DELAYS_MS.length;

function hasMessage(
  deps: MessageNavigationDeps,
  channelId: string,
  messageId: string,
): boolean {
  return deps.getChannelMessages(channelId).some((m) => m.id === messageId);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function raf2(): Promise<void> {
  return new Promise((resolve) => {
    const raf =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame.bind(globalThis)
        : (cb: () => void) => setTimeout(cb, 0);
    raf(() => {
      raf(() => resolve());
    });
  });
}

export async function resolveAndScroll(opts: {
  channelId: string;
  messageId: string;
  strategy?: MessageScrollStrategy[];
  deps: MessageNavigationDeps;
}): Promise<MessageNavigateResult> {
  const strategy = opts.strategy ?? DEFAULT_MESSAGE_SCROLL_STRATEGY;
  const { channelId, messageId, deps } = opts;

  const tryScroll = async (): Promise<boolean> => {
    if (channelId !== deps.activeChannelId()) return false;
    return deps.scrollToMessage(channelId, messageId);
  };

  const finishOk = (): MessageNavigateResult => {
    deps.flashHighlight?.(messageId);
    return { ok: true };
  };

  if (strategy.includes('memory') && hasMessage(deps, channelId, messageId)) {
    if (await tryScroll()) return finishOk();
  }

  const wantsPrefetch =
    strategy.includes('fetch') || strategy.includes('paginate');
  if (wantsPrefetch && deps.prefetchMessage) {
    await deps.prefetchMessage(channelId, messageId);
  }

  if (hasMessage(deps, channelId, messageId) && (await tryScroll())) {
    return finishOk();
  }

  if (strategy.includes('retry-dom')) {
    for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
      const delayMs = RETRY_DELAYS_MS[i] ?? 0;
      if (delayMs > 0) {
        await sleep(delayMs);
      }
      await raf2();
      if (!hasMessage(deps, channelId, messageId)) continue;
      if (await tryScroll()) return finishOk();
    }
  }

  if (!hasMessage(deps, channelId, messageId)) {
    return { ok: false, reason: 'message_not_found' };
  }
  return { ok: false, reason: 'scroll_failed' };
}

export const MessageNavigator = {
  resolveAndScroll,
  DEFAULT_STRATEGY: DEFAULT_MESSAGE_SCROLL_STRATEGY,
  MAX_RETRY_ATTEMPTS: MESSAGE_NAVIGATOR_MAX_RETRY_ATTEMPTS,
};

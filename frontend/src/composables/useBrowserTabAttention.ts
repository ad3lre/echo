import { storeToRefs } from 'pinia';
import { computed, onScopeDispose, watch } from 'vue';
import { isDmChannelMentionUnread } from '@shared/attentionPing';
import { useEchoAttentionStore } from '@/stores/echoAttention';

const DEFAULT_TITLE = 'Echo';
const PING_TITLE = 'Echo (Ping)';
const DEFAULT_FAVICON_HREF = '/echo-rounded-logo.png';
const PING_FAVICON_HREF = '/favicon-ping.svg';

type IconLinkState = {
  element: HTMLLinkElement;
  href: string | null;
};

function getIconLinks(): HTMLLinkElement[] {
  if (typeof document === 'undefined') return [];
  return Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'),
  );
}

function ensurePrimaryIconLink(): HTMLLinkElement {
  const existing = getIconLinks()[0];
  if (existing) return existing;
  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = DEFAULT_FAVICON_HREF;
  document.head.appendChild(link);
  return link;
}

/**
 * Mirrors mention/ping attention into browser tab affordances (title + favicon).
 * Plain unread does not change the tab title; only a waiting ping/mention does.
 * Uses the shared attention store so browser and desktop shells stay in sync.
 */
export function useBrowserTabAttention(): void {
  if (typeof document === 'undefined') return;

  const attention = useEchoAttentionStore();
  const {
    serverAttentionByServerId,
    channelAttentionByChannelId,
    readStateByChannelId,
  } = storeToRefs(attention);

  const hasWaitingPing = computed(() => {
    if (
      Object.values(serverAttentionByServerId.value).some(
        (summary) => summary.unread && !!summary.pingKind,
      )
    ) {
      return true;
    }
    const readMap = readStateByChannelId.value;
    for (const ch of Object.values(channelAttentionByChannelId.value)) {
      const lr = readMap[ch.channelId] ?? ch.lastReadMessageId;
      if (isDmChannelMentionUnread(ch, lr ?? null)) return true;
    }
    return false;
  });

  const initialTitle = document.title || DEFAULT_TITLE;
  const trackedIcons = getIconLinks().map((element) => ({
    element,
    href: element.getAttribute('href'),
  }));
  const primaryIconLink = ensurePrimaryIconLink();

  let lastTitle: string | null = null;
  let lastFaviconHref: string | null = null;

  const stop = watch(
    () => hasWaitingPing.value,
    (waitingPing) => {
      const nextTitle = waitingPing ? PING_TITLE : initialTitle;
      if (nextTitle !== lastTitle) {
        document.title = nextTitle;
        lastTitle = nextTitle;
      }

      const nextFaviconHref = waitingPing
        ? PING_FAVICON_HREF
        : DEFAULT_FAVICON_HREF;
      if (nextFaviconHref !== lastFaviconHref) {
        const iconLinks = getIconLinks();
        if (iconLinks.length === 0) {
          primaryIconLink.href = nextFaviconHref;
        } else {
          for (const link of iconLinks) {
            link.href = nextFaviconHref;
          }
        }
        lastFaviconHref = nextFaviconHref;
      }
    },
    { immediate: true, flush: 'post' },
  );

  onScopeDispose(() => {
    stop();
    document.title = initialTitle;
    if (trackedIcons.length > 0) {
      for (const tracked of trackedIcons) {
        if (tracked.href == null) tracked.element.removeAttribute('href');
        else tracked.element.setAttribute('href', tracked.href);
      }
      return;
    }
    primaryIconLink.href = DEFAULT_FAVICON_HREF;
  });
}

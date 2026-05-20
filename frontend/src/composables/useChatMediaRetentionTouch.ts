import { touchChatUploadRetentionKeys } from '@/api/echo/uploads';
import { useAuthSessionStore } from '@/stores/authSession';

const pending = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_MS = 3000;
const MAX_BATCH = 20;

function flushPending(): void {
  flushTimer = null;
  const keys = [...pending].slice(0, MAX_BATCH);
  pending.clear();
  if (keys.length === 0) return;
  const token = useAuthSessionStore().accessToken;
  void touchChatUploadRetentionKeys(token, keys).catch(() => {});
}

/**
 * Queue a chat upload storage key for abandonment timer refresh when the attachment is seen.
 */
export function queueChatMediaRetentionTouch(storageKey: string | undefined | null): void {
  const key = storageKey?.trim();
  if (!key) return;
  pending.add(key);
  if (flushTimer != null) return;
  flushTimer = setTimeout(flushPending, FLUSH_MS);
}

/**
 * Observe element visibility and queue retention touch (IntersectionObserver + caller load/play).
 */
export function observeChatMediaRetentionVisible(
  el: HTMLElement | null | undefined,
  storageKey: string | undefined | null,
): () => void {
  const key = storageKey?.trim();
  if (!el || !key || typeof IntersectionObserver === 'undefined') {
    return () => {};
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          queueChatMediaRetentionTouch(key);
        }
      }
    },
    { threshold: [0.5] },
  );
  observer.observe(el);
  return () => observer.disconnect();
}

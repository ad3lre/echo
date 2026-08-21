import { extractStorageKeyFromEchoMediaUrl } from '@shared/echoUploadStorageKey';
import type { ImageDimensions } from '@/features/layout/display/probeImageDimensions';

/**
 * Cross-reload persistence for probed image dimensions.
 *
 * WHY: the in-memory probe cache in `probeImageDimensions.ts` is wiped on every full
 * page load, so a cold channel open re-probes every image — first painting a wrong
 * default-aspect guess, then shifting twice (probe, then decode). Persisting dimensions
 * to `localStorage` lets a previously-seen image reserve its EXACT box on the very first
 * frame after reload (read synchronously below), eliminating the layout shift for the
 * common daily case of revisiting channels.
 *
 * Keys are hashed (not the raw URL / storage key) so the persisted blob never exposes
 * which media a browser has viewed in plaintext — only `w`/`h` pairs keyed by an opaque
 * hash. Echo media URLs are normalised to their stable storage key first, so the cache
 * survives read-through/CDN host differences (and any future signed-URL rotation).
 */

const STORAGE_KEY = 'echo.imgdims.v1';
/** Bound the persisted set so localStorage stays small and writes stay cheap. */
const MAX_ENTRIES = 1200;
/** Coalesce the many probes that fire while a channel paints into one write. */
const FLUSH_DEBOUNCE_MS = 1500;

/** Insertion-ordered → oldest first, so overflow eviction drops least-recently-written. */
const persistent = new Map<string, ImageDimensions>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;

function hasLocalStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

/**
 * Stable, opaque cache key. Echo media collapses to its storage key (host-independent);
 * everything else keys off the full URL. FNV-1a → base36 keeps it short and unreadable.
 */
function dimsCacheKey(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) return null;
  const storageKey = extractStorageKeyFromEchoMediaUrl(trimmed);
  const basis = storageKey ? `sk:${storageKey}` : `u:${trimmed}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < basis.length; i++) {
    hash ^= basis.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function loadFromStorage(): void {
  if (!hasLocalStorage()) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { e?: [string, number, number][] };
    const entries = Array.isArray(parsed?.e) ? parsed.e : [];
    // Keep only the most-recent MAX_ENTRIES (tail of the persisted, ordered list).
    for (const entry of entries.slice(-MAX_ENTRIES)) {
      const [key, w, h] = entry;
      if (typeof key === 'string' && w > 0 && h > 0) {
        persistent.set(key, { width: w, height: h });
      }
    }
  } catch {
    // Corrupt / unavailable storage: start empty, never throw on the render path.
  }
}

function flushToStorage(): void {
  flushTimer = null;
  if (!dirty || !hasLocalStorage()) return;
  dirty = false;
  try {
    const e: [string, number, number][] = [];
    for (const [key, dims] of persistent)
      e.push([key, dims.width, dims.height]);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, e }));
  } catch {
    // Quota / private-mode: the in-memory cache still serves this session.
  }
}

function scheduleFlush(): void {
  dirty = true;
  if (!hasLocalStorage() || flushTimer !== null) return;
  flushTimer = setTimeout(flushToStorage, FLUSH_DEBOUNCE_MS);
}

/** Exact dimensions for a URL seen in a previous session, or null. */
export function getPersistentImageDimensions(
  url: string,
): ImageDimensions | null {
  const key = dimsCacheKey(url);
  if (!key) return null;
  return persistent.get(key) ?? null;
}

/** Record dimensions for cross-reload reuse (debounced write). */
export function rememberPersistentImageDimensions(
  url: string,
  dims: ImageDimensions,
): void {
  if (dims.width <= 0 || dims.height <= 0) return;
  const key = dimsCacheKey(url);
  if (!key) return;
  // Re-insert to move to the most-recent position (LRU by write order).
  persistent.delete(key);
  persistent.set(key, { width: dims.width, height: dims.height });
  while (persistent.size > MAX_ENTRIES) {
    const oldest = persistent.keys().next().value;
    if (oldest === undefined) break;
    persistent.delete(oldest);
  }
  scheduleFlush();
}

// Seed synchronously at module load so the first `getPersistentImageDimensions`
// during a component's setup (before first paint) already has last session's data.
loadFromStorage();

if (typeof window !== 'undefined') {
  // Persist promptly when the tab is backgrounded / closed, before the debounce fires.
  window.addEventListener('pagehide', flushToStorage);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushToStorage();
  });
}

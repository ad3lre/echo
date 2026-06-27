import type { Ref } from 'vue';
import { parseYoutubeVideoId } from '@/utils/parseYoutubeVideoId';
import {
  fetchEchoYoutubePopular,
  fetchEchoYoutubeRelated,
  fetchEchoYoutubeVcSearch,
} from '@/api/echo/youtubeVc';
import type { EchoYoutubeSearchItem } from '@/api/echo/youtubeVc';
import { EchoApiError } from '@/api/echo/transport';
import { postEchoYoutubeWatchTogetherUsage } from '@/api/echo/vcActivities';
import type {
  VcActivityUiState,
  YoutubePlaylistEntry,
} from '@/features/voice/vcActivityTypes';

/** Bill watch-together wall time in chunks; server enforces a UTC daily budget. */
export const YT_USAGE_BILL_INTERVAL_MS = 60_000;
/** Per-tick chunk cap (seconds) while the YouTube activity stays open. */
export const YT_USAGE_BILL_CHUNK_CAP_S = 120;
/** Final flush cap (seconds) when leaving the activity / unmounting. */
export const YT_USAGE_BILL_FINAL_CAP_S = 600;

export const QUICK_SEARCH_PRESETS: { label: string; q: string }[] = [
  { label: 'Music', q: 'popular music videos' },
  { label: 'Gaming', q: 'gaming highlights' },
  { label: 'News', q: 'world news today' },
  { label: 'Comedy', q: 'stand up comedy' },
  { label: 'Science', q: 'science documentary' },
];

/** Mutable wall-time billing cursor, owned by the composable scope. */
export type YtUsageBilling = {
  interval: ReturnType<typeof setInterval> | null;
  anchorMs: number;
};

/** Everything the browse actions read/write — refs, reactive getters, callbacks. */
export type YtBrowseCtx = {
  state: () => VcActivityUiState;
  token: () => string | null;
  setVideo: (
    videoId: string,
    meta?: Partial<
      Pick<YoutubePlaylistEntry, 'title' | 'channelTitle' | 'thumbnailUrl'>
    >,
  ) => void;
  setBrowseOpen: (open: boolean) => void;
  addToQueue: (entry: YoutubePlaylistEntry) => void;
  searchDraft: Ref<string>;
  searchLoading: Ref<boolean>;
  searchError: Ref<string>;
  searchResults: Ref<EchoYoutubeSearchItem[]>;
  searchHint: Ref<string | null>;
  browseTab: Ref<'find' | 'queue'>;
  popularLoading: Ref<boolean>;
  popularError: Ref<string>;
  popularItems: Ref<EchoYoutubeSearchItem[]>;
  popularHint: Ref<string | null>;
  queueSuggestLoading: Ref<boolean>;
  queueSuggestError: Ref<string>;
  queueSuggestHint: Ref<string | null>;
  queueSuggestItems: Ref<EchoYoutubeSearchItem[]>;
};

export function youtubeListingFetchErrorMessage(e: unknown): string {
  if (
    e instanceof EchoApiError &&
    e.status === 429 &&
    e.body.code === 'YOUTUBE_WATCH_TOGETHER_QUOTA'
  ) {
    return (
      e.body.message?.trim() ||
      'YouTube watch together daily budget reached. Try again tomorrow (UTC).'
    );
  }
  return e instanceof Error ? e.message : "Something didn't work. Try again.";
}

export function rowToMeta(v: EchoYoutubeSearchItem) {
  return {
    title: v.title,
    channelTitle: v.channelTitle,
    thumbnailUrl: v.thumbnailUrl,
  };
}

export function entryFromItem(v: EchoYoutubeSearchItem): YoutubePlaylistEntry {
  return {
    id: v.id,
    title: v.title,
    channelTitle: v.channelTitle,
    thumbnailUrl: v.thumbnailUrl,
  };
}

export function youtubeHasQueue(s: VcActivityUiState): boolean {
  return s.phase === 'youtube' && s.playlist.length > 0;
}

export async function flushUsageSeconds(
  billing: YtUsageBilling,
  getToken: () => string | null,
  maxChunk: number,
): Promise<void> {
  const token = getToken();
  if (!token || !billing.anchorMs) return;
  const elapsed = Math.floor((Date.now() - billing.anchorMs) / 1000);
  if (elapsed < 1) return;
  const chunk = Math.min(maxChunk, elapsed);
  try {
    await postEchoYoutubeWatchTogetherUsage(token, chunk);
    billing.anchorMs += chunk * 1000;
  } catch {
    billing.anchorMs = Date.now();
  }
}

export function clearUsageInterval(billing: YtUsageBilling): void {
  if (billing.interval) {
    clearInterval(billing.interval);
    billing.interval = null;
  }
}

export async function ytLoadPopular(c: YtBrowseCtx): Promise<void> {
  c.popularLoading.value = true;
  c.popularError.value = '';
  c.popularHint.value = null;
  try {
    const res = await fetchEchoYoutubePopular(c.token(), 'US');
    c.popularItems.value = res.items ?? [];
    c.popularHint.value = res.hint?.trim() ? res.hint : null;
    if (!c.popularItems.value.length && !c.popularHint.value) {
      c.popularError.value =
        'No recommendations available. Try search or paste a link.';
    }
  } catch (e) {
    c.popularError.value = youtubeListingFetchErrorMessage(e);
    c.popularItems.value = [];
  } finally {
    c.popularLoading.value = false;
  }
}

export async function ytRunSearch(c: YtBrowseCtx): Promise<void> {
  const q = c.searchDraft.value.trim();
  if (q.length < 2) {
    c.searchError.value = 'Enter a search or a full YouTube link.';
    return;
  }
  c.searchLoading.value = true;
  c.searchError.value = '';
  c.searchHint.value = null;
  try {
    const res = await fetchEchoYoutubeVcSearch(c.token(), q);
    c.searchResults.value = res.items ?? [];
    c.searchHint.value = res.hint?.trim() ? res.hint : null;
    if (!c.searchResults.value.length && !c.searchHint.value) {
      c.searchError.value =
        'No videos found. Try different words or paste a link.';
    }
  } catch (e) {
    c.searchError.value = youtubeListingFetchErrorMessage(e);
    c.searchResults.value = [];
  } finally {
    c.searchLoading.value = false;
  }
}

export async function ytApplyPresetSearch(
  c: YtBrowseCtx,
  q: string,
): Promise<void> {
  c.searchDraft.value = q;
  await ytRunSearch(c);
}

/** Single field: URL / video id plays immediately; otherwise YouTube search. */
export async function ytSubmitFindField(c: YtBrowseCtx): Promise<void> {
  const raw = c.searchDraft.value.trim();
  if (!raw) return;
  const id = parseYoutubeVideoId(raw);
  if (id) {
    c.searchError.value = '';
    c.searchHint.value = null;
    c.setVideo(id);
    return;
  }
  await ytRunSearch(c);
}

export async function ytLoadQueueSuggestions(c: YtBrowseCtx): Promise<void> {
  const s = c.state();
  if (s.phase !== 'youtube') return;
  const pl = s.playlist;
  if (!pl.length) {
    c.queueSuggestItems.value = [];
    return;
  }
  const cur = pl[s.currentIndex];
  if (!cur?.id) return;
  c.queueSuggestLoading.value = true;
  c.queueSuggestError.value = '';
  c.queueSuggestHint.value = null;
  try {
    const res = await fetchEchoYoutubeRelated(c.token(), cur.id);
    const inQueue = new Set(pl.map((e) => e.id));
    const raw = res.items ?? [];
    c.queueSuggestItems.value = raw.filter((i) => !inQueue.has(i.id));
    c.queueSuggestHint.value = res.hint?.trim() ? res.hint : null;
    if (!c.queueSuggestItems.value.length && raw.length > 0) {
      c.queueSuggestHint.value = 'Suggested picks are already in your queue.';
    } else if (!c.queueSuggestItems.value.length && !c.queueSuggestHint.value) {
      c.queueSuggestHint.value = 'No suggestions yet — try Search.';
    }
  } catch (e) {
    c.queueSuggestError.value = youtubeListingFetchErrorMessage(e);
    c.queueSuggestItems.value = [];
  } finally {
    c.queueSuggestLoading.value = false;
  }
}

/** Play now or append depending on whether a session is already playing. */
export function ytPickVideo(c: YtBrowseCtx, v: EchoYoutubeSearchItem): void {
  const meta = rowToMeta(v);
  const s = c.state();
  if (s.phase !== 'youtube') return;
  if (youtubeHasQueue(s)) {
    c.addToQueue(entryFromItem(v));
  } else {
    c.setVideo(v.id, meta);
  }
}

/** Always replace queue and play this video (queue row "play now" semantics). */
export function ytPlayVideoNow(c: YtBrowseCtx, v: EchoYoutubeSearchItem): void {
  c.setVideo(v.id, rowToMeta(v));
}

export function ytOpenBrowseFind(c: YtBrowseCtx): void {
  c.browseTab.value = 'find';
  c.setBrowseOpen(true);
}

export function ytOpenBrowseQueue(c: YtBrowseCtx): void {
  c.browseTab.value = 'queue';
  c.setBrowseOpen(true);
}

export function ytToggleBrowseFind(c: YtBrowseCtx): void {
  if (c.state().youtubeBrowseOpen && c.browseTab.value === 'find') {
    c.setBrowseOpen(false);
  } else {
    ytOpenBrowseFind(c);
  }
}

export function ytToggleBrowseQueue(c: YtBrowseCtx): void {
  if (c.state().youtubeBrowseOpen && c.browseTab.value === 'queue') {
    c.setBrowseOpen(false);
  } else {
    ytOpenBrowseQueue(c);
  }
}

/** Reset transient browse state on phase change; default to the Find tab. */
export function ytResetBrowseForPhase(
  c: YtBrowseCtx,
  phase: VcActivityUiState['phase'],
): void {
  if (phase !== 'youtube') {
    c.searchDraft.value = '';
    c.searchResults.value = [];
    c.searchError.value = '';
    c.searchHint.value = null;
    c.searchLoading.value = false;
    c.popularError.value = '';
    c.popularHint.value = null;
    c.browseTab.value = 'find';
    c.queueSuggestItems.value = [];
    c.queueSuggestError.value = '';
    c.queueSuggestHint.value = null;
  } else {
    c.browseTab.value = 'find';
  }
}

/** Start/stop wall-time billing and kick a popular load when YouTube opens. */
export function ytOnActiveChange(
  c: YtBrowseCtx,
  billing: YtUsageBilling,
  isYt: boolean,
  wasYt: boolean | undefined,
): void {
  if (wasYt === true && isYt === false) {
    void flushUsageSeconds(billing, c.token, YT_USAGE_BILL_FINAL_CAP_S);
  }
  clearUsageInterval(billing);
  billing.anchorMs = 0;
  if (!isYt) return;
  billing.anchorMs = Date.now();
  billing.interval = setInterval(() => {
    void flushUsageSeconds(billing, c.token, YT_USAGE_BILL_CHUNK_CAP_S);
  }, YT_USAGE_BILL_INTERVAL_MS);

  if (!c.popularItems.value.length && !c.popularLoading.value) {
    void ytLoadPopular(c);
  }
}

import { computed, onUnmounted, ref, watch } from 'vue';
import type { EchoYoutubeSearchItem } from '@/api/echo/youtubeVc';
import type {
  VcActivityUiState,
  YoutubePlaylistEntry,
} from '@/features/voice/vcActivityTypes';
import {
  clearUsageInterval,
  flushUsageSeconds,
  QUICK_SEARCH_PRESETS,
  YT_USAGE_BILL_FINAL_CAP_S,
  youtubeHasQueue,
  ytApplyPresetSearch,
  ytLoadPopular,
  ytLoadQueueSuggestions,
  ytOnActiveChange,
  ytPickVideo,
  ytPlayVideoNow,
  ytResetBrowseForPhase,
  ytSubmitFindField,
  ytToggleBrowseFind,
  ytToggleBrowseQueue,
  type YtBrowseCtx,
  type YtUsageBilling,
} from '@/features/voice/composables/vcYoutubeBrowseActions';

type UseVcYoutubeBrowseOptions = {
  state: () => VcActivityUiState;
  token: () => string | null;
  setVideo: YtBrowseCtx['setVideo'];
  setBrowseOpen: (open: boolean) => void;
  addToQueue: (entry: YoutubePlaylistEntry) => void;
};

/** Transient browse state — search / trending / queue-suggestion refs. */
function createYtBrowseRefs() {
  return {
    searchDraft: ref(''),
    searchLoading: ref(false),
    searchError: ref(''),
    searchResults: ref<EchoYoutubeSearchItem[]>([]),
    searchHint: ref<string | null>(null),
    browseTab: ref<'find' | 'queue'>('find'),
    popularLoading: ref(false),
    popularError: ref(''),
    popularItems: ref<EchoYoutubeSearchItem[]>([]),
    popularHint: ref<string | null>(null),
    queueSuggestLoading: ref(false),
    queueSuggestError: ref(''),
    queueSuggestHint: ref<string | null>(null),
    queueSuggestItems: ref<EchoYoutubeSearchItem[]>([]),
  };
}

/** Phase-driven resets, usage billing, and queue-suggestion refresh. */
function wireYtBrowseWatches(ctx: YtBrowseCtx, billing: YtUsageBilling): void {
  watch(
    () => ctx.state().phase,
    (phase) => ytResetBrowseForPhase(ctx, phase),
  );
  watch(
    () => ctx.state().phase === 'youtube',
    (isYt, wasYt) => ytOnActiveChange(ctx, billing, isYt, wasYt),
    { immediate: true },
  );
  watch(
    () => {
      const s = ctx.state();
      const youtube = s.phase === 'youtube';
      return [
        ctx.browseTab.value,
        youtube ? s.currentIndex : -1,
        youtube ? s.playlist.map((p) => p.id).join('|') : '',
      ] as const;
    },
    ([tab]) => {
      if (tab !== 'queue' || ctx.state().phase !== 'youtube') return;
      void ytLoadQueueSuggestions(ctx);
    },
  );
  onUnmounted(() => {
    if (billing.anchorMs) {
      void flushUsageSeconds(billing, ctx.token, YT_USAGE_BILL_FINAL_CAP_S);
    }
    clearUsageInterval(billing);
  });
}

/**
 * YouTube watch-together browse surface: search / trending / queue suggestions,
 * the Find↔Queue drawer tabs, and wall-time usage billing. Extracted from
 * VcActivityStage.vue; the SFC destructures the returned refs/actions verbatim.
 */
export function useVcYoutubeBrowse(opts: UseVcYoutubeBrowseOptions) {
  const refs = createYtBrowseRefs();
  const ctx: YtBrowseCtx = {
    state: opts.state,
    token: opts.token,
    setVideo: opts.setVideo,
    setBrowseOpen: opts.setBrowseOpen,
    addToQueue: opts.addToQueue,
    ...refs,
  };
  const billing: YtUsageBilling = { interval: null, anchorMs: 0 };

  const primaryFindRows = computed(() =>
    refs.searchResults.value.length
      ? refs.searchResults.value
      : refs.popularItems.value,
  );
  const queueSuggestSeedTitle = computed(() => {
    const s = ctx.state();
    if (s.phase !== 'youtube') return '';
    return s.playlist[s.currentIndex]?.title?.trim() || '';
  });
  const hasQueue = computed(() => youtubeHasQueue(ctx.state()));

  wireYtBrowseWatches(ctx, billing);

  return {
    ...refs,
    primaryFindRows,
    queueSuggestSeedTitle,
    hasQueue,
    QUICK_SEARCH_PRESETS,
    loadPopular: () => ytLoadPopular(ctx),
    loadQueueSuggestions: () => ytLoadQueueSuggestions(ctx),
    applyPresetSearch: (q: string) => ytApplyPresetSearch(ctx, q),
    submitFindField: () => ytSubmitFindField(ctx),
    pickVideo: (v: EchoYoutubeSearchItem) => ytPickVideo(ctx, v),
    playVideoNow: (v: EchoYoutubeSearchItem) => ytPlayVideoNow(ctx, v),
    toggleBrowseFind: () => ytToggleBrowseFind(ctx),
    toggleBrowseQueue: () => ytToggleBrowseQueue(ctx),
  };
}

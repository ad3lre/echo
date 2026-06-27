import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { EchoYoutubeSearchItem } from '@/api/echo/youtubeVc';
import type { VcActivityUiState } from '@/features/voice/vcActivityTypes';
import {
  entryFromItem,
  rowToMeta,
  youtubeHasQueue,
  youtubeListingFetchErrorMessage,
  ytPickVideo,
  ytPlayVideoNow,
  ytResetBrowseForPhase,
  ytToggleBrowseFind,
  ytToggleBrowseQueue,
  type YtBrowseCtx,
} from '@/features/voice/composables/vcYoutubeBrowseActions';

function item(id: string): EchoYoutubeSearchItem {
  return {
    id,
    title: `Title ${id}`,
    channelTitle: `Channel ${id}`,
    thumbnailUrl: `https://img/${id}.jpg`,
  };
}

function fakeState(
  overrides: Partial<VcActivityUiState> = {},
): VcActivityUiState {
  return {
    phase: 'youtube',
    youtubeVideoId: null,
    youtubeBrowseOpen: false,
    playlist: [],
    currentIndex: 0,
    watchTogetherSessionStarted: false,
    watchTogetherBrowseOpen: false,
    watchTogetherPlaylist: [],
    watchTogetherCurrentIndex: 0,
    watchTogetherLobbyRole: null,
    watchTogetherSessionId: null,
    watchTogetherSessionBytesUsed: 0,
    ...overrides,
  };
}

function makeCtx(state: VcActivityUiState) {
  const setVideo = vi.fn();
  const setBrowseOpen = vi.fn();
  const addToQueue = vi.fn();
  const ctx: YtBrowseCtx = {
    state: () => state,
    token: () => 'tok',
    setVideo,
    setBrowseOpen,
    addToQueue,
    searchDraft: ref('seeded'),
    searchLoading: ref(true),
    searchError: ref('boom'),
    searchResults: ref([item('a')]),
    searchHint: ref('hint'),
    browseTab: ref<'find' | 'queue'>('queue'),
    popularLoading: ref(false),
    popularError: ref('pop-err'),
    popularItems: ref([item('p')]),
    popularHint: ref('pop-hint'),
    queueSuggestLoading: ref(false),
    queueSuggestError: ref('q-err'),
    queueSuggestHint: ref('q-hint'),
    queueSuggestItems: ref([item('q')]),
  };
  return { ctx, setVideo, setBrowseOpen, addToQueue };
}

describe('vcYoutubeBrowseActions', () => {
  it('maps search rows to playlist meta / entries', () => {
    const v = item('x');
    expect(rowToMeta(v)).toEqual({
      title: 'Title x',
      channelTitle: 'Channel x',
      thumbnailUrl: 'https://img/x.jpg',
    });
    expect(entryFromItem(v)).toEqual({
      id: 'x',
      title: 'Title x',
      channelTitle: 'Channel x',
      thumbnailUrl: 'https://img/x.jpg',
    });
  });

  it('youtubeHasQueue is true only for a non-empty youtube playlist', () => {
    expect(youtubeHasQueue(fakeState({ playlist: [] }))).toBe(false);
    expect(
      youtubeHasQueue(fakeState({ playlist: [entryFromItem(item('a'))] })),
    ).toBe(true);
    expect(
      youtubeHasQueue(
        fakeState({ phase: 'pick', playlist: [entryFromItem(item('a'))] }),
      ),
    ).toBe(false);
  });

  it('falls back to a generic message for non-API errors', () => {
    expect(youtubeListingFetchErrorMessage(new Error('nope'))).toBe('nope');
    expect(youtubeListingFetchErrorMessage('weird')).toBe(
      "Something didn't work. Try again.",
    );
  });

  it('pickVideo appends to an existing queue, else replaces the video', () => {
    const withQueue = makeCtx(
      fakeState({ playlist: [entryFromItem(item('cur'))] }),
    );
    ytPickVideo(withQueue.ctx, item('new'));
    expect(withQueue.addToQueue).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new' }),
    );
    expect(withQueue.setVideo).not.toHaveBeenCalled();

    const empty = makeCtx(fakeState({ playlist: [] }));
    ytPickVideo(empty.ctx, item('new'));
    expect(empty.setVideo).toHaveBeenCalledWith(
      'new',
      expect.objectContaining({ title: 'Title new' }),
    );
    expect(empty.addToQueue).not.toHaveBeenCalled();
  });

  it('pickVideo is a no-op outside the youtube phase', () => {
    const { ctx, setVideo, addToQueue } = makeCtx(fakeState({ phase: 'pick' }));
    ytPickVideo(ctx, item('new'));
    expect(setVideo).not.toHaveBeenCalled();
    expect(addToQueue).not.toHaveBeenCalled();
  });

  it('playVideoNow always replaces the active video', () => {
    const { ctx, setVideo } = makeCtx(
      fakeState({ playlist: [entryFromItem(item('cur'))] }),
    );
    ytPlayVideoNow(ctx, item('new'));
    expect(setVideo).toHaveBeenCalledWith(
      'new',
      expect.objectContaining({ title: 'Title new' }),
    );
  });

  it('resets transient browse state when leaving the youtube phase', () => {
    const { ctx } = makeCtx(fakeState());
    ytResetBrowseForPhase(ctx, 'pick');
    expect(ctx.searchDraft.value).toBe('');
    expect(ctx.searchResults.value).toEqual([]);
    expect(ctx.searchError.value).toBe('');
    expect(ctx.searchHint.value).toBeNull();
    expect(ctx.searchLoading.value).toBe(false);
    expect(ctx.popularError.value).toBe('');
    expect(ctx.popularHint.value).toBeNull();
    expect(ctx.browseTab.value).toBe('find');
    expect(ctx.queueSuggestItems.value).toEqual([]);
  });

  it('keeps results but defaults to the Find tab when entering youtube', () => {
    const { ctx } = makeCtx(fakeState());
    ytResetBrowseForPhase(ctx, 'youtube');
    expect(ctx.browseTab.value).toBe('find');
    // Untouched: still holds prior results.
    expect(ctx.searchResults.value).toHaveLength(1);
    expect(ctx.searchDraft.value).toBe('seeded');
  });

  it('toggling a drawer tab opens it, or closes it when already shown', () => {
    const open = makeCtx(fakeState({ youtubeBrowseOpen: true }));
    open.ctx.browseTab.value = 'find';
    ytToggleBrowseFind(open.ctx);
    expect(open.setBrowseOpen).toHaveBeenLastCalledWith(false);

    const closed = makeCtx(fakeState({ youtubeBrowseOpen: false }));
    ytToggleBrowseQueue(closed.ctx);
    expect(closed.ctx.browseTab.value).toBe('queue');
    expect(closed.setBrowseOpen).toHaveBeenLastCalledWith(true);
  });
});

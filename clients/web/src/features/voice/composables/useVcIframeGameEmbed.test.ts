import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { useVcIframeGameEmbed } from './useVcIframeGameEmbed';

describe('useVcIframeGameEmbed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('defers Unity WebGL src assignment so IndexedDB startup is not raced', async () => {
    const phase = ref<'cluster_rush' | null>('cluster_rush');
    const url = ref('https://clusterrush.io/game/cluster-rush/');
    const visible = ref(true);

    const { iframeSrc } = useVcIframeGameEmbed({ phase, url, visible });
    expect(iframeSrc.value).toBe('about:blank');

    vi.advanceTimersByTime(49);
    expect(iframeSrc.value).toBe('about:blank');

    vi.advanceTimersByTime(1);
    expect(iframeSrc.value).toBe(url.value);
  });

  it('assigns non-Unity iframe src immediately', async () => {
    const phase = ref<'skribbl_io' | null>('skribbl_io');
    const url = ref('https://skribbl.io/');
    const visible = ref(true);

    const { iframeSrc } = useVcIframeGameEmbed({ phase, url, visible });
    await nextTick();
    vi.runAllTimers();
    expect(iframeSrc.value).toBe(url.value);
  });

  it('bumps key when switching between embed games', async () => {
    const phase = ref<'cluster_rush' | 'krunker' | null>('cluster_rush');
    const url = ref('https://clusterrush.io/game/cluster-rush/');
    const visible = ref(true);

    const { iframeKey } = useVcIframeGameEmbed({ phase, url, visible });
    const firstKey = iframeKey.value;

    phase.value = 'krunker';
    url.value = 'https://krunker.io/';
    await nextTick();

    expect(iframeKey.value).toBeGreaterThan(firstKey);
  });

  it('blanks iframe when hidden', async () => {
    const phase = ref<'cluster_rush' | null>('cluster_rush');
    const url = ref('https://clusterrush.io/game/cluster-rush/');
    const visible = ref(true);

    const { iframeSrc } = useVcIframeGameEmbed({ phase, url, visible });
    vi.runAllTimers();
    expect(iframeSrc.value).toBe(url.value);

    visible.value = false;
    await nextTick();
    expect(iframeSrc.value).toBe('about:blank');
  });
});

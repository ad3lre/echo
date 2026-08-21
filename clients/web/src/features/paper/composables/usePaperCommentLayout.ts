import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import type { PaperPageLayout } from '@/features/paper/composables/usePaperPageLayout';

export const PAPER_CARD_WIDTH = 268;
export const PAPER_COMMENT_GAP = 20;
export const PAPER_STACKED_MARGIN = 24;
/** Horizontal padding + safety margin beside page + card */
const SIDE_RESERVE = 48;

export type PaperCommentLayoutMode = 'beside' | 'stacked';

export function usePaperCommentLayout(
  scrollRoot: Ref<HTMLElement | null>,
  pageLayout: Ref<PaperPageLayout>,
) {
  const mode = ref<PaperCommentLayoutMode>('beside');

  function measure() {
    const root = scrollRoot.value;
    const pl = pageLayout.value;
    if (!root || pl.width <= 0) {
      mode.value = 'beside';
      return;
    }
    const needed =
      pl.width + PAPER_CARD_WIDTH + PAPER_COMMENT_GAP + SIDE_RESERVE;
    mode.value = root.clientWidth >= needed ? 'beside' : 'stacked';
  }

  const stackedBaseTop = computed(() => {
    const pl = pageLayout.value;
    if (pl.height <= 0) return 0;
    return pl.top + pl.height + PAPER_STACKED_MARGIN;
  });

  onMounted(() => {
    window.addEventListener('resize', measure);
    measure();
  });

  onUnmounted(() => {
    window.removeEventListener('resize', measure);
  });

  watch(pageLayout, measure, { deep: true });

  return { mode, stackedBaseTop, measure };
}

/** Avoid overlapping comment cards at similar anchor Y positions. */
export function stackCommentTops(
  items: { id: string; top: number }[],
  cardEstimate = 108,
  gap = 8,
): Map<string, number> {
  const sorted = [...items].sort((a, b) => a.top - b.top);
  const result = new Map<string, number>();
  let lastBottom = -Infinity;
  for (const item of sorted) {
    let top = item.top;
    if (top < lastBottom + gap) {
      top = lastBottom + gap;
    }
    result.set(item.id, top);
    lastBottom = top + cardEstimate;
  }
  return result;
}

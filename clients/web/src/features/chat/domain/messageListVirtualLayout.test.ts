import { describe, expect, it } from 'vitest';
import {
  buildInitialMeasurementsCacheForChannel,
  getCachedMessageRowHeightPx,
  resetMessageRowHeightStoreForTests,
  setMessageRowHeightPx,
} from '@/features/chat/domain/messageRowHeightStore';
import {
  MESSAGE_LIST_EMOJI_ONLY_GLYPH_PX,
  estimateMessageBodyHeightPx,
} from '@/features/chat/domain/messageBodyEmojiGeometry';
import { estimateMessageListRowSizePx } from '@/features/chat/domain/messageListRowEstimate';

/** TanStack-style cumulative layout from per-index sizes. */
function layoutFromSizes(sizes: readonly number[]): {
  start: number[];
  end: number[];
  total: number;
} {
  const start: number[] = [];
  const end: number[] = [];
  let offset = 0;
  for (let i = 0; i < sizes.length; i++) {
    start.push(offset);
    offset += sizes[i]!;
    end.push(offset);
  }
  return { start, end, total: offset };
}

function consecutiveSlotGapsPx(sizes: readonly number[]): number[] {
  const { start, end } = layoutFromSizes(sizes);
  const out: number[] = [];
  for (let i = 0; i < start.length - 1; i++) {
    out.push(start[i + 1]! - end[i]!);
  }
  return out;
}

/** Content painted below the allocated slot when measured > slot size. */
function slotContentOverflowPx(
  slotSizes: readonly number[],
  measuredHeights: readonly number[],
): number[] {
  return slotSizes.map((slot, i) =>
    Math.max(0, (measuredHeights[i] ?? slot) - slot),
  );
}

function visualOverlapCount(
  slotSizes: readonly number[],
  measuredHeights: readonly number[],
): number {
  const overflow = slotContentOverflowPx(slotSizes, measuredHeights);
  let count = 0;
  for (let i = 0; i < overflow.length - 1; i++) {
    if (overflow[i]! > 2) count += 1;
  }
  return count;
}

/** Simulate measure-after-render: virtualizer slot sizes converge to measured heights. */
function simulateMeasureConvergence(
  estimates: number[],
  measured: number[],
  maxPasses = 8,
): { passes: number; sizes: number[]; visualOverlaps: number } {
  const sizes = [...estimates];
  let passes = 0;
  for (; passes < maxPasses; passes++) {
    let changed = false;
    for (let i = 0; i < sizes.length; i++) {
      const m = measured[i]!;
      if (Math.abs(sizes[i]! - m) >= 0.5) {
        sizes[i] = m;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return {
    passes,
    sizes,
    visualOverlaps: visualOverlapCount(sizes, measured),
  };
}

describe('message list virtual layout math', () => {
  it('keeps TanStack slot offsets contiguous (start[i+1] always equals end[i])', () => {
    const sizes = [88, 120, 64, 200];
    expect(consecutiveSlotGapsPx(sizes).every((g) => Math.abs(g) < 0.001)).toBe(
      true,
    );
  });

  it('predicts visual collision when slot size stays below measured height', () => {
    const measured = [88, 420, 64];
    const slotSizes = [88, 120, 64];
    expect(visualOverlapCount(slotSizes, measured)).toBe(1);
    expect(slotContentOverflowPx(slotSizes, measured)[1]).toBe(300);
    // Slots are still contiguous in virtual space — collision is overflow, not gap<0.
    expect(consecutiveSlotGapsPx(slotSizes).every((g) => g === 0)).toBe(true);
  });

  it('eliminates visual collision after sizes converge to measured heights', () => {
    const measured = [88, 420, 64];
    const estimates = [88, 120, 64];
    expect(visualOverlapCount(estimates, measured)).toBe(1);
    const { visualOverlaps, sizes } = simulateMeasureConvergence(
      estimates,
      measured,
    );
    expect(visualOverlaps).toBe(0);
    expect(sizes).toEqual(measured);
  });

  it('clip-shell model: slot height bounds paint even before measure converges', () => {
    // Absolute rows without an explicit slot height expand to content, so
    // overflow:hidden cannot stop bleed into the next translateY neighbor.
    // With height=slotSize, paint is clipped to the slot (collision → clip).
    const slotSizes = [88, 120, 64];
    const measured = [88, 420, 64];
    const paintOverlapWithoutClip = visualOverlapCount(slotSizes, measured);
    expect(paintOverlapWithoutClip).toBe(1);

    const clippedPaintHeights = measured.map((m, i) =>
      Math.min(m, slotSizes[i]!),
    );
    expect(visualOverlapCount(slotSizes, clippedPaintHeights)).toBe(0);
  });

  it('adeliverse-style link embeds + day separator need more than a plain text slot', () => {
    const plainGrouped = estimateMessageListRowSizePx({
      groupedWithPrevious: true,
      showDaySeparatorBefore: false,
      message: { content: 'no complaints thus far' },
    });
    const withLinksAndDay = estimateMessageListRowSizePx({
      groupedWithPrevious: false,
      showDaySeparatorBefore: true,
      message: {
        content:
          'Here is some more information\nhttps://math.stackexchange.com/questions/4231560/example',
        embeds: [
          {
            url: 'https://math.stackexchange.com/questions/4231560/example',
            title: 'General linear group',
            description:
              'And for Affine General Linear groups: structure and properties.',
            provider: 'Mathematics Stack Exchange',
          },
          {
            url: 'https://math.stackexchange.com/questions/988864/example',
            title: 'AGL(V)',
            description: 'Affine general linear group notes.',
            provider: 'Mathematics Stack Exchange',
          },
        ],
      },
    });
    expect(withLinksAndDay - plainGrouped).toBeGreaterThan(200);
  });

  it('buildInitialMeasurementsCache cumulative offsets equal sum of row sizes', () => {
    resetMessageRowHeightStoreForTests();
    setMessageRowHeightPx('c1', 'm0', 100, 'r0');
    setMessageRowHeightPx('c1', 'm2', 180, 'r2');
    const ids = ['m0', 'm1', 'm2'];
    const items = buildInitialMeasurementsCacheForChannel(
      'c1',
      ids,
      (index) =>
        getCachedMessageRowHeightPx('c1', ids[index], `r${index}`) ??
        [90, 110, 70][index]!,
      (index) =>
        getCachedMessageRowHeightPx('c1', ids[index], `r${index}`) != null,
    );
    expect(items).toHaveLength(3);
    expect(items[0]?.start).toBe(0);
    expect(items[0]?.end).toBe(100);
    expect(items[1]?.start).toBe(100);
    expect(items[1]?.end).toBe(210);
    expect(items[2]?.start).toBe(210);
    expect(items[2]?.end).toBe(390);
    expect(items[2]?.end - items[0]!.start).toBe(
      items.reduce((sum, item) => sum + item.size, 0),
    );
  });

  it('returns no initial cache when nothing is revision-measured (estimates only)', () => {
    resetMessageRowHeightStoreForTests();
    const items = buildInitialMeasurementsCacheForChannel(
      'c1',
      ['a', 'b'],
      () => 88,
      () => false,
    );
    expect(items).toEqual([]);
  });

  it('emoji-only body estimate reserves at least one 48px glyph row', () => {
    expect(estimateMessageBodyHeightPx('<:pepe:1>')).toBeGreaterThanOrEqual(
      MESSAGE_LIST_EMOJI_ONLY_GLYPH_PX,
    );
    expect(estimateMessageBodyHeightPx('👋')).toBeGreaterThanOrEqual(
      MESSAGE_LIST_EMOJI_ONLY_GLYPH_PX,
    );
  });

  it('GIF/link embed estimate exceeds plain-text-only row for same message', () => {
    const plain = estimateMessageListRowSizePx({
      groupedWithPrevious: false,
      showDaySeparatorBefore: false,
      message: { content: 'https://tenor.com/view/example' },
    });
    const withEmbed = estimateMessageListRowSizePx({
      groupedWithPrevious: false,
      showDaySeparatorBefore: false,
      message: {
        content: 'https://tenor.com/view/example',
        embeds: [
          {
            url: 'https://tenor.com/view/example',
            image: {
              url: 'https://media.tenor.com/x.gif',
              width: 480,
              height: 270,
            },
          },
        ],
      },
    });
    expect(withEmbed - plain).toBeGreaterThanOrEqual(200);
  });

  it('scroll compensation: growing row i shifts all later starts by delta', () => {
    const before = layoutFromSizes([100, 80, 120]);
    const delta = 60;
    const rowIndex = 1;
    const after = layoutFromSizes([100, 80 + delta, 120]);
    expect(after.start[rowIndex + 1]! - before.start[rowIndex + 1]!).toBe(
      delta,
    );
    expect(after.total - before.total).toBe(delta);
  });
});

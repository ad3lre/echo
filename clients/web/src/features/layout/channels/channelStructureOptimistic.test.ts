import { describe, expect, it } from 'vitest';
import type { ChannelCategory } from '@/features/layout/channels/useChannels';
import type { ChannelSummary } from '@shared/types';
import {
  applyOptimisticCategoryReorder,
  applyOptimisticChannelReorder,
} from '@/features/layout/channels/channelStructureOptimistic';

function ch(id: string, extra: Partial<ChannelSummary> = {}): ChannelSummary {
  return {
    id,
    name: id,
    type: 'text',
    ...extra,
  } as ChannelSummary;
}

function namedCat(id: string, channels: ChannelSummary[]): ChannelCategory {
  return { id, name: id, channels };
}

function hideCat(channels: ChannelSummary[]): ChannelCategory {
  return {
    id: `__uncategorized_${channels[0]?.id ?? 'empty'}`,
    name: 'Uncategorized',
    hideCategoryHeader: true,
    channels,
  };
}

describe('applyOptimisticCategoryReorder', () => {
  it('reorders named categories while preserving uncategorized slots', () => {
    const categories = [
      namedCat('a', [ch('a1')]),
      hideCat([ch('r1')]),
      namedCat('b', [ch('b1')]),
    ];
    const next = applyOptimisticCategoryReorder(categories, 'b', 0);
    expect(next?.map((c) => c.id)).toEqual(['b', '__uncategorized_r1', 'a']);
  });

  it('returns null when order is unchanged', () => {
    const categories = [namedCat('a', []), namedCat('b', [])];
    expect(applyOptimisticCategoryReorder(categories, 'a', 0)).toBeNull();
  });
});

describe('applyOptimisticChannelReorder', () => {
  it('reorders within the same category', () => {
    const categories = [namedCat('cat', [ch('one'), ch('two'), ch('three')])];
    const next = applyOptimisticChannelReorder(categories, 'three', 'cat', 0);
    expect(next?.[0]?.channels.map((c) => c.id)).toEqual([
      'three',
      'one',
      'two',
    ]);
  });

  it('moves a channel into another category', () => {
    const categories = [
      namedCat('src', [ch('move'), ch('stay')]),
      namedCat('dst', [ch('d1')]),
    ];
    const next = applyOptimisticChannelReorder(categories, 'move', 'dst', 1);
    expect(next?.[0]?.channels.map((c) => c.id)).toEqual(['stay']);
    expect(next?.[1]?.channels.map((c) => c.id)).toEqual(['d1', 'move']);
  });

  it('moves a channel to uncategorized', () => {
    const categories = [namedCat('src', [ch('move')]), hideCat([ch('r1')])];
    const next = applyOptimisticChannelReorder(categories, 'move', null, 0);
    expect(next?.[0]?.channels).toHaveLength(0);
    expect(next?.[1]?.channels.map((c) => c.id)).toEqual(['move', 'r1']);
  });
});

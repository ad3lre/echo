import type { IconCatalogEntry } from '@/assets/iconCatalog';
import { describe, expect, it } from 'vitest';
import {
  getChannelIconSortKeys,
  sortIconsForChannelPicker,
} from './iconChannelSort';

function entry(id: string, label?: string): IconCatalogEntry {
  return { id, url: `https://test/${id}`, label: label ?? id };
}

describe('getChannelIconSortKeys', () => {
  it('assigns tier 0 when chat or voice keyword hits', () => {
    const k = getChannelIconSortKeys(entry('message-bubble.svg'));
    expect(k.tier).toBe(0);
    expect(k.chatIdx).toBeLessThan(9999);
  });

  it('assigns tier 1 for secondary keywords only', () => {
    const k = getChannelIconSortKeys(entry('random-user-icon.svg'));
    expect(k.tier).toBe(1);
  });

  it('assigns tier 2 when no keywords match', () => {
    const k = getChannelIconSortKeys(entry('xyz-unknown.svg'));
    expect(k.tier).toBe(2);
  });
});

describe('sortIconsForChannelPicker', () => {
  it('orders chat keywords before voice for text channels', () => {
    const sorted = sortIconsForChannelPicker(
      [entry('volume-high.svg'), entry('message-1.svg')],
      'text',
    );
    expect(sorted[0]!.id).toContain('message');
  });

  it('orders voice before chat for voice channels', () => {
    const sorted = sortIconsForChannelPicker(
      [entry('message-1.svg'), entry('volume-high.svg')],
      'voice',
    );
    expect(sorted[0]!.id).toContain('volume');
  });
});

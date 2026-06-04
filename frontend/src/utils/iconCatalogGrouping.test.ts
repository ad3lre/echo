import type { IconCatalogEntry } from '@/assets/iconCatalog';
import { describe, expect, it } from 'vitest';
import {
  getBaseIconGroupKey,
  groupIconCatalogEntries,
  resolveSemanticMegaKey,
} from './iconCatalogGrouping';

function e(id: string, label: string): IconCatalogEntry {
  return { id, url: `https://test/${id}`, label };
}

describe('getBaseIconGroupKey', () => {
  it('strips numeric and variant suffixes when channelType omitted', () => {
    expect(getBaseIconGroupKey('message-2.svg')).toBe('message');
    expect(getBaseIconGroupKey('camera-on.svg')).toBe('camera');
    expect(getBaseIconGroupKey('ICON-FILLED.SVG')).toBe('icon');
  });

  it('uses semantic mega key for tier-0 chat icons when channelType is set', () => {
    expect(getBaseIconGroupKey('CHAT-NORMAL.svg', 'text')).toBe(
      '__mega_messaging',
    );
    expect(getBaseIconGroupKey('message.svg', 'text')).toBe('__mega_messaging');
  });

  it('does not mega-group unrelated names', () => {
    expect(getBaseIconGroupKey('chateau.svg', 'text')).toBe('chateau');
    expect(getBaseIconGroupKey('coffee.svg', 'text')).toBe('coffee');
  });

  it('mega-groups math and hobby pack prefixes', () => {
    expect(getBaseIconGroupKey('math-sigma.svg', 'text')).toBe('__mega_math');
    expect(getBaseIconGroupKey('hobby-dice.svg', 'text')).toBe(
      '__mega_hobbies',
    );
  });
});

describe('resolveSemanticMegaKey', () => {
  it('classifies chat vs voice for text channel preference', () => {
    expect(resolveSemanticMegaKey(e('chat.svg', 'chat'), 'text')).toBe(
      'messaging',
    );
    expect(resolveSemanticMegaKey(e('volume up.svg', 'volume'), 'text')).toBe(
      'voice',
    );
  });

  it('classifies math and hobby packs', () => {
    expect(resolveSemanticMegaKey(e('math-pi.svg', 'math-pi'), 'text')).toBe(
      'math',
    );
    expect(
      resolveSemanticMegaKey(e('hobby-guitar.svg', 'hobby-guitar'), 'text'),
    ).toBe('hobbies');
  });
});

describe('groupIconCatalogEntries', () => {
  it('clusters variants and sorts families', () => {
    const entries = [
      e('message.svg', 'Message'),
      e('message-filled.svg', 'Message Filled'),
    ];
    const groups = groupIconCatalogEntries(entries, 'text');
    expect(groups).toHaveLength(1);
    expect(groups[0]!.variants.length).toBe(2);
  });

  it('merges many chat/message filenames into one mega family', () => {
    const entries = [
      e('chat.svg', 'chat'),
      e('CHAT-NORMAL.svg', 'CHAT-NORMAL'),
      e('message.svg', 'message'),
      e('volume up.svg', 'volume up'),
    ];
    const groups = groupIconCatalogEntries(entries, 'text');
    const mega = groups.find((g) => g.key === '__mega_messaging');
    expect(mega).toBeDefined();
    expect(mega!.variants).toHaveLength(3);
    expect(mega!.label).toBe('Chat & messages');
    expect(groups.some((g) => g.key === '__mega_voice')).toBe(true);
  });
});

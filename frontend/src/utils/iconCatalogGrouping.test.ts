import type { IconCatalogEntry } from '@/assets/iconCatalog';
import { describe, expect, it } from 'vitest';
import {
  getBaseIconGroupKey,
  groupIconCatalogEntries,
  normalizeIconStem,
} from './iconCatalogGrouping';

function e(id: string, label: string): IconCatalogEntry {
  return { id, url: `https://test/${id}`, label };
}

describe('normalizeIconStem', () => {
  it('lowercases and converts spaces to hyphens', () => {
    expect(normalizeIconStem('volume up.svg')).toBe('volume-up');
    expect(normalizeIconStem('USER-AVATAR.svg')).toBe('user-avatar');
  });
});

describe('getBaseIconGroupKey', () => {
  it('strips numeric and variant suffixes', () => {
    expect(getBaseIconGroupKey('message-2.svg')).toBe('message');
    expect(getBaseIconGroupKey('camera-on.svg')).toBe('camera');
    expect(getBaseIconGroupKey('ICON-FILLED.SVG')).toBe('icon');
  });

  it('groups -x and stylistic -y alts with their base', () => {
    expect(getBaseIconGroupKey('USER-AVATAR-X.svg')).toBe('user-avatar');
    expect(getBaseIconGroupKey('USER-AVATAR-XY.svg')).toBe('user-avatar');
    expect(getBaseIconGroupKey('USER-AVATAR-OFFY.svg')).toBe('user-avatar');
    expect(getBaseIconGroupKey('notifications-x.svg')).toBe('notifications');
    expect(getBaseIconGroupKey('TRASH-X.svg')).toBe('trash');
  });

  it('does not group unrelated icons by topic', () => {
    expect(getBaseIconGroupKey('chat.svg')).toBe('chat');
    expect(getBaseIconGroupKey('message.svg')).toBe('message');
    expect(getBaseIconGroupKey('CHAT-NORMAL.svg')).toBe('chat');
    expect(getBaseIconGroupKey('math-sigma.svg')).toBe('math-sigma');
    expect(getBaseIconGroupKey('math-pi.svg')).toBe('math-pi');
    expect(getBaseIconGroupKey('hobby-dice.svg')).toBe('hobby-dice');
    expect(getBaseIconGroupKey('hobby-guitar.svg')).toBe('hobby-guitar');
  });

  it('groups volume level icons as volume variants', () => {
    expect(getBaseIconGroupKey('volume up.svg')).toBe('volume');
    expect(getBaseIconGroupKey('volume down.svg')).toBe('volume');
    expect(getBaseIconGroupKey('VOLUME-X.svg')).toBe('volume');
  });

  it('normalizes spaced filenames to the same family key', () => {
    expect(getBaseIconGroupKey('user avatar.svg')).toBe('user-avatar');
    expect(getBaseIconGroupKey('USER-AVATAR.svg')).toBe('user-avatar');
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

  it('keeps chat and message as separate families', () => {
    const entries = [
      e('chat.svg', 'chat'),
      e('CHAT-NORMAL.svg', 'CHAT-NORMAL'),
      e('message.svg', 'message'),
      e('volume up.svg', 'volume up'),
    ];
    const groups = groupIconCatalogEntries(entries, 'text');
    expect(groups.find((g) => g.key === 'chat')?.variants).toHaveLength(2);
    expect(groups.find((g) => g.key === 'message')?.variants).toHaveLength(1);
    expect(groups.find((g) => g.key === 'volume')?.variants).toHaveLength(1);
  });

  it('merges user-avatar overlay variants', () => {
    const entries = [
      e('USER-AVATAR.svg', 'USER-AVATAR'),
      e('USER-AVATAR-X.svg', 'USER-AVATAR-X'),
      e('USER-AVATAR-OFF.svg', 'USER-AVATAR-OFF'),
      e('USER-AVATAR-OFFY.svg', 'USER-AVATAR-OFFY'),
    ];
    const groups = groupIconCatalogEntries(entries, 'text');
    expect(groups).toHaveLength(1);
    expect(groups[0]!.variants).toHaveLength(4);
    expect(groups[0]!.representative.id).toBe('USER-AVATAR.svg');
  });
});

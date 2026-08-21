import type { IconCatalogEntry } from '@/assets/iconCatalog';
import { describe, expect, it } from 'vitest';
import {
  getBaseIconGroupKey,
  groupIconCatalogEntries,
  resolveDenseFamilyPrefix,
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
    expect(getBaseIconGroupKey('telescope.svg', 'text')).toBe('telescope');
  });

  it('mega-groups math and hobby pack prefixes', () => {
    expect(getBaseIconGroupKey('math-sigma.svg', 'text')).toBe('__mega_math');
    expect(getBaseIconGroupKey('hobby-dice.svg', 'text')).toBe(
      '__mega_hobbies',
    );
  });

  it('dense-groups user-avatar and users-avatar packs', () => {
    expect(getBaseIconGroupKey('USER-AVATAR-SEARCH.svg', 'text')).toBe(
      'user-avatar',
    );
    expect(getBaseIconGroupKey('USER-AVATAR.svg', 'text')).toBe('user-avatar');
    expect(getBaseIconGroupKey('USERS-AVATAR-GROUP.svg', 'text')).toBe(
      'users-avatar',
    );
    expect(getBaseIconGroupKey('user-block.svg', 'text')).toBe('user');
    expect(getBaseIconGroupKey('users.svg', 'text')).toBe('users');
  });
});

describe('resolveDenseFamilyPrefix', () => {
  it('normalizes spaces and case', () => {
    expect(resolveDenseFamilyPrefix('user avatar.svg')).toBe('user-avatar');
    expect(resolveDenseFamilyPrefix('Users avatar.svg')).toBe('users-avatar');
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

  it('classifies tier-2 social icons into people mega', () => {
    expect(resolveSemanticMegaKey(e('friend.svg', 'friend'), 'text')).toBe(
      'people',
    );
    expect(
      resolveSemanticMegaKey(e('USER-AVATAR-SEARCH.svg', 'search'), 'text'),
    ).toBeNull();
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

  it('clusters many USER-AVATAR variants into one family', () => {
    const entries = [
      e('USER-AVATAR.svg', 'USER-AVATAR'),
      e('USER-AVATAR-SEARCH.svg', 'USER-AVATAR-SEARCH'),
      e('USER-AVATAR-OFF.svg', 'USER-AVATAR-OFF'),
      e('user.svg', 'user'),
      e('user-block.svg', 'user-block'),
    ];
    const groups = groupIconCatalogEntries(entries, 'text');
    const avatar = groups.find((g) => g.key === 'user-avatar');
    expect(avatar?.variants).toHaveLength(3);
    const user = groups.find((g) => g.key === 'user');
    expect(user?.variants).toHaveLength(2);
  });

  it('mega-groups navigation, film, log, food, and doors variants', () => {
    const entries = [
      e('arrow-left.svg', 'arrow-left'),
      e('arrow right.svg', 'arrow right'),
      e('down left.svg', 'down left'),
      e('film.svg', 'film'),
      e('FILM-FILLED.svg', 'FILM-FILLED'),
      e('repeat.svg', 'repeat'),
      e('REPEAT-NORMAL.svg', 'REPEAT-NORMAL'),
      e('log in.svg', 'log in'),
      e('log out.svg', 'log out'),
      e('open doors.svg', 'open doors'),
      e('close doors.svg', 'close doors'),
      e('restaurant.svg', 'restaurant'),
      e('food tray.svg', 'food tray'),
    ];
    const groups = groupIconCatalogEntries(entries, 'text');
    expect(
      groups.find((g) => g.key === '__mega_navigation')?.variants,
    ).toHaveLength(5);
    expect(
      groups.find((g) => g.key === '__mega_images')?.variants,
    ).toHaveLength(2);
    expect(groups.find((g) => g.key === '__mega_log')?.variants).toHaveLength(
      2,
    );
    expect(groups.find((g) => g.key === '__mega_doors')?.variants).toHaveLength(
      2,
    );
    expect(groups.find((g) => g.key === '__mega_food')?.variants).toHaveLength(
      2,
    );
  });
});

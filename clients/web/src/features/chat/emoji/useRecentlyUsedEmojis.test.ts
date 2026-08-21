/* @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import {
  recentlyUsedEmojiRows,
  useRecentlyUsedEmojis,
  type RecentEmojiStored,
} from './useRecentlyUsedEmojis';

describe('useRecentlyUsedEmojis', () => {
  it('returns custom recent emojis across server contexts', () => {
    const prev = recentlyUsedEmojiRows.value;
    const row: RecentEmojiStored = {
      v: 3,
      kind: 'custom',
      token: '<:party_blob:123>',
      id: '123',
      name: 'party_blob',
      url: 'https://cdn.test/party_blob.webp',
      serverId: 'server-a',
      animated: false,
    };
    try {
      recentlyUsedEmojiRows.value = [row];
      const { recentPickerEntries } = useRecentlyUsedEmojis();
      const entries = recentPickerEntries('server-b');
      expect(entries).toHaveLength(1);
      expect(entries[0]?.emoji).toBe('<:party_blob:123>');
    } finally {
      recentlyUsedEmojiRows.value = prev;
    }
  });
});

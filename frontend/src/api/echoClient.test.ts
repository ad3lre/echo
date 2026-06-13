import { describe, it, expect } from 'vitest';
import {
  groupEchoChannelsToCategories,
  mergeEchoChannelCategoriesWithRoots,
} from './echoClient';
import {
  dedupeRawMessagesById,
  mapEchoMessageToRaw,
} from '@/services/domain/echoMessageSnapshots';

describe('echoClient helpers', () => {
  it('mapEchoMessageToRaw maps fields and timestamps', () => {
    const apiMsg: any = {
      id: 'm1',
      channelId: 'c1',
      authorId: 'a1',
      content: 'hello',
      mentions: [{ id: 'u1' }],
      replyTo: { messageId: 'r1', authorName: 'X', content: 'old' },
      editedAt: '2020-01-01T00:00:00Z',
      timestamp: '2020-01-01T00:00:00Z',
      embeds: [{ url: 'https://x' }],
    };
    const out = mapEchoMessageToRaw(apiMsg);
    expect(out.id).toBe('m1');
    expect(out.content).toBe('hello');
    expect(out.mentions).toBeDefined();
    expect(out.replyTo).toBeDefined();
    expect(out.editedAt).toBeDefined();
    expect(typeof out.timestamp).toBe('string');
    expect(Number.isFinite(Date.parse(out.timestamp))).toBe(true);
  });

  it('dedupeRawMessagesById filters missing and duplicate ids', () => {
    const msgs: any[] = [
      { id: 'a', content: '1' },
      { id: '', content: 'bad' },
      { id: 'a', content: 'dup' },
      { id: 'b', content: '2' },
    ];
    const out = dedupeRawMessagesById(msgs);
    expect(out.length).toBe(2);
    expect(out.find((m) => m.id === 'a')!.content).toBe('1');
    expect(out.find((m) => m.id === 'b')).toBeTruthy();
  });

  it('mergeEchoChannelCategoriesWithRoots interleaves categories and categoryless channels by position', () => {
    const categories = [
      { id: 'cat-a', name: 'Alpha', position: 2 },
      { id: 'cat-b', name: 'Beta', position: 5 },
    ];
    const channels: any[] = [
      {
        id: 'root-1',
        name: 'lobby',
        categoryId: '',
        categoryName: '',
        categoryPosition: 0,
        position: 1,
        type: 'text',
        slowmodeSeconds: 0,
        userLimit: 0,
        nsfw: false,
        bitrateBps: null,
      },
      {
        id: 'c1',
        name: 'general',
        categoryId: 'cat-a',
        categoryName: 'Alpha',
        categoryPosition: 2,
        position: 0,
        type: 'text',
        slowmodeSeconds: 0,
        userLimit: 0,
        nsfw: false,
        bitrateBps: null,
      },
      {
        id: 'root-2',
        name: 'voice-lobby',
        categoryId: '',
        categoryName: '',
        categoryPosition: 0,
        position: 4,
        type: 'voice',
        slowmodeSeconds: 0,
        userLimit: 0,
        nsfw: false,
        bitrateBps: 64000,
      },
    ];
    const out = mergeEchoChannelCategoriesWithRoots(
      categories,
      channels,
      'srv',
    );
    expect(out.map((b) => b.id)).toEqual([
      '__uncategorized_root-1',
      'cat-a',
      '__uncategorized_root-2',
      'cat-b',
    ]);
    expect(out[0]?.name).toBe('Uncategorized');
    expect(out[0]?.hideCategoryHeader).toBe(true);
    expect(out[0]?.channels.map((c) => c.name)).toEqual(['lobby']);
    expect(out[2]?.name).toBe('Uncategorized');
    expect(out[2]?.channels.map((c) => c.name)).toEqual(['voice-lobby']);
  });

  it('mergeEchoChannelCategoriesWithRoots pins system channels above regular categories', () => {
    const categories = [{ id: 'cat-a', name: 'Text', position: 0 }];
    const channels: any[] = [
      {
        id: 'roles',
        name: 'roles',
        categoryId: 'cat-a',
        categoryName: 'Text',
        categoryPosition: 0,
        position: -1,
        type: 'selfRoles',
        slowmodeSeconds: 0,
        userLimit: 0,
        nsfw: false,
        bitrateBps: null,
      },
      {
        id: 'general',
        name: 'general',
        categoryId: 'cat-a',
        categoryName: 'Text',
        categoryPosition: 0,
        position: 0,
        type: 'text',
        slowmodeSeconds: 0,
        userLimit: 0,
        nsfw: false,
        bitrateBps: null,
      },
    ];
    const out = mergeEchoChannelCategoriesWithRoots(
      categories,
      channels,
      'srv',
    );
    expect(out[0]?.systemSection).toBe(true);
    expect(out[0]?.channels.map((c) => c.id)).toEqual(['roles']);
    expect(out[1]?.id).toBe('cat-a');
    expect(out[1]?.channels.map((c) => c.id)).toEqual(['general']);
  });

  it('groupEchoChannelsToCategories groups and orders channels', () => {
    const channels: any[] = [
      {
        id: '1',
        name: 'c1',
        categoryId: 'cat1',
        categoryName: 'Cat',
        categoryPosition: 1,
        position: 2,
        slowmodeSeconds: 0,
        userLimit: 0,
        nsfw: false,
        bitrateBps: null,
      },
      {
        id: '2',
        name: 'c2',
        categoryId: 'cat1',
        categoryName: 'Cat',
        categoryPosition: 1,
        position: 1,
        slowmodeSeconds: 0,
        userLimit: 0,
        nsfw: false,
        bitrateBps: null,
      },
      {
        id: '3',
        name: 'voice',
        categoryId: 'cat2',
        categoryName: 'Voice',
        categoryPosition: 2,
        position: 1,
        type: 'voice',
        slowmodeSeconds: 0,
        userLimit: 5,
        nsfw: false,
        bitrateBps: 64,
      },
    ];
    const out = groupEchoChannelsToCategories(channels, 'srv1');
    expect(out.length).toBe(2);
    const cat1 = out.find((c) => c.id === 'cat1')!;
    expect(cat1.channels[0].name).toBe('c2'); // sorted by position
    const cat2 = out.find((c) => c.id === 'cat2')!;
    expect(cat2.channels[0].type).toBe('voice');
    expect(cat2.channels[0].userLimit).toBe(5);
  });
});

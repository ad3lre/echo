import { describe, expect, it } from 'vitest';
import type { UserForAuthor } from '@/features/chat/chatMessageTypes';
import {
  apiSearchCriteriaSatisfied,
  applyFilters,
  buildEchoMessageSearchParams,
  buildFilterChips,
  computeUseChannelSearchApi,
  computeUseServerSearchApi,
  extractInlineSearchFilters,
  resolveFilterChannelEchoId,
  stripFilterPrefixes,
  type MessageWithOrder,
  type SearchApiModeSnapshot,
} from '../messageSearchCore';

function u(id: string, name: string): UserForAuthor {
  return { id, name, pfp: '', status: 'online' };
}

function row(
  partial: Partial<MessageWithOrder> & Pick<MessageWithOrder, 'id' | 'author'>,
): MessageWithOrder {
  return {
    timestamp: '2026-01-01T00:00:00.000Z',
    content: '',
    ...partial,
  } as MessageWithOrder;
}

describe('messageSearchCore', () => {
  it('stripFilterPrefixes removes trailing filter command tails', () => {
    expect(stripFilterPrefixes('hello in:')).toBe('hello');
    expect(stripFilterPrefixes('foo from:alice')).toBe('foo');
    expect(stripFilterPrefixes('bar has:image')).toBe('bar');
  });

  it('extractInlineSearchFilters canonicalizes typed inline commands', () => {
    expect(
      extractInlineSearchFilters('hello in:#general from:@Alice has:image'),
    ).toEqual({
      searchText: 'hello',
      parsedFilters: {
        in: 'general',
        from: 'Alice',
        hasType: 'image',
      },
    });
    expect(extractInlineSearchFilters('mentions:@bob hi there')).toEqual({
      searchText: 'hi there',
      parsedFilters: {
        mentions: 'bob',
      },
    });
  });

  it('resolveFilterChannelEchoId matches name or hash prefix', () => {
    const ch = [{ id: 'c1', name: 'general' }];
    expect(resolveFilterChannelEchoId({ in: 'general' }, ch)).toBe('c1');
    expect(resolveFilterChannelEchoId({ in: '#general' }, ch)).toBe('c1');
    expect(resolveFilterChannelEchoId({ in: 'nope' }, ch)).toBeUndefined();
  });

  it('applyFilters applies text and chip filters', () => {
    const msgs: MessageWithOrder[] = [
      row({
        id: '1',
        author: { id: 'a', name: 'Alice', avatar: '' },
        content: 'hello world',
        channelName: 'general',
      }),
      row({
        id: '2',
        author: { id: 'b', name: 'Bob', avatar: '' },
        content: 'other',
        channelName: 'random',
      }),
    ];
    const out = applyFilters(msgs, 'hello', {});
    expect(out.map((m) => m.id)).toEqual(['1']);
    const byChannel = applyFilters(msgs, '', { in: 'general' });
    expect(byChannel.map((m) => m.id)).toEqual(['1']);
  });

  it('computeUseServerSearchApi reflects session + server + not DM', () => {
    const snap: SearchApiModeSnapshot = {
      echoSessionReady: true,
      selectedServerId: 'srv1',
      isInDMMode: false,
      activeChannelId: 'ch1',
      echoDmThreadIds: new Set(),
    };
    expect(computeUseServerSearchApi(true, snap)).toBe(true);
    expect(computeUseServerSearchApi(false, snap)).toBe(false);
    expect(
      computeUseServerSearchApi(true, { ...snap, selectedServerId: 'echo' }),
    ).toBe(false);
    expect(computeUseServerSearchApi(true, { ...snap, isInDMMode: true })).toBe(
      false,
    );
  });

  it('computeUseChannelSearchApi requires graph DM thread', () => {
    const dmId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const snap: SearchApiModeSnapshot = {
      echoSessionReady: true,
      selectedServerId: 'srv1',
      isInDMMode: true,
      activeChannelId: dmId,
      echoDmThreadIds: new Set([dmId]),
    };
    expect(computeUseChannelSearchApi(true, snap)).toBe(true);
    expect(
      computeUseChannelSearchApi(true, {
        ...snap,
        echoDmThreadIds: new Set(),
      }),
    ).toBe(false);
  });

  it('buildEchoMessageSearchParams maps filters and strips command tails from q', () => {
    const users = [u('a1', 'Alice')];
    const channels = [{ id: 'c1', name: 'general' }];
    const p = buildEchoMessageSearchParams({
      searchTextRaw: 'hello in:',
      filters: {
        from: 'Alice',
        in: 'general',
        mentions: 'bob',
        hasType: 'link',
      },
      allChannels: channels,
      users,
      before: 'm99',
    });
    expect(p.q).toBe('hello');
    expect(p.channelId).toBe('c1');
    expect(p.authorId).toBe('a1');
    expect(p.mentions).toBe('bob');
    expect(p.hasType).toBe('link');
    expect(p.before).toBe('m99');
  });

  it('buildEchoMessageSearchParams removes inline filters from q anywhere in the text', () => {
    const users = [u('a1', 'Alice')];
    const channels = [{ id: 'c1', name: 'general' }];
    const p = buildEchoMessageSearchParams({
      searchTextRaw: 'hello from:@Alice in:#general world',
      filters: {
        from: 'Alice',
        in: 'general',
      },
      allChannels: channels,
      users,
    });
    expect(p.q).toBe('hello world');
    expect(p.channelId).toBe('c1');
    expect(p.authorId).toBe('a1');
  });

  it('apiSearchCriteriaSatisfied requires at least one criterion', () => {
    const users = [u('a1', 'Alice')];
    const channels: { id: string; name: string }[] = [];
    expect(apiSearchCriteriaSatisfied('', {}, users, channels)).toBe(false);
    expect(apiSearchCriteriaSatisfied('x', {}, users, channels)).toBe(true);
    expect(
      apiSearchCriteriaSatisfied('', { from: 'Ali' }, users, channels),
    ).toBe(true);
    expect(
      apiSearchCriteriaSatisfied('', { mentions: 'x' }, users, channels),
    ).toBe(true);
    expect(
      apiSearchCriteriaSatisfied('', { hasType: 'image' }, users, channels),
    ).toBe(true);
  });

  it('apiSearchCriteriaSatisfied treats a resolvable in-filter as valid criteria', () => {
    const users = [u('a1', 'Alice')];
    const channels = [{ id: 'c1', name: 'general' }];
    expect(
      apiSearchCriteriaSatisfied('', { in: 'general' }, users, channels),
    ).toBe(true);
  });

  it('buildFilterChips mirrors filter state', () => {
    const chips = buildFilterChips({
      in: 'general',
      from: 'Alice',
      mentions: 'bob',
      hasType: 'gif',
    });
    expect(chips.map((c) => c.key)).toEqual([
      'in',
      'from',
      'mentions',
      'hasType',
    ]);
  });
});

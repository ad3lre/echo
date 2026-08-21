import { describe, expect, it } from 'vitest';
import {
  channelValidInServer,
  pickFallbackParsedPath,
  resolveGuildPath,
  type UrlNavigationResolveContext,
} from '@/features/layout/urlNavigationResolve';

function ctx(
  partial: Partial<UrlNavigationResolveContext>,
): UrlNavigationResolveContext {
  return {
    servers: partial.servers ?? [],
    categoriesByServer: partial.categoriesByServer ?? {},
    getFirstTextChannelId:
      partial.getFirstTextChannelId ??
      ((cats) => cats[0]?.channels?.[0]?.id ?? ''),
  };
}

describe('urlNavigationResolve', () => {
  it('channelValidInServer accepts text and voice', () => {
    const c = ctx({
      categoriesByServer: {
        s1: [
          {
            name: 'x',
            channels: [
              { id: 't1', type: 'text' },
              { id: 'v1', type: 'voice' },
              { id: 'o1', type: 'other' },
            ],
          },
        ],
      },
    });
    expect(channelValidInServer(c, 's1', 't1')).toBe(true);
    expect(channelValidInServer(c, 's1', 'v1')).toBe(true);
    expect(channelValidInServer(c, 's1', 'o1')).toBe(false);
    expect(channelValidInServer(c, 's1', 'missing')).toBe(false);
  });

  it('pickFallbackParsedPath returns first non-echo server + first text channel', () => {
    const c = ctx({
      servers: [{ id: 'echo' }, { id: 'srv' }],
      categoriesByServer: {
        srv: [
          {
            name: 'c',
            channels: [{ id: 'gen', type: 'text' }],
          },
        ],
      },
      getFirstTextChannelId: (cats) =>
        cats[0]?.channels?.find((ch) => ch.type === 'text')?.id ?? '',
    });
    expect(pickFallbackParsedPath(c)).toEqual({
      kind: 'guild',
      serverId: 'srv',
      channelId: 'gen',
    });
  });

  it('pickFallbackParsedPath returns explore when no real server', () => {
    expect(pickFallbackParsedPath(ctx({ servers: [{ id: 'echo' }] }))).toEqual({
      kind: 'explore',
    });
  });

  it('resolveGuildPath falls back when server missing or echo', () => {
    const fb = ctx({
      servers: [{ id: 'a' }],
      categoriesByServer: {
        a: [{ name: 'c', channels: [{ id: 't', type: 'text' }] }],
      },
      getFirstTextChannelId: (cats) =>
        cats[0]?.channels?.find((x) => x.type === 'text')?.id ?? '',
    });
    expect(resolveGuildPath(fb, 'nope', 'x').kind).toBe('guild');
    expect(resolveGuildPath(fb, 'echo', 'general').kind).toBe('guild');
  });

  it('resolveGuildPath replaces invalid channel with first text', () => {
    const c = ctx({
      servers: [{ id: 'srv' }],
      categoriesByServer: {
        srv: [{ name: 'c', channels: [{ id: 'ok', type: 'text' }] }],
      },
      getFirstTextChannelId: (cats) =>
        cats[0]?.channels?.find((x) => x.type === 'text')?.id ?? '',
    });
    expect(resolveGuildPath(c, 'srv', 'bad')).toEqual({
      kind: 'guild',
      serverId: 'srv',
      channelId: 'ok',
    });
  });

  it('resolveGuildPath returns guild when channel valid', () => {
    const c = ctx({
      servers: [{ id: 'srv' }],
      categoriesByServer: {
        srv: [{ name: 'c', channels: [{ id: 'ok', type: 'text' }] }],
      },
      getFirstTextChannelId: () => 'ok',
    });
    expect(resolveGuildPath(c, 'srv', 'ok')).toEqual({
      kind: 'guild',
      serverId: 'srv',
      channelId: 'ok',
    });
  });

  it('resolveGuildPath keeps graph channel id when categories not loaded yet', () => {
    const snowCh = '1234567890123456789';
    const c = ctx({
      servers: [{ id: 'srv' }],
      categoriesByServer: {},
      getFirstTextChannelId: () => '',
    });
    expect(resolveGuildPath(c, 'srv', snowCh)).toEqual({
      kind: 'guild',
      serverId: 'srv',
      channelId: snowCh,
    });
  });

  it('resolveGuildPath maps vanity slug to server id for short invite URLs', () => {
    const c = ctx({
      servers: [{ id: 'srv-uuid', vanityCode: 'server1' }],
      categoriesByServer: {
        'srv-uuid': [
          { name: 'c', channels: [{ id: 'general', type: 'text' }] },
        ],
      },
      getFirstTextChannelId: (cats) =>
        cats[0]?.channels?.find((x) => x.type === 'text')?.id ?? '',
    });
    expect(resolveGuildPath(c, 'server1', '')).toEqual({
      kind: 'guild',
      serverId: 'srv-uuid',
      channelId: 'general',
    });
  });
});

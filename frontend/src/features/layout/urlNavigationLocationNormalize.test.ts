import { describe, expect, it } from 'vitest';
import { normalizeBrowserPathParsed } from './urlNavigationLocationNormalize';
import type { UrlNavigationResolveContext } from '@/services/orchestration/urlNavigationResolve';

function makeCtx(): UrlNavigationResolveContext {
  return {
    servers: [{ id: 'srv' }],
    categoriesByServer: {
      srv: [{ name: 'c', channels: [{ id: 'ok', type: 'text' }] }],
    },
    getFirstTextChannelId: (cats) =>
      cats[0]?.channels?.find((x) => x.type === 'text')?.id ?? '',
  };
}

describe('normalizeBrowserPathParsed', () => {
  it('adjusts guild path when channel invalid', () => {
    const ctx = makeCtx();
    const r = normalizeBrowserPathParsed(
      { kind: 'guild', serverId: 'srv', channelId: 'bad' },
      ctx,
    );
    expect(r.adjusted).toBe(true);
    expect(r.pathParsed).toEqual({
      kind: 'guild',
      serverId: 'srv',
      channelId: 'ok',
    });
  });

  it('does not adjust valid guild path', () => {
    const ctx = makeCtx();
    const r = normalizeBrowserPathParsed(
      { kind: 'guild', serverId: 'srv', channelId: 'ok' },
      ctx,
    );
    expect(r.adjusted).toBe(false);
    expect(r.pathParsed.kind).toBe('guild');
  });

  it('unknown becomes fallback with adjusted true', () => {
    const ctx = makeCtx();
    const r = normalizeBrowserPathParsed(
      { kind: 'unknown', raw: '/weird' },
      ctx,
    );
    expect(r.adjusted).toBe(true);
    expect(r.pathParsed).toEqual({
      kind: 'guild',
      serverId: 'srv',
      channelId: 'ok',
    });
  });

  it('passes through explore unchanged', () => {
    const ctx = makeCtx();
    const r = normalizeBrowserPathParsed({ kind: 'explore' }, ctx);
    expect(r.adjusted).toBe(false);
    expect(r.pathParsed).toEqual({ kind: 'explore' });
  });
});

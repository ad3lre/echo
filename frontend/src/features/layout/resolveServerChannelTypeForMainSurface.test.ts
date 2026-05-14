import { describe, expect, it } from 'vitest';
import {
  bindResolveServerChannelInfoForMainSurface,
  resolveServerChannelInfoForMainSurface,
} from './resolveServerChannelTypeForMainSurface';

describe('resolveServerChannelInfoForMainSurface', () => {
  it('returns null for dm thread ids', () => {
    expect(
      resolveServerChannelInfoForMainSurface('dm-x', () => null),
    ).toBeNull();
  });

  it('maps guild channel types', () => {
    expect(
      resolveServerChannelInfoForMainSurface('c1', (id) =>
        id === 'c1' ? { channel: { type: 'voice' } } : null,
      ),
    ).toEqual({ type: 'voice' });
    expect(
      resolveServerChannelInfoForMainSurface('c2', (id) =>
        id === 'c2' ? { channel: { type: 'text' } } : null,
      ),
    ).toEqual({ type: 'text' });
    expect(
      resolveServerChannelInfoForMainSurface('c3', (id) =>
        id === 'c3' ? { channel: { type: 'forum' } } : null,
      ),
    ).toEqual({ type: 'forum' });
  });

  it('bindResolveServerChannelInfoForMainSurface closes over findChannelContextById', () => {
    const get = bindResolveServerChannelInfoForMainSurface((id) =>
      id === 'c1' ? { channel: { type: 'voice' } } : null,
    );
    expect(get('c1')).toEqual({ type: 'voice' });
  });
});

import { describe, expect, it } from 'vitest';
import { createResolveEchoDmPeerFromMap } from './createResolveEchoDmPeerFromMap';

describe('createResolveEchoDmPeerFromMap', () => {
  it('reads from live map', () => {
    const m = new Map<string, string>([['c1', 'u1']]);
    const resolve = createResolveEchoDmPeerFromMap(() => m);
    expect(resolve('c1')).toBe('u1');
    m.set('c2', 'u2');
    expect(resolve('c2')).toBe('u2');
    expect(resolve('missing')).toBeNull();
  });
});

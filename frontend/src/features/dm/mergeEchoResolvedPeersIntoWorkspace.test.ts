import { describe, expect, it } from 'vitest';
import { mergeEchoResolvedPeersIntoWorkspaceUsers } from './mergeEchoResolvedPeersIntoWorkspace';

describe('mergeEchoResolvedPeersIntoWorkspaceUsers', () => {
  it('upserts resolved peer rows', () => {
    const next = mergeEchoResolvedPeersIntoWorkspaceUsers(
      [{ id: 'a', name: 'A', pfp: '', status: '' }],
      [{ id: 'b', name: 'Bee', pfp: 'https://x.test/p.png' }],
    );
    expect(next.find((u) => u.id === 'b')).toMatchObject({
      id: 'b',
      name: 'Bee',
      pfp: 'https://x.test/p.png',
    });
  });
});

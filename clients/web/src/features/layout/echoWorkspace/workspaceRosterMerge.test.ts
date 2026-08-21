import { describe, expect, it } from 'vitest';
import { applyWorkspaceMembersToRoster } from '@/features/layout/echoWorkspace/workspaceRosterMerge';
import { deriveTimeoutUntilByServerUser } from '@/features/layout/echoWorkspace/workspaceEchoApiSnapshot';

describe('applyWorkspaceMembersToRoster', () => {
  it('upserts members and matches standalone timeout derivation', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const membersByServer = {
      s1: [
        {
          userId: 'u1',
          name: 'Ada',
          pfp: 'https://x.test/a.png',
        },
      ],
    };
    const { users, timeoutUntilByServerUser } = applyWorkspaceMembersToRoster(
      [],
      membersByServer,
    );
    expect(users).toEqual([
      expect.objectContaining({
        id: 'u1',
        name: 'Ada',
        pfp: 'https://x.test/a.png',
      }),
    ]);
    expect(timeoutUntilByServerUser).toEqual(
      deriveTimeoutUntilByServerUser(membersByServer),
    );

    const withTimeout = {
      s1: [
        {
          userId: 'u1',
          name: 'Ada',
          pfp: '',
          communicationTimeoutUntil: future,
        },
      ],
    };
    const t2 = applyWorkspaceMembersToRoster(
      [],
      withTimeout,
    ).timeoutUntilByServerUser;
    expect(t2.s1?.u1).toBe(Date.parse(future));
  });

  it('preserves unrelated existing users and overlays API fields', () => {
    const existing = [
      { id: 'keep', name: 'Keep', pfp: '', status: 'online' as const },
    ];
    const { users } = applyWorkspaceMembersToRoster(existing, {
      s1: [{ userId: 'u2', name: 'Bob', pfp: 'b.png' }],
    });
    const keep = users.find((u) => u.id === 'keep');
    const bob = users.find((u) => u.id === 'u2');
    expect(keep).toEqual(existing[0]);
    expect(bob).toEqual(
      expect.objectContaining({ id: 'u2', name: 'Bob', pfp: 'b.png' }),
    );
  });
});

import { describe, expect, it } from 'vitest';
import { applyWorkspaceRosterUsersPipeline } from '@/features/layout/echoWorkspace/workspaceRoster';
import type { EchoServerMemberDto } from '@/api/echo/types';

describe('applyWorkspaceRosterUsersPipeline', () => {
  it('applies members merge then auth upsert in order', () => {
    const membersByServer: Record<string, EchoServerMemberDto[]> = {
      s1: [
        {
          userId: 'u-auth',
          name: 'From Api',
          pfp: '',
        },
      ],
    };
    const out = applyWorkspaceRosterUsersPipeline(
      [{ id: 'other', name: 'X', pfp: '', status: 'online' }],
      {
        membersByServer,
        authUser: {
          id: 'u-auth',
          username: 'me',
          displayName: 'Auth Display',
          pfp: 'apfp',
        },
      },
    );
    const self = out.find((u) => u.id === 'u-auth');
    expect(self).toBeDefined();
    expect(self!.name).toBe('Auth Display');
  });

  it('merges profile badges from workspace member rows', () => {
    const out = applyWorkspaceRosterUsersPipeline(
      [{ id: 'u1', name: 'A', pfp: '', status: 'online' }],
      {
        membersByServer: {
          s1: [
            {
              userId: 'u1',
              name: 'A',
              pfp: '',
              badges: ['og'],
            },
          ],
        },
      },
    );
    expect(out.find((u) => u.id === 'u1')?.badges).toEqual(['og']);
  });
});

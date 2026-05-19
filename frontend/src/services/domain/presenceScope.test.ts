import { describe, expect, it } from 'vitest';
import { collectPresenceCandidateUserIds } from '@/services/domain/presenceScope';

describe('collectPresenceCandidateUserIds', () => {
  it('merges workspace, friends, messages, selected server members, excluding self', () => {
    const ids = collectPresenceCandidateUserIds({
      authUserId: 'self',
      workspaceUserIds: ['u1', 'u2', 'self'],
      friendIds: ['u2', 'u3'],
      globalAuthorIds: new Set(['u3', 'u4']),
      selectedServerId: 'server-1',
      serverMemberIdsByServer: {
        'server-1': ['u4', 'u5'],
      },
      workspaceMembersByServer: {
        'server-1': [{ userId: 'fallback-only' }],
      },
    });

    expect(ids).toEqual(['u1', 'u2', 'u3', 'u4', 'u5']);
  });

  it('falls back to roster rows when selected-server member ids are empty', () => {
    const ids = collectPresenceCandidateUserIds({
      workspaceUserIds: [],
      friendIds: [],
      globalAuthorIds: new Set(),
      selectedServerId: 'server-1',
      serverMemberIdsByServer: {
        'server-1': [],
      },
      workspaceMembersByServer: {
        'server-1': [{ userId: 'u7' }, { userId: '' }, { userId: 'u8' }],
      },
    });

    expect(ids).toEqual(['u7', 'u8']);
  });
});

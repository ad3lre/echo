import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useWorkspaceFriendIdsByUserIdSync } from './useWorkspaceFriendIdsByUserIdSync';

describe('useWorkspaceFriendIdsByUserIdSync', () => {
  it('runs friendIds → friendIdsByUserId sync without throwing', () => {
    const workspace = {
      friendIds: ref<string[]>(['u1', 'u2']),
      friendIdsByUserId: ref<Record<string, string[]>>({}),
    };
    const authSession = {
      backendUser: { id: 'self' },
    };
    useWorkspaceFriendIdsByUserIdSync({
      workspace: workspace as any,
      authSession: authSession as any,
    });
    expect(Array.isArray(workspace.friendIds.value)).toBe(true);
  });
});

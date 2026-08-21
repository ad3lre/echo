import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { createChatSoundMemberRoleIdsGetter } from './createChatSoundMemberRoleIdsGetter';

describe('createChatSoundMemberRoleIdsGetter', () => {
  it('returns set for current user roles', () => {
    const currentUserId = ref<string | undefined>('me');
    const get = createChatSoundMemberRoleIdsGetter({
      currentUserId,
      echoMemberRoleIdsByUser: () => ({ me: ['r1', 'r2'] }),
    });
    expect(get()).toEqual(new Set(['r1', 'r2']));
  });

  it('returns undefined without user', () => {
    const currentUserId = ref<string | undefined>(undefined);
    const get = createChatSoundMemberRoleIdsGetter({
      currentUserId,
      echoMemberRoleIdsByUser: () => ({ me: ['r1'] }),
    });
    expect(get()).toBeUndefined();
  });
});

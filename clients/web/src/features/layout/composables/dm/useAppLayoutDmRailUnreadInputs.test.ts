import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import {
  useDmRailActiveCallGroupIds,
  useDmRailActiveCallUserIds,
} from './useAppLayoutDmRailUnreadInputs';

describe('useDmRailActiveCallUserIds', () => {
  it('includes the 1:1 call peer and persisted 1:1 call participants', () => {
    const ids = useDmRailActiveCallUserIds({
      authSession: { backendUser: { id: 'self' } },
      dmCallWithUserId: ref('peer-a'),
      groupDMs: ref({ 'group-1': { id: 'group-1' } }),
      echoDmActiveCallParticipantUserIdsByChannelId: ref(
        new Map([
          ['dm-1', ['self', 'peer-b']],
          ['group-1', ['self', 'peer-c']],
        ]),
      ),
      echoDmPeerByChannelId: ref(
        new Map([
          ['dm-1', 'peer-b'],
          ['group-1', 'peer-c'],
        ]),
      ),
    });
    expect([...ids.value].sort()).toEqual(['peer-a', 'peer-b']);
  });
});

describe('useDmRailActiveCallGroupIds', () => {
  it('includes the active group call and live group threads', () => {
    const ids = useDmRailActiveCallGroupIds({
      dmCallWithUserId: ref('group-1'),
      groupDMs: ref({
        'group-1': { id: 'group-1' },
        'group-2': { id: 'group-2' },
      }),
      echoDmActiveCallParticipantUserIdsByChannelId: ref(
        new Map([
          ['group-2', ['a', 'b']],
          ['dm-1', ['a']],
        ]),
      ),
    });
    expect([...ids.value].sort()).toEqual(['group-1', 'group-2']);
  });
});

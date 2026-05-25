import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import type { EchoWorkspaceState } from '@/api/echoClient';
import {
  applyVoiceRosterDeltaToEchoSession,
  applyWorkspaceSnapshotToEchoSession,
  patchPresenceBatchOnEchoSession,
  patchPresenceOnEchoSession,
  replaceUsersInEchoSession,
  sessionAcceptsIncomingVersion,
  type EchoWorkspaceSessionApplyRefs,
} from '@/services/domain/workspaceSession';

function createSessionRefs(): EchoWorkspaceSessionApplyRefs {
  return {
    users: ref([]),
    presenceByUserId: ref({}),
    presenceMobileByUserId: ref({}),
    discordOnlineByUserId: ref({}),
    lastOnlineAtByUserId: ref({}),
    servers: ref([]),
    categoriesByServer: ref({}),
    discoverableServers: ref([]),
    messages: ref({}),
    serverMemberIds: ref({}),
    workspaceMembersByServer: ref({}),
    workspaceVersion: ref('0'),
    liveSyncConnected: ref(false),
    lastWorkspaceEventVersion: ref('0'),
    lastSnapshotFetchedAtMs: ref(0),
    upcomingEventsByServerId: ref({}),
    myEventRsvps: ref([]),
  };
}

describe('workspaceSession domain', () => {
  it('accepts only snapshots at or above the effective workspace version', () => {
    expect(sessionAcceptsIncomingVersion('12', '11', '10')).toBe(true);
    expect(sessionAcceptsIncomingVersion('11', '12', '10')).toBe(false);
    expect(sessionAcceptsIncomingVersion(undefined, '0', '0')).toBe(true);
  });

  it('keeps authoritative presence overlay when roster rows are loaded', () => {
    const refs = createSessionRefs();
    refs.presenceByUserId.value = {
      u1: 'idle',
      u2: 'offline',
    };
    replaceUsersInEchoSession(refs, [
      { id: 'u1', name: 'Ada', pfp: '', status: 'online' },
      { id: 'u2', name: 'Ben', pfp: '', status: '' },
    ]);

    expect(refs.presenceByUserId.value).toEqual({
      u1: 'idle',
      u2: 'offline',
    });
  });

  it('applies newer workspace snapshots, merges roster rows, and preserves presence overlay', () => {
    const refs = createSessionRefs();
    refs.users.value = [{ id: 'u1', name: 'Ada', pfp: '', status: 'online' }];
    refs.presenceByUserId.value = {
      u1: 'idle',
      u2: 'offline',
    };
    refs.workspaceVersion.value = '10';
    refs.lastWorkspaceEventVersion.value = '10';

    const state = {
      servers: [
        {
          id: 's1',
          name: 'Guild',
          imageUrl: '',
          ownerId: 'u1',
        },
      ],
      categoriesByServer: {
        s1: [],
      },
      serverMemberIds: {
        s1: ['u1', 'u2'],
      },
      workspaceVersion: '11',
      upcomingEventsByServerId: {},
      myEventRsvps: [],
      membersByServer: {
        s1: [
          { userId: 'u1', name: 'Ada', pfp: '' },
          { userId: 'u2', name: 'Ben', pfp: '' },
        ],
      },
    } as EchoWorkspaceState;

    expect(applyWorkspaceSnapshotToEchoSession(refs, state)).toBe(true);
    expect(refs.workspaceVersion.value).toBe('11');
    expect(refs.serverMemberIds.value).toEqual({ s1: ['u1', 'u2'] });
    expect(refs.workspaceMembersByServer.value).toEqual(state.membersByServer);
    expect(refs.users.value.map((user) => user.id)).toEqual(['u1', 'u2']);
    expect(refs.presenceByUserId.value).toEqual({
      u1: 'idle',
      u2: 'offline',
    });
  });

  it('patchPresenceOnEchoSession updates the overlay and row cache together', () => {
    const refs = createSessionRefs();
    refs.users.value = [{ id: 'u1', name: 'Ada', pfp: '', status: 'offline' }];

    patchPresenceOnEchoSession(refs, 'u1', 'online');

    expect(refs.presenceByUserId.value).toEqual({ u1: 'online' });
    expect(refs.users.value[0]?.status).toBe('online');
  });

  it('patchPresenceBatchOnEchoSession applies a presence batch in one pass', () => {
    const refs = createSessionRefs();
    refs.users.value = [
      { id: 'u1', name: 'Ada', pfp: '', status: 'offline' },
      { id: 'u2', name: 'Ben', pfp: '', status: 'offline' },
    ];
    refs.presenceByUserId.value = { u1: 'offline', u2: 'offline' };
    refs.presenceMobileByUserId.value = { u2: true };

    patchPresenceBatchOnEchoSession(refs, [
      { userId: 'u1', status: 'online', mobileSurface: true },
      { userId: 'u2', status: 'idle', mobileSurface: false },
    ]);

    expect(refs.presenceByUserId.value).toEqual({ u1: 'online', u2: 'idle' });
    expect(refs.users.value.map((user) => user.status)).toEqual([
      'online',
      'idle',
    ]);
    expect(refs.presenceMobileByUserId.value).toEqual({ u1: true });
  });

  it('rejects stale workspace snapshots once a newer event version is known', () => {
    const refs = createSessionRefs();
    refs.lastWorkspaceEventVersion.value = '15';
    refs.workspaceVersion.value = '14';

    const staleState = {
      servers: [],
      categoriesByServer: {},
      serverMemberIds: {},
      workspaceVersion: '14',
      upcomingEventsByServerId: {},
      myEventRsvps: [],
    } as EchoWorkspaceState;

    expect(applyWorkspaceSnapshotToEchoSession(refs, staleState)).toBe(false);
    expect(refs.workspaceVersion.value).toBe('14');
  });

  it('applies authoritative workspace snapshots even when version is older than cache', () => {
    const refs = createSessionRefs();
    refs.lastWorkspaceEventVersion.value = '20';
    refs.workspaceVersion.value = '20';
    refs.servers.value = [
      {
        id: 'ghost',
        name: 'Ghost Guild',
        imageUrl: '',
        ownerId: 'u1',
      },
    ] as EchoWorkspaceState['servers'];

    const authoritativeState = {
      servers: [],
      categoriesByServer: {},
      serverMemberIds: {},
      workspaceVersion: '5',
      upcomingEventsByServerId: {},
      myEventRsvps: [],
    } as EchoWorkspaceState;

    expect(
      applyWorkspaceSnapshotToEchoSession(refs, authoritativeState, {
        authoritative: true,
      }),
    ).toBe(true);
    expect(refs.workspaceVersion.value).toBe('5');
    expect(refs.servers.value).toEqual([]);
  });

  it('keeps stage speaker hint when moving into stage', () => {
    const serverId = '123456789012345678';
    const refs = createSessionRefs();
    refs.categoriesByServer.value = {
      [serverId]: [
        {
          id: 'cat',
          name: 'Voice',
          channels: [
            {
              id: 'voice-1',
              name: 'Voice',
              type: 'voice',
              voiceParticipantIds: ['u1'],
            },
            {
              id: 'stage-1',
              name: 'Stage',
              type: 'stage',
              voiceParticipantIds: [],
              voiceStageSpeakerByUserId: {},
            },
          ],
        },
      ],
    };

    applyVoiceRosterDeltaToEchoSession(refs, {
      action: 'move',
      serverId,
      channelId: 'stage-1',
      fromChannelId: 'voice-1',
      userId: 'u1',
      stageSpeaker: true,
      workspaceVersion: '2',
      occurredAt: new Date().toISOString(),
    });

    const stage = refs.categoriesByServer.value[serverId]?.[0]?.channels.find(
      (c) => c.id === 'stage-1',
    );
    expect(stage?.voiceParticipantIds).toEqual(['u1']);
    expect(stage?.voiceStageSpeakerByUserId).toEqual({ u1: true });
  });
});

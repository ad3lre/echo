import { describe, expect, it } from 'vitest';
import {
  normalizeEchoDirectoryServersPayload,
  normalizeEchoInvitePreviewPayload,
} from '../echoInvitesAndDirectoryFromHttp';

describe('normalizeEchoInvitePreviewPayload', () => {
  it('fills defaults and clamps memberCount', () => {
    expect(
      normalizeEchoInvitePreviewPayload({
        name: '  ',
        memberCount: 3.7,
      }),
    ).toEqual({
      name: 'Server',
      iconUrl: '',
      bannerUrl: '',
      description: '',
      memberCount: 3,
    });
  });
});

describe('normalizeEchoDirectoryServersPayload', () => {
  it('maps numeric id and optional fields', () => {
    const out = normalizeEchoDirectoryServersPayload({
      servers: [
        {
          id: 42,
          name: 'S',
          iconUrl: 'i',
          bannerUrl: 'b',
          description: ' d ',
          tags: [' Gaming ', 'co-op', '', 'gaming'],
          memberCount: '7',
        },
      ],
    });
    expect(out.servers).toEqual([
      {
        id: '42',
        name: 'S',
        iconUrl: 'i',
        bannerUrl: 'b',
        description: 'd',
        tags: ['gaming', 'co-op', 'gaming'],
        memberCount: 7,
      },
    ]);
  });

  it('maps voice participant count from camelCase or snake_case', () => {
    const out = normalizeEchoDirectoryServersPayload({
      servers: [
        {
          id: 'a',
          name: 'A',
          iconUrl: '',
          bannerUrl: '',
          voiceParticipantCount: 2.9,
        },
        {
          id: 'b',
          name: 'B',
          iconUrl: '',
          bannerUrl: '',
          voice_participant_count: '4',
        },
      ],
    });
    expect(out.servers[0]?.voiceParticipantCount).toBe(2);
    expect(out.servers[1]?.voiceParticipantCount).toBe(4);
  });

  it('maps allow_global_guests snake_case to allowGlobalGuests', () => {
    const out = normalizeEchoDirectoryServersPayload({
      servers: [
        {
          id: 'srv1',
          name: 'S',
          iconUrl: '',
          bannerUrl: '',
          allow_global_guests: false,
        },
      ],
    });
    expect(out.servers[0]?.allowGlobalGuests).toBe(false);
  });
});

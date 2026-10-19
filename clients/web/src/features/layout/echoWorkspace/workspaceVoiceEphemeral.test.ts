import { describe, expect, it } from 'vitest';
import {
  applyVoiceRosterDeltaToEphemeralMap,
  emptyVoiceEphemeralMap,
  ingestVoiceEphemeralFromCategories,
  mergeVoiceEphemeralIntoCategories,
  stripVoiceFieldsFromCategories,
} from './workspaceVoiceEphemeral';

describe('workspaceVoiceEphemeral', () => {
  it('ingests and strips voice fields from the structural tree', () => {
    const cats = {
      s1: [
        {
          id: 'cat',
          name: 'Voice',
          channels: [
            {
              id: 'v1',
              name: 'General',
              type: 'voice' as const,
              voiceParticipantIds: ['u1'],
              voiceServerMuteByUserId: { u1: true },
            },
            { id: 't1', name: 'chat', type: 'text' as const },
          ],
        },
      ],
    };
    const ephemeral = ingestVoiceEphemeralFromCategories(cats);
    expect(ephemeral.get('v1')?.participantIds).toEqual(['u1']);
    expect(ephemeral.get('v1')?.serverMuteByUserId).toEqual({ u1: true });

    const stripped = stripVoiceFieldsFromCategories(cats);
    expect(stripped.s1?.[0]?.channels[0]?.voiceParticipantIds).toBeUndefined();
    expect(stripped.s1?.[0]?.channels[1]?.type).toBe('text');
  });

  it('applies join/leave without needing channel objects', () => {
    const map = emptyVoiceEphemeralMap();
    const voiceIds = ['v1', 'v2'];
    expect(
      applyVoiceRosterDeltaToEphemeralMap(
        map,
        {
          action: 'join',
          serverId: 's1',
          channelId: 'v1',
          userId: 'u1',
          workspaceVersion: '1',
          occurredAt: new Date().toISOString(),
        },
        voiceIds,
        false,
      ),
    ).toBe(true);
    expect(map.get('v1')?.participantIds).toEqual(['u1']);

    applyVoiceRosterDeltaToEphemeralMap(
      map,
      {
        action: 'leave',
        serverId: 's1',
        channelId: 'v1',
        userId: 'u1',
        workspaceVersion: '2',
        occurredAt: new Date().toISOString(),
      },
      voiceIds,
      false,
    );
    expect(map.get('v1')?.participantIds).toEqual([]);
  });

  it('merges ephemeral back onto categories for UI', () => {
    const structural = [
      {
        id: 'cat',
        name: 'Voice',
        channels: [{ id: 'v1', name: 'General', type: 'voice' as const }],
      },
    ];
    const map = emptyVoiceEphemeralMap();
    map.set('v1', { participantIds: ['a', 'b'] });
    const merged = mergeVoiceEphemeralIntoCategories(structural, map);
    expect(
      (merged[0]?.channels[0] as { voiceParticipantIds?: string[] })
        ?.voiceParticipantIds,
    ).toEqual(['a', 'b']);
    expect(
      (structural[0]?.channels[0] as { voiceParticipantIds?: string[] })
        ?.voiceParticipantIds,
    ).toBeUndefined();
  });
});

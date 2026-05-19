import { describe, expect, it } from 'vitest';
import { computed, ref } from 'vue';
import { useAppLayoutChannelManageCapabilities } from './useAppLayoutChannelManageCapabilities';

describe('useAppLayoutChannelManageCapabilities', () => {
  it('denies create on echo / missing server', () => {
    const { canCreateChannels, canManageThisChannel } =
      useAppLayoutChannelManageCapabilities({
        selectedServerEcho: computed(() => ({ id: 'echo' })),
        isAuthenticated: () => true,
        echoCanCreateChannel: computed(() => true),
      });
    expect(canCreateChannels.value).toBe(false);
    expect(
      canManageThisChannel({
        id: 'ch1',
        name: 'x',
        type: 'text',
      }),
    ).toBe(false);
  });

  it('allows manage when graph server and permission true', () => {
    const graphId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const { canCreateChannels, canManageThisChannel } =
      useAppLayoutChannelManageCapabilities({
        selectedServerEcho: computed(() => ({ id: graphId })),
        isAuthenticated: () => true,
        echoCanCreateChannel: computed(() => true),
      });
    expect(canCreateChannels.value).toBe(true);
    expect(
      canManageThisChannel({
        id: graphId,
        name: 'c',
        type: 'text',
      }),
    ).toBe(true);
    expect(
      canManageThisChannel({
        id: 'non-graph-channel-key',
        name: 'c',
        type: 'text',
      }),
    ).toBe(true);
  });
});

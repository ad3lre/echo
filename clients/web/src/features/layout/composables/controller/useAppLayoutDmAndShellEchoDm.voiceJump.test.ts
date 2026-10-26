import { describe, expect, it, vi } from 'vitest';
import { resolveConnectedVoiceJumpTarget } from './useAppLayoutDmAndShellEchoDm';

vi.mock('@/features/voice/resolveEchoServerIdForGuildChannel', () => ({
  resolveEchoServerIdContainingChannel: (
    channelId: string,
    cats: Record<string, { channels: { id: string }[] }[]>,
  ) => {
    for (const [sid, categories] of Object.entries(cats ?? {})) {
      if (
        categories.some((c) => c.channels?.some((ch) => ch.id === channelId))
      ) {
        return sid;
      }
    }
    return null;
  },
}));

describe('resolveConnectedVoiceJumpTarget', () => {
  it('returns serverId + channelId for a connected VC', () => {
    expect(
      resolveConnectedVoiceJumpTarget('vc1', {
        guildA: [{ channels: [{ id: 'text1' }, { id: 'vc1' }] }],
      } as never),
    ).toEqual({ serverId: 'guildA', channelId: 'vc1' });
  });

  it('returns null when the VC is not in the channel tree', () => {
    expect(
      resolveConnectedVoiceJumpTarget('missing', {
        guildA: [{ channels: [{ id: 'text1' }] }],
      } as never),
    ).toBeNull();
  });
});

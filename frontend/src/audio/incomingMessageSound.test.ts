import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { playIncomingChatMessageSound } from '@/audio/incomingMessageSound';

const playEchoSoundMock = vi.fn();

vi.mock('@/composables/useEchoSounds', () => ({
  playEchoSound: (id: string) => playEchoSoundMock(id),
}));

describe('playIncomingChatMessageSound', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    playEchoSoundMock.mockReset();
  });

  it('plays DM sound even when viewing a different channel', () => {
    const played = playIncomingChatMessageSound({
      channelId: 'dm-channel-1',
      authorId: 'u2',
      activeChannelId: 'server-channel-1',
      currentUserId: 'u1',
      currentUsername: 'u1',
      isDmChannel: true,
      serverNotificationLevel: undefined,
      memberRoleIds: undefined,
    });

    expect(played).toBe(true);
    expect(playEchoSoundMock).toHaveBeenCalledWith('pingDm');
  });

  it('does not play a sound for non-mention server messages', () => {
    const played = playIncomingChatMessageSound({
      channelId: 'server-channel-2',
      authorId: 'u2',
      activeChannelId: 'server-channel-1',
      currentUserId: 'u1',
      currentUsername: 'u1',
      isDmChannel: false,
      serverNotificationLevel: 'all',
      memberRoleIds: new Set<string>(),
    });

    expect(played).toBe(false);
    expect(playEchoSoundMock).not.toHaveBeenCalled();
  });

  it('plays a mention sound for an inactive (non-open) server channel', () => {
    const played = playIncomingChatMessageSound({
      channelId: 'server-channel-2',
      authorId: 'u2',
      activeChannelId: 'server-channel-1',
      currentUserId: 'u1',
      currentUsername: 'ada',
      isDmChannel: false,
      serverNotificationLevel: 'mentions',
      memberRoleIds: new Set<string>(),
      mentions: [
        {
          id: '1',
          kind: 'user',
          label: 'Ada',
          userId: 'u1',
          start: 0,
          end: 4,
        },
      ],
    });

    expect(played).toBe(true);
    expect(playEchoSoundMock).toHaveBeenCalledWith('pingDirectMention');
  });

  it('maps personal, role, and broadcast pings to the expected sounds', () => {
    expect(
      playIncomingChatMessageSound({
        channelId: 'server-channel-1',
        authorId: 'u2',
        activeChannelId: 'server-channel-1',
        currentUserId: 'u1',
        currentUsername: 'ada',
        isDmChannel: false,
        serverNotificationLevel: 'mentions',
        memberRoleIds: new Set(['role-mod']),
        mentions: [
          {
            id: '1',
            kind: 'user',
            label: 'Ada',
            userId: 'u1',
            start: 0,
            end: 4,
          },
        ],
      }),
    ).toBe(true);
    expect(playEchoSoundMock).toHaveBeenLastCalledWith('pingDirectMention');

    expect(
      playIncomingChatMessageSound({
        channelId: 'server-channel-1',
        authorId: 'u2',
        activeChannelId: 'server-channel-1',
        currentUserId: 'u1',
        currentUsername: 'ada',
        isDmChannel: false,
        serverNotificationLevel: 'mentions',
        memberRoleIds: new Set(['role-mod']),
        mentions: [
          {
            id: '2',
            kind: 'role',
            label: 'Mods',
            roleId: 'role-mod',
            start: 0,
            end: 5,
          },
        ],
      }),
    ).toBe(true);
    expect(playEchoSoundMock).toHaveBeenLastCalledWith('pingActive');

    expect(
      playIncomingChatMessageSound({
        channelId: 'server-channel-1',
        authorId: 'u2',
        activeChannelId: 'server-channel-1',
        currentUserId: 'u1',
        currentUsername: 'ada',
        isDmChannel: false,
        serverNotificationLevel: 'mentions',
        memberRoleIds: new Set(['role-mod']),
        mentions: [
          {
            id: '3',
            kind: 'everyone',
            label: 'everyone',
            start: 0,
            end: 9,
          },
        ],
      }),
    ).toBe(true);
    expect(playEchoSoundMock).toHaveBeenLastCalledWith('pingEveryone');
  });

  it('plays reply-to-self sound as a personal ping', () => {
    const played = playIncomingChatMessageSound({
      channelId: 'server-channel-1',
      authorId: 'u2',
      activeChannelId: 'server-channel-1',
      currentUserId: 'u1',
      currentUsername: 'ada',
      isDmChannel: false,
      serverNotificationLevel: 'mentions_direct',
      memberRoleIds: new Set<string>(),
      replyTo: {
        messageId: 'm0',
        authorId: 'u1',
        authorName: 'Ada',
        content: 'hey',
      },
    });

    expect(played).toBe(true);
    expect(playEchoSoundMock).toHaveBeenCalledWith('pingDirectMention');
  });

  it('respects mentions_direct by suppressing non-personal server pings', () => {
    const played = playIncomingChatMessageSound({
      channelId: 'server-channel-1',
      authorId: 'u2',
      activeChannelId: 'server-channel-1',
      currentUserId: 'u1',
      currentUsername: 'ada',
      isDmChannel: false,
      serverNotificationLevel: 'mentions_direct',
      memberRoleIds: new Set(['role-mod']),
      mentions: [
        {
          id: '2',
          kind: 'role',
          label: 'Mods',
          roleId: 'role-mod',
          start: 0,
          end: 5,
        },
      ],
    });

    expect(played).toBe(false);
    expect(playEchoSoundMock).not.toHaveBeenCalled();
  });
});

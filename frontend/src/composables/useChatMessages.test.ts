import { beforeEach, describe, expect, it } from 'vitest';
import { ref } from 'vue';
import {
  useChatMessages,
  type RawMessage,
  type UserForAuthor,
} from './useChatMessages';
import { _resetAllIndexesForTesting } from '@/features/chat/domain/channelMessageIndex';
import { messageWindowAuthority } from '@/features/chat/domain/messageWindowAuthority';
import {
  insertChannelMessageFromHistory,
  replaceChannelMessagesFromHistory,
  updateChannelMessageInBucket,
} from '@/services/realtime/channelMessageAuthority';

describe('useChatMessages', () => {
  beforeEach(() => {
    _resetAllIndexesForTesting();
    messageWindowAuthority.bindMessages(ref<Record<string, RawMessage[]>>({}));
    /** Must clear active channel before `clearWorkspaceMessagesRecord` — its `updateActiveWindow` would otherwise rebuild the window for a stale channel id against an empty bucket. */
    messageWindowAuthority.setActiveChannel(null);
    messageWindowAuthority.clearWorkspaceMessagesRecord();
  });
  it('maps authors via O(1) lookup from users list', () => {
    const messages = ref<Record<string, RawMessage[]>>({
      c1: [
        {
          id: 'm1',
          authorId: 'u1',
          timestamp: 'Today at 1:00 PM',
          content: 'hi',
        },
      ],
    });
    messageWindowAuthority.bindMessages(messages);
    const activeChannelId = ref('c1');
    messageWindowAuthority.setActiveChannel('c1');
    const users = ref<UserForAuthor[]>([
      { id: 'u1', name: 'Ada', pfp: 'https://p.test/a.png', status: 'online' },
    ]);
    const { activeChannelMessages } = useChatMessages(activeChannelId, users);
    const row = activeChannelMessages.value[0]!;
    expect(row.author.name).toBe('Ada');
    expect(row.author.avatar).toBe('https://p.test/a.png');
    expect(row.author.status).toBe('online');
    expect(row.content).toBe('hi');
  });

  it('treats blank user status as unknown (omit author.status)', () => {
    const messages = ref<Record<string, RawMessage[]>>({
      c1: [{ id: 'm1', authorId: 'u1', timestamp: 't', content: 'hi' }],
    });
    const activeChannelId = ref('c1');
    messageWindowAuthority.bindMessages(messages);
    messageWindowAuthority.setActiveChannel('c1');
    const users = ref<UserForAuthor[]>([
      { id: 'u1', name: 'Ada', pfp: '', status: '   ' },
    ]);
    const { activeChannelMessages } = useChatMessages(activeChannelId, users);
    expect(activeChannelMessages.value[0]!.author.status).toBeUndefined();
  });

  it('uses Unknown author when user missing from map', () => {
    const messages = ref<Record<string, RawMessage[]>>({
      c1: [{ id: 'm1', authorId: 'ghost', timestamp: 't', content: 'x' }],
    });
    messageWindowAuthority.bindMessages(messages);
    messageWindowAuthority.setActiveChannel('c1');
    const activeChannelId = ref('c1');
    const users = ref<UserForAuthor[]>([]);
    const { activeChannelMessages } = useChatMessages(activeChannelId, users);
    expect(activeChannelMessages.value[0]!.author).toEqual({
      id: 'ghost',
      name: 'Unknown',
      avatar: '',
    });
  });

  it('applies presence overlay for authors not in the users list', () => {
    const messages = ref<Record<string, RawMessage[]>>({
      c1: [{ id: 'm1', authorId: 'ghost', timestamp: 't', content: 'x' }],
    });
    messageWindowAuthority.bindMessages(messages);
    messageWindowAuthority.setActiveChannel('c1');
    const presenceByUserId = ref<Record<string, string>>({
      ghost: 'offline',
    });
    const { activeChannelMessages } = useChatMessages(
      ref('c1'),
      ref<UserForAuthor[]>([]),
      presenceByUserId,
    );
    expect(activeChannelMessages.value[0]!.author).toMatchObject({
      id: 'ghost',
      name: 'Unknown',
      status: 'offline',
    });
  });

  it('prefers live presence overlay over stale non-offline workspace row', () => {
    const messages = ref<Record<string, RawMessage[]>>({
      c1: [{ id: 'm1', authorId: 'u1', timestamp: 't', content: 'hi' }],
    });
    messageWindowAuthority.bindMessages(messages);
    messageWindowAuthority.setActiveChannel('c1');
    const presenceByUserId = ref<Record<string, string>>({
      u1: 'offline',
    });
    const { activeChannelMessages } = useChatMessages(
      ref('c1'),
      ref<UserForAuthor[]>([
        { id: 'u1', name: 'Ada', pfp: '', status: 'online' },
      ]),
      presenceByUserId,
    );
    expect(activeChannelMessages.value[0]!.author.status).toBe('offline');
  });

  it('prefers presence overlay when the workspace row is placeholder offline', () => {
    const messages = ref<Record<string, RawMessage[]>>({
      c1: [{ id: 'm1', authorId: 'u1', timestamp: 't', content: 'hi' }],
    });
    messageWindowAuthority.bindMessages(messages);
    messageWindowAuthority.setActiveChannel('c1');
    const presenceByUserId = ref<Record<string, string>>({
      u1: 'idle',
    });
    const { activeChannelMessages } = useChatMessages(
      ref('c1'),
      ref<UserForAuthor[]>([
        { id: 'u1', name: 'Ada', pfp: '', status: 'offline' },
      ]),
      presenceByUserId,
    );
    expect(activeChannelMessages.value[0]!.author.status).toBe('idle');
  });

  it('fills author status from overlay when user row status is blank', () => {
    const messages = ref<Record<string, RawMessage[]>>({
      c1: [{ id: 'm1', authorId: 'u1', timestamp: 't', content: 'hi' }],
    });
    messageWindowAuthority.bindMessages(messages);
    messageWindowAuthority.setActiveChannel('c1');
    const presenceByUserId = ref<Record<string, string>>({ u1: 'idle' });
    const { activeChannelMessages } = useChatMessages(
      ref('c1'),
      ref<UserForAuthor[]>([{ id: 'u1', name: 'Ada', pfp: '', status: '   ' }]),
      presenceByUserId,
    );
    expect(activeChannelMessages.value[0]!.author.status).toBe('idle');
  });

  it('updates when channel id changes', () => {
    const messages = ref<Record<string, RawMessage[]>>({
      a: [{ id: 'ma', authorId: 'u1', timestamp: 't', content: 'in a' }],
      b: [{ id: 'mb', authorId: 'u1', timestamp: 't', content: 'in b' }],
    });
    messageWindowAuthority.bindMessages(messages);
    messageWindowAuthority.setActiveChannel('a');
    const activeChannelId = ref('a');
    const users = ref<UserForAuthor[]>([
      { id: 'u1', name: 'Bob', pfp: '', status: 'offline' },
    ]);
    const { activeChannelMessages } = useChatMessages(activeChannelId, users);
    expect(activeChannelMessages.value[0]!.content).toBe('in a');
    activeChannelId.value = 'b';
    messageWindowAuthority.setActiveChannel('b');
    expect(activeChannelMessages.value[0]!.content).toBe('in b');
  });

  it('updates when a previously empty channel receives a replaced history snapshot', () => {
    const messages = ref<Record<string, RawMessage[]>>({
      c1: [],
    });
    messageWindowAuthority.bindMessages(messages);
    messageWindowAuthority.setActiveChannel('c1');
    const activeChannelId = ref('c1');
    const users = ref<UserForAuthor[]>([
      { id: 'u1', name: 'Ada', pfp: '', status: 'online' },
    ]);
    const { activeChannelMessages } = useChatMessages(activeChannelId, users);

    expect(activeChannelMessages.value).toEqual([]);

    replaceChannelMessagesFromHistory('c1', [
      {
        id: 'm1',
        authorId: 'u1',
        timestamp: '2026-04-10T13:51:17.000Z',
        content: 'history arrived',
      },
    ]);

    expect(activeChannelMessages.value).toHaveLength(1);
    expect(activeChannelMessages.value[0]!.content).toBe('history arrived');
    expect(activeChannelMessages.value[0]!.author.name).toBe('Ada');
  });

  it('preserves row object identity when users array is replaced with equivalent data', () => {
    const m1: RawMessage = {
      id: 'm1',
      authorId: 'u1',
      timestamp: 't',
      content: 'hi',
    };
    const messages = ref<Record<string, RawMessage[]>>({
      c1: [m1],
    });
    messageWindowAuthority.bindMessages(messages);
    messageWindowAuthority.setActiveChannel('c1');
    const activeChannelId = ref('c1');
    const users = ref<UserForAuthor[]>([
      { id: 'u1', name: 'Ada', pfp: '', status: 'online' },
    ]);
    const { activeChannelMessages } = useChatMessages(activeChannelId, users);
    const listBefore = activeChannelMessages.value;
    const first = activeChannelMessages.value[0];
    users.value = [{ id: 'u1', name: 'Ada', pfp: '', status: 'online' }];
    expect(activeChannelMessages.value[0]).toBe(first);
    expect(activeChannelMessages.value).toBe(listBefore);
  });

  it('reuses the messages array when presence changes only for users who are not channel authors', () => {
    const m1: RawMessage = {
      id: 'm1',
      authorId: 'u1',
      timestamp: 't',
      content: 'a',
    };
    const messages = ref<Record<string, RawMessage[]>>({
      c1: [m1],
    });
    messageWindowAuthority.bindMessages(messages);
    messageWindowAuthority.setActiveChannel('c1');
    const presence = ref<Record<string, string>>({
      u1: 'online',
      u99: 'idle',
    });
    const { activeChannelMessages } = useChatMessages(
      ref('c1'),
      ref<UserForAuthor[]>([
        { id: 'u1', name: 'A', pfp: '', status: 'offline' },
      ]),
      presence,
    );
    const listBefore = activeChannelMessages.value;
    presence.value = { ...presence.value, u99: 'dnd' };
    expect(activeChannelMessages.value).toBe(listBefore);
  });

  it('does not remap an unaffected author row when another author presence changes', () => {
    const m1: RawMessage = {
      id: 'm1',
      authorId: 'u1',
      timestamp: 't',
      content: 'a',
    };
    const m2: RawMessage = {
      id: 'm2',
      authorId: 'u2',
      timestamp: 't',
      content: 'b',
    };
    const messages = ref<Record<string, RawMessage[]>>({
      c1: [m1, m2],
    });
    messageWindowAuthority.bindMessages(messages);
    messageWindowAuthority.setActiveChannel('c1');
    const presence = ref<Record<string, string>>({
      u1: 'online',
      u2: 'offline',
    });
    const { activeChannelMessages } = useChatMessages(
      ref('c1'),
      ref<UserForAuthor[]>([
        { id: 'u1', name: 'A', pfp: '', status: 'offline' },
        { id: 'u2', name: 'B', pfp: '', status: 'offline' },
      ]),
      presence,
    );
    const rowU1Before = activeChannelMessages.value[0];
    const listBefore = activeChannelMessages.value;
    presence.value = { ...presence.value, u2: 'idle' };
    expect(activeChannelMessages.value[0]).toBe(rowU1Before);
    expect(activeChannelMessages.value).not.toBe(listBefore);
  });

  it('rebuilds row when author name changes', () => {
    const m1: RawMessage = {
      id: 'm1',
      authorId: 'u1',
      timestamp: 't',
      content: 'hi',
    };
    const messages = ref<Record<string, RawMessage[]>>({ c1: [m1] });
    messageWindowAuthority.bindMessages(messages);
    messageWindowAuthority.setActiveChannel('c1');
    const users = ref<UserForAuthor[]>([
      { id: 'u1', name: 'Ada', pfp: '', status: 'online' },
    ]);
    const { activeChannelMessages } = useChatMessages(ref('c1'), users);
    const first = activeChannelMessages.value[0];
    users.value = [{ id: 'u1', name: 'Ada2', pfp: '', status: 'online' }];
    expect(activeChannelMessages.value[0]).not.toBe(first);
    expect(activeChannelMessages.value[0]!.author.name).toBe('Ada2');
  });

  it('allocates a new list array when a new message is appended', () => {
    const m1: RawMessage = {
      id: 'm1',
      authorId: 'u1',
      timestamp: 't',
      content: 'first',
    };
    const messages = ref<Record<string, RawMessage[]>>({
      c1: [m1],
    });
    messageWindowAuthority.bindMessages(messages);
    messageWindowAuthority.setActiveChannel('c1');
    const users = ref<UserForAuthor[]>([
      { id: 'u1', name: 'Ada', pfp: '', status: 'online' },
    ]);
    const { activeChannelMessages } = useChatMessages(ref('c1'), users);
    const listBefore = activeChannelMessages.value;
    insertChannelMessageFromHistory('c1', {
      id: 'm2',
      authorId: 'u1',
      timestamp: 't2',
      content: 'second',
    });
    expect(activeChannelMessages.value).not.toBe(listBefore);
    expect(activeChannelMessages.value).toHaveLength(2);
  });

  it('rebuilds row when message object is replaced with new content', () => {
    const m1: RawMessage = {
      id: 'm1',
      authorId: 'u1',
      timestamp: 't',
      content: 'old',
    };
    const messages = ref<Record<string, RawMessage[]>>({ c1: [m1] });
    messageWindowAuthority.bindMessages(messages);
    messageWindowAuthority.setActiveChannel('c1');
    const users = ref<UserForAuthor[]>([
      { id: 'u1', name: 'Ada', pfp: '', status: 'online' },
    ]);
    const { activeChannelMessages } = useChatMessages(ref('c1'), users);
    const first = activeChannelMessages.value[0];
    updateChannelMessageInBucket('c1', 'm1', { content: 'new' });
    expect(activeChannelMessages.value[0]).not.toBe(first);
    expect(activeChannelMessages.value[0]!.content).toBe('new');
  });
});

import { describe, expect, it } from 'vitest';
import type {
  RawMessage,
  UserForAuthor,
} from '@/features/chat/chatMessageTypes';
import {
  attachmentFingerprint,
  buildMessageWithAuthor,
  channelActiveMessagesFingerprint,
  messageWithAuthorCacheKey,
  resolveAuthorStatus,
} from './messageWithAuthor';

describe('resolveAuthorStatus', () => {
  it('prefers live presence overlay over stale non-offline workspace row', () => {
    const user: UserForAuthor = {
      id: 'u1',
      name: 'Ada',
      pfp: '',
      status: 'online',
    };
    expect(resolveAuthorStatus(user, 'u1', { u1: 'offline' })).toBe('offline');
  });

  it('prefers overlay when row is offline', () => {
    const user: UserForAuthor = {
      id: 'u1',
      name: 'Ada',
      pfp: '',
      status: 'offline',
    };
    expect(resolveAuthorStatus(user, 'u1', { u1: 'idle' })).toBe('idle');
  });

  it('fills from overlay when row status is blank', () => {
    const user: UserForAuthor = {
      id: 'u1',
      name: 'Ada',
      pfp: '',
      status: '   ',
    };
    expect(resolveAuthorStatus(user, 'u1', { u1: 'idle' })).toBe('idle');
  });

  it('uses overlay for unknown user', () => {
    expect(resolveAuthorStatus(undefined, 'ghost', { ghost: 'offline' })).toBe(
      'offline',
    );
  });
});

describe('attachmentFingerprint', () => {
  it('is stable for same attachments', () => {
    const a = [
      {
        url: 'https://x.test/a.png',
        kind: 'image' as const,
        filename: 'a.png',
        mimeType: 'image/png',
      },
    ];
    expect(attachmentFingerprint(a)).toBe(attachmentFingerprint([...a]));
  });

  it('changes when url changes', () => {
    const a = [{ url: 'https://x.test/1', kind: 'image' as const }];
    const b = [{ url: 'https://x.test/2', kind: 'image' as const }];
    expect(attachmentFingerprint(a)).not.toBe(attachmentFingerprint(b));
  });
});

describe('messageWithAuthorCacheKey', () => {
  it('is equal when user row is replaced with equivalent data', () => {
    const msg: RawMessage = {
      id: 'm1',
      authorId: 'u1',
      timestamp: 't',
      content: 'hi',
    };
    const u1: UserForAuthor = {
      id: 'u1',
      name: 'Ada',
      pfp: 'p.png',
      status: 'online',
    };
    const u1Clone: UserForAuthor = {
      id: 'u1',
      name: 'Ada',
      pfp: 'p.png',
      status: 'online',
    };
    expect(messageWithAuthorCacheKey(msg, u1, undefined)).toBe(
      messageWithAuthorCacheKey(msg, u1Clone, undefined),
    );
  });

  it('changes when user name changes', () => {
    const msg: RawMessage = {
      id: 'm1',
      authorId: 'u1',
      timestamp: 't',
      content: 'hi',
    };
    const a: UserForAuthor = {
      id: 'u1',
      name: 'Ada',
      pfp: '',
      status: 'online',
    };
    const b: UserForAuthor = {
      id: 'u1',
      name: 'Ada2',
      pfp: '',
      status: 'online',
    };
    expect(messageWithAuthorCacheKey(msg, a, undefined)).not.toBe(
      messageWithAuthorCacheKey(msg, b, undefined),
    );
  });

  it('changes when presence for author changes', () => {
    const msg: RawMessage = {
      id: 'm1',
      authorId: 'u1',
      timestamp: 't',
      content: 'hi',
    };
    const u: UserForAuthor = {
      id: 'u1',
      name: 'Ada',
      pfp: '',
      status: 'offline',
    };
    expect(messageWithAuthorCacheKey(msg, u, 'idle')).not.toBe(
      messageWithAuthorCacheKey(msg, u, 'dnd'),
    );
  });
});

describe('channelActiveMessagesFingerprint', () => {
  it('is stable for an empty sorted list', () => {
    const lookup = new Map<string, UserForAuthor>();
    const empty = new Map<string, RawMessage>();
    expect(
      channelActiveMessagesFingerprint('c1', 3, [], empty, lookup, {}),
    ).toBe(channelActiveMessagesFingerprint('c1', 3, [], empty, lookup, {}));
  });

  it('changes when channel id differs', () => {
    const lookup = new Map<string, UserForAuthor>();
    const m: RawMessage = {
      id: 'm1',
      authorId: 'u1',
      timestamp: 't',
      content: 'x',
    };
    const entities = new Map<string, RawMessage>([['m1', m]]);
    expect(
      channelActiveMessagesFingerprint('a', 0, ['m1'], entities, lookup, {}),
    ).not.toBe(
      channelActiveMessagesFingerprint('b', 0, ['m1'], entities, lookup, {}),
    );
  });

  it('changes when message body changes', () => {
    const lookup = new Map<string, UserForAuthor>([
      ['u1', { id: 'u1', name: 'A', pfp: '', status: 'online' }],
    ]);
    const a: RawMessage = {
      id: 'm1',
      authorId: 'u1',
      timestamp: 't',
      content: 'old',
    };
    const b: RawMessage = {
      id: 'm1',
      authorId: 'u1',
      timestamp: 't',
      content: 'new',
    };
    expect(
      channelActiveMessagesFingerprint(
        'c1',
        0,
        ['m1'],
        new Map([['m1', a]]),
        lookup,
        {},
      ),
    ).not.toBe(
      channelActiveMessagesFingerprint(
        'c1',
        0,
        ['m1'],
        new Map([['m1', b]]),
        lookup,
        {},
      ),
    );
  });

  it('ignores overlay entries for user ids that are not authors in sorted', () => {
    const lookup = new Map<string, UserForAuthor>([
      ['u1', { id: 'u1', name: 'A', pfp: '', status: 'offline' }],
    ]);
    const m: RawMessage = {
      id: 'm1',
      authorId: 'u1',
      timestamp: 't',
      content: 'x',
    };
    const entities = new Map<string, RawMessage>([['m1', m]]);
    expect(
      channelActiveMessagesFingerprint('c1', 0, ['m1'], entities, lookup, {
        u1: 'online',
        u99: 'idle',
      }),
    ).toBe(
      channelActiveMessagesFingerprint('c1', 0, ['m1'], entities, lookup, {
        u1: 'online',
        u99: 'dnd',
      }),
    );
  });
});

describe('buildMessageWithAuthor', () => {
  it('matches roster author shape', () => {
    const msg: RawMessage = {
      id: 'm1',
      authorId: 'u1',
      timestamp: 't',
      content: 'x',
    };
    const lookup = new Map<string, UserForAuthor>([
      ['u1', { id: 'u1', name: 'Bob', pfp: 'a.png', status: 'online' }],
    ]);
    const row = buildMessageWithAuthor(msg, lookup, {});
    expect(row.author).toMatchObject({
      id: 'u1',
      name: 'Bob',
      avatar: 'a.png',
      status: 'online',
    });
  });
});

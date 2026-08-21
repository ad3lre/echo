import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Message } from '../../../../../contracts/types';
import {
  collectServerPushTargets,
  userAllowsMessagePush,
} from '../../services/echoMessagePushNotify';

function baseMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    channelId: 'c1',
    authorId: 'author',
    content: 'hi',
    contentText: 'hi',
    messageFormatVersion: 1,
    contentSchemaVersion: 1,
    timestamp: new Date().toISOString(),
    ...overrides,
  } as Message;
}

describe('collectServerPushTargets', () => {
  it('targets directly mentioned users as personal', () => {
    const msg = baseMessage({
      mentions: [
        {
          id: 'u2',
          kind: 'user',
          label: 'Bob',
          userId: 'u2',
          start: 0,
          end: 3,
        },
      ],
    });
    const targets = collectServerPushTargets(msg, 'author', {});
    assert.deepEqual(targets, [{ userId: 'u2', pingKind: 'personal' }]);
  });

  it('never targets the author (self-mention is ignored)', () => {
    const msg = baseMessage({
      mentions: [
        {
          id: 'author',
          kind: 'user',
          label: 'Me',
          userId: 'author',
          start: 0,
          end: 3,
        },
      ],
    });
    assert.deepEqual(collectServerPushTargets(msg, 'author', {}), []);
  });

  it('expands role mentions to role members as role pings', () => {
    const msg = baseMessage({
      mentions: [
        {
          id: 'r1',
          kind: 'role',
          label: 'Mods',
          roleId: 'r1',
          start: 0,
          end: 5,
        },
      ],
    });
    const targets = collectServerPushTargets(msg, 'author', {
      u2: ['r1'],
      u3: ['r9'],
      author: ['r1'],
    });
    assert.deepEqual(targets, [{ userId: 'u2', pingKind: 'role' }]);
  });

  it('prefers personal over role when a user is both mentioned and in a role', () => {
    const msg = baseMessage({
      mentions: [
        {
          id: 'u2',
          kind: 'user',
          label: 'Bob',
          userId: 'u2',
          start: 0,
          end: 3,
        },
        {
          id: 'r1',
          kind: 'role',
          label: 'Mods',
          roleId: 'r1',
          start: 4,
          end: 9,
        },
      ],
    });
    const targets = collectServerPushTargets(msg, 'author', { u2: ['r1'] });
    assert.deepEqual(targets, [{ userId: 'u2', pingKind: 'personal' }]);
  });

  it('targets reply-to author as personal', () => {
    const msg = baseMessage({
      replyTo: {
        messageId: 'm0',
        authorId: 'u5',
        authorName: 'Carol',
        content: 'earlier',
      },
    });
    assert.deepEqual(collectServerPushTargets(msg, 'author', {}), [
      { userId: 'u5', pingKind: 'personal' },
    ]);
  });

  it('skips @everyone/@active (no server-wide push storm)', () => {
    const msg = baseMessage({
      mentions: [
        {
          id: 'everyone',
          kind: 'everyone',
          label: 'everyone',
          start: 0,
          end: 9,
        },
      ],
    });
    assert.deepEqual(
      collectServerPushTargets(msg, 'author', { u2: ['r1'] }),
      [],
    );
  });
});

describe('userAllowsMessagePush', () => {
  it('defaults to enabled and honors the account master switch', () => {
    assert.equal(userAllowsMessagePush(undefined), true);
    assert.equal(userAllowsMessagePush({}), true);
    assert.equal(userAllowsMessagePush({ desktopAlerts: true }), true);
    assert.equal(userAllowsMessagePush({ desktopAlerts: false }), false);
  });
});

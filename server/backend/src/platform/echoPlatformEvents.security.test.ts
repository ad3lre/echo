import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { EchoWorkspaceEvent } from '../../../../contracts/types/socket';

// Isolate the real publisher from database/network services; model two members
// with different channel permissions and exercise immediate and outbox fanout.
function stub(path: string, exports: object): void {
  require.cache[require.resolve(path)] = { exports } as NodeModule;
}
let privatePaper = false;
let member = true;
let ticketExists = true;
let ticketHandler = false;
const emitted: string[] = [];
const insertedOutboxIds: string[] = [];
const deliveredOutboxIds: string[] = [];
const pool = { query: async () => ({ rowCount: 1, rows: [{}] }) };
stub('../db/pg', { getPgPool: () => pool });
stub('../domain/permissions/echoPermissions', {
  isMemberOfServer: async () => member,
  canUserAccessChannel: async (_pool: unknown, userId: string) =>
    userId === 'allowed',
});
stub('../domain/echoStore/paper/paperShare', {
  assertPaperContentVisibleToUser: async () => ({ ok: !privatePaper }),
});
stub('../domain/echoStore/community/tickets', {
  getEchoTicketById: async () =>
    ticketExists
      ? {
          serverId: 'server',
          channelId: 'channel',
          authorId: 'allowed',
        }
      : null,
  isTicketHandler: async () => ticketHandler,
});
let replay: unknown[] = [];
stub('../domain/echoStore/platform/workspaceEventOutbox', {
  insertEchoWorkspaceEventOutboxProcessing: async (
    _pool: unknown,
    args: { id: string },
  ) => {
    insertedOutboxIds.push(args.id);
  },
  markEchoWorkspaceEventOutboxDelivered: async (_pool: unknown, id: string) => {
    deliveredOutboxIds.push(id);
  },
  markEchoWorkspaceEventOutboxFailed: async () => {},
  claimEchoWorkspaceEventOutbox: async () => replay,
});
stub('../domain/echoSnowflake', { nextEchoSnowflakeId: () => 'event' });
stub('../observability/echoMetrics', {
  echoWorkspaceEventPublishedTotal: { inc() {} },
});
const { publishEchoWorkspaceEvent, drainEchoWorkspaceEventOutbox } =
  require('./echoPlatformEvents') as typeof import('./echoPlatformEvents');
const sockets = ['allowed', 'denied'].map((userId) => ({
  data: { authenticated: true, userId },
  emit() {
    emitted.push(userId);
  },
}));
const app = {
  io: { in: () => ({ fetchSockets: async () => sockets }) },
  log: { warn() {} },
} as unknown as FastifyInstance;
const events = [
  {
    kind: 'paper_document_updated',
    paperDocument: { channelId: 'channel', contentJson: { text: 'secret' } },
  },
  {
    kind: 'paper_comment_updated',
    paperComment: {
      channelId: 'channel',
      action: 'created',
      comment: { body: 'secret' },
    },
  },
  {
    kind: 'ticket_created',
    ticketEvent: {
      channelId: 'channel',
      ticketId: 'ticket',
      subject: 'secret',
    },
  },
  {
    kind: 'ticket_updated',
    ticketEvent: {
      channelId: 'channel',
      ticketId: 'ticket',
      subject: 'secret',
    },
  },
].map(
  (event) =>
    ({ ...event, serverId: 'server', version: '1' }) as EchoWorkspaceEvent,
);

for (const event of events) {
  test(`${event.kind} is filtered on immediate delivery and replay`, async () => {
    emitted.length = 0;
    publishEchoWorkspaceEvent(app, event, { serverId: 'server' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(emitted, ['allowed']);
    emitted.length = 0;
    replay = [
      { id: 'event', payload: event, targetServerId: 'server', attempts: 1 },
    ];
    await drainEchoWorkspaceEventOutbox(app, 1);
    assert.deepEqual(emitted, ['allowed']);
  });
}

test('replay rechecks paper visibility after a document becomes private', async () => {
  privatePaper = true;
  emitted.length = 0;
  replay = [
    { id: 'event', payload: events[0], targetServerId: 'server', attempts: 1 },
  ];
  try {
    await drainEchoWorkspaceEventOutbox(app, 1);
    assert.deepEqual(emitted, []);
  } finally {
    privatePaper = false;
  }
});

test('removed members and deleted tickets receive no replayed details', async () => {
  for (const event of events) {
    member = false;
    emitted.length = 0;
    replay = [
      { id: 'event', payload: event, targetServerId: 'server', attempts: 1 },
    ];
    try {
      await drainEchoWorkspaceEventOutbox(app, 1);
      assert.deepEqual(emitted, []);
    } finally {
      member = true;
    }
  }
  ticketExists = false;
  emitted.length = 0;
  try {
    await drainEchoWorkspaceEventOutbox(app, 1);
    assert.deepEqual(emitted, []);
  } finally {
    ticketExists = true;
  }
});

test('ticket handlers and ordinary server invalidations retain delivery', async () => {
  ticketHandler = true;
  emitted.length = 0;
  try {
    await drainEchoWorkspaceEventOutbox(app, 1);
    assert.deepEqual(emitted, ['allowed', 'denied']);
  } finally {
    ticketHandler = false;
  }
  emitted.length = 0;
  publishEchoWorkspaceEvent(
    app,
    { kind: 'workspace_invalidated', version: '2', serverId: 'server' },
    { serverId: 'server' },
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(emitted, ['allowed', 'denied']);
});

test('pre-staged durable events dispatch and complete their existing outbox row', async () => {
  emitted.length = 0;
  insertedOutboxIds.length = 0;
  deliveredOutboxIds.length = 0;
  const event = {
    kind: 'role_graph_changed',
    version: 'audit-version',
    serverId: 'server',
  } as EchoWorkspaceEvent;
  publishEchoWorkspaceEvent(
    app,
    event,
    { serverId: 'server' },
    'audit-version',
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(insertedOutboxIds, []);
  assert.deepEqual(deliveredOutboxIds, ['audit-version']);
  assert.deepEqual(emitted, ['allowed', 'denied']);
});

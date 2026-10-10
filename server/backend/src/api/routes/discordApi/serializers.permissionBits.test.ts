import assert from 'node:assert/strict';
import { permsBitfield, serializeMessage } from './serializers';
import type { EchoMessageRow } from '../../../domain/echoMessagesDal';

assert.equal(permsBitfield(['PIN_MESSAGES']), (1n << 51n).toString());
assert.equal(permsBitfield(['MANAGE_MESSAGES']), (1n << 13n).toString());
assert.notEqual(
  permsBitfield(['PIN_MESSAGES']),
  permsBitfield(['MANAGE_MESSAGES']),
);
const serialized = serializeMessage(
  {
    id: 'message',
    channelId: 'channel',
    authorId: 'user',
    content: '',
    timestamp: new Date(0).toISOString(),
    attachments: [
      { url: 'https://cdn.example/doc', kind: 'document', fileSize: 123 },
      { url: 'https://cdn.example/unknown', kind: 'document' },
    ],
  } satisfies EchoMessageRow,
  {
    id: 'user',
    username: 'user',
    discriminator: '0',
    global_name: 'user',
    avatar: null,
    bot: false,
    system: false,
    flags: 0,
  },
);
assert.deepEqual(
  serialized.attachments.map((attachment) => attachment.size),
  [123, 0],
);
console.log('Discord permission bit regressions: ok');

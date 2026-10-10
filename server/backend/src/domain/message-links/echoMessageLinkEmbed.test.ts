import assert from 'node:assert/strict';
import type pg from 'pg';
import { DEFAULT_INSTANCE_POLICY } from '../../../../../contracts/instancePolicy';
import { setInstancePolicyForTests } from '../../config/instancePolicy';
import {
  buildEchoJumpEmbedFromUrl,
  neutralizeSharedJumpEmbeds,
  parseEchoMessageJumpPath,
} from '../echoMessageLinkEmbed';

async function run() {
  setInstancePolicyForTests(DEFAULT_INSTANCE_POLICY);
  const pool = {
    query: () => {
      throw new Error('Shared preview must not read private data');
    },
  } as unknown as pg.Pool;
  const link = 'http://localhost:8080/channels/private-channel/private-message';
  const embed = await buildEchoJumpEmbedFromUrl(pool, 'author', link);
  assert.deepEqual(embed, {
    url: link,
    provider: 'Echo',
    title: 'Message link',
    echoJump: { channelId: 'private-channel', messageId: 'private-message' },
  });
  assert.equal(
    parseEchoMessageJumpPath(
      'https://external.example/channels/private-channel/private-message',
    ),
    null,
  );
  assert.deepEqual(
    neutralizeSharedJumpEmbeds([
      {
        ...embed,
        description: 'Private message',
        author: { name: 'Private author' },
        timestamp: 'secret',
      },
    ]),
    [embed],
  );
  console.info('echoMessageLinkEmbed: OK');
}
void run();

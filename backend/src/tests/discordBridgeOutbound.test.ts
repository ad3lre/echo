import assert from 'node:assert/strict';
import { generateDefaultAvatarPfp } from '../auth/defaultAvatarPfp';
import { buildDiscordBridgeOutboundWebhookBody } from '../services/discordBridgeOutbound';
import type { Message } from '../../../shared/types';

function baseMessage(patch: Partial<Message> = {}): Message {
  return {
    id: '1420070400000000001',
    channelId: '00000000-0000-4000-8000-000000000010',
    authorId: '00000000-0000-4000-8000-000000000020',
    content: 'hello from echo',
    timestamp: '2026-06-06T12:00:00.000Z',
    ...patch,
  };
}

function test(name: string, fn: () => void) {
  try {
    fn();
    // eslint-disable-next-line no-console
    console.log(`ok ${name}`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

test('omits avatar_url for native Echo default data-URL pfps', () => {
  const body = buildDiscordBridgeOutboundWebhookBody(
    baseMessage({
      authorDisplayName: 'Ada',
      authorAvatar: generateDefaultAvatarPfp('Ada'),
    }),
  );
  assert.ok(body);
  assert.equal(body.content, 'hello from echo');
  assert.equal(body.username, 'Ada');
  assert.equal(body.avatar_url, undefined);
});

test('prefers contentText when content is empty', () => {
  const body = buildDiscordBridgeOutboundWebhookBody(
    baseMessage({
      content: '',
      contentText: 'derived plain text',
    }),
  );
  assert.equal(body?.content, 'derived plain text');
});

void (async () => {
  if (process.exitCode) process.exit(1);
})();

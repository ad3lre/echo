import assert from 'node:assert/strict';
import { generateDefaultAvatarPfp } from '../../auth/defaultAvatarPfp';
import { buildDiscordBridgeOutboundWebhookBody } from '../../services/discordBridge/discordBridgeOutbound';
import type { Message } from '../../../../../contracts/types';

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

test('appends filled image slot URLs to webhook content', () => {
  const body = buildDiscordBridgeOutboundWebhookBody(
    baseMessage({
      content: 'see image',
      contentJson: {
        type: 'doc',
        content: [
          {
            type: 'imageSlot',
            attrs: {
              slotId: 'slot-1',
              aspectW: 16,
              aspectH: 9,
              imageUrl: 'https://cdn.example.com/slot.png',
              storageKey: null,
              width: null,
              height: null,
            },
          },
        ],
      },
    }),
  );
  assert.ok(body);
  assert.equal(body.content, 'see image\nhttps://cdn.example.com/slot.png');
});

test('forwards full embed schema to Discord webhooks', () => {
  const body = buildDiscordBridgeOutboundWebhookBody(
    baseMessage({
      content: '',
      embeds: [
        {
          title: 'Status',
          description: '**ok**',
          color: 5814783,
          fields: [{ name: 'Env', value: '`prod`', inline: true }],
          footer: { text: 'Echo' },
        },
      ],
    }),
  );
  assert.ok(body);
  assert.equal(body.content, undefined);
  assert.equal(Array.isArray(body.embeds), true);
  const embeds = body.embeds as Record<string, unknown>[];
  assert.equal(embeds.length, 1);
  assert.equal(embeds[0]?.title, 'Status');
  assert.equal(embeds[0]?.description, '**ok**');
  assert.equal(embeds[0]?.color, 5814783);
  assert.deepEqual(embeds[0]?.fields, [
    { name: 'Env', value: '`prod`', inline: true },
  ]);
  assert.deepEqual(embeds[0]?.footer, { text: 'Echo' });
});

void (async () => {
  if (process.exitCode) process.exit(1);
})();

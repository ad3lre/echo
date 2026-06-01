import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import {
  signEchoWebhookBody,
  verifyEchoWebhookBodyHmac,
} from '../../../shared/echoWebhookHmac';

const TEST_SECRET = 'test-discord-bot-webhook-secret-32chars';
const require = createRequire(import.meta.url);

function clearModule(relativePath: string): void {
  try {
    const resolved = require.resolve(relativePath);
    delete require.cache[resolved];
  } catch {
    /* module may not be loaded yet */
  }
}

describe('discordBotWebhook contract', () => {
  it('shared sign + verify round-trip', () => {
    const rawBody = JSON.stringify({
      discordGuildId: '123',
      discordChannelId: '456',
      discordMessageId: '789',
    });
    const signed = signEchoWebhookBody(TEST_SECRET, rawBody);
    assert.equal(
      verifyEchoWebhookBodyHmac(
        TEST_SECRET,
        rawBody,
        signed['x-echo-signature-ts'],
        signed['x-echo-signature'],
        signed.tsMs,
      ),
      true,
    );
  });

  it('signed POST is accepted by bridge hook in non-production (dev bypass)', async () => {
    process.env.ECHO_CONFIG_TEST_ISOLATION = '1';
    process.env.NODE_ENV = 'test';
    process.env.ECHO_DISCORD_BOT_WEBHOOK_SECRET = TEST_SECRET;
    process.env.ECHO_BACKEND_STORAGE = 'memory';
    clearModule('../config');

    const { default: discordBridgeHookRoutes } =
      await import('../api/routes/discordBridgeHook');

    const app = Fastify({ logger: false });
    await app.register(discordBridgeHookRoutes);

    const body = {
      discordGuildId: '1',
      discordChannelId: '2',
      discordMessageId: '3',
      content: 'probe',
      author: { id: '9', username: 'probe' },
    };
    const rawBody = JSON.stringify(body);
    const signed = signEchoWebhookBody(TEST_SECRET, rawBody);

    const res = await app.inject({
      method: 'POST',
      url: '/hooks/discord-bridge/inbound',
      headers: {
        'content-type': 'application/json',
        'x-echo-discord-bot-secret': TEST_SECRET,
        'x-echo-delivery-id': randomUUID(),
        'x-echo-signature-ts': signed['x-echo-signature-ts'],
        'x-echo-signature': signed['x-echo-signature'],
      },
      payload: rawBody,
    });

    assert.notEqual(res.statusCode, 401, res.body);
    await app.close();
  });
});

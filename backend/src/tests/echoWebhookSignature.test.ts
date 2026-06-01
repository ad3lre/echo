import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { verifyEchoWebhookHmac } from '../services/echoWebhookSignature';
import {
  signEchoWebhookBody,
  verifyEchoWebhookBodyHmac,
} from '../../../shared/echoWebhookHmac';

describe('echoWebhookSignature', () => {
  it('accepts valid HMAC signatures within skew window', () => {
    const secret = 'test-webhook-secret-value-32chars';
    const rawBody = JSON.stringify({ discordGuildId: '123' });
    const signed = signEchoWebhookBody(secret, rawBody, Date.now());
    const req = {
      headers: {
        'x-echo-signature-ts': signed['x-echo-signature-ts'],
        'x-echo-signature': signed['x-echo-signature'],
      },
    } as Parameters<typeof verifyEchoWebhookHmac>[2];
    assert.equal(verifyEchoWebhookHmac(secret, rawBody, req), true);
  });

  it('rejects tampered bodies', () => {
    const secret = 'test-webhook-secret-value-32chars';
    const rawBody = JSON.stringify({ discordGuildId: '123' });
    const signed = signEchoWebhookBody(secret, rawBody, Date.now());
    assert.equal(
      verifyEchoWebhookBodyHmac(
        secret,
        JSON.stringify({ discordGuildId: '456' }),
        signed['x-echo-signature-ts'],
        signed['x-echo-signature'],
        signed.tsMs,
      ),
      false,
    );
  });
});

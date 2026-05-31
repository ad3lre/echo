import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { verifyEchoWebhookHmac } from '../services/echoWebhookSignature';

describe('echoWebhookSignature', () => {
  it('accepts valid HMAC signatures within skew window', () => {
    const secret = 'test-webhook-secret-value-32chars';
    const rawBody = JSON.stringify({ discordGuildId: '123' });
    const ts = String(Date.now());
    const signature = createHmac('sha256', secret)
      .update(`${ts}.${rawBody}`)
      .digest('hex');
    const req = {
      headers: {
        'x-echo-signature-ts': ts,
        'x-echo-signature': signature,
      },
    } as Parameters<typeof verifyEchoWebhookHmac>[2];
    assert.equal(verifyEchoWebhookHmac(secret, rawBody, req), true);
  });

  it('rejects tampered bodies', () => {
    const secret = 'test-webhook-secret-value-32chars';
    const rawBody = JSON.stringify({ discordGuildId: '123' });
    const ts = String(Date.now());
    const signature = createHmac('sha256', secret)
      .update(`${ts}.${rawBody}`)
      .digest('hex');
    const req = {
      headers: {
        'x-echo-signature-ts': ts,
        'x-echo-signature': signature,
      },
    } as Parameters<typeof verifyEchoWebhookHmac>[2];
    assert.equal(
      verifyEchoWebhookHmac(
        secret,
        JSON.stringify({ discordGuildId: '456' }),
        req,
      ),
      false,
    );
  });
});

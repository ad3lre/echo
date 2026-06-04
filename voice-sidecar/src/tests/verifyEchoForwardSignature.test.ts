import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyEchoForwardSignature } from '../verifyEchoForwardSignature';

function run(): void {
  const secret = 'test-secret';
  const rawBody = JSON.stringify({ event: 'participant_joined' });
  const ts = String(Date.now());
  const sig = createHmac('sha256', secret)
    .update(`${ts}.${rawBody}`)
    .digest('hex');

  const req = {
    headers: {
      'x-echo-signature-ts': ts,
      'x-echo-signature': sig,
    },
  };

  const ok = verifyEchoForwardSignature(
    req as unknown as Parameters<typeof verifyEchoForwardSignature>[0],
    rawBody,
    secret,
  );
  assert.equal(ok, true);

  const bad = verifyEchoForwardSignature(
    {
      headers: {
        'x-echo-signature-ts': ts,
        'x-echo-signature': '00',
      },
    } as unknown as Parameters<typeof verifyEchoForwardSignature>[0],
    rawBody,
    secret,
  );
  assert.equal(bad, false);

  console.log('verifyEchoForwardSignature.test: ok');
}

run();

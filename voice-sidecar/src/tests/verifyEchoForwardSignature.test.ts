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

  // A correctly-signed but stale timestamp (outside the ±5 min skew window)
  // must be rejected so captured forwards cannot be replayed.
  const staleTs = String(Date.now() - 10 * 60 * 1000);
  const staleSig = createHmac('sha256', secret)
    .update(`${staleTs}.${rawBody}`)
    .digest('hex');
  const stale = verifyEchoForwardSignature(
    {
      headers: {
        'x-echo-signature-ts': staleTs,
        'x-echo-signature': staleSig,
      },
    } as unknown as Parameters<typeof verifyEchoForwardSignature>[0],
    rawBody,
    secret,
  );
  assert.equal(stale, false);

  console.log('verifyEchoForwardSignature.test: ok');
}

run();

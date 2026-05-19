import assert from 'node:assert/strict';
import { validateE2eeEnvelopeWire } from '../sockets/messageValidation';

async function run(): Promise<void> {
  const ok = validateE2eeEnvelopeWire({ protocol: 'libsignal-v1', n: 1 });
  assert.equal(ok.ok, true);

  let deepObj: unknown = { leaf: true };
  for (let i = 0; i < 50; i += 1) {
    deepObj = { nest: deepObj };
  }
  const deepRes = validateE2eeEnvelopeWire(deepObj);
  assert.equal(deepRes.ok, false);

  const big = { x: 'y'.repeat(70_000) };
  const bigRes = validateE2eeEnvelopeWire(big);
  assert.equal(bigRes.ok, false);

  console.log('echo.e2eeEnvelope: ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

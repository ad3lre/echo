import assert from 'node:assert/strict';
import { decryptTotpSecret, encryptTotpSecret } from '../auth/totpCrypto';

async function run(): Promise<void> {
  const plain = 'JBSWY3DPEHPK3PXP';
  const enc = encryptTotpSecret(plain);
  assert.notEqual(enc, plain);
  const dec = decryptTotpSecret(enc);
  assert.equal(dec, plain);
}

run()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('totpCrypto tests passed');
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('totpCrypto tests failed', err);
    process.exit(1);
  });

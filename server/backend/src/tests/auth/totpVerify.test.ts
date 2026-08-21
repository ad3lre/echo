import assert from 'node:assert/strict';
import { generateSync } from 'otplib';
import {
  buildTotpKeyUri,
  generateTotpSecretBase32,
  verifyTotpCode,
} from '../../auth/totpVerify';

async function run(): Promise<void> {
  const secret = generateTotpSecretBase32();
  assert.ok(secret.length >= 16);
  const token = generateSync({ secret });
  assert.ok(verifyTotpCode(secret, token));
  assert.ok(!verifyTotpCode(secret, '000000'));
  const uri = buildTotpKeyUri({
    secretBase32: secret,
    accountLabel: 'user',
    issuer: 'Echo',
  });
  assert.ok(uri.startsWith('otpauth://totp/'));
}

run()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('totpVerify tests passed');
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('totpVerify tests failed', err);
    process.exit(1);
  });

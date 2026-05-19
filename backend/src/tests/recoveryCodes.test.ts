import assert from 'node:assert/strict';
import {
  generateRecoveryCodePlain,
  hashRecoveryCode,
  normalizeRecoveryCodeInput,
  recoveryCodeHashEquals,
} from '../auth/recoveryCodes';

async function run(): Promise<void> {
  const pepper = 'test-pepper';
  const plain = generateRecoveryCodePlain();
  assert.match(
    plain,
    /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/,
  );
  const norm = normalizeRecoveryCodeInput(plain);
  const h = hashRecoveryCode(pepper, norm);
  assert.equal(h.length, 64);
  assert.ok(
    recoveryCodeHashEquals(
      h,
      pepper,
      normalizeRecoveryCodeInput(plain.toLowerCase().replace('-', ' ')),
    ),
  );
  assert.ok(!recoveryCodeHashEquals(h, pepper, 'ZZZZZZZZZZZZ'));
}

run()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('recoveryCodes tests passed');
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('recoveryCodes tests failed', err);
    process.exit(1);
  });

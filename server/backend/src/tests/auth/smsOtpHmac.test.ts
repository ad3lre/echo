import assert from 'node:assert/strict';
import { smsOtpHmacHex, smsOtpVerifyTimingSafe } from '../../auth/smsOtpHmac';

async function run(): Promise<void> {
  const userId = 'user_test_1';
  const phone = '+15551234567';
  const code = '123456';
  const h = smsOtpHmacHex(userId, phone, code);
  assert.equal(smsOtpVerifyTimingSafe(h, userId, phone, code), true);
  assert.equal(smsOtpVerifyTimingSafe(h, 'other_user', phone, code), false);
  assert.equal(smsOtpVerifyTimingSafe(h, userId, '+15559876543', code), false);
  assert.equal(smsOtpVerifyTimingSafe(h, userId, phone, '000000'), false);
  assert.equal(smsOtpVerifyTimingSafe('not-hex', userId, phone, code), false);
}

run()
  .then(() => console.log('smsOtpHmac tests passed'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

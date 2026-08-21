import assert from 'node:assert/strict';
import { toInstancePolicyPublic } from '../../../../../contracts/instancePolicy';
import { loadInstancePolicy } from '../../config/instancePolicy/loadInstancePolicy';

process.env.ECHO_CONFIG_TEST_ISOLATION = '1';

const policy = loadInstancePolicy({
  filePath: '/dev/null/missing',
  isProduction: false,
});
const pub = toInstancePolicyPublic(policy);

assert.equal(typeof pub.general.instanceName, 'string');
assert.equal(typeof pub.guest.enabled, 'boolean');
assert.equal(typeof pub.registration.disabled, 'boolean');
assert.equal(typeof pub.guest.turnstileSiteKey, 'string');
assert.ok(Array.isArray(pub.regions.voice.available));
assert.equal(
  'limits' in (pub as object),
  false,
  'public payload omits rate limits',
);

console.info('instancePolicy.public.test.ts OK');

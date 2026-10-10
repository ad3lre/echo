import assert from 'node:assert/strict';
import {
  deepMergeInstancePolicy,
  DEFAULT_INSTANCE_POLICY,
} from '../../../../../contracts/instancePolicy';
import { validateInstancePolicy } from '../../config/instancePolicy/validateInstancePolicy';
import { instancePolicySchemaIssues } from '../../config/instancePolicy/instancePolicySchema';
import {
  envBool,
  envFloat,
  envInt,
} from '../../config/instancePolicy/envOverrideHelpers';

process.env.ECHO_CONFIG_TEST_ISOLATION = '1';

process.env.ECHO_REGISTRATION_DISABLED = 'tru';
assert.throws(
  () => envBool('ECHO_REGISTRATION_DISABLED'),
  /ECHO_REGISTRATION_DISABLED/,
);
process.env.ECHO_REGISTRATION_DISABLED = 'true';
assert.equal(envBool('ECHO_REGISTRATION_DISABLED'), true);
process.env.ECHO_AUTH_HWID_MAX_ACCOUNTS_PER_KEY_IP = '10junk';
assert.throws(
  () => envInt('ECHO_AUTH_HWID_MAX_ACCOUNTS_PER_KEY_IP'),
  /whole number/,
);
process.env.ECHO_GUEST_CAPTCHA_FAIL_BLOCK_HOURS = '2hours';
assert.throws(
  () => envFloat('ECHO_GUEST_CAPTCHA_FAIL_BLOCK_HOURS'),
  /finite number/,
);
delete process.env.ECHO_REGISTRATION_DISABLED;
delete process.env.ECHO_AUTH_HWID_MAX_ACCOUNTS_PER_KEY_IP;
delete process.env.ECHO_GUEST_CAPTCHA_FAIL_BLOCK_HOURS;

validateInstancePolicy(DEFAULT_INSTANCE_POLICY);
for (const partial of [
  { guest: { enabled: 'false' } },
  { registration: { disabled: 'false' } },
  { limits: { upstream: { serper: { perMinute: '10' } } } },
  { limits: { http: { absolute: { messages: { enabled: 'false' } } } } },
  { limits: { socket: { messagesPerMinute: NaN } } },
  { guest: { enabled: false, typo: true } },
  { limits: { upstream: { unexpected: {} } } },
  { regions: { voice: { available: [{ id: 123, name: 'US' }] } } },
]) {
  assert.ok(
    instancePolicySchemaIssues(partial, true).length,
    'invalid partial policy must fail before merge',
  );
  assert.throws(() =>
    validateInstancePolicy(
      deepMergeInstancePolicy(DEFAULT_INSTANCE_POLICY, partial),
    ),
  );
}
assert.deepEqual(
  instancePolicySchemaIssues(
    {
      $schema: './contracts/instancePolicySchema.json',
      guest: { enabled: false },
    },
    true,
  ),
  [],
);

const withRegions = deepMergeInstancePolicy(DEFAULT_INSTANCE_POLICY, {
  regions: {
    voice: {
      default: 'us-east',
      available: [{ id: 'us-east', name: 'US East', optimal: true }],
    },
  },
});
validateInstancePolicy(withRegions);

let invalidRegion = false;
try {
  validateInstancePolicy(
    deepMergeInstancePolicy(DEFAULT_INSTANCE_POLICY, {
      regions: {
        voice: {
          default: 'missing',
          available: [{ id: 'us-east', name: 'US East' }],
        },
      },
    }),
  );
} catch {
  invalidRegion = true;
}
assert.equal(invalidRegion, true);

console.info('instancePolicy.validation.test.ts OK');

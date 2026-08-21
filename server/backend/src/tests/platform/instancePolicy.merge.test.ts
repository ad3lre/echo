import assert from 'node:assert/strict';
import {
  deepMergeInstancePolicy,
  DEFAULT_INSTANCE_POLICY,
} from '../../../../../contracts/instancePolicy';
import { buildInstancePolicyEnvOverrides } from '../../config/instancePolicy/envOverrides';
import { loadInstancePolicy } from '../../config/instancePolicy/loadInstancePolicy';
import { validateInstancePolicy } from '../../config/instancePolicy/validateInstancePolicy';

process.env.ECHO_CONFIG_TEST_ISOLATION = '1';
delete process.env.ECHO_GUEST_ACCOUNTS_ENABLED;

const merged = deepMergeInstancePolicy(DEFAULT_INSTANCE_POLICY, {
  guest: { enabled: true },
});
assert.equal(merged.guest.enabled, true);

process.env.ECHO_GUEST_ACCOUNTS_ENABLED = '0';
const withEnv = loadInstancePolicy({
  filePath: '/dev/null/does-not-exist',
  isProduction: false,
});
assert.equal(withEnv.guest.enabled, false, 'env overrides file defaults');

delete process.env.ECHO_GUEST_ACCOUNTS_ENABLED;
const fromDefaults = loadInstancePolicy({
  filePath: '/dev/null/does-not-exist',
  isProduction: false,
});
assert.equal(fromDefaults.guest.enabled, false);

const bad = deepMergeInstancePolicy(DEFAULT_INSTANCE_POLICY, {
  guest: { serverSampleCount: 20, directory: { poolSize: 5 } },
});
let threw = false;
try {
  validateInstancePolicy(bad);
} catch {
  threw = true;
}
assert.equal(threw, true, 'cross-field validation should fail');

const overrides = buildInstancePolicyEnvOverrides(false);
assert.equal(Object.keys(overrides).length, 0, 'empty env → no overrides');

console.info('instancePolicy.merge.test.ts OK');

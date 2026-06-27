import assert from 'node:assert/strict';
import {
  deepMergeInstancePolicy,
  DEFAULT_INSTANCE_POLICY,
} from '../../../shared/instancePolicy';
import { validateInstancePolicy } from '../config/instancePolicy/validateInstancePolicy';

process.env.ECHO_CONFIG_TEST_ISOLATION = '1';

validateInstancePolicy(DEFAULT_INSTANCE_POLICY);

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

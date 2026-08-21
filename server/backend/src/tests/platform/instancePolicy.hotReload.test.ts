import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  initInstancePolicy,
  setInstancePolicyForTests,
  stopInstancePolicyWatcher,
} from '../../config/instancePolicy/hotReload';
import { loadInstancePolicy } from '../../config/instancePolicy/loadInstancePolicy';

process.env.ECHO_CONFIG_TEST_ISOLATION = '1';
delete process.env.ECHO_INSTANCE_POLICY_WATCH;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-policy-'));
const policyPath = path.join(dir, 'echo.instance.json');
process.env.ECHO_INSTANCE_POLICY_PATH = policyPath;

fs.writeFileSync(
  policyPath,
  JSON.stringify({ guest: { enabled: true } }, null, 2),
  'utf8',
);

setInstancePolicyForTests(null);
const first = initInstancePolicy();
assert.equal(first.guest.enabled, true);

fs.writeFileSync(
  policyPath,
  JSON.stringify({ guest: { serverSampleCount: 99 } }, null, 2),
  'utf8',
);

let rejected = false;
try {
  loadInstancePolicy({ filePath: policyPath, isProduction: false });
} catch {
  rejected = true;
}
assert.equal(rejected, true, 'invalid policy must be rejected');

const stillGood = loadInstancePolicy({
  filePath: policyPath.replace('echo.instance.json', 'missing.json'),
  isProduction: false,
});
assert.equal(stillGood.guest.enabled, false);

stopInstancePolicyWatcher();
fs.rmSync(dir, { recursive: true, force: true });

console.info('instancePolicy.hotReload.test.ts OK');

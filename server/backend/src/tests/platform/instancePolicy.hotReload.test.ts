import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  initInstancePolicy,
  setInstancePolicyForTests,
  getInstancePolicy,
  startInstancePolicyWatcher,
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

// Watching the containing directory survives atomic file replacement.
process.env.ECHO_INSTANCE_POLICY_WATCH = '1';
fs.writeFileSync(
  policyPath,
  JSON.stringify({ guest: { enabled: true } }),
  'utf8',
);
setInstancePolicyForTests(loadInstancePolicy({ filePath: policyPath }));
startInstancePolicyWatcher();
const replacementPath = `${policyPath}.tmp`;
fs.writeFileSync(
  replacementPath,
  JSON.stringify({ guest: { enabled: false } }),
  'utf8',
);
fs.renameSync(replacementPath, policyPath);

async function waitForPolicy(enabled: boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (getInstancePolicy().guest.enabled === enabled) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(getInstancePolicy().guest.enabled, enabled);
}

void waitForPolicy(false)
  .then(() => {
    stopInstancePolicyWatcher();
    fs.rmSync(dir, { recursive: true, force: true });
    console.info('instancePolicy.hotReload.test.ts OK');
  })
  .catch((error: unknown) => {
    stopInstancePolicyWatcher();
    fs.rmSync(dir, { recursive: true, force: true });
    console.error(error);
    process.exitCode = 1;
  });

import assert from 'node:assert/strict';
import { parseClientEnvironmentSnapshot } from '../../../../../contracts/clientEnvironment';
import {
  listMemoryClientEnvironmentDaily,
  recordClientEnvironmentReport,
} from '../../services/clientEnvironmentAggregation';

function validSnapshot() {
  return {
    shell: 'web',
    osFamily: 'windows',
    deviceForm: 'desktop',
    browserFamily: 'chrome',
    displayMode: 'browser',
    gpuTier: 'full',
    viewportBucket: 'lg',
    locale: 'en-US',
    touch: false,
    colorScheme: 'dark',
    connectionType: '4g',
  };
}

function runParseTests(): void {
  const parsed = parseClientEnvironmentSnapshot(validSnapshot());
  assert.ok(parsed);
  assert.equal(parsed.shell, 'web');
  assert.equal(parsed.locale, 'en-US');

  assert.equal(parseClientEnvironmentSnapshot(null), null);
  assert.equal(parseClientEnvironmentSnapshot({}), null);
  assert.equal(
    parseClientEnvironmentSnapshot({
      ...validSnapshot(),
      shell: 'invalid',
    }),
    null,
  );
  assert.equal(
    parseClientEnvironmentSnapshot({
      ...validSnapshot(),
      locale: 'not a locale!!!',
    }),
    null,
  );
}

async function runAggregationTests(): Promise<void> {
  const before = listMemoryClientEnvironmentDaily().length;
  const snapshot = parseClientEnvironmentSnapshot(validSnapshot());
  assert.ok(snapshot);
  await recordClientEnvironmentReport(null, snapshot);
  await recordClientEnvironmentReport(null, snapshot);
  const rows = listMemoryClientEnvironmentDaily();
  assert.equal(rows.length, before + 1);
  assert.equal(rows[rows.length - 1]?.reportCount, 2);
}

async function run(): Promise<void> {
  runParseTests();
  await runAggregationTests();
  console.log('clientEnvironment.test: ok');
}

void run();

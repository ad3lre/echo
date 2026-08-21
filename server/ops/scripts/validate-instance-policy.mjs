#!/usr/bin/env node
/**
 * Validate an Echo instance policy JSON file without starting the API.
 * Usage: node server/ops/scripts/validate-instance-policy.mjs [path/to/echo.instance.json]
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const policyPath = process.argv[2] ?? path.join(repoRoot, 'echo.instance.json');

process.env.ECHO_INSTANCE_POLICY_PATH = policyPath;
process.env.ECHO_CONFIG_TEST_ISOLATION = '1';

const runner = spawnSync(
  process.execPath,
  [
    '--import',
    'tsx',
    path.join(
      repoRoot,
      'server/backend/src/scripts/validateInstancePolicyCli.ts',
    ),
  ],
  { stdio: 'inherit', cwd: repoRoot, env: process.env },
);

process.exit(runner.status ?? 1);

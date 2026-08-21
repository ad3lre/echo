import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveComposeProjectName } from './composeProjectName.mjs';

test('resolveComposeProjectName prefers COMPOSE_PROJECT_NAME', () => {
  assert.equal(
    resolveComposeProjectName({ COMPOSE_PROJECT_NAME: 'custom' }),
    'custom',
  );
});

test('resolveComposeProjectName trims COMPOSE_PROJECT_NAME', () => {
  assert.equal(
    resolveComposeProjectName({ COMPOSE_PROJECT_NAME: '  echo-active  ' }),
    'echo-active',
  );
});

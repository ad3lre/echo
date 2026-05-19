import assert from 'node:assert/strict';
import { isCsrfExemptPath } from '../auth/csrf';

function run(): void {
  assert.equal(
    isCsrfExemptPath('/api/v1/hooks/discord-bot/export-ready'),
    true,
  );
  assert.equal(isCsrfExemptPath('/api/v1/hooks/discord-bridge/inbound'), true);
  assert.equal(
    isCsrfExemptPath('/api/v1/hooks/discord-voice-mirror/snapshot'),
    true,
  );
  assert.equal(isCsrfExemptPath('/api/v1/echo/servers'), false);
  console.log('csrf.exemptPaths: ok');
}

run();

import assert from 'assert';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { sanitizeContext } from '../../../shared/diagnostics';

async function run() {
  process.env.DIAG_SAMPLE_SUCCESS_RATE = '1';
  process.env.DIAG_COALESCE_WINDOW_MS = '5000';
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-diag-'));
  const {
    appendBackendDiagnostic,
    appendFrontendDiagnosticBatch,
    closeSessionDiagnostics,
    getSessionDiagnosticsState,
    initSessionDiagnostics,
  } = await import('../observability/sessionDiagnostics');
  await initSessionDiagnostics(tmpRoot);
  const state = getSessionDiagnosticsState();
  assert.ok(state.enabled, 'diagnostics should be initialized');
  assert.ok(
    state.sessionDir.includes('session_'),
    'session dir should be named',
  );

  const sanitized = sanitizeContext({
    method: 'GET',
    token: 'secret-token',
    randomKey: 'drop-me',
  });
  assert.deepStrictEqual(sanitized, { method: 'GET' });

  await appendBackendDiagnostic({
    level: 'info',
    domain: 'api',
    event: 'test_backend_event',
    stage: 'success',
    context: { method: 'GET', path: '/api/v1/health' },
  });
  await appendFrontendDiagnosticBatch([
    {
      ts: new Date().toISOString(),
      level: 'info',
      source: 'frontend',
      domain: 'ui',
      event: 'test_frontend_event',
      stage: 'start',
      context: { action: 'open_modal' },
    },
  ]);
  await appendBackendDiagnostic({
    level: 'error',
    domain: 'api',
    event: 'test_backend_fail',
    stage: 'fail',
    error: { message: 'boom' },
    context: { method: 'GET', path: '/api/v1/echo/presence' },
  });
  for (let i = 0; i < 6; i += 1) {
    await appendBackendDiagnostic({
      level: 'info',
      domain: 'api',
      event: 'http_response',
      stage: 'success',
      status: '200',
      context: {
        method: 'GET',
        path: '/api/v1/echo/presence',
        statusCode: 200,
      },
    });
  }
  await closeSessionDiagnostics('closed');

  const files = await fs.readdir(state.sessionDir);
  assert.ok(files.includes('manifest.json'), 'manifest should exist');
  assert.ok(files.some((f) => f.startsWith('backend_events_')));
  assert.ok(files.some((f) => f.startsWith('frontend_events_')));
  assert.ok(files.some((f) => f.startsWith('spans_')));
  const backendEvents = await fs.readFile(
    path.join(
      state.sessionDir,
      files.find((f) => f.startsWith('backend_events_')) ?? '',
    ),
    'utf8',
  );
  const parsed = backendEvents
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  assert.ok(
    parsed.some(
      (ev) =>
        ev.event === 'test_backend_fail' &&
        ev.stage === 'fail' &&
        ev.level === 'error',
    ),
    'fail/error event must never be sampled out',
  );
  assert.ok(
    parsed.some(
      (ev) =>
        ev.event === 'http_response' &&
        Number(
          (ev.context as Record<string, unknown> | undefined)?.count ?? 0,
        ) > 1,
    ),
    'success responses should be coalesced with count > 1',
  );
}

run()
  .then(() => {
    process.stdout.write('sessionDiagnostics.test.ts passed\n');
  })
  .catch((e) => {
    process.stderr.write(`sessionDiagnostics.test.ts failed: ${String(e)}\n`);
    process.exit(1);
  });

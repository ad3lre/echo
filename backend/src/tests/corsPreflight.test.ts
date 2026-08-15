/**
 * Ensures Echo API CORS preflight allows diagnostic headers sent by the SPA
 * (`frontend/src/api/echo/transport.ts`) and keeps credentialed cross-origin
 * requests valid for the SPA origin. No database required.
 *
 * Run: npx ts-node src/tests/corsPreflight.test.ts (from backend/)
 */
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerHttpPlugins } from '../bootstrap/httpPlugins';

async function run(): Promise<void> {
  const app = Fastify({ logger: false });
  await registerHttpPlugins(app);
  app.get('/api/v1/echo/workspace', async () => ({ ok: true }));
  await app.ready();

  const res = await app.inject({
    method: 'OPTIONS',
    url: '/api/v1/echo/workspace',
    headers: {
      origin: 'http://localhost:8080',
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'x-diag-trace-id,x-diag-span-id',
    },
  });

  assert.equal(res.statusCode, 204, res.payload);
  assert.equal(
    res.headers['access-control-allow-origin'],
    'http://localhost:8080',
  );
  assert.equal(res.headers['access-control-allow-credentials'], 'true');
  assert.equal(
    res.headers.vary,
    'Origin, Access-Control-Request-Headers',
    `Expected Vary to include Origin and Access-Control-Request-Headers; got: ${res.headers.vary}`,
  );
  const allow = (res.headers['access-control-allow-headers'] ?? '') as string;
  assert.match(
    allow.toLowerCase(),
    /x-diag-trace-id/,
    `Access-Control-Allow-Headers should list x-diag-trace-id; got: ${allow}`,
  );
  assert.match(
    allow.toLowerCase(),
    /x-diag-span-id/,
    `Access-Control-Allow-Headers should list x-diag-span-id; got: ${allow}`,
  );

  const uploadPutPreflight = await app.inject({
    method: 'OPTIONS',
    url: '/api/v1/echo/uploads/local/put',
    headers: {
      origin: 'http://localhost:8080',
      'access-control-request-method': 'PUT',
      'access-control-request-headers': 'authorization,content-type',
    },
  });
  assert.equal(uploadPutPreflight.statusCode, 204, uploadPutPreflight.payload);
  assert.equal(
    uploadPutPreflight.headers['access-control-allow-origin'],
    'http://localhost:8080',
  );
  assert.equal(
    uploadPutPreflight.headers['access-control-allow-credentials'],
    'true',
  );
  const uploadAllow = (uploadPutPreflight.headers[
    'access-control-allow-headers'
  ] ?? '') as string;
  assert.match(
    uploadAllow.toLowerCase(),
    /authorization/,
    `PUT upload preflight must allow Authorization; got: ${uploadAllow}`,
  );

  const actual = await app.inject({
    method: 'GET',
    url: '/api/v1/echo/workspace',
    headers: {
      origin: 'http://localhost:8080',
      'x-diag-trace-id': 'trace_test_cors',
      'x-diag-span-id': 'span_test_cors',
    },
  });
  assert.equal(actual.statusCode, 200, actual.payload);
  assert.equal(
    actual.headers['access-control-allow-origin'],
    'http://localhost:8080',
  );
  assert.equal(actual.headers['access-control-allow-credentials'], 'true');
  assert.equal(
    actual.headers.vary,
    'Origin',
    `Expected actual response Vary: Origin; got: ${actual.headers.vary}`,
  );

  await app.close();
  console.log('corsPreflight.test: ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

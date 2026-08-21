import assert from 'node:assert/strict';

async function run(): Promise<void> {
  process.env.ECHO_CONFIG_TEST_ISOLATION = '1';
  process.env.ECHO_BACKEND_STORAGE = 'memory';
  delete process.env.DATABASE_URL;
  delete process.env.USE_MOCK_DB;
  const { trimEchoPathParam } =
    await import('../../api/routes/echo/routeUtils');
  assert.equal(trimEchoPathParam('  abc  '), 'abc');
  assert.equal(trimEchoPathParam('id'), 'id');
  assert.equal(trimEchoPathParam('\t\nx\t'), 'x');
}

run()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('echo.routeUtils tests passed');
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('echo.routeUtils tests failed', err);
    process.exit(1);
  });

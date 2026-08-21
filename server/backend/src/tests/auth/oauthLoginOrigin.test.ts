import assert from 'node:assert/strict';

async function run(): Promise<void> {
  process.env.ECHO_APP_PUBLIC_URL = 'https://chat-echo.com';
  const { isOAuthLoginStartOriginAllowed } =
    await import('../../auth/oauthLoginOrigin');

  assert.equal(
    isOAuthLoginStartOriginAllowed({
      origin: 'https://chat-echo.com',
    }),
    true,
  );
  assert.equal(
    isOAuthLoginStartOriginAllowed({
      origin: 'https://chat-echo.com.evil.test',
    }),
    false,
  );
  assert.equal(
    isOAuthLoginStartOriginAllowed({
      referer: 'https://chat-echo.com/login',
    }),
    true,
  );
  assert.equal(
    isOAuthLoginStartOriginAllowed({
      referer: 'https://chat-echo.com.evil.test/oauth',
    }),
    false,
  );
  assert.equal(isOAuthLoginStartOriginAllowed({}), false);
}

void run()
  .then(() => {
    console.log('oauthLoginOrigin.test.ts: ok');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

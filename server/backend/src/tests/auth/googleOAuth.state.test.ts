import assert from 'node:assert/strict';
import {
  createGoogleOAuthState,
  decodeGoogleOAuthCookieValue,
  encodeGoogleOAuthLinkCookieValue,
  encodeGoogleOAuthLoginCookieValue,
} from '../../domain/googleOAuthState';

async function run(): Promise<void> {
  const userId = 'user_test_1';
  const state = createGoogleOAuthState();
  const pkceVerifier = 'pkce_verifier_test_value';
  const exp = Date.now() + 60_000;
  const cookie = encodeGoogleOAuthLinkCookieValue(
    userId,
    state,
    pkceVerifier,
    exp,
  );

  const decoded = decodeGoogleOAuthCookieValue(cookie);
  assert.ok(decoded);
  assert.equal(decoded.flow, 'link');
  assert.equal(decoded.userId, userId);
  assert.equal(decoded.state, state);

  const loginCookie = encodeGoogleOAuthLoginCookieValue(
    state,
    pkceVerifier,
    exp,
  );
  const loginDecoded = decodeGoogleOAuthCookieValue(loginCookie);
  assert.ok(loginDecoded);
  assert.equal(loginDecoded.flow, 'login');
  assert.equal(loginDecoded.state, state);

  const tampered = cookie.replace(/.$/, 'x');
  assert.equal(decodeGoogleOAuthCookieValue(tampered), null);

  const wrongSig = cookie.slice(0, -4) + 'ffff';
  assert.equal(decodeGoogleOAuthCookieValue(wrongSig), null);

  const expired = encodeGoogleOAuthLinkCookieValue(
    userId,
    state,
    pkceVerifier,
    Date.now() - 1000,
  );
  assert.equal(decodeGoogleOAuthCookieValue(expired), null);
}

void run()
  .then(() => {
    console.log('googleOAuth.state.test.ts: ok');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

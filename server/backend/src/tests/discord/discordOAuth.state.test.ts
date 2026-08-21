import assert from 'node:assert/strict';
import {
  createDiscordOAuthState,
  decodeDiscordLoginSignedState,
  decodeDiscordOAuthCookieValue,
  encodeDiscordLoginSignedState,
  encodeDiscordOAuthLinkCookieValue,
  encodeDiscordOAuthLoginCookieValue,
} from '../../domain/discord/discordOAuthState';

async function run(): Promise<void> {
  const userId = 'user_test_1';
  const state = createDiscordOAuthState();
  const exp = Date.now() + 60_000;
  const cookie = encodeDiscordOAuthLinkCookieValue(userId, state, exp);

  const decoded = decodeDiscordOAuthCookieValue(cookie);
  assert.ok(decoded);
  assert.equal(decoded.flow, 'link');
  assert.equal(decoded.userId, userId);
  assert.equal(decoded.state, state);

  const { stateForDiscord, exp: loginExp } = encodeDiscordLoginSignedState();
  const signed = decodeDiscordLoginSignedState(stateForDiscord);
  assert.ok(signed);
  assert.equal(signed.exp, loginExp);

  const tamperedSignedState = stateForDiscord.replace(/.$/, 'x');
  assert.equal(decodeDiscordLoginSignedState(tamperedSignedState), null);

  const loginCookie = encodeDiscordOAuthLoginCookieValue(
    stateForDiscord,
    loginExp,
  );
  const loginDecoded = decodeDiscordOAuthCookieValue(loginCookie);
  assert.ok(loginDecoded);
  assert.equal(loginDecoded.flow, 'login');
  assert.equal(loginDecoded.state, stateForDiscord);

  const tampered = cookie.replace(/.$/, 'x');
  assert.equal(decodeDiscordOAuthCookieValue(tampered), null);

  const wrongSig = cookie.slice(0, -4) + 'ffff';
  assert.equal(decodeDiscordOAuthCookieValue(wrongSig), null);

  const expired = encodeDiscordOAuthLinkCookieValue(
    userId,
    state,
    Date.now() - 1000,
  );
  assert.equal(decodeDiscordOAuthCookieValue(expired), null);
}

void run()
  .then(() => {
    console.log('discordOAuth.state.test.ts: ok');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

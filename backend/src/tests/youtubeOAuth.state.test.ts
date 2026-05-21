import {
  createYoutubeOAuthState,
  decodeYoutubeOAuthCookieValue,
  encodeYoutubeOAuthLinkCookieValue,
} from '../domain/youtubeOAuthState';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function run(): Promise<void> {
  const state = createYoutubeOAuthState();
  const verifier = 'test_verifier_12345678901234567890123456789012';
  const exp = Date.now() + 60_000;
  const cookie = encodeYoutubeOAuthLinkCookieValue(
    'user-1',
    state,
    verifier,
    exp,
  );
  const decoded = decodeYoutubeOAuthCookieValue(cookie);
  assert(decoded?.userId === 'user-1', 'userId');
  assert(decoded?.state === state, 'state');
  assert(decoded?.pkceVerifier === verifier, 'pkceVerifier');
  const [body, sig] = cookie.split('.');
  assert(
    decodeYoutubeOAuthCookieValue(`${body}.${sig}ff`) === null,
    'tamper rejected',
  );
  console.log('youtubeOAuth.state.test: ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

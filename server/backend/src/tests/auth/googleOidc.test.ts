import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import {
  __resetGoogleJwksCacheForTests,
  googleIdTokenClaimsToUserInfo,
  resolveGoogleUserFromOAuthTokenResponse,
  verifyGoogleIdToken,
} from '../../services/integrations/googleOidc';
import type { FetchLike } from '../../services/integrations/googleApiClient';

const CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';

function makeJwksFetch(jwk: { kid: string; n: string; e: string }): FetchLike {
  return async (input) => {
    const url = String(input);
    if (url.includes('oauth2/v3/certs')) {
      return new Response(
        JSON.stringify({
          keys: [
            {
              kty: 'RSA',
              kid: jwk.kid,
              use: 'sig',
              alg: 'RS256',
              n: jwk.n,
              e: jwk.e,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    throw new Error(`unexpected_fetch:${url}`);
  };
}

async function run(): Promise<void> {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const jwk = publicKey.export({ format: 'jwk' }) as {
    n: string;
    e: string;
  };
  const kid = 'test-kid';
  const fetchImpl = makeJwksFetch({ kid, n: jwk.n, e: jwk.e });

  const signIdToken = (claims: Record<string, unknown>) =>
    jwt.sign(claims, privateKey, {
      algorithm: 'RS256',
      keyid: kid,
      expiresIn: '5m',
    });

  __resetGoogleJwksCacheForTests();

  const idToken = signIdToken({
    sub: 'google-sub-123',
    email: 'user@example.com',
    email_verified: true,
    name: 'Test User',
    aud: CLIENT_ID,
    iss: 'https://accounts.google.com',
  });

  const claims = await verifyGoogleIdToken(idToken, CLIENT_ID, fetchImpl);
  assert.equal(claims.sub, 'google-sub-123');
  const userInfo = googleIdTokenClaimsToUserInfo(claims);
  assert.equal(userInfo.email, 'user@example.com');
  assert.equal(userInfo.email_verified, true);

  const resolved = await resolveGoogleUserFromOAuthTokenResponse(
    {
      access_token: 'unused',
      expires_in: 3600,
      scope: 'openid email profile',
      token_type: 'Bearer',
      id_token: idToken,
    },
    fetchImpl,
    CLIENT_ID,
  );
  assert.equal(resolved.sub, 'google-sub-123');

  const badAud = signIdToken({
    sub: 'google-sub-123',
    aud: 'other-client',
    iss: 'https://accounts.google.com',
  });
  await assert.rejects(
    () => verifyGoogleIdToken(badAud, CLIENT_ID, fetchImpl),
    /audience invalid|google_id_token/,
  );

  let userinfoCalled = false;
  const fetchWithUserinfo: FetchLike = async (input, init) => {
    const url = String(input);
    if (url.includes('userinfo')) {
      userinfoCalled = true;
      return new Response(
        JSON.stringify({ sub: 'from-userinfo', email: 'u@example.com' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return fetchImpl(input, init);
  };

  const withoutOpenId = await resolveGoogleUserFromOAuthTokenResponse(
    {
      access_token: 'access-only',
      expires_in: 3600,
      scope: 'email profile',
      token_type: 'Bearer',
      id_token: '',
    },
    fetchWithUserinfo,
  );
  assert.equal(userinfoCalled, true);
  assert.equal(withoutOpenId.sub, 'from-userinfo');
}

void run()
  .then(() => {
    console.log('googleOidc.test.ts: ok');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

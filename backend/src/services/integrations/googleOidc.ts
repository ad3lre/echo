import { createPublicKey } from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const jwt = require('jsonwebtoken') as any;
import { OAUTH_UPSTREAM_FETCH_MS } from '../../constants/outboundHttp';
import { config } from '../../config';
import type {
  FetchLike,
  GoogleTokenResponse,
  GoogleUserInfo,
} from './googleApiClient';
import { fetchGoogleUserInfo } from './googleApiClient';

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = new Set([
  'https://accounts.google.com',
  'accounts.google.com',
]);
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;
const ID_TOKEN_CLOCK_TOLERANCE_SEC = 60;

type GoogleJwk = {
  kty: string;
  kid?: string;
  alg?: string;
  n?: string;
  e?: string;
  use?: string;
};

type GoogleJwksResponse = { keys?: GoogleJwk[] };

export type GoogleIdTokenClaims = {
  sub: string;
  aud?: string | string[];
  azp?: string;
  iss?: string;
  exp?: number;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string;
};

let jwksCache: { keys: GoogleJwk[]; fetchedAt: number } | null = null;

export function __resetGoogleJwksCacheForTests(): void {
  jwksCache = null;
}

function oauthFetchInit(init?: RequestInit): RequestInit {
  return {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(OAUTH_UPSTREAM_FETCH_MS),
  };
}

function audienceMatches(
  aud: string | string[] | undefined,
  clientId: string,
): boolean {
  if (!aud) return false;
  if (Array.isArray(aud)) return aud.includes(clientId);
  return aud === clientId;
}

async function fetchGoogleJwks(
  fetchImpl: FetchLike,
  forceRefresh = false,
): Promise<GoogleJwk[]> {
  const now = Date.now();
  if (
    !forceRefresh &&
    jwksCache &&
    now - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS
  ) {
    return jwksCache.keys;
  }
  const res = await fetchImpl(GOOGLE_JWKS_URL, oauthFetchInit());
  if (!res.ok) {
    throw new Error(`google_jwks_failed:${res.status}`);
  }
  const data = (await res.json()) as GoogleJwksResponse;
  const keys = Array.isArray(data.keys) ? data.keys : [];
  if (!keys.length) throw new Error('google_jwks_empty');
  jwksCache = { keys, fetchedAt: now };
  return keys;
}

function decodeJwtHeaderKid(idToken: string): string | null {
  const part = idToken.split('.')[0];
  if (!part) return null;
  try {
    const header = JSON.parse(
      Buffer.from(part, 'base64url').toString('utf8'),
    ) as { kid?: string; alg?: string };
    return typeof header.kid === 'string' && header.kid ? header.kid : null;
  } catch {
    return null;
  }
}

function verifyWithJwk(
  idToken: string,
  jwk: GoogleJwk,
  clientId: string,
): GoogleIdTokenClaims {
  const keyObject = createPublicKey({ key: jwk, format: 'jwk' });
  const decoded = jwt.verify(idToken, keyObject, {
    algorithms: ['RS256'],
    audience: clientId,
    issuer: [...GOOGLE_ISSUERS],
    clockTolerance: ID_TOKEN_CLOCK_TOLERANCE_SEC,
  }) as GoogleIdTokenClaims & Record<string, unknown>;
  if (typeof decoded.sub !== 'string' || !decoded.sub.trim()) {
    throw new Error('google_id_token_missing_sub');
  }
  if (
    !audienceMatches(decoded.aud, clientId) &&
    !(typeof decoded.azp === 'string' && decoded.azp === clientId)
  ) {
    throw new Error('google_id_token_aud_mismatch');
  }
  return decoded;
}

/**
 * Verifies a Google OIDC `id_token` (signature, iss, aud, exp) using Google's JWKS.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string = config.googleOauthClientId,
  fetchImpl: FetchLike = fetch,
): Promise<GoogleIdTokenClaims> {
  const token = idToken.trim();
  if (!token) throw new Error('google_id_token_missing');
  if (!clientId.trim()) throw new Error('google_oauth_client_id_missing');

  const kid = decodeJwtHeaderKid(token);
  let keys = await fetchGoogleJwks(fetchImpl);
  let matching = kid ? keys.filter((k) => k.kid === kid) : keys;
  if (!matching.length && kid) {
    keys = await fetchGoogleJwks(fetchImpl, true);
    matching = keys.filter((k) => k.kid === kid);
  }
  if (!matching.length) matching = keys;

  let lastErr: unknown;
  for (const jwk of matching) {
    try {
      return verifyWithJwk(token, jwk, clientId.trim());
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error('google_id_token_invalid');
}

export function googleIdTokenClaimsToUserInfo(
  claims: GoogleIdTokenClaims,
): GoogleUserInfo {
  return {
    sub: claims.sub,
    name: claims.name,
    given_name: claims.given_name,
    family_name: claims.family_name,
    picture: claims.picture,
    email: claims.email,
    email_verified: claims.email_verified,
    locale: claims.locale,
  };
}

function scopesIncludeOpenId(scope: string | undefined): boolean {
  if (!scope?.trim()) return true;
  return scope.split(/\s+/).some((s) => s === 'openid');
}

/**
 * Resolves the Google subject and profile for OAuth callback handling.
 * When `openid` is in scope and Google returns an `id_token`, claims are taken from
 * a cryptographically verified ID token; otherwise falls back to the OIDC userinfo endpoint.
 */
export async function resolveGoogleUserFromOAuthTokenResponse(
  tokenResponse: GoogleTokenResponse,
  fetchImpl: FetchLike = fetch,
  clientId: string = config.googleOauthClientId,
): Promise<GoogleUserInfo> {
  const idToken =
    typeof tokenResponse.id_token === 'string'
      ? tokenResponse.id_token.trim()
      : '';
  if (idToken && scopesIncludeOpenId(tokenResponse.scope)) {
    const claims = await verifyGoogleIdToken(idToken, clientId, fetchImpl);
    return googleIdTokenClaimsToUserInfo(claims);
  }
  if (!tokenResponse.access_token?.trim()) {
    throw new Error('google_token_missing');
  }
  return fetchGoogleUserInfo(tokenResponse.access_token, fetchImpl);
}

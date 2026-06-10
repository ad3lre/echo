import { createPublicKey } from 'crypto';
import jwt from 'jsonwebtoken';
import { OAUTH_UPSTREAM_FETCH_MS } from '../../constants/outboundHttp';
import type { FetchLike } from './googleApiClient';

/**
 * Sign in with Apple identity-token verification.
 *
 * The native iOS app obtains an identity token from `ASAuthorizationController`
 * (Sign in with Apple) and POSTs it to `/auth/apple`. This module verifies that
 * JWT against Apple's public JWKS (signature, issuer, audience, expiry) and
 * returns the stable Apple subject + email claims.
 *
 * Audience: for the native app the `aud` claim is the app bundle id
 * (`com.echo.ios`); a web Services ID can be added via APPLE_CLIENT_IDS.
 */
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;
const ID_TOKEN_CLOCK_TOLERANCE_SEC = 60;

type AppleJwk = {
  kty: string;
  kid?: string;
  alg?: string;
  n?: string;
  e?: string;
  use?: string;
};

type AppleJwksResponse = { keys?: AppleJwk[] };

export type AppleIdTokenClaims = {
  sub: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
  email?: string;
  /** Apple sends these as the strings "true"/"false". */
  email_verified?: boolean | 'true' | 'false';
  is_private_email?: boolean | 'true' | 'false';
  nonce?: string;
  nonce_supported?: boolean;
};

let jwksCache: { keys: AppleJwk[]; fetchedAt: number } | null = null;

export function __resetAppleJwksCacheForTests(): void {
  jwksCache = null;
}

function oauthFetchInit(init?: RequestInit): RequestInit {
  return {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(OAUTH_UPSTREAM_FETCH_MS),
  };
}

/**
 * Allowed `aud` values. Defaults to the iOS bundle id; override/extend with
 * APPLE_CLIENT_IDS (comma-separated) to also accept a web Services ID.
 */
export function appleClientIds(): string[] {
  const fromEnv = (process.env.APPLE_CLIENT_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : ['com.echo.ios'];
}

function audienceMatches(
  aud: string | string[] | undefined,
  clientIds: string[],
): boolean {
  if (!aud) return false;
  if (Array.isArray(aud)) return aud.some((a) => clientIds.includes(a));
  return clientIds.includes(aud);
}

async function fetchAppleJwks(
  fetchImpl: FetchLike,
  forceRefresh = false,
): Promise<AppleJwk[]> {
  const now = Date.now();
  if (
    !forceRefresh &&
    jwksCache &&
    now - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS
  ) {
    return jwksCache.keys;
  }
  const res = await fetchImpl(APPLE_JWKS_URL, oauthFetchInit());
  if (!res.ok) {
    throw new Error(`apple_jwks_failed:${res.status}`);
  }
  const data = (await res.json()) as AppleJwksResponse;
  const keys = Array.isArray(data.keys) ? data.keys : [];
  if (!keys.length) throw new Error('apple_jwks_empty');
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
  jwk: AppleJwk,
  clientIds: string[],
): AppleIdTokenClaims {
  const keyObject = createPublicKey({ key: jwk, format: 'jwk' });
  const decoded = jwt.verify(idToken, keyObject, {
    algorithms: ['RS256'],
    audience: clientIds as [string, ...string[]],
    issuer: APPLE_ISSUER,
    clockTolerance: ID_TOKEN_CLOCK_TOLERANCE_SEC,
  }) as AppleIdTokenClaims & Record<string, unknown>;
  if (typeof decoded.sub !== 'string' || !decoded.sub.trim()) {
    throw new Error('apple_id_token_missing_sub');
  }
  if (!audienceMatches(decoded.aud, clientIds)) {
    throw new Error('apple_id_token_aud_mismatch');
  }
  return decoded;
}

/** True for the boolean or the string "true" that Apple uses for claims. */
export function appleClaimIsTrue(
  value: boolean | 'true' | 'false' | undefined,
): boolean {
  return value === true || value === 'true';
}

/**
 * Verifies a Sign in with Apple identity token (signature, iss, aud, exp) using
 * Apple's JWKS. Optionally enforces the `nonce` the client bound to the request.
 */
export async function verifyAppleIdentityToken(
  identityToken: string,
  options: {
    clientIds?: string[];
    expectedNonce?: string;
    fetchImpl?: FetchLike;
  } = {},
): Promise<AppleIdTokenClaims> {
  const token = identityToken.trim();
  if (!token) throw new Error('apple_id_token_missing');
  const clientIds = options.clientIds?.length
    ? options.clientIds
    : appleClientIds();
  const fetchImpl = options.fetchImpl ?? fetch;

  const kid = decodeJwtHeaderKid(token);
  let keys = await fetchAppleJwks(fetchImpl);
  let matching = kid ? keys.filter((k) => k.kid === kid) : keys;
  if (!matching.length && kid) {
    keys = await fetchAppleJwks(fetchImpl, true);
    matching = keys.filter((k) => k.kid === kid);
  }
  if (!matching.length) matching = keys;

  let lastErr: unknown;
  let claims: AppleIdTokenClaims | null = null;
  for (const jwk of matching) {
    try {
      claims = verifyWithJwk(token, jwk, clientIds);
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!claims) {
    throw lastErr instanceof Error
      ? lastErr
      : new Error('apple_id_token_invalid');
  }
  if (options.expectedNonce && (claims.nonce ?? '') !== options.expectedNonce) {
    throw new Error('apple_id_token_nonce_mismatch');
  }
  return claims;
}

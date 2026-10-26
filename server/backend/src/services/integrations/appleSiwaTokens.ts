/**
 * Sign in with Apple token exchange + revoke (TN3194 / App Review 5.1.1(v)).
 *
 * Requires a Services/App ID client id plus a .p8 key with Sign in with Apple
 * enabled (`APPLE_SIWA_*`, falling back to APNs team id when shared).
 */
import { createPrivateKey } from 'crypto';
import jwt from 'jsonwebtoken';
import { OAUTH_UPSTREAM_FETCH_MS } from '../../constants/outboundHttp';
import { config } from '../../config';
import { getPgPool } from '../../db/pg';
import { getAppleLinkByUserId } from '../../domain/appleUserLinkRepo';
import { appleClientIds } from './appleOidc';
import type { FetchLike } from './googleApiClient';

const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const APPLE_AUD = 'https://appleid.apple.com';

export type AppleSiwaTokenBundle = {
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
};

function oauthFetchInit(init?: RequestInit): RequestInit {
  return {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(OAUTH_UPSTREAM_FETCH_MS),
  };
}

export function isAppleSiwaTokenApiConfigured(): boolean {
  return Boolean(
    config.appleSiwaKeyId &&
    config.appleSiwaTeamId &&
    config.appleSiwaKeyP8 &&
    (config.appleSiwaClientId || appleClientIds()[0]),
  );
}

export function appleSiwaClientId(): string {
  return (
    config.appleSiwaClientId?.trim() || appleClientIds()[0] || 'com.echo.ios'
  );
}

export type AppleSiwaClientSecretInput = {
  keyId: string;
  teamId: string;
  keyP8: string;
  clientId: string;
  nowSec?: number;
};

/** ES256 client_secret JWT for Apple's token / revoke endpoints. */
export function signAppleSiwaClientSecret(
  input: AppleSiwaClientSecretInput,
): string {
  const nowSec = input.nowSec ?? Math.floor(Date.now() / 1000);
  const key = createPrivateKey(input.keyP8);
  return jwt.sign(
    {
      iss: input.teamId,
      iat: nowSec,
      exp: nowSec + 60 * 60 * 24 * 150, // < 6 months
      aud: APPLE_AUD,
      sub: input.clientId,
    },
    key,
    {
      algorithm: 'ES256',
      keyid: input.keyId,
      header: { alg: 'ES256', kid: input.keyId },
    },
  );
}

export function createAppleSiwaClientSecret(
  nowSec = Math.floor(Date.now() / 1000),
): string {
  const keyId = config.appleSiwaKeyId?.trim();
  const teamId = config.appleSiwaTeamId?.trim();
  const keyP8 = config.appleSiwaKeyP8;
  if (!keyId || !teamId || !keyP8) {
    throw new Error('apple_siwa_not_configured');
  }
  return signAppleSiwaClientSecret({
    keyId,
    teamId,
    keyP8,
    clientId: appleSiwaClientId(),
    nowSec,
  });
}

export async function exchangeAppleAuthorizationCode(
  authorizationCode: string,
  options: { fetchImpl?: FetchLike } = {},
): Promise<AppleSiwaTokenBundle> {
  const code = authorizationCode.trim();
  if (!code) throw new Error('apple_authorization_code_missing');
  if (!isAppleSiwaTokenApiConfigured()) {
    throw new Error('apple_siwa_not_configured');
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    client_id: appleSiwaClientId(),
    client_secret: createAppleSiwaClientSecret(),
    code,
    grant_type: 'authorization_code',
  });
  const res = await fetchImpl(
    APPLE_TOKEN_URL,
    oauthFetchInit({
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    }),
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `apple_token_exchange_failed:${res.status}:${text.slice(0, 200)}`,
    );
  }
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('apple_token_exchange_invalid_json');
  }
  return {
    accessToken:
      typeof json.access_token === 'string' ? json.access_token : undefined,
    refreshToken:
      typeof json.refresh_token === 'string' ? json.refresh_token : undefined,
    idToken: typeof json.id_token === 'string' ? json.id_token : undefined,
  };
}

export async function revokeAppleSiwaToken(
  token: string,
  tokenTypeHint: 'refresh_token' | 'access_token' = 'refresh_token',
  options: { fetchImpl?: FetchLike } = {},
): Promise<void> {
  const value = token.trim();
  if (!value) return;
  if (!isAppleSiwaTokenApiConfigured()) {
    throw new Error('apple_siwa_not_configured');
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    client_id: appleSiwaClientId(),
    client_secret: createAppleSiwaClientSecret(),
    token: value,
    token_type_hint: tokenTypeHint,
  });
  const res = await fetchImpl(
    APPLE_REVOKE_URL,
    oauthFetchInit({
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    }),
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `apple_token_revoke_failed:${res.status}:${text.slice(0, 200)}`,
    );
  }
}

type WarnLogger = {
  warn: (obj: Record<string, unknown>, msg: string) => void;
};

/**
 * App Review 5.1.1(v) / TN3194 — best-effort revoke before local account delete
 * when SIWA keys + a stored refresh token are available.
 */
/**
 * Best-effort authorization-code → refresh-token exchange for login/link.
 * Returns null when SIWA is unconfigured, the code is empty, or exchange fails
 * (caller should still complete Apple sign-in).
 */
export async function exchangeAppleRefreshTokenBestEffort(
  authorizationCode: string | undefined,
  log: WarnLogger,
  context: { userId?: string } = {},
): Promise<string | null> {
  const code =
    typeof authorizationCode === 'string' ? authorizationCode.trim() : '';
  if (!code || !isAppleSiwaTokenApiConfigured()) return null;
  try {
    const tokens = await exchangeAppleAuthorizationCode(code);
    return tokens.refreshToken?.trim() || null;
  } catch (err) {
    log.warn(
      { err, userId: context.userId },
      'apple_oauth_token_exchange_failed',
    );
    return null;
  }
}

export async function revokeAppleSiwaBestEffortOnAccountDelete(
  userId: string,
  log: WarnLogger,
): Promise<void> {
  try {
    if (!isAppleSiwaTokenApiConfigured()) return;
    const pool = getPgPool();
    if (!pool) return;
    const appleLink = await getAppleLinkByUserId(pool, userId);
    if (!appleLink?.appleRefreshToken) return;
    await revokeAppleSiwaToken(appleLink.appleRefreshToken, 'refresh_token');
  } catch (err) {
    log.warn({ err, userId }, 'apple_siwa_revoke_on_delete_failed');
  }
}

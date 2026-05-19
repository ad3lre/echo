import type { Pool } from 'pg';
import {
  decryptDiscordToken,
  encryptDiscordToken,
} from '../auth/discordTokenCrypto';
import { refreshDiscordOAuthToken } from '../services/integrations/discordApiClient';
import {
  getDiscordLinkByUserId,
  updateDiscordUserLinkTokens,
} from './discordUserLinkRepo';

function accessTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  const t = new Date(expiresAt).getTime();
  return !Number.isFinite(t) || t < Date.now() + 60_000;
}

/**
 * Returns a usable Discord OAuth access token for the linked account, refreshing when needed.
 */
export async function getDiscordUserAccessTokenForApi(
  pool: Pool,
  userId: string,
): Promise<string> {
  const row = await getDiscordLinkByUserId(pool, userId);
  if (!row) throw new Error('NOT_LINKED');

  if (!accessTokenExpired(row.tokenExpiresAt)) {
    return decryptDiscordToken(row.accessTokenCipher);
  }

  if (!row.refreshTokenCipher) {
    throw new Error('TOKEN_EXPIRED');
  }

  const refreshPlain = decryptDiscordToken(row.refreshTokenCipher);
  const next = await refreshDiscordOAuthToken(refreshPlain);
  const accessCipher = encryptDiscordToken(next.access_token);
  const refreshCipher = next.refresh_token
    ? encryptDiscordToken(next.refresh_token)
    : row.refreshTokenCipher;
  const exp =
    typeof next.expires_in === 'number' && Number.isFinite(next.expires_in)
      ? new Date(Date.now() + next.expires_in * 1000).toISOString()
      : null;

  await updateDiscordUserLinkTokens(pool, userId, {
    accessTokenCipher: accessCipher,
    refreshTokenCipher: refreshCipher,
    tokenExpiresAt: exp,
    scope: next.scope,
  });

  return next.access_token;
}

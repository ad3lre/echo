import { verifyAccessToken, type AccessTokenPayload } from './token';

/** Legacy mode must never erase a token's session or game-room restrictions. */
export function verifyLegacyAccessToken(token: string): AccessTokenPayload {
  const payload = verifyAccessToken(token);
  if (
    'typ' in payload ||
    'sid' in payload ||
    'roomId' in payload ||
    'gameKey' in payload
  ) {
    throw new Error('Scoped token is not a legacy access token');
  }
  return payload;
}

import jwt from 'jsonwebtoken';
import type { GameTokenPayload } from '../../cores/games';
import { isEchoVcActivityKey } from '../../cores/vcActivityCatalog';

/**
 * Verify a backend-minted game token (HS256). The token is the game server's
 * only trust anchor for client identity + room scope — there is no auth-DB call
 * here, which is what keeps this process decoupled from the backend.
 */
export function verifyGameToken(
  token: string,
  secret: string,
): GameTokenPayload {
  const decoded = jwt.verify(token, secret, {
    algorithms: ['HS256'],
  }) as Partial<GameTokenPayload> | string;

  if (!decoded || typeof decoded === 'string') {
    throw new Error('game token: unexpected payload');
  }
  if (typeof decoded.sub !== 'string' || !decoded.sub) {
    throw new Error('game token: missing sub');
  }
  if (typeof decoded.roomId !== 'string' || !decoded.roomId) {
    throw new Error('game token: missing roomId');
  }
  if (
    typeof decoded.gameKey !== 'string' ||
    !isEchoVcActivityKey(decoded.gameKey)
  ) {
    throw new Error('game token: bad gameKey');
  }

  return {
    sub: decoded.sub,
    username: typeof decoded.username === 'string' ? decoded.username : '',
    roomId: decoded.roomId,
    gameKey: decoded.gameKey,
    iat: decoded.iat,
    exp: decoded.exp,
  };
}

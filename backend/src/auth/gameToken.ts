import jwt, { type SignOptions } from 'jsonwebtoken';
import type { GameTokenPayload } from '../../../shared/games/protocol';
import { isEchoVcActivityKey } from '../../../shared/vcActivityCatalog';
import { config } from '../config';

export function signGameToken(
  payload: Omit<GameTokenPayload, 'iat' | 'exp'>,
): string {
  if (!isEchoVcActivityKey(payload.gameKey)) {
    throw new Error('signGameToken: invalid gameKey');
  }
  return jwt.sign(payload, config.gameServerJwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.gameServerJoinTokenTtlSec as SignOptions['expiresIn'],
  });
}

import jwt, { type SignOptions } from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';
import { config } from '../config';

export type AccessTokenPayload = {
  sub: string; // user id
  username: string;
  /** Server session id — present on session-bound native bearer tokens only. */
  sid?: string;
  /** Distinguishes session-bound native tokens from legacy stateless bearer JWTs. */
  typ?: string;
};

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, config.jwtSecret, {
    algorithms: ['HS256'],
  }) as AccessTokenPayload;
  if (!decoded?.sub || typeof decoded.username !== 'string') {
    throw new Error('Invalid token payload');
  }
  return decoded;
}

export function getAccessUserIdFromAuthHeader(
  authorization: string | undefined,
): string | null {
  if (!authorization || !authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length);
  try {
    const payload = verifyAccessToken(token);
    return payload.sub;
  } catch {
    return null;
  }
}

export function createRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type MfaPendingTokenPayload = {
  sub: string;
  typ: 'mfa_pending';
};

export function signMfaPendingToken(userId: string): string {
  return jwt.sign(
    { sub: userId, typ: 'mfa_pending' } satisfies MfaPendingTokenPayload,
    config.jwtSecret,
    {
      expiresIn: config.echoMfaPendingJwtExpiresIn as SignOptions['expiresIn'],
    },
  );
}

export function verifyMfaPendingToken(token: string): MfaPendingTokenPayload {
  const decoded = jwt.verify(token, config.jwtSecret, {
    algorithms: ['HS256'],
  }) as MfaPendingTokenPayload & Record<string, unknown>;
  if (
    decoded?.typ !== 'mfa_pending' ||
    typeof decoded.sub !== 'string' ||
    !decoded.sub
  ) {
    throw new Error('Invalid MFA token');
  }
  return { sub: decoded.sub, typ: 'mfa_pending' };
}

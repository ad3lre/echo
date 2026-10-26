import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { describe, test } from 'node:test';
import jwt from 'jsonwebtoken';
import { signAppleSiwaClientSecret } from './appleSiwaTokens.ts';

describe('appleSiwaTokens', () => {
  test('signAppleSiwaClientSecret produces a verifiable ES256 Apple client secret', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', {
      namedCurve: 'P-256',
    });
    const now = Math.floor(Date.now() / 1000);
    const secret = signAppleSiwaClientSecret({
      keyId: 'TESTKEY123',
      teamId: 'TEAM123456',
      keyP8: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
      clientId: 'com.echo.ios',
      nowSec: now,
    });
    const decoded = jwt.verify(secret, publicKey, {
      algorithms: ['ES256'],
      audience: 'https://appleid.apple.com',
      issuer: 'TEAM123456',
    }) as jwt.JwtPayload;
    assert.equal(decoded.sub, 'com.echo.ios');
    const header = JSON.parse(
      Buffer.from(secret.split('.')[0]!, 'base64url').toString('utf8'),
    ) as { kid?: string; alg?: string };
    assert.equal(header.kid, 'TESTKEY123');
    assert.equal(header.alg, 'ES256');
  });
});

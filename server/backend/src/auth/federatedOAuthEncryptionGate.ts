import type { FastifyBaseLogger, FastifyReply } from 'fastify';
import { sendError } from '../api/errors';
import { assertFederatedOAuthTokenEncryptionParsable } from './discordTokenCrypto';

/**
 * Returns true if the encryption key is usable; otherwise sends 503 and returns false.
 */
export function ensureFederatedOAuthTokenEncryptionReady(
  reply: FastifyReply,
  log: FastifyBaseLogger,
): boolean {
  try {
    assertFederatedOAuthTokenEncryptionParsable();
    return true;
  } catch (err: unknown) {
    log.error({ err }, 'federated_oauth_token_encryption_key_invalid');
    sendError(
      reply,
      503,
      'NOT_CONFIGURED',
      'ECHO_DISCORD_TOKEN_ENCRYPTION_KEY is invalid or unusable. Use 64 hexadecimal characters or base64 encoding exactly 32 bytes.',
    );
    return false;
  }
}

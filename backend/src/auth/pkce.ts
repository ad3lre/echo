import { createHash, randomBytes } from 'node:crypto';

export function createPkceVerifier(): string {
  return randomBytes(32).toString('base64url');
}

export function createPkceChallengeS256(verifier: string): string {
  const v = verifier.trim();
  if (!v) throw new Error('PKCE_VERIFIER_REQUIRED');
  return createHash('sha256').update(v, 'utf8').digest().toString('base64url');
}

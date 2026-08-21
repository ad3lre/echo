import { base64ToBytes } from '@/services/e2ee/e2eeBase64';
import { ensureEchoSignalBootstrap } from '@/services/e2ee/e2eeSignalStore';

/** 60 hex chars (SHA-256 truncated) grouped for human comparison (Signal-style safety number simplification). */
export async function fingerprintFromIdentityKeyB64(
  identityKeyB64: string,
): Promise<string> {
  const bytes = base64ToBytes(identityKeyB64.trim());
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy);
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const chunk = hex.slice(0, 60);
  const parts: string[] = [];
  for (let i = 0; i < chunk.length; i += 5) {
    parts.push(chunk.slice(i, i + 5));
  }
  return parts.join(' ');
}

export async function getLocalE2eeSafetyNumber(
  authUserId: string,
): Promise<string> {
  const { registration } = await ensureEchoSignalBootstrap(authUserId);
  return fingerprintFromIdentityKeyB64(registration.identityKey);
}

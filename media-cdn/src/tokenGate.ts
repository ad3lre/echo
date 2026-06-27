import { verifyMediaCdnReadToken } from '../../shared/mediaCdnSigning';
import { mediaCdnConfig } from './config';

export function verifyObjectReadToken(
  token: string | undefined,
  storageKey: string,
): boolean {
  const secret = mediaCdnConfig.signingSecret.trim();
  if (!secret || !token?.trim()) return false;
  return verifyMediaCdnReadToken(secret, token.trim(), storageKey);
}

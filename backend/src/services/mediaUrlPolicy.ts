import { config } from '../config';
import { extractEchoStorageKeyFromPublicUrl } from './echoUploadPublicUrl';
import { ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX } from './localUploadDisk';

/** Aligned with `MAX_HTTPS_MEDIA_URL_LENGTH` in `messageValidation.ts`. */
const MAX_LOCAL_PATH_MEDIA_LEN = 8192;

/**
 * Extra constraints for HTTP(S) media URLs (messages, branding) when env flags are set.
 * Does not apply to `data:` URLs — callers handle those separately.
 */
export function mediaUrlPassesEchoPolicy(url: string): boolean {
  const t = url.trim();
  if (
    config.echoLocalUploadDir &&
    t.startsWith(ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX) &&
    !t.includes('..')
  ) {
    return t.length <= MAX_LOCAL_PATH_MEDIA_LEN;
  }
  if (extractEchoStorageKeyFromPublicUrl(t)) {
    return true;
  }
  if (config.echoMediaUrlRequireHttps && !t.startsWith('https://')) {
    return false;
  }
  const hosts = config.echoMediaUrlAllowedHosts;
  if (hosts.length === 0) {
    if (/^https?:\/\//i.test(t)) return false;
    return true;
  }
  try {
    const u = new URL(t);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    return hosts.some((allowed) => h === allowed || h.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

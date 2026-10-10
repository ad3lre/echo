import { ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX } from '@shared/echoUploadStorageKey';

/** Local files already have a cookie-authenticated route; they are not S3 objects. */
export function localUploadReadUrl(url: string): string | null {
  try {
    const parsed = new URL(url, 'https://echo.invalid');
    if (
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
      !parsed.pathname.startsWith(ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX)
    ) {
      return null;
    }
    // This is a same-origin API route. Never preserve an arbitrary source URL's
    // origin after recognizing its path as a local upload route.
    return parsed.pathname;
  } catch {
    return null;
  }
}

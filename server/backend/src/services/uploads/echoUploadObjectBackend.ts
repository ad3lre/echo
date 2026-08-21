import { config } from '../../config';
import { isEchoS3UploadConfigured } from './s3UploadPresign';
import { isVcWatchTogetherStorageKey } from '../watchTogether/vcWatchTogetherSessions';

/**
 * Watch Together uploads (and their HLS pack under the same prefix) are stored on
 * local disk even when S3/R2 is configured for the rest of Echo.
 */
export function echoUploadUsesLocalObjectStore(
  storageKeyOrPrefix: string,
): boolean {
  return (
    !!config.echoLocalUploadDir &&
    isVcWatchTogetherStorageKey(storageKeyOrPrefix.trim())
  );
}

export function echoUploadPrefersS3ObjectStore(
  storageKeyOrPrefix: string,
): boolean {
  return (
    isEchoS3UploadConfigured() &&
    !echoUploadUsesLocalObjectStore(storageKeyOrPrefix)
  );
}

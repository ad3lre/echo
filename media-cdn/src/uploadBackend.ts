import { isMediaCdnS3Configured, mediaCdnConfig } from './config';

/** Mirrors backend echoUploadObjectBackend selection for media reads. */
export function echoUploadPrefersS3ObjectStore(storageKey: string): boolean {
  const key = storageKey.trim();
  if (key.startsWith('echo/vc-watch/') && mediaCdnConfig.localUploadDir) {
    return false;
  }
  return isMediaCdnS3Configured();
}

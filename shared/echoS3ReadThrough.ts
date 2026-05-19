/**
 * Authenticated same-origin GET for S3 object bytes when `ECHO_S3_PUBLIC_READ_THROUGH_API` is enabled.
 * Append slash-encoded storage key segments (see `buildEchoUploadPublicUrlForStorageKey` in backend).
 */
export const ECHO_S3_PUBLIC_READ_THROUGH_PREFIX = '/api/v1/echo/uploads/s3/';

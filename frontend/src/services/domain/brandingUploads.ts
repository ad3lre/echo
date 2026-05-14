export const ECHO_BRANDING_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

export function isEchoUploadLikelyDisabled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('503') ||
    message.includes('UPLOADS_NOT_CONFIGURED') ||
    message.includes('Set ECHO_S3') ||
    message.toLowerCase().includes('not configured')
  );
}

/** User-facing detail from failed upload / PATCH (EchoApiError.message, etc.). */
export function extractUploadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return '';
}

export function isValidBrandingImageFile(
  file: Pick<File, 'type' | 'size'> | null | undefined,
): file is File {
  return (
    !!file &&
    file.type.startsWith('image/') &&
    file.size <= ECHO_BRANDING_UPLOAD_MAX_BYTES
  );
}

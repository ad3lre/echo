import { isEchoUploadLikelyDisabled } from '@/features/server-settings/domain/brandingUploads';

export function readBlobAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export async function uploadBrandingAssetWithInlineFallback(opts: {
  file: File;
  upload: () => Promise<string>;
}): Promise<string> {
  try {
    return await opts.upload();
  } catch (error) {
    if (!isEchoUploadLikelyDisabled(error)) throw error;
  }
  return readBlobAsDataUrl(opts.file);
}

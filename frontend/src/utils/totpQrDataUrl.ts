import { toDataURL } from 'qrcode';

/** PNG data URL for scanning `otpauth://` URI in authenticator apps. */
export function totpQrDataUrl(otpauthUrl: string): Promise<string> {
  return toDataURL(otpauthUrl, { margin: 2, width: 220 });
}

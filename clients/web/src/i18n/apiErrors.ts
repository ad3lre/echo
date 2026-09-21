import type { ApiErrorBody } from '@shared/types/api';
import { echoT } from '@/i18n';

const API_ERROR_PREFIX = 'errors.api.';

export function translateApiErrorToken(
  token: string | undefined,
): string | null {
  const normalized = token?.trim();
  if (!normalized || !/^[A-Z0-9_]+$/.test(normalized)) return null;
  const candidate = normalized === 'UNKNOWN' ? 'unknown' : normalized;
  const key = `${API_ERROR_PREFIX}${candidate}`;
  const translated = echoT(key);
  return translated !== key ? translated : null;
}

/**
 * Resolve a user-facing message for an API error body using stable `code` / `detail`
 * tokens, falling back to the server `message` and then a generic string.
 */
export function translateApiErrorBody(body: ApiErrorBody): string {
  const fromDetail = translateApiErrorToken(body.detail);
  if (fromDetail) return fromDetail;
  const fromCode = translateApiErrorToken(body.code);
  if (fromCode) return fromCode;
  const serverMessage = body.message?.trim();
  if (serverMessage) return serverMessage;
  return echoT('errors.api.unknown');
}

export function formatApiErrorForDisplay(body: ApiErrorBody): string {
  const base = translateApiErrorBody(body);
  const detail = body.detail?.trim();
  if (!detail) return base;
  const detailMsg = translateApiErrorToken(detail);
  return detailMsg && detailMsg !== base ? detailMsg : base;
}

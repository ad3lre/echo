import type { ApiErrorBody } from '@shared/types/api';
import { echoT } from '@/i18n';

const API_ERROR_PREFIX = 'errors.api.';

function tryApiErrorKey(token: string | undefined): string | null {
  if (!token?.trim()) return null;
  const key = `${API_ERROR_PREFIX}${token.trim()}`;
  const translated = echoT(key);
  if (translated !== key) return translated;
  return null;
}

/**
 * Resolve a user-facing message for an API error body using stable `code` / `detail`
 * tokens, falling back to the server `message` and then a generic string.
 */
export function translateApiErrorBody(body: ApiErrorBody): string {
  const fromDetail = tryApiErrorKey(body.detail);
  if (fromDetail) return fromDetail;
  const fromCode = tryApiErrorKey(body.code);
  if (fromCode) return fromCode;
  const serverMessage = body.message?.trim();
  if (serverMessage) return serverMessage;
  return echoT('errors.api.unknown');
}

export function formatApiErrorForDisplay(body: ApiErrorBody): string {
  const base = translateApiErrorBody(body);
  const detail = body.detail?.trim();
  if (!detail) return base;
  const detailKey = `${API_ERROR_PREFIX}${detail}`;
  const detailMsg = echoT(detailKey);
  if (detailMsg !== detailKey && detailMsg !== base) {
    return detailMsg;
  }
  return base;
}

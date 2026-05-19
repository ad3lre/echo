/**
 * API client for backend endpoints.
 */

import { API_BASE } from '@/config';
import type { ApiErrorBody } from '@shared/types';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiGetOptions {
  signal?: AbortSignal;
}

async function parseErrorBody(res: Response): Promise<ApiErrorBody | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'code' in parsed &&
      'message' in parsed
    ) {
      return {
        code: String((parsed as ApiErrorBody).code),
        message: String((parsed as ApiErrorBody).message),
      };
    }
    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      return {
        code: 'ERROR',
        message: String((parsed as { error: string }).error),
      };
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

export async function apiGet<T>(
  path: string,
  options?: ApiGetOptions,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { signal: options?.signal });
  if (!res.ok) {
    const body = await parseErrorBody(res);
    const message = body?.message ?? `${res.status} ${res.statusText}`;
    const code = body?.code ?? 'UNKNOWN';
    throw new ApiError(message, res.status, code);
  }
  return res.json();
}

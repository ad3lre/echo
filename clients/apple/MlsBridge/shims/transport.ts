/** Minimal echoFetch / EchoApiError compatible with mlsGroupClient. */

export type ApiErrorBody = {
  code?: string;
  message?: string;
  detail?: string;
};

export class EchoApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message?.trim() || body.detail?.trim() || `HTTP ${status}`);
    this.name = 'EchoApiError';
    this.status = status;
    this.body = body;
  }
}

type Host = {
  fetch: (
    method: string,
    path: string,
    token: string,
    body: string | null,
  ) => Promise<{ status: number; bodyText: string }>;
};

function host(): Host {
  const h = (globalThis as { __echoMlsHost?: Host }).__echoMlsHost;
  if (!h?.fetch) throw new Error('Echo MLS host fetch is not installed.');
  return h;
}

export async function echoFetch<T>(
  token: string,
  path: string,
  init?: { method?: string; body?: string },
): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const result = await host().fetch(method, path, token, init?.body ?? null);
  if (result.status < 200 || result.status >= 300) {
    let body: ApiErrorBody = {};
    try {
      body = JSON.parse(result.bodyText || '{}') as ApiErrorBody;
    } catch {
      body = { message: result.bodyText.slice(0, 280) };
    }
    throw new EchoApiError(result.status, body);
  }
  if (result.status === 204 || !result.bodyText) {
    return undefined as T;
  }
  const trimmed = result.bodyText.trimStart();
  if (trimmed.startsWith('<')) {
    throw new EchoApiError(result.status, {
      message: `Expected JSON from ${path}, got HTML (check API base URL joining).`,
    });
  }
  try {
    return JSON.parse(result.bodyText) as T;
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new EchoApiError(result.status, {
      message: `Invalid JSON from ${path}: ${detail}`,
    });
  }
}

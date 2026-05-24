import { API_BASE } from '@/config';
import { authTryCookieRefresh, echoAuthDebugLog } from '@/api/authClient';
import { useAuthSessionStore } from '@/stores/authSession';
import { assertEchoApiAllowed } from '@/echoMode';
import { echoCsrfHeaders } from '@/utils/echoCsrf';
import type { ApiErrorBody } from '@shared/types/api';
import { translateApiErrorBody } from '@/i18n/apiErrors';
import { echoT } from '@/i18n';
import {
  isBugHunterRecordingEnabled,
  pushBugHunterEntry,
} from '@/observability/bugHunterTrace';
import {
  emitDiagnostic,
  newSpanId,
  newTraceId,
} from '@/observability/sessionDiagnostics';

const ECHO = `${API_BASE.replace(/\/$/, '')}/api/v1/echo`;

const ECHO_FETCH_MAX_CONCURRENT = 8;
let echoFetchInFlight = 0;
const echoFetchWaitQueue: Array<() => void> = [];

export class EchoApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody,
  ) {
    /* Avoid surfacing the bare placeholder `UNKNOWN` (sentinel used when the response body has
     * no `code`/`message` and HTTP/2 omits `statusText`) — fall back to the HTTP status so the
     * primary-flow banner says e.g. `HTTP 503` instead of `UNKNOWN`. */
    let baseMessage = translateApiErrorBody(body);
    const placeholderCode = body.code === 'UNKNOWN' || !body.code;
    if (
      placeholderCode &&
      !body.message?.trim() &&
      baseMessage === echoT('errors.api.unknown') &&
      status > 0
    ) {
      baseMessage =
        status >= 500
          ? echoT('errors.api.serverUnavailable')
          : echoT('errors.api.requestFailed');
    }
    const detailKey = body.detail?.trim()
      ? `errors.api.${body.detail.trim()}`
      : '';
    const detailMsg =
      detailKey && echoT(detailKey) !== detailKey ? echoT(detailKey) : '';
    const msg =
      detailMsg && detailMsg !== baseMessage ? detailMsg : baseMessage;
    super(msg);
    this.name = 'EchoApiError';
  }
}

function monotonicNowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function acquireEchoFetchSlot(): Promise<{
  waitMs: number;
  queueDepthAtEnqueue: number;
}> {
  if (echoFetchInFlight < ECHO_FETCH_MAX_CONCURRENT) {
    echoFetchInFlight += 1;
    return Promise.resolve({ waitMs: 0, queueDepthAtEnqueue: 0 });
  }
  const queuedAtMs = monotonicNowMs();
  const queueDepthAtEnqueue = echoFetchWaitQueue.length + 1;
  return new Promise<{ waitMs: number; queueDepthAtEnqueue: number }>(
    (resolve) => {
      echoFetchWaitQueue.push(() => {
        echoFetchInFlight += 1;
        resolve({
          waitMs: Math.max(0, Math.round(monotonicNowMs() - queuedAtMs)),
          queueDepthAtEnqueue,
        });
      });
    },
  );
}

function releaseEchoFetchSlot(): void {
  echoFetchInFlight -= 1;
  const next = echoFetchWaitQueue.shift();
  if (next) next();
}

const ECHO_FETCH_429_MAX_RETRIES = 3;

function parseRetryAfterMs(
  headerVal: string | null,
  attemptIndex: number,
): number {
  if (!headerVal) return Math.min(1000 * 2 ** attemptIndex, 10_000);
  const n = Number(headerVal.trim());
  if (Number.isFinite(n) && n >= 0) return Math.min(n * 1000, 30_000);
  const httpDate = Date.parse(headerVal);
  if (Number.isFinite(httpDate))
    return Math.min(Math.max(0, httpDate - Date.now()), 30_000);
  return Math.min(1000 * 2 ** attemptIndex, 10_000);
}

function echoMutatingMethod(method: string | undefined): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(
    (method ?? 'GET').toUpperCase(),
  );
}

/** Trim whitespace on ids in Echo REST paths/query (parity with backend `trimEchoPathParam`). */
export function trimEchoPathSegment(raw: string): string {
  return raw.trim();
}

/** Cookie session auth; `_token` kept for call-site compatibility but ignored (BFF cookies). */
export async function echoFetch<T>(
  _token: string | null | undefined,
  path: string,
  init?: RequestInit,
): Promise<T> {
  assertEchoApiAllowed();
  const method = (init?.method ?? 'GET').toUpperCase();
  const csrf = echoMutatingMethod(method) ? echoCsrfHeaders() : {};
  const headers: Record<string, string> = {
    ...csrf,
    ...(init?.headers as Record<string, string> | undefined),
  };
  const traceId = headers['x-diag-trace-id'] ?? newTraceId();
  const spanId = newSpanId();
  headers['x-diag-trace-id'] = traceId;
  headers['x-diag-span-id'] = spanId;
  if (init?.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const slot = await acquireEchoFetchSlot();
  const t0 = monotonicNowMs();
  emitDiagnostic({
    level: 'info',
    domain: 'api',
    event: 'echo_fetch',
    stage: 'start',
    traceId,
    spanId,
    context: {
      method,
      path,
      queueWaitMs: slot.waitMs,
      queueDepthAtEnqueue: slot.queueDepthAtEnqueue,
      maxConcurrent: ECHO_FETCH_MAX_CONCURRENT,
    },
  });
  if (slot.waitMs > 0) {
    emitDiagnostic({
      level: 'info',
      domain: 'perf',
      event: 'echo_fetch_slot_wait',
      stage: 'success',
      traceId,
      spanId,
      durationMs: slot.waitMs,
      context: {
        method,
        path,
        queueWaitMs: slot.waitMs,
        queueDepthAtEnqueue: slot.queueDepthAtEnqueue,
        maxConcurrent: ECHO_FETCH_MAX_CONCURRENT,
      },
    });
  }
  try {
    let didHttpTraceLog = false;
    try {
      let res: Response | undefined;
      for (let attempt = 0; attempt <= ECHO_FETCH_429_MAX_RETRIES; attempt++) {
        let innerAttempt = 0;
        while (innerAttempt < 2) {
          res = await fetch(`${ECHO}${path}`, {
            ...init,
            credentials: 'include',
            headers: { ...headers },
          });
          if (res.status === 401 && innerAttempt === 0) {
            const u = await authTryCookieRefresh();
            if (u) {
              useAuthSessionStore().applyRestoredProfile(u);
              /* `authTryCookieRefresh` rotates the CSRF cookie + memory token (see `applyEchoCsrfFromAuthJson`).
               * Reusing the pre-refresh `headers` would send the stale `X-CSRF-Token`, causing the
               * retry to fail with `CSRF_REQUIRED`. Re-derive the CSRF header for mutating methods. */
              if (echoMutatingMethod(method)) {
                const fresh = echoCsrfHeaders();
                for (const k of Object.keys(headers)) {
                  if (k.toLowerCase() === 'x-csrf-token') delete headers[k];
                }
                Object.assign(headers, fresh);
              }
              innerAttempt += 1;
              continue;
            }
          }
          break;
        }
        if (!res) throw new Error('Echo request failed');
        if (res.status === 429 && attempt < ECHO_FETCH_429_MAX_RETRIES) {
          const waitMs = parseRetryAfterMs(
            res.headers.get('Retry-After'),
            attempt,
          );
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        break;
      }
      if (!res) throw new Error('Echo request failed');

      const text = await res.text();
      const trimmedBody = text.trim();
      let data: Record<string, unknown> = {};
      if (trimmedBody) {
        try {
          data = JSON.parse(text) as Record<string, unknown>;
        } catch {
          if (res.ok) {
            throw new Error(
              'Echo API returned a non-JSON response (check network, CDN, or proxy).',
            );
          }
          data = {};
        }
      }
      const ms = Math.round(monotonicNowMs() - t0);
      if (isBugHunterRecordingEnabled()) {
        const errHint =
          res.ok || typeof data.message !== 'string'
            ? undefined
            : data.message.slice(0, 320);
        pushBugHunterEntry({
          kind: 'http',
          event: 'echoFetch',
          meta: {
            method,
            path,
            status: res.status,
            ms,
            ok: res.ok,
            ...(errHint ? { err: errHint } : {}),
          },
        });
        didHttpTraceLog = true;
      }
      emitDiagnostic({
        level: res.ok ? 'info' : res.status >= 500 ? 'error' : 'warn',
        domain: 'api',
        event: 'echo_fetch',
        stage: res.ok ? 'success' : 'fail',
        traceId,
        spanId,
        status: String(res.status),
        durationMs: ms,
        context: {
          method,
          path,
          statusCode: res.status,
          ok: res.ok,
          queueWaitMs: slot.waitMs,
          queueDepthAtEnqueue: slot.queueDepthAtEnqueue,
          maxConcurrent: ECHO_FETCH_MAX_CONCURRENT,
        },
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          echoAuthDebugLog('echoFetch auth-related failure', {
            method,
            path,
            url: res.url,
            httpStatus: res.status,
            apiCode: typeof data.code === 'string' ? data.code : undefined,
            apiMessage:
              typeof data.message === 'string' ? data.message : undefined,
            apiDetail:
              typeof data.detail === 'string' ? data.detail : undefined,
            hint:
              res.status === 401
                ? 'Cookie session invalid or expired; client may retry after refresh (see auth logs).'
                : 'Often CSRF mismatch (echo_csrf / x-csrf-token) or permission.',
          });
        }
        if (res.status === 401) {
          useAuthSessionStore().invalidateSessionForReauth(
            'Your session expired or is no longer valid. Sign in again.',
          );
        }
        throw new EchoApiError(res.status, {
          code: typeof data.code === 'string' ? data.code : 'UNKNOWN',
          message:
            typeof data.message === 'string' ? data.message : res.statusText,
          ...(typeof data.detail === 'string' ? { detail: data.detail } : {}),
        });
      }
      return data as T;
    } catch (e) {
      const customHeaders = Object.keys(headers).filter(
        (k) =>
          ![
            'content-type',
            'accept',
            'accept-language',
            'content-language',
          ].includes(k.toLowerCase()),
      );
      const contentType =
        typeof headers['Content-Type'] === 'string'
          ? headers['Content-Type']
          : undefined;
      const normalizedContentType = contentType
        ?.toLowerCase()
        .split(';', 1)[0]
        ?.trim();
      const likelyPreflight =
        !['GET', 'HEAD', 'POST'].includes(method) ||
        customHeaders.length > 0 ||
        (method === 'POST' &&
          !!normalizedContentType &&
          ![
            'application/x-www-form-urlencoded',
            'multipart/form-data',
            'text/plain',
          ].includes(normalizedContentType));
      console.error('[echo][api][network]', {
        traceId,
        spanId,
        method,
        path,
        apiBase: API_BASE,
        href: typeof window !== 'undefined' ? window.location.href : undefined,
        origin:
          typeof window !== 'undefined' ? window.location.origin : undefined,
        contentType,
        customHeaders,
        likelyPreflight,
        error: e instanceof Error ? e.message : String(e),
      });
      emitDiagnostic({
        level: 'error',
        domain: 'api',
        event: 'echo_fetch_exception',
        stage: 'fail',
        traceId,
        spanId,
        durationMs: Math.round(
          (typeof performance !== 'undefined'
            ? performance.now()
            : Date.now()) - t0,
        ),
        context: { method, path },
        error: {
          message: e instanceof Error ? e.message : String(e),
        },
      });
      if (isBugHunterRecordingEnabled() && !didHttpTraceLog) {
        const ms = Math.round(
          (typeof performance !== 'undefined'
            ? performance.now()
            : Date.now()) - t0,
        );
        pushBugHunterEntry({
          kind: 'http',
          event: 'echoFetch_exception',
          meta: {
            method,
            path,
            ms,
            err:
              e instanceof Error
                ? e.message.slice(0, 400)
                : String(e).slice(0, 400),
          },
        });
      }
      throw e;
    }
  } finally {
    releaseEchoFetchSlot();
  }
}

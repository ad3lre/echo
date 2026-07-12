import { AuthApiError } from '@/api/authClientCore';
import { EchoApiError } from '@/api/echo/transport';

export type PrimaryFlowFailureDetail = {
  flow: string;
  message: string;
  cause?: unknown;
  context?: Record<string, unknown>;
  /** When set, the primary-flow banner should show this instead of the technical line. */
  userMessage?: string;
  /** When true, subscribers should not surface the global primary-flow banner (e.g. hydrate already uses `echoWorkspaceError`). */
  suppressBanner?: boolean;
};

const EVENT = 'echo-primary-flow-failure';

export type ReportPrimaryFlowFailureOptions = {
  /** When false, do not dispatch the global banner event (e.g. workspace hydrate already has `echoWorkspaceError`). */
  showBanner?: boolean;
  /** Human-readable banner copy; when omitted, banner uses flow id + error message. */
  userMessage?: string;
  /** Report even when the error is classified as benign (e.g. tests). */
  force?: boolean;
};

/** Echo API `detail` tokens for stale nav / deleted targets — not product outages. */
export const BENIGN_ECHO_API_DETAILS = new Set([
  'CHANNEL_NOT_FOUND',
  'VOICE_CHANNEL_NOT_FOUND',
  'GROUP_DM_NOT_MEMBER',
  'DM_NOT_ALLOWED',
  'DM_USER_BLOCKED',
]);

/**
 * Background channel fetches surface errors in channel UI (history skeleton, composer caps).
 * They must not trip the global primary-flow banner.
 */
export const CHANNEL_SCOPED_FETCH_FLOWS = new Set([
  'fetchEchoChannelMessages',
  'fetchEchoChannelMessages.older',
  'prefetchChannelMessagesFirstPage',
  'prefetchWorkspaceBootstrapTextChannels',
  'prefetchChannelHover',
  'bootUrlChannelPrefetch',
  'fetchEchoChannelPins',
  'liveChannelCapabilities',
  'mark_active_channel_read_failed',
]);

function enrichPrimaryFlowContext(
  cause: unknown,
  context?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!(cause instanceof EchoApiError)) return context;
  const httpStatus = cause.status;
  const apiDetail = cause.body.detail?.trim();
  const next: Record<string, unknown> = { ...(context ?? {}) };
  if (httpStatus !== undefined && next.httpStatus === undefined) {
    next.httpStatus = httpStatus;
  }
  if (apiDetail && next.apiDetail === undefined) {
    next.apiDetail = apiDetail;
  }
  return Object.keys(next).length > 0 ? next : context;
}

function isPrefetchViewDeniedError(e: EchoApiError): boolean {
  const detail = e.body.detail?.trim();
  if (detail === 'MISSING_VIEW_CHANNEL') return true;
  const sources = [e.message, e.body.message?.trim()].filter(
    (msg): msg is string => !!msg,
  );
  for (const msg of sources) {
    if (
      msg.includes('View Channel') ||
      msg.includes('VIEW_CHANNEL') ||
      msg.includes('permission overwrite')
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Expected failures during channel nav reconciliation (deleted channel, left group DM, etc.).
 * Also covers aborted in-flight fetches after the user switches away.
 */
export function isBenignPrimaryFlowError(
  cause: unknown,
  flow?: string,
  _context?: Record<string, unknown>,
): boolean {
  if (cause instanceof DOMException && cause.name === 'AbortError') return true;
  if (!(cause instanceof EchoApiError || cause instanceof AuthApiError)) {
    return false;
  }

  const detail = cause.body.detail?.trim();
  if (detail && BENIGN_ECHO_API_DETAILS.has(detail)) return true;

  if (cause.status === 403) {
    if (cause instanceof EchoApiError && isPrefetchViewDeniedError(cause)) {
      return true;
    }
    if (
      detail === 'NOT_SERVER_MEMBER' &&
      flow != null &&
      CHANNEL_SCOPED_FETCH_FLOWS.has(flow)
    ) {
      return true;
    }
  }

  if (cause.status === 429 && flow === 'restoreSessionFromApi') {
    return true;
  }

  return false;
}

export function isChannelScopedFetchFlow(flow: string): boolean {
  return CHANNEL_SCOPED_FETCH_FLOWS.has(flow);
}

/**
 * Primary product flows must not fail silently: by default surface a dismissible banner.
 * Non-primary noise (analytics, icon prefetch) should not call this.
 */
export function reportPrimaryFlowFailure(
  flow: string,
  cause: unknown,
  context?: Record<string, unknown>,
  options?: ReportPrimaryFlowFailureOptions,
): void {
  const enrichedContext = enrichPrimaryFlowContext(cause, context);
  const message =
    cause instanceof Error
      ? cause.message
      : typeof cause === 'string'
        ? cause
        : String(cause);

  if (
    !options?.force &&
    isBenignPrimaryFlowError(cause, flow, enrichedContext)
  ) {
    if (import.meta.env.DEV && typeof console.debug === 'function') {
      console.debug('[echo][primary-flow-failure][benign]', {
        flow,
        message,
        context: enrichedContext,
      });
    }
    return;
  }

  const channelScoped = isChannelScopedFetchFlow(flow);
  const showBanner = options?.showBanner !== false && !channelScoped;
  const detail: PrimaryFlowFailureDetail = {
    flow,
    message,
    cause,
    context: enrichedContext,
    ...(options?.userMessage !== undefined
      ? { userMessage: options.userMessage }
      : {}),
    ...(showBanner === false ? { suppressBanner: true } : {}),
  };
  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    console.error('[echo][primary-flow-failure]', {
      flow,
      message,
      context: enrichedContext,
      ...(options?.userMessage !== undefined
        ? { userMessage: options.userMessage }
        : {}),
    });
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT, { detail }));
  }
}

/** Flow ids and HTTP hints that justify treating the outage as backend/API unreachable (subject to `/health` confirmation in the shell). */
export function primaryFlowFailureSuggestsBackendUnreachable(
  d: PrimaryFlowFailureDetail,
): boolean {
  if (d.suppressBanner) return false;
  if (
    d.flow === 'restoreSessionFromApi' ||
    d.flow === 'socket.connect_error' ||
    d.flow === 'hydrateEchoFromApi' ||
    d.flow === 'refreshEchoSocialFromApi'
  ) {
    return true;
  }
  const status = d.context?.httpStatus;
  return typeof status === 'number' && status >= 500;
}

export const PRIMARY_FLOW_FAILURE_EVENT = EVENT;

export function subscribePrimaryFlowFailures(
  handler: (d: PrimaryFlowFailureDetail) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const fn = (e: Event) => {
    const ce = e as CustomEvent<PrimaryFlowFailureDetail>;
    if (ce.detail) handler(ce.detail);
  };
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

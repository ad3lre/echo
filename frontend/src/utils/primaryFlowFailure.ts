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
};

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
  const message =
    cause instanceof Error
      ? cause.message
      : typeof cause === 'string'
        ? cause
        : String(cause);
  const showBanner = options?.showBanner !== false;
  const detail: PrimaryFlowFailureDetail = {
    flow,
    message,
    cause,
    context,
    ...(options?.userMessage !== undefined
      ? { userMessage: options.userMessage }
      : {}),
    ...(showBanner === false ? { suppressBanner: true } : {}),
  };
  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    console.error('[echo][primary-flow-failure]', {
      flow,
      message,
      context,
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

export type UIErrorSeverity = 'info' | 'warning' | 'error';

export type UIErrorPayload = {
  context: string;
  severity: UIErrorSeverity;
  userMessage: string;
  code?: string;
  retryable?: boolean;
  /** Optional one-shot retry; caller should re-invoke the failing operation. */
  retryAction?: () => void;
};

const EVENT = 'echo-ui-error';

export const UI_ERROR_EVENT = EVENT;

export function UIErrorBusEmit(payload: UIErrorPayload): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: payload }));
}

/** Stable reference for tree-shaking / mocking. */
export const UIErrorBus = {
  emit: UIErrorBusEmit,
};

export function subscribeUIErrors(
  handler: (d: UIErrorPayload) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const fn = (e: Event) => {
    const ce = e as CustomEvent<UIErrorPayload>;
    if (ce.detail) handler(ce.detail);
  };
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

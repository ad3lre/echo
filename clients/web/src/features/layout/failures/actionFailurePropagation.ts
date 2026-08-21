import type { ActionResult } from '@/features/layout/actionResult';
import { reportPrimaryFlowFailure } from '@/features/layout/failures/primaryFlowFailure';
import {
  UIErrorBus,
  type UIErrorSeverity,
} from '@/features/layout/failures/uiErrorBus';

export type PropagateActionFailureOptions = {
  flow: string;
  context: string;
  severity?: UIErrorSeverity;
  extraContext?: Record<string, unknown>;
  retryAction?: () => void;
  /** Original error for logging (stack / detail). */
  cause?: unknown;
};

/**
 * User-facing error on the UI bus + structured primary-flow log without duplicating the global primary banner.
 */
export function propagateActionFailure(
  result: ActionResult,
  options: PropagateActionFailureOptions,
): void {
  if (result.ok || !result.error) return;
  const { flow, context, severity, extraContext, retryAction, cause } = options;
  UIErrorBus.emit({
    context,
    severity: severity ?? 'error',
    userMessage: result.error.userMessage,
    code: result.error.code,
    retryable: result.error.retryable,
    retryAction,
  });
  const logCause =
    cause instanceof Error ? cause : new Error(result.error.userMessage);
  reportPrimaryFlowFailure(
    flow,
    logCause,
    {
      code: result.error.code,
      retryable: result.error.retryable,
      ...(cause !== undefined && !(cause instanceof Error)
        ? { rawCause: String(cause) }
        : {}),
      ...extraContext,
    },
    { showBanner: false },
  );
}

export function logActionFailureOnly(
  result: ActionResult,
  flow: string,
  extraContext?: Record<string, unknown>,
  cause?: unknown,
): void {
  if (result.ok || !result.error) return;
  reportPrimaryFlowFailure(
    flow,
    cause instanceof Error ? cause : new Error(result.error.userMessage),
    {
      code: result.error.code,
      retryable: result.error.retryable,
      ...extraContext,
    },
    { showBanner: false },
  );
}

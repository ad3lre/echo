export interface ActionError {
  code: string;
  userMessage: string;
  retryable: boolean;
}

export interface ActionResult {
  ok: boolean;
  error?: ActionError;
}

export function okResult(): ActionResult {
  return { ok: true };
}

export function failResult(
  code: string,
  userMessage: string,
  retryable: boolean,
): ActionResult {
  return { ok: false, error: { code, userMessage, retryable } };
}

export function toFailResultFromUnknown(
  cause: unknown,
  code: string,
  userMessage: string,
  retryable: boolean,
): ActionResult {
  const msg =
    cause instanceof Error
      ? `${userMessage} (${cause.message})`
      : typeof cause === 'string'
        ? `${userMessage} (${cause})`
        : userMessage;
  return failResult(code, msg, retryable);
}

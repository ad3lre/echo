/**
 * Gate for verbose client-side diagnostics (auth flows, desktop OAuth handoff, etc.).
 * Production clients/web/desktop/iOS bundles must not emit secrets to the console unless
 * explicitly opted in on non-prod builds via `VITE_ECHO_AUTH_DEBUG=true`.
 */
export function echoClientDebugEnabled(): boolean {
  return (
    import.meta.env.DEV ||
    (!import.meta.env.PROD && import.meta.env.VITE_ECHO_AUTH_DEBUG === 'true')
  );
}

export function echoClientDebugWarn(...args: unknown[]): void {
  if (!echoClientDebugEnabled()) return;
  console.warn(...args);
}

export function echoClientDebugError(...args: unknown[]): void {
  if (!echoClientDebugEnabled()) return;
  console.error(...args);
}

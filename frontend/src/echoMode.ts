/**
 * True when the user is authenticated — Echo APIs are used for session-backed flows only.
 */
export function isEchoExecutionPath(isAuthenticated: boolean): boolean {
  return isAuthenticated;
}

/** No-op guard kept for call sites; Echo REST is always allowed when the app runs against a backend. */
export function assertEchoApiAllowed(): void {}

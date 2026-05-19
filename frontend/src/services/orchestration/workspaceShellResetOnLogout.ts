/**
 * When `authSession.backendUser` becomes null (logout / session cleared), reset shell + echo session
 * and optionally drop the prior user from the workspace roster. Vue `watch` stays in
 * `useEchoWorkspaceLifecycle`; this holds the imperative steps.
 */
export function applyEchoWorkspaceShellResetOnAuthUserCleared(p: {
  previousBackendUser: unknown;
  resetEchoSessionState: () => void;
  setExploreRailTab: () => void;
  clearSelectedServer: () => void;
  /** If the prior user had a stable id, remove that row from `users` (mock roster). */
  removeRosterUserById?: (userId: string) => void;
}): void {
  const prevU = p.previousBackendUser as { id?: string } | null | undefined;
  const goneId = prevU && typeof prevU.id === 'string' ? prevU.id : null;
  p.resetEchoSessionState();
  p.setExploreRailTab();
  p.clearSelectedServer();
  if (goneId) p.removeRosterUserById?.(goneId);
}

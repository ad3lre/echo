/**
 * Imperative shell navigation for code that holds an in-app path but no
 * navigation composable (e.g. the guild-event location handler).
 *
 * `useAppLayoutShellNavigation` registers the applier once
 * {@link useUrlNavigationSync} exists; before that, navigation requests fail
 * loudly (return `false`) so callers can surface a "still loading" hint.
 */

let applyFromBrowserLocation: (() => void) | null = null;

/**
 * Navigate the main shell to an in-app pathname + search (same contract as the
 * browser bar). Returns `false` when URL sync has not registered yet.
 */
export function applyEchoShellPath(pathWithSearch: string): boolean {
  if (typeof window === 'undefined' || !applyFromBrowserLocation) return false;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current === pathWithSearch) {
    applyFromBrowserLocation();
    return true;
  }
  window.history.pushState(null, '', pathWithSearch);
  window.dispatchEvent(new PopStateEvent('popstate'));
  return true;
}

export function registerEchoShellPathNavigator(opts: {
  applyFromBrowserLocation: () => void;
}): void {
  applyFromBrowserLocation = opts.applyFromBrowserLocation;
}

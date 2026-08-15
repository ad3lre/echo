/** Hard reload the SPA. */
export function reloadEchoApp(): void {
  if (typeof window === 'undefined') return;
  window.location.reload();
}

/**
 * Layout hyper-diagnostics for channel/member/tri-pane investigation. Default
 * OFF in the browser. Opt in when debugging:
 * `localStorage.setItem('echoHyperLayout','1'); location.reload();`
 */
export function isEchoLayoutHyperLogEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem('echoHyperLayout') === '1';
  } catch {
    return false;
  }
}

/** Alias: same gate as {@link isEchoLayoutHyperLogEnabled}. */
export function isEchoPanelDiagEnabled(): boolean {
  return isEchoLayoutHyperLogEnabled();
}

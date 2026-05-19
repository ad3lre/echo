/**
 * Opt-in only (never enabled for all dev builds — too noisy and confuses real issues).
 *
 * Enable: `?debugReadState=1`, or `localStorage.setItem('echo_read_state_debug','1')`, or
 * `window.__echoDebugReadState = true` in the console.
 */
export function isEchoReadStateDebugEnabled(): boolean {
  if (import.meta.env.MODE === 'test') return false;
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { __echoDebugReadState?: boolean };
  if (w.__echoDebugReadState === true) return true;
  try {
    if (localStorage.getItem('echo_read_state_debug') === '1') return true;
  } catch {
    /* ignore */
  }
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('debugReadState') === '1';
  } catch {
    return false;
  }
}

export function dbgReadState(
  phase: string,
  data: Record<string, unknown>,
): void {
  if (!isEchoReadStateDebugEnabled()) return;
  if (typeof console === 'undefined') return;
  console.warn(`[echo][read-state] ${phase}`, {
    at: new Date().toISOString(),
    ...data,
  });
}

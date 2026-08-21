/**
 * Opt-in server/voice/LiveKit client logging. Set `localStorage.setItem('echo_debug_vc','1')` and reload.
 * Keeps production consoles clean (connection_state_changed, volume traces, etc.).
 */
export function vcDebugEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem('echo_debug_vc') === '1';
  } catch {
    return false;
  }
}

export function vcDebugLog(...args: unknown[]): void {
  if (!vcDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.warn('[Echo:VC]', ...args);
}

import { isEchoPanelDiagEnabled } from './panelDiagEnabled';

/**
 * Channel panel / compact-nav diagnostics (filter DevTools: `Echo:ChannelPanel`).
 * Gated by `isEchoLayoutHyperLogEnabled()` (default off; opt in with
 * `echoHyperLayout=1`).
 */
export function channelPanelDiag(
  phase: string,
  data?: Record<string, unknown>,
): void {
  if (!isEchoPanelDiagEnabled()) return;
  if (typeof console === 'undefined' || typeof console.warn !== 'function') {
    return;
  }
  console.warn(`[Echo:ChannelPanel] ${phase}`, {
    t: new Date().toISOString(),
    ...data,
  });
}

import { isEchoPanelDiagEnabled } from '@/features/layout/panelDiagEnabled';

/**
 * Member panel diagnostics (filter DevTools: `Echo:MemberPanel`).
 * Gated by `isEchoLayoutHyperLogEnabled()` (default on; mute `echoHyperLayout=0`).
 */
export function memberPanelDiag(
  phase: string,
  data?: Record<string, unknown>,
): void {
  if (!isEchoPanelDiagEnabled()) return;
  if (typeof console === 'undefined' || typeof console.warn !== 'function') {
    return;
  }
  console.warn(`[Echo:MemberPanel] ${phase}`, {
    t: new Date().toISOString(),
    ...data,
  });
}

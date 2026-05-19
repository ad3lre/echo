import { mirrorLayoutHyperLogToDevEndpoint } from '@/dev/layoutHyperDevSink';
import { isEchoLayoutHyperLogEnabled } from '@/utils/panelDiagEnabled';

/**
 * High-signal layout diagnostics (members / channels / tri-pane). Default OFF.
 * Opt in: `localStorage.setItem('echoHyperLayout','1'); location.reload();`
 */
export function layoutHyperLog(
  phase: string,
  data?: Record<string, unknown>,
): void {
  if (!isEchoLayoutHyperLogEnabled()) return;
  if (typeof console === 'undefined' || typeof console.warn !== 'function') {
    return;
  }
  const payload = { t: new Date().toISOString(), ...data };
  const msg = `[Echo:LayoutHyper] ${phase}`;
  console.warn(msg, payload);
  mirrorLayoutHyperLogToDevEndpoint(msg, payload);
}

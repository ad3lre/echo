import { isEchoLayoutHyperLogEnabled } from '@/features/layout/panelDiagEnabled';

export function isEchoMemberListDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (isEchoLayoutHyperLogEnabled()) return true;
  const w = window as unknown as { __echoDebugMemberList?: boolean };
  if (w.__echoDebugMemberList === true) return true;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('debugMemberList') === '1';
  } catch {
    return false;
  }
}

export function dbgMemberList(
  phase: string,
  data: Record<string, unknown>,
): void {
  if (!isEchoMemberListDebugEnabled()) return;
  if (typeof console === 'undefined') return;
  console.log(`[echo][member-list] ${phase}`, data);
}

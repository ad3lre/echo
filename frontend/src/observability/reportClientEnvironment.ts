import type { ClientEnvironmentSnapshot } from '@shared/clientEnvironment';
import { API_BASE } from '@/config';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { collectClientEnvironment } from '@/observability/collectClientEnvironment';

const ENDPOINT = `${API_BASE.replace(/\/$/, '')}/api/v1/analytics/client-environment`;
const REPORTED_SESSION_KEY = 'echo_client_env_reported_v1';

function alreadyReportedThisTab(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    return sessionStorage.getItem(REPORTED_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function markReportedThisTab(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(REPORTED_SESSION_KEY, '1');
  } catch {
    /* quota / privacy mode */
  }
}

function postSnapshot(snapshot: ClientEnvironmentSnapshot): void {
  void fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'omit',
    body: JSON.stringify({ snapshot }),
  }).catch(() => {});
}

/**
 * Fire-and-forget anonymous client environment report (once per browser tab).
 * No auth or CSRF required — server rate-limits by IP and aggregates only.
 */
export function reportClientEnvironmentOnce(): void {
  if (echoSyncCapabilities.isMockDataMode) return;
  if (typeof window === 'undefined') return;
  if (alreadyReportedThisTab()) return;
  markReportedThisTab();
  postSnapshot(collectClientEnvironment());
}

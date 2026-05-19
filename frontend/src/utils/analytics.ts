import { API_BASE } from '@/config';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { echoCsrfHeaders } from '@/utils/echoCsrf';

const ENDPOINT = `${API_BASE.replace(/\/$/, '')}/api/v1/analytics/events`;

const CLIENT_ALLOWED = new Set(['guest_display_name_set', 'session_ended']);

function scrubProps(
  props?: Record<string, unknown>,
): Record<string, string | number | boolean> | undefined {
  if (!props) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props)) {
    if (/email/i.test(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') {
      const t = v.trim();
      if (!t || t.includes('@')) continue;
      out[k] = t.slice(0, 200);
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Fire-and-forget funnel events (PII-safe). Server also logs mint/resume/upgrade/first message for guests.
 */
export function trackEchoEvent(
  name: string,
  props?: Record<string, unknown>,
): void {
  if (echoSyncCapabilities.isMockDataMode) return;
  if (!CLIENT_ALLOWED.has(name)) return;
  try {
    const csrfHeaders = echoCsrfHeaders();
    if (!csrfHeaders['X-CSRF-Token']) return;
    const scrubbed = scrubProps(props);
    const body = JSON.stringify({
      events: [{ name, ...(scrubbed ? { props: scrubbed } : {}) }],
    });
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...csrfHeaders },
      credentials: 'include',
      body,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

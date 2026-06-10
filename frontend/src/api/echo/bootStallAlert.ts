import { API_BASE } from '@/config';

export type BootStallAlertKind =
  | 'boot_gate_settled_still_visible'
  | 'boot_gate_past_safety_timeout'
  | 'app_layout_chunk_stall';

export type BootStallAlertPayload = {
  kind: BootStallAlertKind;
  client?: Record<string, unknown>;
  timing?: Record<string, unknown>;
  state?: Record<string, unknown>;
};

const BOOT_STALL_ALERT_PATH = `${API_BASE.replace(/\/$/, '')}/api/v1/echo/public/client-alerts/boot-stall`;

/**
 * Fire-and-forget client alert when boot / AppLayout loading appears stuck.
 * Must never block or throw into primary UX.
 */
export function postBootStallAlert(payload: BootStallAlertPayload): void {
  void fetch(BOOT_STALL_ALERT_PATH, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    /* silent */
  });
}

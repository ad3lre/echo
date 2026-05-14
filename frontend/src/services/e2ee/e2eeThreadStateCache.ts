import type { E2eeThreadState } from './e2eeTypes';

const THREAD_STATE_PREFIX = 'echo_e2ee_thread_state_v1:';

export function readCachedE2eeThreadState(
  channelId: string,
): E2eeThreadState | null {
  const cid = channelId.trim();
  if (!cid) return null;
  try {
    const raw = sessionStorage.getItem(`${THREAD_STATE_PREFIX}${cid}`);
    if (!raw) return null;
    return JSON.parse(raw) as E2eeThreadState;
  } catch {
    return null;
  }
}

export function writeCachedE2eeThreadState(
  channelId: string,
  state: E2eeThreadState,
): void {
  const cid = channelId.trim();
  if (!cid) return;
  try {
    sessionStorage.setItem(
      `${THREAD_STATE_PREFIX}${cid}`,
      JSON.stringify(state),
    );
  } catch {
    /* ignore */
  }
}

/** Channel ids with `enabled: true` in the session-scoped E2EE thread cache (for UX after device pairing). */
export function listCachedE2eeEnabledChannelIds(): string[] {
  const out: string[] = [];
  if (typeof sessionStorage === 'undefined') return out;
  try {
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (!k?.startsWith(THREAD_STATE_PREFIX)) continue;
      const cid = k.slice(THREAD_STATE_PREFIX.length);
      if (!cid) continue;
      const raw = sessionStorage.getItem(k);
      if (!raw) continue;
      let st: E2eeThreadState;
      try {
        st = JSON.parse(raw) as E2eeThreadState;
      } catch {
        continue;
      }
      if (st?.enabled === true) out.push(cid);
    }
  } catch {
    /* ignore */
  }
  return out;
}

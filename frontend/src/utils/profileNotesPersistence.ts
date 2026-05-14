/** Private notes about other users (viewer-local); survives reloads. */
export const PROFILE_NOTES_STORAGE_KEY = 'echo_profile_notes_v1';

const MAX_NOTE_LEN = 512;

export function loadProfileNotesMap(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(PROFILE_NOTES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof k !== 'string' || k.trim() === '') continue;
      if (typeof v !== 'string') continue;
      const t = v.trim();
      if (!t) continue;
      out[k] = t.slice(0, MAX_NOTE_LEN);
    }
    return out;
  } catch {
    return {};
  }
}

export function persistProfileNotesMap(map: Record<string, string>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PROFILE_NOTES_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode */
  }
}

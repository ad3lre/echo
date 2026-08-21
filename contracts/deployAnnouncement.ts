/** Max length for deploy / restart announcements shown during downtime and welcome-back. */
export const DEPLOY_ANNOUNCEMENT_MAX_LENGTH = 500;

/**
 * Normalize user-provided deploy announcement text.
 * Returns null when empty; throws when over the max length.
 */
export function normalizeDeployAnnouncement(raw: unknown): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  if (t.length > DEPLOY_ANNOUNCEMENT_MAX_LENGTH) {
    throw new Error(
      `Deploy announcement must be at most ${DEPLOY_ANNOUNCEMENT_MAX_LENGTH} characters (got ${t.length})`,
    );
  }
  return t;
}

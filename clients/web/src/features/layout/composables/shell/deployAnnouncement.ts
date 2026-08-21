import {
  DEPLOY_ANNOUNCEMENT_MAX_LENGTH,
  normalizeDeployAnnouncement,
} from '@shared/deployAnnouncement';

export { DEPLOY_ANNOUNCEMENT_MAX_LENGTH };

export const DEPLOY_ANNOUNCEMENT_STORAGE_KEY = 'echo_deploy_announcement_v1';
export const DEPLOY_WELCOME_BACK_STORAGE_KEY = 'echo_deploy_welcome_back_v1';

const PUBLIC_ANNOUNCEMENT_TTL_MS = 2 * 60 * 60 * 1000;

type StoredDeployAnnouncement = {
  message: string;
  storedAtMs: number;
};

export function persistDeployAnnouncement(message: string): void {
  let normalized: string | null;
  try {
    normalized = normalizeDeployAnnouncement(message);
  } catch {
    normalized =
      message.trim().slice(0, DEPLOY_ANNOUNCEMENT_MAX_LENGTH) || null;
  }
  if (!normalized) return;
  try {
    sessionStorage.setItem(
      DEPLOY_ANNOUNCEMENT_STORAGE_KEY,
      JSON.stringify({
        message: normalized,
        storedAtMs: Date.now(),
      } satisfies StoredDeployAnnouncement),
    );
  } catch {
    /* ignore storage availability issues */
  }
}

export function readDeployAnnouncement(): string | null {
  try {
    const raw = sessionStorage.getItem(DEPLOY_ANNOUNCEMENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDeployAnnouncement;
    if (typeof parsed?.message !== 'string') return null;
    const t = parsed.message.trim();
    return t || null;
  } catch {
    return null;
  }
}

export function clearDeployAnnouncement(): void {
  try {
    sessionStorage.removeItem(DEPLOY_ANNOUNCEMENT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Stash announcement for a post-recovery welcome-back banner, then clear outage copy. */
export function markDeployWelcomeBackPending(): void {
  const msg = readDeployAnnouncement();
  if (!msg) return;
  try {
    sessionStorage.setItem(
      DEPLOY_WELCOME_BACK_STORAGE_KEY,
      JSON.stringify({ message: msg, pendingAtMs: Date.now() }),
    );
    sessionStorage.removeItem(DEPLOY_ANNOUNCEMENT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Read and clear pending welcome-back copy (once per recovery reload). */
export function consumeDeployWelcomeBack(): string | null {
  try {
    const raw = sessionStorage.getItem(DEPLOY_WELCOME_BACK_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(DEPLOY_WELCOME_BACK_STORAGE_KEY);
    const parsed = JSON.parse(raw) as { message?: string };
    if (typeof parsed?.message !== 'string') return null;
    const t = parsed.message.trim();
    return t || null;
  } catch {
    return null;
  }
}

/** Static JSON written by the VPS launcher for users who load during downtime. */
export async function fetchPublicDeployAnnouncement(): Promise<string | null> {
  try {
    const res = await fetch('/echo-deploy-announcement.json', {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      message?: unknown;
      writtenAt?: unknown;
    };
    if (typeof data?.message !== 'string') return null;
    let normalized: string | null;
    try {
      normalized = normalizeDeployAnnouncement(data.message);
    } catch {
      return null;
    }
    if (!normalized) return null;
    const writtenAt =
      typeof data.writtenAt === 'number' && Number.isFinite(data.writtenAt)
        ? data.writtenAt
        : 0;
    if (writtenAt > 0 && Date.now() - writtenAt > PUBLIC_ANNOUNCEMENT_TTL_MS) {
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

import type { EchoWorkspaceState } from '@/features/layout/echoWorkspace/workspaceEchoApiSnapshot';
import {
  stripForWorkspaceCache,
  type WorkspaceCacheTier,
} from '@/features/layout/echoWorkspace/workspacePersistence';

/** Mirrors `EchoWorkspaceState` from echoClient (duplicated shape to avoid import cycles). */
export type CachedEchoWorkspaceState = {
  servers: unknown[];
  categoriesByServer: Record<string, unknown>;
  serverMemberIds: Record<string, string[]>;
  workspaceVersion: string;
  membersByServer?: Record<
    string,
    { userId: string; name: string; pfp: string }[]
  >;
};

const WS_CACHE_KEY = 'echo_workspace_v3';

export type WorkspaceSessionCachePayload = {
  userId: string;
  state: CachedEchoWorkspaceState;
  ts: number;
};

/** Best-effort JWT `sub` for cache key alignment (not verified cryptographically). */
export function readJwtSub(accessToken: string): string | null {
  const parts = accessToken.split('.');
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = JSON.parse(atob(padded)) as { sub?: unknown };
    return typeof json.sub === 'string' && json.sub.trim()
      ? json.sub.trim()
      : null;
  } catch {
    return null;
  }
}

export function readWorkspaceSessionCache(
  userIdGuess: string | null,
): CachedEchoWorkspaceState | null {
  if (typeof sessionStorage === 'undefined' || !userIdGuess) return null;
  try {
    const raw = sessionStorage.getItem(WS_CACHE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as WorkspaceSessionCachePayload;
    if (
      !o ||
      o.userId !== userIdGuess ||
      !o.state?.servers ||
      !o.state.categoriesByServer
    )
      return null;
    const stripped = stripForWorkspaceCache(
      o.state as unknown as EchoWorkspaceState,
      'full',
    );
    return stripped as unknown as CachedEchoWorkspaceState;
  } catch {
    return null;
  }
}

export function writeWorkspaceSessionCache(
  userId: string,
  state: CachedEchoWorkspaceState,
): void {
  if (typeof sessionStorage === 'undefined' || !userId) return;
  const tiers: WorkspaceCacheTier[] = ['full', 'light', 'minimal'];
  for (const tier of tiers) {
    try {
      const stripped = stripForWorkspaceCache(
        state as unknown as EchoWorkspaceState,
        tier,
      ) as unknown as CachedEchoWorkspaceState;
      const payload: WorkspaceSessionCachePayload = {
        userId,
        state: stripped,
        ts: Date.now(),
      };
      sessionStorage.setItem(WS_CACHE_KEY, JSON.stringify(payload));
      return;
    } catch {
      try {
        sessionStorage.removeItem(WS_CACHE_KEY);
      } catch {
        /* ignore */
      }
    }
  }
}

export function clearWorkspaceSessionCache(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(WS_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

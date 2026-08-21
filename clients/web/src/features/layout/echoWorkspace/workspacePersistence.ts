import type { EchoWorkspaceState } from '@/api/echoClient';
import { stripEphemeralVoiceFromWorkspaceSnapshot } from '@/features/layout/echoWorkspace/workspaceVoiceEphemeralStrip';

const WORKSPACE_CACHE_KEY = 'echo-workspace-v1';

export type WorkspaceCacheTier = 'full' | 'light' | 'minimal';

type PersistedWorkspaceCachePayload = {
  userId: string;
  state: EchoWorkspaceState;
};

/** Strip voice ghosts and optionally drop heavy fields when storage quota is tight. */
export function stripForWorkspaceCache(
  state: EchoWorkspaceState,
  tier: WorkspaceCacheTier = 'full',
): EchoWorkspaceState {
  const base = stripEphemeralVoiceFromWorkspaceSnapshot(
    JSON.parse(JSON.stringify(state)) as EchoWorkspaceState,
  );
  if (tier === 'full') return base;

  const { membersByServer: _members, ...light } = base;
  if (tier === 'light') return light as EchoWorkspaceState;

  return {
    ...light,
    serverMemberIds: {},
    upcomingEventsByServerId: {},
    myEventRsvps: [],
  };
}

function canUseLocalStorage(): boolean {
  return (
    typeof localStorage !== 'undefined' &&
    typeof localStorage.setItem === 'function'
  );
}

function tryWriteWorkspaceCacheJson(json: string): boolean {
  try {
    localStorage.setItem(WORKSPACE_CACHE_KEY, json);
    return true;
  } catch {
    return false;
  }
}

export function saveEchoWorkspaceToCache(
  userId: string,
  state: EchoWorkspaceState,
): void {
  const uid = userId.trim();
  if (!uid || !canUseLocalStorage()) return;

  const tiers: WorkspaceCacheTier[] = ['full', 'light', 'minimal'];
  for (const tier of tiers) {
    const payload: PersistedWorkspaceCachePayload = {
      userId: uid,
      state: stripForWorkspaceCache(state, tier),
    };
    const json = JSON.stringify(payload);
    if (tryWriteWorkspaceCacheJson(json)) return;
    clearEchoWorkspaceCache();
    if (tryWriteWorkspaceCacheJson(json)) return;
  }
  /* quota / private mode — cold-start cache is best-effort */
}

export function loadEchoWorkspaceFromCache(
  userId: string,
): EchoWorkspaceState | null {
  const uid = userId.trim();
  if (
    !uid ||
    typeof localStorage === 'undefined' ||
    typeof localStorage.getItem !== 'function'
  )
    return null;
  try {
    const raw = localStorage.getItem(WORKSPACE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as
      | PersistedWorkspaceCachePayload
      | EchoWorkspaceState;
    if (parsed && typeof parsed === 'object' && 'userId' in parsed) {
      const payload = parsed as PersistedWorkspaceCachePayload;
      if (payload.userId !== uid || !payload.state?.servers) return null;
      return stripForWorkspaceCache(payload.state, 'full');
    }
    // Legacy unscoped cache — ignore to avoid cross-account ghost guilds.
    return null;
  } catch {
    return null;
  }
}

export function clearEchoWorkspaceCache(): void {
  if (
    typeof localStorage === 'undefined' ||
    typeof localStorage.removeItem !== 'function'
  )
    return;
  localStorage.removeItem(WORKSPACE_CACHE_KEY);
}

import type { EchoWorkspaceState } from '@/api/echoClient';
import { stripEphemeralVoiceFromWorkspaceSnapshot } from '@/services/domain/workspaceVoiceEphemeralStrip';

const WORKSPACE_CACHE_KEY = 'echo-workspace-v1';

type PersistedWorkspaceCachePayload = {
  userId: string;
  state: EchoWorkspaceState;
};

function stripForCache(state: EchoWorkspaceState): EchoWorkspaceState {
  return stripEphemeralVoiceFromWorkspaceSnapshot(
    JSON.parse(JSON.stringify(state)) as EchoWorkspaceState,
  );
}

export function saveEchoWorkspaceToCache(
  userId: string,
  state: EchoWorkspaceState,
): void {
  const uid = userId.trim();
  if (
    !uid ||
    typeof localStorage === 'undefined' ||
    typeof localStorage.setItem !== 'function'
  )
    return;
  try {
    const payload: PersistedWorkspaceCachePayload = {
      userId: uid,
      state: stripForCache(state),
    };
    localStorage.setItem(WORKSPACE_CACHE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('Failed to cache echo workspace', err);
  }
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
      return stripForCache(payload.state);
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

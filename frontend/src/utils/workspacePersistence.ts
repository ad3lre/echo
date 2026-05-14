import type { EchoWorkspaceState } from '@/api/echoClient';
import { stripEphemeralVoiceFromWorkspaceSnapshot } from '@/services/domain/workspaceVoiceEphemeralStrip';

const WORKSPACE_CACHE_KEY = 'echo-workspace-v1';

export function saveEchoWorkspaceToCache(state: EchoWorkspaceState): void {
  if (
    typeof localStorage === 'undefined' ||
    typeof localStorage.setItem !== 'function'
  )
    return;
  try {
    // Only cache critical parts to keep it under 5MB (localStorage limit).
    // membersByServer is large, but with lazy loading it will be small or empty initially.
    const cached: EchoWorkspaceState = stripEphemeralVoiceFromWorkspaceSnapshot(
      JSON.parse(JSON.stringify(state)) as EchoWorkspaceState,
    );
    localStorage.setItem(WORKSPACE_CACHE_KEY, JSON.stringify(cached));
  } catch (err) {
    console.warn('Failed to cache echo workspace', err);
  }
}

export function loadEchoWorkspaceFromCache(): EchoWorkspaceState | null {
  if (
    typeof localStorage === 'undefined' ||
    typeof localStorage.getItem !== 'function'
  )
    return null;
  try {
    const raw = localStorage.getItem(WORKSPACE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EchoWorkspaceState;
    return stripEphemeralVoiceFromWorkspaceSnapshot(parsed);
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

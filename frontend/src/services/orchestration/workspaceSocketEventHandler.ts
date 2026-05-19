import type { EchoWorkspaceEvent } from '@shared/types';

/** Workspace event kinds that trigger a debounced full workspace hydrate. */
export const ECHO_WORKSPACE_SOCKET_REFRESH_KINDS = new Set<string>([
  'workspace_invalidated',
  'channel_tree_changed',
  'permission_invalidated',
  'server_updated',
  'membership_changed',
]);

export type WorkspaceSocketEventHandlerDeps = {
  noteWorkspaceEventVersion: (version: string | undefined) => boolean;
  bumpLiveChannelCapabilities: () => void;
  hydrateEchoFromApi: () => Promise<void>;
  refreshEchoSocialFromApi: () => Promise<void>;
  /**
   * Called immediately (not debounced) when `workspace_invalidated` passes version gating,
   * before the debounced full workspace hydrate.
   */
  onWorkspaceInvalidated?: () => void | Promise<void>;
  /** Discord VC roster mirror — applies patch without full workspace hydrate. */
  onDiscordVoiceMirrorRoster?: (payload: EchoWorkspaceEvent) => void;
  /** LiveKit voice E2EE epoch invalidated — disconnect / prompt rejoin. */
  onVoiceE2eeEpochSuperseded?: (payload: EchoWorkspaceEvent) => void;
  /** Debounce before calling `hydrateEchoFromApi` for refresh kinds. Default 200. */
  debounceMs?: number;
};

/**
 * Maps Echo workspace socket events to hydrate / social-refresh actions.
 * Keeps version gating, capability bump, and debounce in one testable place.
 */
export function createWorkspaceSocketEventHandler(
  deps: WorkspaceSocketEventHandlerDeps,
): (payload: EchoWorkspaceEvent) => void {
  const debounceMs = deps.debounceMs ?? 200;
  let timer: ReturnType<typeof setTimeout> | null = null;

  return (payload: EchoWorkspaceEvent) => {
    if (payload.kind === 'friend_requests_changed') {
      void deps.refreshEchoSocialFromApi();
      return;
    }
    if (payload.kind === 'discord_voice_mirror_roster') {
      if (!deps.noteWorkspaceEventVersion(payload.version)) return;
      deps.onDiscordVoiceMirrorRoster?.(payload);
      return;
    }
    if (payload.kind === 'voice_e2ee_epoch_superseded') {
      if (!deps.noteWorkspaceEventVersion(payload.version)) return;
      deps.onVoiceE2eeEpochSuperseded?.(payload);
      return;
    }
    if (!deps.noteWorkspaceEventVersion(payload.version)) return;
    if (!ECHO_WORKSPACE_SOCKET_REFRESH_KINDS.has(payload.kind)) return;

    deps.bumpLiveChannelCapabilities();
    if (
      payload.kind === 'workspace_invalidated' &&
      deps.onWorkspaceInvalidated
    ) {
      void deps.onWorkspaceInvalidated();
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void deps.hydrateEchoFromApi();
    }, debounceMs);
  };
}

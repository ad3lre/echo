import type { EchoWorkspaceEvent } from '@shared/types';

/** Workspace event kinds that trigger a debounced full workspace hydrate. */
export const ECHO_WORKSPACE_SOCKET_REFRESH_KINDS = new Set<string>([
  'workspace_invalidated',
  'channel_tree_changed',
  'permission_invalidated',
  /** Role create/delete/reorder/assignments — channel visibility can change. */
  'role_graph_changed',
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
  /** @deprecated MLS — retained for typing during cutover. */
  onVoiceMlsMessage?: (payload: EchoWorkspaceEvent) => void;
  /** Element Call–style media key announce — pull inbox and install sender keys. */
  onVoiceMediaKey?: (payload: EchoWorkspaceEvent) => void;
  /**
   * Voice roster delta — apply in-place to cached workspace without a full hydrate.
   * Not called if the payload has no `voiceRosterDelta` field.
   */
  onVoiceRosterDelta?: (payload: EchoWorkspaceEvent) => void;
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
  const seenVersionedEvents = new Set<string>();
  const maxSeenVersionedEvents = 2048;

  return (payload: EchoWorkspaceEvent) => {
    // Socket reconnects and outbox replay are at-least-once delivery paths.
    // Version gating intentionally accepts equal versions for snapshot races;
    // this separate bounded key set prevents duplicate side effects in event
    // consumers that do not hydrate a snapshot.
    const version = payload.version?.trim();
    if (version) {
      const eventKey = `${payload.kind}:${version}`;
      if (seenVersionedEvents.has(eventKey)) return;
      seenVersionedEvents.add(eventKey);
      if (seenVersionedEvents.size > maxSeenVersionedEvents) {
        const oldest = seenVersionedEvents.values().next().value;
        if (typeof oldest === 'string') seenVersionedEvents.delete(oldest);
      }
    }
    if (payload.kind === 'paper_document_updated' && payload.paperDocument) {
      void import('@/features/paper/paperRealtimeBus').then((m) =>
        m.emitPaperDocumentUpdated(payload.paperDocument!),
      );
      return;
    }
    if (payload.kind === 'paper_comment_updated' && payload.paperComment) {
      void import('@/features/paper/paperRealtimeBus').then((m) =>
        m.emitPaperCommentUpdated(payload.paperComment!),
      );
      return;
    }
    if (payload.kind === 'friend_requests_changed') {
      void deps.refreshEchoSocialFromApi();
      return;
    }
    if (payload.kind === 'voice_roster_delta') {
      // Tier-1 fast path: immediate in-place patch, no debounced hydrate.
      // Version cursor is updated so subsequent full snapshots version-gate correctly.
      deps.noteWorkspaceEventVersion(payload.version);
      deps.onVoiceRosterDelta?.(payload);
      return;
    }
    if (payload.kind === 'discord_voice_mirror_roster') {
      if (!deps.noteWorkspaceEventVersion(payload.version)) return;
      deps.onDiscordVoiceMirrorRoster?.(payload);
      return;
    }
    if (payload.kind === 'voice_e2ee_epoch_superseded') {
      deps.noteWorkspaceEventVersion(payload.version);
      deps.onVoiceE2eeEpochSuperseded?.(payload);
      return;
    }
    if (payload.kind === 'voice_mls_message') {
      deps.noteWorkspaceEventVersion(payload.version);
      deps.onVoiceMlsMessage?.(payload);
      return;
    }
    if (payload.kind === 'voice_media_key') {
      deps.noteWorkspaceEventVersion(payload.version);
      deps.onVoiceMediaKey?.(payload);
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
    // Permission / role graph changes need a snappy channel-tree refresh so
    // clients do not sit on stale VIEW_CHANNEL until a manual reload.
    const delay =
      payload.kind === 'permission_invalidated' ||
      payload.kind === 'role_graph_changed'
        ? Math.min(debounceMs, 50)
        : debounceMs;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void deps.hydrateEchoFromApi();
    }, delay);
  };
}

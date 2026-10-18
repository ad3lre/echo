/**
 * Process-local state for the active voice media-key session (Element Call–style).
 * Holds the local sender key + rotation so connect/rotate/realtime can share it
 * without pulling MLS.
 */

export type VoiceMediaKeyScope =
  | { kind: 'dm'; channelId: string }
  | { kind: 'guild'; serverId: string; channelId: string };

export function voiceMediaKeyChannelKey(scope: VoiceMediaKeyScope): string {
  if (scope.kind === 'dm') return `dm:${scope.channelId.trim()}`;
  return `${scope.serverId.trim()}:${scope.channelId.trim()}`;
}

export type ActiveVoiceMediaKeySession = {
  channelKey: string;
  scope: VoiceMediaKeyScope;
  viewerUserId: string;
  senderDeviceId: string;
  token: string;
  /** Raw 32-byte local sender media key. */
  mediaKey: ArrayBuffer;
  /** Monotonic rotation counter (maps to keyring via % 16). */
  rotation: number;
  keyIndex: number;
};

let active: ActiveVoiceMediaKeySession | null = null;

export function getActiveVoiceMediaKeySession(): ActiveVoiceMediaKeySession | null {
  return active;
}

export function activeVoiceMediaKeyChannelKey(): string | null {
  return active?.channelKey ?? null;
}

export function setActiveVoiceMediaKeySession(
  session: ActiveVoiceMediaKeySession,
): void {
  active = session;
}

export function clearActiveVoiceMediaKeySession(channelKey?: string): void {
  if (channelKey && active && active.channelKey !== channelKey) return;
  active = null;
}

export function updateActiveVoiceMediaKeyRotation(opts: {
  mediaKey: ArrayBuffer;
  rotation: number;
  keyIndex: number;
}): void {
  if (!active) return;
  active = {
    ...active,
    mediaKey: opts.mediaKey,
    rotation: opts.rotation,
    keyIndex: opts.keyIndex,
  };
}

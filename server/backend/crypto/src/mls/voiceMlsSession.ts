/**
 * @deprecated MLS voice sessions removed. Element Call–style media keys live in
 * `@/services/voice/e2ee/voiceMediaKeySession` and `voiceE2eePrepare`.
 * Stubs keep residual imports from compiling during cutover.
 */

export function activeVoiceMlsChannelKey(): string | null {
  return null;
}

export async function startVoiceMlsSession(_opts: unknown): Promise<never> {
  throw new Error(
    'Voice MLS was removed. Use Element Call–style media-key prepare.',
  );
}

export async function syncVoiceMlsSession(_channelKey: string): Promise<null> {
  return null;
}

export async function reconcileVoiceMlsSession(
  _channelKey: string,
): Promise<null> {
  return null;
}

export async function deriveActiveVoiceMlsSenderMediaKey(
  _identity: string,
): Promise<null> {
  return null;
}

export function stopVoiceMlsSession(): void {
  /* no-op */
}

export function setVoiceMlsAuthorizedUserIds(
  _channelKey: string,
  _userIds: string[],
): void {
  /* no-op */
}

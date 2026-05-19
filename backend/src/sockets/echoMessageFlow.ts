/**
 * Explicit channel semantics for Socket.IO `message` (no implicit channel creation via socket).
 */
export type EchoSocketChannelBranch = 'echo_persisted' | 'reject_unknown';

/** After DB lookup: is this id a row in echo_channels? */
export function branchFromPersistedChannelRow(
  persistedInDb: boolean,
): EchoSocketChannelBranch {
  return persistedInDb ? 'echo_persisted' : 'reject_unknown';
}

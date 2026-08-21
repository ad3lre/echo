/** Live Discord→Echo bridge (bot relay). */
export const DISCORD_INBOUND_BRIDGE_SOURCE = 'discord_inbound';

/** Bulk history import from Discord channels. */
export const DISCORD_IMPORT_BRIDGE_SOURCE = 'discord_import';

export function isDiscordSyncedBridgeSource(
  source: string | undefined | null,
): boolean {
  const s = typeof source === 'string' ? source.trim() : '';
  return (
    s === DISCORD_INBOUND_BRIDGE_SOURCE || s === DISCORD_IMPORT_BRIDGE_SOURCE
  );
}

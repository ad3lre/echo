import type { PatchEchoServerPreferencesBody } from '@/api/echoClient';

export function mergeServerPatch<T extends { id: string }>(
  servers: T[],
  serverId: string,
  patch: Partial<PatchEchoServerPreferencesBody>,
): T[] {
  return servers.map((server) =>
    server.id === serverId ? { ...server, ...patch } : server,
  );
}

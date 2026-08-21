import type { ChannelCategory } from '@/features/layout/channels/useChannels';
import { logShellNav } from '@/features/layout/shellNavDebugLog';
import {
  shouldRetargetServerAfterServerDeletion,
  pickNextServerIdAfterDeletion,
} from '@/features/layout/echoWorkspace/workspaceShellSelection';

/** Shell nav labels stay aligned with `useEchoWorkspaceLifecycle`. */
const SHELL_SOURCE = 'useEchoWorkspaceLifecycle';

export type EchoWorkspaceServerDeletionRetargetParams = {
  deletedServerId: string;
  selectedServerId: string | null;
  remainingServerRows: readonly { id: string }[];
  pickPreferredGuildServerId: () => string | null;
  categoriesByServer: Record<string, ChannelCategory[]>;
  getFirstTextChannelId: (
    cats: { name: string; channels: { id: string; type: string }[] }[],
  ) => string;
  selectServer: (serverId: string | null) => void;
  setActiveChannelId: (channelId: string) => void;
  /** Channel id before retarget (for debug logs). */
  activeChannelIdBefore: string;
};

/**
 * If the current server selection is invalid after a server was removed, select the next
 * server and jump to `#general` (Echo home) or the first text channel.
 * @returns whether retargeting ran (selection + optional channel change).
 */
export function applyEchoWorkspaceRetargetAfterServerDeletion(
  p: EchoWorkspaceServerDeletionRetargetParams,
): boolean {
  const remainingServerIds = p.remainingServerRows.map((row) => row.id);
  if (
    !shouldRetargetServerAfterServerDeletion(
      p.deletedServerId,
      p.selectedServerId,
      remainingServerIds,
    )
  ) {
    return false;
  }
  const next = pickNextServerIdAfterDeletion(
    remainingServerIds,
    p.pickPreferredGuildServerId,
  );
  p.selectServer(next);
  if (next === 'echo') {
    logShellNav(SHELL_SOURCE, 'handleServerDeleted_echo_general', {
      deletedServerId: p.deletedServerId,
      from: p.activeChannelIdBefore,
    });
    p.setActiveChannelId('general');
  } else {
    const cats = p.categoriesByServer[next] ?? [];
    const first = p.getFirstTextChannelId(cats);
    if (first) {
      logShellNav(SHELL_SOURCE, 'handleServerDeleted_next_server_first', {
        deletedServerId: p.deletedServerId,
        nextServerId: next,
        first,
      });
      p.setActiveChannelId(first);
    }
  }
  return true;
}

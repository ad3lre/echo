import { paperAuthorColor } from '@/features/paper/composables/usePaperAuthorGutter';

export type PaperSocketWatcher = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  authoring?: boolean;
};

export type MergedPaperWatchingPeer = {
  clientId: number;
  userId: string;
  name: string;
  color: string;
  /** User is actively authoring (edit mode) in this paper. */
  isAuthoring?: boolean;
};

const MAX_AVATARS = 4;

export function mergePaperWatchingPeers(socketWatchers: PaperSocketWatcher[]): {
  peers: MergedPaperWatchingPeer[];
  totalWatching: number;
} {
  const byUser = new Map<string, MergedPaperWatchingPeer>();

  for (const w of socketWatchers) {
    const id = w.userId.trim();
    if (!id) continue;
    byUser.set(id, {
      clientId: -1,
      userId: id,
      name: w.displayName.trim() || 'Someone',
      color: paperAuthorColor(id),
      isAuthoring: w.authoring === true,
    });
  }

  const all = [...byUser.values()];
  const authors = all.filter((p) => p.isAuthoring);
  const others = all.filter((p) => !p.isAuthoring);
  const ordered = [...authors, ...others];
  return {
    peers: ordered.slice(0, MAX_AVATARS),
    totalWatching: all.length,
  };
}

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
  avatarUrl?: string;
  /** User is actively authoring (edit mode) in this paper. */
  isAuthoring?: boolean;
};

const MAX_AVATARS = 3;

export type MergePaperWatchingPeersOptions = {
  /** Omit this user from bubbles (typically the signed-in viewer). */
  excludeUserId?: string;
};

export function mergePaperWatchingPeers(
  socketWatchers: PaperSocketWatcher[],
  options?: MergePaperWatchingPeersOptions,
): {
  peers: MergedPaperWatchingPeer[];
  totalWatching: number;
} {
  const excludeUserId = options?.excludeUserId?.trim() ?? '';
  const byUser = new Map<string, MergedPaperWatchingPeer>();

  for (const w of socketWatchers) {
    const id = w.userId.trim();
    if (!id || (excludeUserId && id === excludeUserId)) continue;
    const avatarUrl = w.avatarUrl?.trim();
    byUser.set(id, {
      clientId: -1,
      userId: id,
      name: w.displayName.trim() || 'Someone',
      color: paperAuthorColor(id),
      avatarUrl: avatarUrl || undefined,
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

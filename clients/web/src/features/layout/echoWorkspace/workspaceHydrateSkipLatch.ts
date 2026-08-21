/**
 * `startInitialLoad` already fetches workspace state; the auth/session watcher may
 * call `hydrateEchoFromApi` immediately after. This one-shot latch skips the
 * redundant workspace HTTP fetch for that single run (social hydrate still runs).
 */
export type WorkspaceHydrateSkipLatch = {
  armSkipNext: () => void;
  cancelSkip: () => void;
  consume: () => boolean;
};

export function createWorkspaceHydrateSkipLatch(): WorkspaceHydrateSkipLatch {
  let skipNext = false;
  return {
    armSkipNext() {
      skipNext = true;
    },
    cancelSkip() {
      skipNext = false;
    },
    consume() {
      if (!skipNext) return false;
      skipNext = false;
      return true;
    },
  };
}

/**
 * Monotonic counter so only the **latest** social-graph fetch applies. Shared by
 * full workspace hydrate (`fetchWorkspaceSocialForHydrate`) and lightweight
 * refresh — otherwise a slow hydrate response can arrive after unfriend +
 * `refreshEchoSocialFromApi` and overwrite `friendIds`.
 *
 * Leaf module on purpose: `authSession` bumps it on session rotation, and the
 * hydrate orchestration consumes it. Keeping it here avoids the import cycle
 * `authSession → workspaceEchoHydrateFromApi → echoClient → transport →
 * authSession`.
 */
let echoWorkspaceSocialRefreshSeq = 0;

export function currentEchoWorkspaceSocialRefreshSeq(): number {
  return echoWorkspaceSocialRefreshSeq;
}

export function nextEchoWorkspaceSocialRefreshSeq(): number {
  return ++echoWorkspaceSocialRefreshSeq;
}

/** Drop in-flight social hydrate/refresh results (e.g. before unfriend optimistic UI, or on session rotation). */
export function invalidateInFlightEchoWorkspaceSocialRefresh(): void {
  echoWorkspaceSocialRefreshSeq++;
}

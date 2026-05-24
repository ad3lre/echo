/** Optional hook registered by the app shell so Paper can prime the main Socket.IO session. */
let ensureConnect: (() => void | Promise<void>) | null = null;

export function registerEchoSocketWarmConnect(
  fn: (() => void | Promise<void>) | null,
): void {
  ensureConnect = fn;
}

export function warmEchoSocketConnect(): void {
  if (!ensureConnect) return;
  void ensureConnect();
}

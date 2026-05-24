/** Ensures only one chat media element plays at a time. */
const activeElements = new Set<HTMLMediaElement>();

export function registerExclusiveMediaPlayback(
  el: HTMLMediaElement,
): () => void {
  activeElements.add(el);
  return () => {
    activeElements.delete(el);
  };
}

export function claimExclusiveMediaPlayback(el: HTMLMediaElement): void {
  for (const other of activeElements) {
    if (other === el) continue;
    if (!other.paused) other.pause();
  }
}

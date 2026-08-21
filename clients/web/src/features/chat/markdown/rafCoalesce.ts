/** Coalesce rapid calls (e.g. editor update bursts) into one rAF callback. */
export function createRafCoalescer(fn: () => void): () => void {
  let rafId: number | null = null;
  return () => {
    if (rafId != null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      fn();
    });
  };
}

/**
 * Echo-owned subset of LiveKit Krisp filter options (see `@livekit/krisp-noise-filter` KrispOptions).
 * Defined here so app modules never statically reference the Krisp package — only the lazy
 * `import('@livekit/krisp-noise-filter')` path pulls WASM into its async chunk.
 */
export type EchoKrispNoiseFilterOptions = {
  quality?: 'low' | 'medium' | 'high';
  useBVC?: boolean;
};

/**
 * Trace payloads for RBAC evaluation. Production default: compressed (final provenance only).
 */

export type EchoTraceMode = 'full' | 'compressed';

export type ServerFoldTraceEventFull = {
  kind: 'server_fold_bit';
  bit: string;
  roleId: string;
  value: boolean;
  reason?: 'administrator';
};

export type LayerApplyTraceEventFull = {
  kind: 'layer_apply_bit';
  layer: 'category' | 'channel';
  bit: string;
  value: boolean;
};

export type CompressedBitSource = {
  bit: string;
  layer: 'owner' | 'server' | 'category' | 'channel';
  sourceLabel: string;
};

export type CompressedTraceBucket = {
  compressed: CompressedBitSource[];
  compressedByBit: Map<string, CompressedBitSource>;
};

export type ServerAggregationTrace = {
  mode: EchoTraceMode;
  full?: (ServerFoldTraceEventFull | LayerApplyTraceEventFull)[];
  compressed?: CompressedBitSource[];
};

/** Collector passed into foldRolePermissions / layer apply. */
export type FoldTraceContext = {
  mode: EchoTraceMode;
  full?: (ServerFoldTraceEventFull | LayerApplyTraceEventFull)[];
  compressed?: CompressedTraceBucket;
};

export function createTraceCollector(mode: EchoTraceMode): {
  mode: EchoTraceMode;
  full?: (ServerFoldTraceEventFull | LayerApplyTraceEventFull)[];
  compressed?: CompressedTraceBucket;
} {
  if (mode === 'full') {
    return { mode, full: [] };
  }
  return {
    mode,
    compressed: {
      compressed: [],
      compressedByBit: new Map<string, CompressedBitSource>(),
    },
  };
}

export function recordCompressedSource(
  bucket: CompressedTraceBucket,
  bit: string,
  layer: CompressedBitSource['layer'],
  sourceLabel: string,
): void {
  const row: CompressedBitSource = { bit, layer, sourceLabel };
  bucket.compressedByBit.set(bit, row);
}

/** Batch-fill compressed provenance for an ADMIN role (one Map.set per bit, no per-bit function-call overhead). */
export function recordCompressedBulkAdmin(
  bucket: CompressedTraceBucket,
  roleId: string,
  allKeys: readonly string[],
): void {
  const label = `role:${roleId}:administrator`;
  for (const k of allKeys) {
    bucket.compressedByBit.set(k, {
      bit: k,
      layer: 'server',
      sourceLabel: label,
    });
  }
}

/** Batch-fill compressed provenance for owner bypass. */
export function recordCompressedBulkOwner(
  bucket: CompressedTraceBucket,
  allKeys: readonly string[],
): void {
  for (const k of allKeys) {
    bucket.compressedByBit.set(k, {
      bit: k,
      layer: 'owner',
      sourceLabel: 'owner',
    });
  }
}

export function finalizeCompressed(
  bucket: CompressedTraceBucket,
): CompressedBitSource[] {
  bucket.compressed = [...bucket.compressedByBit.values()];
  return bucket.compressed;
}

export function emitTraceEvent(
  ctx: FoldTraceContext | undefined,
  ev: ServerFoldTraceEventFull | LayerApplyTraceEventFull,
): void {
  if (!ctx || ctx.mode !== 'full' || !ctx.full) return;
  ctx.full.push(ev);
}

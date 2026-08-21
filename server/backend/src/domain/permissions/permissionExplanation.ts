/**
 * Compose-only: builds summaries from evaluation traces (no side effects, no re-folding).
 */

import type {
  CompressedBitSource,
  ServerAggregationTrace,
} from './echoPermissionTrace';

export type PermissionExplanation = {
  summary: string;
  traces: ServerAggregationTrace[];
  byLayer: { owner: number; server: number; category: number; channel: number };
  compressedBits: CompressedBitSource[];
};

export function composePermissionExplanation(
  traces: ServerAggregationTrace[],
): PermissionExplanation {
  const byLayer = { owner: 0, server: 0, category: 0, channel: 0 };
  const compressedBits: CompressedBitSource[] = [];
  let fullSteps = 0;

  for (const t of traces) {
    if (t.mode === 'full' && t.full) {
      for (const ev of t.full) {
        fullSteps += 1;
        if (ev.kind === 'server_fold_bit') byLayer.server += 1;
        else if (ev.kind === 'layer_apply_bit') {
          if (ev.layer === 'category') byLayer.category += 1;
          else byLayer.channel += 1;
        }
      }
    }
    if (t.mode === 'compressed' && t.compressed) {
      for (const row of t.compressed) {
        compressedBits.push(row);
        if (row.layer === 'owner') byLayer.owner += 1;
        else if (row.layer === 'server') byLayer.server += 1;
        else if (row.layer === 'category') byLayer.category += 1;
        else if (row.layer === 'channel') byLayer.channel += 1;
      }
    }
  }

  return {
    summary: `RBAC explanation: ${fullSteps} full-mode steps, ${compressedBits.length} compressed provenance rows`,
    traces,
    byLayer,
    compressedBits,
  };
}

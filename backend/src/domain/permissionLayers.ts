/**
 * applyLayer(state_prev, mergedLayerInput) — merged input contains only boolean writes; missing keys inherit.
 */

import { applyLayerFromPartialObject } from './echoPermissionPrimitives';

export function applyLayer(
  prev: Set<string>,
  mergedLayerWrites: Record<string, boolean>,
  allKeys: readonly string[],
): Set<string> {
  return applyLayerFromPartialObject(prev, mergedLayerWrites, allKeys);
}

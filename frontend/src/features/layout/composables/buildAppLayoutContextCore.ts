import type { AppLayoutControllerContextCore } from './buildAppLayoutControllerContext';

export type BuildAppLayoutContextCoreDeps = AppLayoutControllerContextCore;

export function buildAppLayoutContextCore(
  deps: BuildAppLayoutContextCoreDeps,
): AppLayoutControllerContextCore {
  return deps;
}

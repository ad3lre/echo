import type { AppLayoutControllerContext } from './appLayoutControllerTypes';

type ShellLayoutSliceKeys = 'toggleChannelPanel' | 'openDMPanel';

export function useAppLayoutContextShellLayoutSlice(
  deps: Pick<AppLayoutControllerContext, ShellLayoutSliceKeys>,
) {
  const slice: Pick<AppLayoutControllerContext, ShellLayoutSliceKeys> = {
    ...deps,
  };
  return slice;
}

export type BuildAppLayoutShellLayoutSliceDeps = Parameters<
  typeof useAppLayoutContextShellLayoutSlice
>[0];

export function buildAppLayoutShellLayoutSliceDeps(
  deps: BuildAppLayoutShellLayoutSliceDeps,
): BuildAppLayoutShellLayoutSliceDeps {
  return deps;
}

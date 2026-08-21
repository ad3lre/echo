import type { AppLayoutControllerContext } from '../controller/appLayoutControllerTypes';

type ModerationSliceKeys =
  | 'canModerateMemberInServer'
  | 'canVcModerateMember'
  | 'canModerateMemberActionInServer'
  | 'canChangeMemberNicknameInServer'
  | 'canModerateMessageAuthor'
  | 'moderationModalOpen'
  | 'moderationAction'
  | 'moderationTargetUserId'
  | 'moderationTargetUser'
  | 'handleModerateUser'
  | 'onModerationModalConfirm'
  | 'handleVcModerate';

export function useAppLayoutContextModerationSlice(
  deps: Pick<AppLayoutControllerContext, ModerationSliceKeys>,
) {
  const slice: Pick<AppLayoutControllerContext, ModerationSliceKeys> = {
    ...deps,
  };
  return slice;
}

export type BuildAppLayoutModerationSliceDeps = Parameters<
  typeof useAppLayoutContextModerationSlice
>[0];

export function buildAppLayoutModerationSliceDeps(
  deps: BuildAppLayoutModerationSliceDeps,
): BuildAppLayoutModerationSliceDeps {
  return deps;
}

import type { AppLayoutControllerContext } from './appLayoutControllerTypes';

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

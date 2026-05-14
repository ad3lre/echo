import { computed } from 'vue';

export function usePreviewCanModerateMembersComputed(deps: {
  previewCanModerateMembers: () => boolean;
}) {
  return computed(() => deps.previewCanModerateMembers());
}

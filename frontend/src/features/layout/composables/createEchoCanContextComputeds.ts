import { computed, type ComputedRef, type Ref } from 'vue';
import type { AppLayoutControllerContext } from './appLayoutControllerTypes';

type EchoCanContextKeys =
  | 'echoCanBanMembers'
  | 'echoCanChangeNicknames'
  | 'echoCanCreateChannel'
  | 'echoCanCreateInvite'
  | 'echoCanKickMembers'
  | 'echoCanManageMessages'
  | 'echoCanManageNicknames'
  | 'echoCanModerateMembers'
  | 'echoCanTimeoutMembers';

type EchoCanRefs =
  Pick<AppLayoutControllerContext, EchoCanContextKeys> extends infer T
    ? { [K in keyof T]: Ref<boolean> }
    : never;

/** `ComputedRef<boolean>` shell context fields from `useEchoGuildRoleUi` `Ref<boolean>` caps. */
export function createEchoCanContextComputeds(
  roleUi: EchoCanRefs,
): Pick<AppLayoutControllerContext, EchoCanContextKeys> {
  const asComputed = (r: Ref<boolean>): ComputedRef<boolean> =>
    computed(() => r.value);

  return {
    echoCanBanMembers: asComputed(roleUi.echoCanBanMembers),
    echoCanChangeNicknames: asComputed(roleUi.echoCanChangeNicknames),
    echoCanCreateChannel: asComputed(roleUi.echoCanCreateChannel),
    echoCanCreateInvite: asComputed(roleUi.echoCanCreateInvite),
    echoCanKickMembers: asComputed(roleUi.echoCanKickMembers),
    echoCanManageMessages: asComputed(roleUi.echoCanManageMessages),
    echoCanManageNicknames: asComputed(roleUi.echoCanManageNicknames),
    echoCanModerateMembers: asComputed(roleUi.echoCanModerateMembers),
    echoCanTimeoutMembers: asComputed(roleUi.echoCanTimeoutMembers),
  };
}

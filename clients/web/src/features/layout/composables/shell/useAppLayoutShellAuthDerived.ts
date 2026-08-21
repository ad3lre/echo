import {
  computed,
  toValue,
  type ComputedRef,
  type MaybeRefOrGetter,
} from 'vue';
import type { AuthUserPublic } from '@/api/authClient';
import {
  resolveEchoGroupDmMaxMembers,
  type EchoPlanLimitsPublic,
} from '@shared/echoPlanLimits';
import { selectSelfPresence } from '@/features/layout/presence';
import type { EchoServerMemberDto } from '@/api/echo/types';
import {
  buildSelfMemberProfileForShell,
  lookupServerMemberJoinedAtIso,
  sessionUserToShellCurrentUserSummary,
} from '@/features/member-profile/memberProfiles';

export function useAppLayoutShellAuthDerived(deps: {
  backendUser: MaybeRefOrGetter<AuthUserPublic | null | undefined>;
  planLimits: MaybeRefOrGetter<EchoPlanLimitsPublic | null | undefined>;
  livePresenceByUserId?: MaybeRefOrGetter<Record<string, string | undefined>>;
  selectedServer: MaybeRefOrGetter<
    { id: string; name: string; imageUrl?: string } | null | undefined
  >;
  /** Echo workspace roster — real “Member since” for the selected guild. */
  workspaceMembersByServer?: MaybeRefOrGetter<
    Record<string, EchoServerMemberDto[]>
  >;
}): {
  currentUser: ComputedRef<
    ReturnType<typeof sessionUserToShellCurrentUserSummary>
  >;
  selfProfile: ComputedRef<ReturnType<typeof buildSelfMemberProfileForShell>>;
  groupDmMaxMembers: ComputedRef<number>;
  /** Backend user id for realtime/socket wiring (`undefined` when logged out). */
  currentUserIdForSocket: ComputedRef<string | undefined>;
  /** Raw session user for API/socket layers (not the shell `{ id, name, pfp }` summary). */
  currentUserComputed: ComputedRef<AuthUserPublic | undefined>;
  isAuthenticatedComputed: ComputedRef<boolean>;
  isGuestComputed: ComputedRef<boolean>;
} {
  const currentUserLiveStatus = computed(() => {
    const user = toValue(deps.backendUser);
    return selectSelfPresence({
      userId: user?.id,
      authoritativeStatusesByUserId: deps.livePresenceByUserId
        ? toValue(deps.livePresenceByUserId)
        : undefined,
      sessionStatus: user?.status,
    }).status;
  });

  const currentUser = computed(() =>
    sessionUserToShellCurrentUserSummary(
      toValue(deps.backendUser),
      currentUserLiveStatus.value,
    ),
  );

  const selfProfile = computed(() => {
    const u = toValue(deps.backendUser);
    const sel = toValue(deps.selectedServer);
    const roster = deps.workspaceMembersByServer
      ? toValue(deps.workspaceMembersByServer)
      : undefined;
    const joinedIso = lookupServerMemberJoinedAtIso(sel?.id, u?.id, roster);
    return buildSelfMemberProfileForShell(
      u,
      sel,
      currentUserLiveStatus.value,
      joinedIso ? { memberJoinedAtIso: joinedIso } : undefined,
    );
  });

  const groupDmMaxMembers = computed(() =>
    resolveEchoGroupDmMaxMembers(toValue(deps.planLimits)?.groupDmMaxMembers),
  );

  const currentUserIdForSocket = computed(() => toValue(deps.backendUser)?.id);

  const currentUserComputed = computed(() => {
    const u = toValue(deps.backendUser);
    return u ?? undefined;
  });

  const isAuthenticatedComputed = computed(() =>
    Boolean(toValue(deps.backendUser)),
  );

  const isGuestComputed = computed(
    () => toValue(deps.backendUser)?.isGuest === true,
  );

  return {
    currentUser,
    selfProfile,
    groupDmMaxMembers,
    currentUserIdForSocket,
    currentUserComputed,
    isAuthenticatedComputed,
    isGuestComputed,
  };
}

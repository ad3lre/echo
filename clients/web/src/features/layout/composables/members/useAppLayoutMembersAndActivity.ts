import { computed, unref, type ComputedRef, type Ref } from 'vue';
import { storeToRefs } from 'pinia';
import type {
  GuildEventActivityCard,
  GuildVoiceActivityCard,
} from '@/features/layout/appLayoutLeftChromeProps';
import { buildGuildVoiceActivityCardsForJoinedServers } from '@/features/layout/buildGuildVoiceActivityCards';
import { buildGuildEventActivityCardsFromMyRsvps } from '@/features/layout/buildGuildEventActivityCards';
import { resolveCallTileAvatarUrl } from '@/features/layout/display/avatarDisplay';
import { useEchoSessionStore } from '@/features/layout/echoSession';
import type { MainSurface } from '@/features/layout/mainSurface';
import type { MemberRole } from '@/features/member-profile/memberProfiles';

type CallOverlay = { type: string };

type MemberListUser = {
  id: string;
  name: string;
  pfp: string;
  status?: string;
  isGuest?: boolean;
  isDiscordShadow?: boolean;
};

export type AppLayoutMembersActivityDeps = {
  useCompactPhoneTabShell: Ref<boolean> | ComputedRef<boolean>;
  isExploreView: Ref<boolean> | ComputedRef<boolean>;
  memberPanelCollapsedEffective: Ref<boolean> | ComputedRef<boolean>;
  isDmUiContext: Ref<boolean> | ComputedRef<boolean>;
  isServerEmptyOnboarding: Ref<boolean> | ComputedRef<boolean>;
  isViewingVoiceChannel: Ref<boolean> | ComputedRef<boolean>;
  callOverlay: Ref<CallOverlay> | ComputedRef<CallOverlay>;
  mainSurface: Ref<MainSurface> | ComputedRef<MainSurface>;
  isEchoGraphId: (id: string) => boolean;
  isEchoRoleBootstrapLoading: Ref<boolean> | ComputedRef<boolean>;
  echoCapabilitiesForServerId:
    | Ref<string | null | undefined>
    | ComputedRef<string | null | undefined>;
  isMemberSurfaceSwitchLoading: Ref<boolean> | ComputedRef<boolean>;
  memberListUsers: Ref<MemberListUser[]> | ComputedRef<MemberListUser[]>;
  serverSettingsMemberUsers:
    | Ref<MemberListUser[]>
    | ComputedRef<MemberListUser[]>;
  memberListResolveHighestRole: (userId: string) => MemberRole | undefined;
  selectedServerId: () => string | undefined;
  joinedServers: unknown;
  categoriesByServer: Ref<unknown> | ComputedRef<unknown>;
  rosterUsers: Ref<unknown> | ComputedRef<unknown>;
  getChannelDisplayName: (channelId: string, fallback?: string) => string;
};

function createMembersColumnGates(deps: AppLayoutMembersActivityDeps) {
  const isEchoServerRoleHierarchyPending = computed(() => {
    const sid = deps.selectedServerId();
    return (
      !!sid &&
      sid !== 'echo' &&
      deps.isEchoGraphId(sid) &&
      unref(deps.isEchoRoleBootstrapLoading)
    );
  });

  const memberListUsersResolved = computed(() => unref(deps.memberListUsers));
  const serverSettingsMemberUsersResolved = computed(() =>
    isEchoServerRoleHierarchyPending.value
      ? []
      : unref(deps.serverSettingsMemberUsers),
  );
  const memberListResolveHighestRoleResolved = computed(() =>
    isEchoServerRoleHierarchyPending.value
      ? undefined
      : deps.memberListResolveHighestRole,
  );

  const serverVoiceSurfaceActive = computed(
    () => unref(deps.callOverlay).type === 'serverVoice',
  );

  const membersColumnVisible = computed(
    () =>
      !unref(deps.useCompactPhoneTabShell) &&
      !unref(deps.isExploreView) &&
      !unref(deps.memberPanelCollapsedEffective) &&
      !unref(deps.isDmUiContext) &&
      !unref(deps.isServerEmptyOnboarding) &&
      !unref(deps.isViewingVoiceChannel) &&
      unref(deps.callOverlay).type !== 'dmCall' &&
      unref(deps.mainSurface).type !== 'serverPaper',
  );

  const membersColumnEchoSectionOrdering = computed(() => {
    const sid = deps.selectedServerId();
    return (
      !!sid &&
      sid !== 'echo' &&
      deps.isEchoGraphId(sid) &&
      unref(deps.echoCapabilitiesForServerId) === sid
    );
  });

  const membersColumnListLoading = computed(
    () =>
      isEchoServerRoleHierarchyPending.value ||
      unref(deps.isMemberSurfaceSwitchLoading),
  );

  return {
    isEchoServerRoleHierarchyPending,
    memberListUsersResolved,
    serverSettingsMemberUsersResolved,
    memberListResolveHighestRoleResolved,
    serverVoiceSurfaceActive,
    membersColumnVisible,
    membersColumnEchoSectionOrdering,
    membersColumnListLoading,
  };
}

function serverHasActiveVoiceChannel(
  categories: {
    channels?: { type?: string; voiceParticipantIds?: string[] }[];
  }[],
): boolean {
  return categories.some((category) =>
    (category.channels ?? []).some(
      (channel) =>
        channel.type === 'voice' &&
        (channel.voiceParticipantIds?.length ?? 0) > 0,
    ),
  );
}

function createGuildActivityCards(deps: AppLayoutMembersActivityDeps) {
  const serverActiveVoiceByServerId = computed<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    const categoriesByServer = unref(deps.categoriesByServer) as Record<
      string,
      { channels?: { type?: string; voiceParticipantIds?: string[] }[] }[]
    >;
    for (const [serverId, categories] of Object.entries(
      categoriesByServer ?? {},
    )) {
      if (serverHasActiveVoiceChannel(categories ?? [])) out[serverId] = true;
    }
    return out;
  });

  const guildVoiceActivityCards = computed<GuildVoiceActivityCard[]>(() =>
    buildGuildVoiceActivityCardsForJoinedServers({
      joinedServers: deps.joinedServers as never,
      categoriesByServer: unref(deps.categoriesByServer) as never,
      roster: unref(deps.rosterUsers) as never,
      getChannelDisplayName: deps.getChannelDisplayName,
      resolveCallTileAvatarUrl,
    }),
  );

  const echoSessionStore = useEchoSessionStore();
  const { myEventRsvps, upcomingEventsByServerId } =
    storeToRefs(echoSessionStore);
  const guildEventActivityCards = computed<GuildEventActivityCard[]>(() =>
    buildGuildEventActivityCardsFromMyRsvps({
      rsvps: myEventRsvps.value,
      getChannelDisplayName: deps.getChannelDisplayName,
    }),
  );

  return {
    serverActiveVoiceByServerId,
    guildVoiceActivityCards,
    guildEventActivityCards,
    myEventRsvps,
    upcomingEventsByServerId,
  };
}

/**
 * Members-column visibility/loading gates plus guild voice/event activity cards.
 */
export function useAppLayoutMembersAndActivity(
  deps: AppLayoutMembersActivityDeps,
) {
  return {
    ...createMembersColumnGates(deps),
    ...createGuildActivityCards(deps),
  };
}

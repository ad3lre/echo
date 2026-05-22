import { computed, onScopeDispose, ref, watch, type ComputedRef } from 'vue';
import type { useServerStore } from '@/stores/server';
import type { WorkspaceStateApi } from '@/composables/workspace/types';
import type { useAuthSessionStore } from '@/stores/authSession';
import {
  fetchEchoRoleUiBootstrap,
  postEchoAssignMemberRole,
  deleteEchoMemberRoleAssignment,
  type EchoServerRoleDto,
} from '@/api/echoClient';
import type { EchoRoleCategoryDto } from '@/api/echo/types';
import { isEchoGraphId } from '@/utils/echoIds';
import { pickEchoMemberListSectionRole } from '@/utils/memberProfiles';
import { useRolePreview } from '@/features/server-settings/composables/useRolePreview';
import { useThemeStore } from '@/stores/theme';
import type { Server } from '@shared/types/server';
import { scheduleDeferredTask } from '@/utils/scheduleDeferredTask';
import { canMutateEchoMemberRole } from '@/utils/echoMemberRoleMutateGate';

export function useEchoGuildRoleUi(deps: {
  serverStore: ReturnType<typeof useServerStore>;
  authSession: ReturnType<typeof useAuthSessionStore>;
  workspace: WorkspaceStateApi;
  currentUser: ComputedRef<{ id: string } | undefined>;
  selectedServer: ComputedRef<Server | undefined>;
}) {
  const {
    serverStore,
    authSession,
    workspace: _workspace,
    currentUser,
    selectedServer,
  } = deps;

  const echoRoleCatalog = ref<EchoServerRoleDto[]>([]);
  const echoRoleCategories = ref<EchoRoleCategoryDto[]>([]);
  const echoMemberRoleIdsByUser = ref<Record<string, string[]>>({});
  const echoCanManageRoles = ref(false);
  const echoCanAssignRoles = ref(false);
  const echoCanManageServer = ref(false);
  const echoCanCreateChannel = ref(false);
  const echoCanModerateMembers = ref(false);
  const echoCanKickMembers = ref(false);
  const echoCanBanMembers = ref(false);
  const echoCanTimeoutMembers = ref(false);
  const echoCanChangeNicknames = ref(false);
  const echoCanManageNicknames = ref(false);
  const echoCanManageMessages = ref(false);
  const echoCanCreateInvite = ref(false);
  const echoCanMuteVoiceMembers = ref(false);
  const echoCanDeafenVoiceMembers = ref(false);
  const echoCanMoveVoiceMembers = ref(false);
  /** When set, `echoCan*` flags below are for this server only (avoids showing another server's perms after switch). */
  const echoCapabilitiesForServerId = ref<string | null>(null);
  const echoRoleBootstrapServerId = ref<string | null>(null);
  const echoRoleBootstrapStatus = ref<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  );
  const echoRoleMutationBusy = ref(false);
  /**
   * Monotonic generation for in-flight bootstrap responses. A newer server switch
   * bumps this so stale fetches never apply state (and we never "skip" a refresh
   * by returning an old in-flight promise — that left the member list stuck on
   * "Loading role hierarchy..." until another switch).
   */
  let roleBootstrapGeneration = 0;
  let deferredRoleDataRefresh: ReturnType<typeof scheduleDeferredTask> | null =
    null;

  const { rolePreview, startRolePreview, clearRolePreview } = useRolePreview();
  const themeStore = useThemeStore();

  function resetEchoRoleDataState(): void {
    echoCapabilitiesForServerId.value = null;
    echoRoleCatalog.value = [];
    echoRoleCategories.value = [];
    echoMemberRoleIdsByUser.value = {};
    echoCanManageRoles.value = false;
    echoCanAssignRoles.value = false;
    echoCanManageServer.value = false;
    echoCanCreateChannel.value = false;
    echoCanModerateMembers.value = false;
    echoCanKickMembers.value = false;
    echoCanBanMembers.value = false;
    echoCanTimeoutMembers.value = false;
    echoCanChangeNicknames.value = false;
    echoCanManageNicknames.value = false;
    echoCanManageMessages.value = false;
    echoCanCreateInvite.value = false;
    echoCanMuteVoiceMembers.value = false;
    echoCanDeafenVoiceMembers.value = false;
    echoCanMoveVoiceMembers.value = false;
  }

  function beginEchoRoleBootstrap(serverId: string): void {
    echoRoleBootstrapServerId.value = serverId;
    echoRoleBootstrapStatus.value = 'loading';
  }

  function clearEchoRoleBootstrap(): void {
    echoRoleBootstrapServerId.value = null;
    echoRoleBootstrapStatus.value = 'idle';
  }

  async function runRefreshEchoRoleData() {
    const sid = serverStore.selectedServer?.id;
    const token = authSession.accessToken ?? '';
    if (
      !authSession.isAuthenticated ||
      !sid ||
      sid === 'echo' ||
      !isEchoGraphId(sid)
    ) {
      resetEchoRoleDataState();
      clearEchoRoleBootstrap();
      return;
    }

    const fetchSid = sid;
    const isServerSwitch = echoCapabilitiesForServerId.value !== fetchSid;
    if (isServerSwitch) {
      resetEchoRoleDataState();
    }
    beginEchoRoleBootstrap(fetchSid);
    const gen = ++roleBootstrapGeneration;
    try {
      const bundleRes = await fetchEchoRoleUiBootstrap(token, fetchSid);
      if (gen !== roleBootstrapGeneration) return;
      if (serverStore.selectedServerId !== fetchSid) return;
      const caps = bundleRes.capabilities;
      echoCanManageRoles.value = caps.canManageRoles;
      echoCanAssignRoles.value =
        caps.canAssignRoles ?? caps.canManageRoles;
      echoCanManageServer.value = caps.canManageServer;
      echoCanCreateChannel.value = caps.canCreateChannel;
      const bundle = caps.canModerateMembers ?? false;
      echoCanModerateMembers.value = bundle;
      echoCanKickMembers.value = caps.canKickMembers ?? bundle;
      echoCanBanMembers.value = caps.canBanMembers ?? bundle;
      echoCanTimeoutMembers.value = caps.canTimeoutMembers ?? bundle;
      echoCanChangeNicknames.value = caps.canChangeNicknames ?? false;
      echoCanManageNicknames.value = caps.canManageNicknames ?? false;
      echoCanManageMessages.value = caps.canManageMessages ?? false;
      echoCanCreateInvite.value = caps.canCreateInvite ?? false;
      echoCanMuteVoiceMembers.value = caps.canMuteVoiceMembers ?? false;
      echoCanDeafenVoiceMembers.value = caps.canDeafenVoiceMembers ?? false;
      echoCanMoveVoiceMembers.value = caps.canMoveVoiceMembers ?? false;
      echoRoleCatalog.value = bundleRes.roles;
      echoRoleCategories.value = bundleRes.roleCategories ?? [];
      echoMemberRoleIdsByUser.value = bundleRes.assignments;
      echoCapabilitiesForServerId.value = fetchSid;
      echoRoleBootstrapStatus.value = 'ready';
    } catch {
      if (gen !== roleBootstrapGeneration) return;
      echoRoleBootstrapStatus.value = 'error';
      if (isServerSwitch) {
        resetEchoRoleDataState();
      }
    }
  }

  function refreshEchoRoleData(): Promise<void> {
    return runRefreshEchoRoleData();
  }

  watch(
    () =>
      [
        serverStore.selectedServerId,
        authSession.isAuthenticated,
        authSession.accessToken,
      ] as const,
    ([selectedServerId, isAuthenticated]) => {
      deferredRoleDataRefresh?.cancel();
      deferredRoleDataRefresh = null;
      if (
        !isAuthenticated ||
        !selectedServerId ||
        selectedServerId === 'echo' ||
        !isEchoGraphId(selectedServerId)
      ) {
        resetEchoRoleDataState();
        clearEchoRoleBootstrap();
        return;
      }
      resetEchoRoleDataState();
      beginEchoRoleBootstrap(selectedServerId);
      deferredRoleDataRefresh = scheduleDeferredTask(
        () => {
          deferredRoleDataRefresh = null;
          void refreshEchoRoleData();
        },
        { timeoutMs: 150 },
      );
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    deferredRoleDataRefresh?.cancel();
  });

  const isRolePreviewActiveForServer = computed(() => {
    const sid = selectedServer.value?.id;
    const preview = rolePreview.value;
    return !!sid && !!preview && preview.serverId === sid;
  });

  const previewUiPermissionSet = computed(
    () => new Set(rolePreview.value?.uiPermissions ?? []),
  );

  function previewHasUiPermission(permission: string): boolean {
    if (!isRolePreviewActiveForServer.value) return false;
    const set = previewUiPermissionSet.value;
    return set.has('administrator') || set.has(permission);
  }

  function previewCanModerateMembers(): boolean {
    return (
      previewHasUiPermission('kickMembers') ||
      previewHasUiPermission('banMembers') ||
      previewHasUiPermission('timeoutMembers')
    );
  }

  watch(
    () => serverStore.selectedServerId,
    (sid) => {
      if (rolePreview.value && rolePreview.value.serverId !== sid) {
        clearRolePreview();
      }
    },
  );

  const memberListResolveHighestRole = computed(() => {
    const sid = serverStore.selectedServer?.id;
    const assignments = echoMemberRoleIdsByUser.value;
    const catalog = echoRoleCatalog.value;
    if (!sid || sid === 'echo') return undefined;
    if (!isEchoGraphId(sid) || echoCapabilitiesForServerId.value !== sid)
      return undefined;
    return (userId: string) =>
      pickEchoMemberListSectionRole(
        assignments[userId] ?? [],
        catalog,
        themeStore.canonicalTheme === 'light',
      );
  });

  const isEchoRoleBootstrapLoading = computed(() => {
    const sid = serverStore.selectedServer?.id;
    return (
      !!sid &&
      sid === echoRoleBootstrapServerId.value &&
      echoRoleBootstrapStatus.value === 'loading'
    );
  });

  const memberListRoleManagement = computed(() => {
    const busy = echoRoleMutationBusy.value;
    const assignmentsEcho = echoMemberRoleIdsByUser.value;
    const sid = serverStore.selectedServer?.id;
    const cur = currentUser.value?.id;
    if (!sid || sid === 'echo' || !cur) return undefined;
    if (
      isRolePreviewActiveForServer.value &&
      !previewHasUiPermission('manageRoles')
    )
      return undefined;
    if (
      !isEchoGraphId(sid) ||
      echoCapabilitiesForServerId.value !== sid ||
      !echoRoleCatalog.value.length ||
      !echoCanManageRoles.value
    ) {
      return undefined;
    }
    const ownerId = serverStore.selectedServer?.ownerId?.trim();
    const curId = cur.trim();
    return {
      enabled: true,
      assignableRoles: echoRoleCatalog.value.map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        darkColor: r.darkColor,
        lightColor: r.lightColor,
        separateThemeColors: r.separateThemeColors,
        roleIconUrl: r.roleIconUrl ?? null,
        roleIconEmojiId: r.roleIconEmojiId ?? null,
        isEveryone: r.isEveryone,
        position: r.position,
        roleCategoryId: r.roleCategoryId ?? null,
        roleScope: r.roleScope,
      })),
      roleCategories: echoRoleCategories.value,
      canMutateMemberRole: (
        targetUserId: string,
        roleId: string,
        assign: boolean,
      ) => {
        const tid = targetUserId.trim();
        return canMutateEchoMemberRole({
          assign,
          actorUserId: curId,
          targetUserId: tid,
          roleId,
          actorIsServerOwner: !!(ownerId && ownerId === curId),
          targetIsServerOwner: !!(ownerId && ownerId === tid),
          catalog: echoRoleCatalog.value.map((r) => ({
            id: r.id,
            position: r.position,
            rankInCategory: r.rankInCategory,
            roleCategoryId: r.roleCategoryId ?? null,
            roleScope: r.roleScope,
            isEveryone: r.isEveryone,
            permissions: r.permissions,
          })),
          assignments: assignmentsEcho,
        });
      },
      busy,
      resolveAssignedRoleIds: (userId: string) => assignmentsEcho[userId] ?? [],
      onToggleRole: async (p: {
        targetUserId: string;
        roleId: string;
        assign: boolean;
      }) => {
        const token = authSession.accessToken?.trim() ?? '';
        if (!authSession.isAuthenticated) return;
        echoRoleMutationBusy.value = true;
        try {
          if (p.assign)
            await postEchoAssignMemberRole(
              token,
              sid,
              p.targetUserId,
              p.roleId,
            );
          else
            await deleteEchoMemberRoleAssignment(
              token,
              sid,
              p.targetUserId,
              p.roleId,
            );
          const prev = echoMemberRoleIdsByUser.value[p.targetUserId] ?? [];
          const set = new Set(prev);
          if (p.assign) set.add(p.roleId);
          else set.delete(p.roleId);
          echoMemberRoleIdsByUser.value = {
            ...echoMemberRoleIdsByUser.value,
            [p.targetUserId]: Array.from(set),
          };
        } catch {
          await refreshEchoRoleData();
        } finally {
          echoRoleMutationBusy.value = false;
        }
      },
    };
  });

  const serverSettingsCanManageRoles = computed(() => {
    const sid = serverStore.selectedServer?.id;
    const uid = currentUser.value?.id;
    const ownerId = serverStore.selectedServer?.ownerId;
    if (!sid || sid === 'echo' || !uid) return true;
    if (isRolePreviewActiveForServer.value)
      return previewHasUiPermission('manageRoles');
    if (!isEchoGraphId(sid)) return true;
    if (ownerId && ownerId === uid) return true;
    return (
      echoCapabilitiesForServerId.value === sid && echoCanManageRoles.value
    );
  });

  const serverSettingsCanManageServer = computed(() => {
    const sid = serverStore.selectedServer?.id;
    const uid = currentUser.value?.id;
    const ownerId = serverStore.selectedServer?.ownerId;
    if (!sid || sid === 'echo' || !uid) return true;
    if (isRolePreviewActiveForServer.value)
      return previewHasUiPermission('manageServer');
    if (!isEchoGraphId(sid)) return true;
    if (ownerId && ownerId === uid) return true;
    return echoCanManageServer.value;
  });

  const canOpenServerSettings = computed(() => {
    const sid = serverStore.selectedServer?.id;
    const uid = currentUser.value?.id;
    const ownerId = serverStore.selectedServer?.ownerId;
    if (!sid || sid === 'echo' || !uid) return false;
    if (isRolePreviewActiveForServer.value) {
      return (
        previewHasUiPermission('manageRoles') ||
        previewHasUiPermission('manageServer')
      );
    }
    if (!isEchoGraphId(sid)) return true;
    if (ownerId && ownerId === uid) return true;
    return (
      echoCapabilitiesForServerId.value === sid &&
      (echoCanManageRoles.value || echoCanManageServer.value)
    );
  });

  function canOpenServerSettingsForServer(serverId: string): boolean {
    const uid = currentUser.value?.id;
    if (!serverId || serverId === 'echo' || !uid) return false;
    if (rolePreview.value?.serverId === serverId) {
      return (
        previewHasUiPermission('manageRoles') ||
        previewHasUiPermission('manageServer')
      );
    }
    const srv = serverStore.servers.find((s) => s.id === serverId);
    const ownerId = srv?.ownerId;
    if (!isEchoGraphId(serverId)) return true;
    if (ownerId && ownerId === uid) return true;
    if (serverStore.selectedServerId !== serverId) return true;
    return echoCanManageRoles.value || echoCanManageServer.value;
  }

  return {
    echoRoleCatalog,
    echoRoleCategories,
    echoMemberRoleIdsByUser,
    echoCanManageRoles,
    echoCanManageServer,
    echoCanCreateChannel,
    echoCanModerateMembers,
    echoCanKickMembers,
    echoCanBanMembers,
    echoCanTimeoutMembers,
    echoCanChangeNicknames,
    echoCanManageNicknames,
    echoCanManageMessages,
    echoCanCreateInvite,
    echoCanMuteVoiceMembers,
    echoCanDeafenVoiceMembers,
    echoCanMoveVoiceMembers,
    echoCapabilitiesForServerId,
    echoRoleBootstrapServerId,
    echoRoleBootstrapStatus,
    isEchoRoleBootstrapLoading,
    echoRoleMutationBusy,
    rolePreview,
    startRolePreview,
    clearRolePreview,
    refreshEchoRoleData,
    isRolePreviewActiveForServer,
    previewHasUiPermission,
    previewCanModerateMembers,
    memberListResolveHighestRole,
    memberListRoleManagement,
    serverSettingsCanManageRoles,
    serverSettingsCanManageServer,
    canOpenServerSettings,
    canOpenServerSettingsForServer,
  };
}

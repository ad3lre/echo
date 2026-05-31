import { computed, ref, watch, type ComputedRef } from 'vue';
import type { useAuthSessionStore } from '@/stores/authSession';
import type { WorkspaceStateApi } from '@/composables/workspace/types';
import {
  buildEchoChannelCategoriesForServer,
  deleteEchoChannel,
  postEchoServerCategory,
  patchEchoChannel,
  patchEchoServerCategory,
  patchEchoCategoryPermissionOverrides,
  fetchEchoChannelPermissionOverwriteRows,
  fetchEchoCategoryPermissionOverwriteRows,
  fetchEchoServerMembers,
  fetchEchoServerRoleList,
  deleteEchoServerCategory,
  putEchoCategoryPermissionOverwriteRows,
  putEchoChannelPermissionOverwriteRows,
} from '@/api/echoClient';
import { isEchoGraphId } from '@/utils/echoIds';
import { ensureChannelBucket } from '@/services/realtime/channelMessageAuthority';
import { channelOverridesToEchoPartial } from '@shared/rolePermissionBridge';
import { EchoApiError } from '@/api/echo/transport';
import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';
import { UIErrorBus } from '@/utils/uiErrorBus';
import type { CategorySettingsSnapshot } from '@/features/channel-settings/types';
import type {
  EchoPermissionEditorState,
  PermissionOverwriteRowDraft,
  PermissionOverwriteSubjectOption,
} from '@/features/channel-settings/types';
import type {
  ChannelPermissionsState,
  ChannelSummary,
  ForumCreatorDefaultPerms,
} from '@shared/types';
import type { CreateChannelModalSubmitPayload } from '@/components/CreateChannelModal.vue';
import { requestAppTwoChoice } from '@/utils/appDialogs';
import { getChannelMoveCrossCategoryPermission } from '@/features/channel-settings/composables/useChannelMoveCrossCategoryPreference';
import type { Server } from '@shared/types/server';
import type { ChannelCategory } from '@/composables/useChannels';
import type { EchoChannelPatch } from '@/api/echo/types';
import type { RailTab } from '@/features/layout/mainSurface';
import { getChannelDisplayName } from '@/assets/icons';
import { dispatchAppToastDetail } from '@/utils/controllerMissingAction';

const CHANNEL_STRUCTURE_ACTION_TOAST_MS = 2600;

function resolveChannelLabelForToast(
  categories: ChannelCategory[],
  channelId: string,
): string {
  for (const cat of categories) {
    const ch = cat.channels.find((c) => c.id === channelId);
    if (ch) return getChannelDisplayName(ch.name);
  }
  return 'channel';
}

function resolveCategoryLabelForToast(
  categories: ChannelCategory[],
  categoryId: string,
): string {
  const cat = categories.find((c) => c.id === categoryId);
  const name = cat?.name?.trim();
  return name ? name : 'category';
}

function findChannelPlacementInCategories(
  categories: ChannelCategory[],
  channelId: string,
): { channel: ChannelSummary; categoryId: string } | null {
  for (const cat of categories) {
    const ch = cat.channels.find((c) => c.id === channelId);
    if (ch) return { channel: ch, categoryId: cat.id };
  }
  return null;
}

function refreshCategorySettingsTargetAfterSave(
  serverId: string,
  categoryId: string,
  categories: ChannelCategory[],
  targetRef: { value: CategorySettingsSnapshot | null },
) {
  const t = targetRef.value;
  if (!t || t.categoryId !== categoryId) return;
  if (t.serverId != null && t.serverId !== serverId) return;
  const cat = categories.find((c) => c.id === categoryId);
  if (!cat) return;
  targetRef.value = {
    categoryId: cat.id,
    originalName: cat.name,
    name: cat.name,
    serverId: t.serverId ?? serverId,
    channelCount: cat.channels.length,
    textForumChannelCount: cat.channels.filter(
      (c) => c.type === 'text' || c.type === 'forum',
    ).length,
    channelPermissionDefaults: { ...(cat.channelPermissionDefaults ?? {}) },
    autoDeleteAfterSeconds: cat.autoDeleteAfterSeconds ?? null,
  };
}

function guildChannelModalFailure(
  flow: string,
  e: unknown,
  context: Record<string, unknown>,
  fallback: string,
) {
  reportPrimaryFlowFailure(flow, e, context, { showBanner: false });
  const code =
    e instanceof EchoApiError && typeof e.body.code === 'string'
      ? e.body.code
      : undefined;
  UIErrorBus.emit({
    context: flow,
    severity: 'warning',
    userMessage:
      e instanceof Error && e.message.trim() ? e.message.trim() : fallback,
    ...(code ? { code } : {}),
  });
}

export function useGuildChannelModals(deps: {
  authSession: ReturnType<typeof useAuthSessionStore>;
  workspace: WorkspaceStateApi;
  selectedServer: ComputedRef<Server | undefined>;
  categoriesForServer: ComputedRef<ChannelCategory[]>;
  activeChannelId: { value: string };
  activeRailTab: { value: RailTab };
  getFirstTextChannelId: (
    cats: { name: string; channels: { id: string; type: string }[] }[],
  ) => string;
  hydrateWorkspace: () => Promise<void>;
}) {
  const {
    authSession,
    workspace,
    selectedServer,
    categoriesForServer,
    activeChannelId,
    activeRailTab,
    getFirstTextChannelId,
    hydrateWorkspace,
  } = deps;

  const isCreateChannelModalOpen = ref(false);
  const createChannelInitialCategoryId = ref<string | null>(null);
  const isCreateCategoryModalOpen = ref(false);
  const channelSettingsTarget = ref<{
    serverId: string;
    channel: ChannelSummary;
    categoryId: string;
  } | null>(null);
  const categorySettingsTarget = ref<CategorySettingsSnapshot | null>(null);
  const channelSettingsEchoPermissionEditor =
    ref<EchoPermissionEditorState | null>(null);
  const categorySettingsEchoPermissionEditor =
    ref<EchoPermissionEditorState | null>(null);

  const createChannelCategoryNames = computed(() =>
    categoriesForServer.value.map((c) => c.name),
  );
  const createChannelCategoryOptions = computed(() =>
    categoriesForServer.value.map((c) => ({ id: c.id, label: c.name })),
  );

  async function loadEchoPermissionSubjects(
    token: string,
    serverId: string,
  ): Promise<{
    roles: PermissionOverwriteSubjectOption[];
    members: PermissionOverwriteSubjectOption[];
  }> {
    const [{ roles }, { members }] = await Promise.all([
      fetchEchoServerRoleList(token, serverId),
      fetchEchoServerMembers(token, serverId),
    ]);
    return {
      roles: roles
        .filter((role) => !role.isEveryone)
        .map((role) => ({
          id: role.id,
          label: role.name,
          color: role.color || undefined,
          subtitle: role.hoist ? 'Displayed separately' : undefined,
        })),
      members: members.map((member) => ({
        id: member.userId,
        label: member.name,
        avatarUrl: member.pfp || undefined,
      })),
    };
  }

  function openCreateChannelModal(categoryId: string | null) {
    createChannelInitialCategoryId.value = categoryId;
    isCreateChannelModalOpen.value = true;
  }

  function openCreateCategoryModal() {
    isCreateCategoryModalOpen.value = true;
  }

  async function handleCreateChannelSubmit(payload: {
    name: string;
    type: 'text' | 'voice' | 'forum' | 'stage' | 'paper';
    categoryId: string;
    iconKey: string;
  }) {
    const sid = selectedServer.value?.id;
    if (!sid || sid === 'echo') return;
    if (authSession.isAuthenticated && isEchoGraphId(sid)) {
      const id = await workspace.addChannelToCategory(sid, payload.categoryId, {
        name: payload.name,
        type: payload.type,
        iconKey: payload.iconKey,
      });
      if (!id) return;
      ensureChannelBucket(id);
      activeChannelId.value = id;
      return;
    }
    const id = await workspace.addChannelToCategory(sid, payload.categoryId, {
      name: payload.name,
      type: payload.type,
      iconKey: payload.iconKey,
    });
    if (!id) return;
    ensureChannelBucket(id);
    activeChannelId.value = id;
  }

  function handleCreateChannelModalSubmit(
    payload: CreateChannelModalSubmitPayload,
  ) {
    if (payload.kind === 'category') {
      void handleCreateCategorySubmit({ name: payload.name });
      return;
    }
    void handleCreateChannelSubmit({
      name: payload.name,
      type: payload.type,
      categoryId: payload.categoryId,
      iconKey: payload.iconKey,
    });
  }

  async function handleCreateCategorySubmit(payload: { name: string }) {
    const sid = selectedServer.value?.id;
    if (!sid || sid === 'echo') return;
    const token = authSession.accessToken?.trim() ?? '';
    if (authSession.isAuthenticated && isEchoGraphId(sid)) {
      try {
        await postEchoServerCategory(token, sid, { name: payload.name.trim() });
        const cats = await buildEchoChannelCategoriesForServer(token, sid);
        workspace.categoriesByServer.value = {
          ...workspace.categoriesByServer.value,
          [sid]: cats,
        };
      } catch (e) {
        guildChannelModalFailure(
          'postEchoServerCategory',
          e,
          { sid, payload },
          'Could not create the category. Try again.',
        );
      }
      return;
    }
    workspace.addCategoryToServer(sid, payload.name);
  }

  function openChannelSettings(payload: {
    channel: ChannelSummary;
    categoryId: string;
  }) {
    const sid = selectedServer.value?.id;
    if (!sid) return;
    channelSettingsTarget.value = { serverId: sid, ...payload };
    channelSettingsEchoPermissionEditor.value = null;
    const token = authSession.accessToken?.trim() ?? '';
    if (!sid || !authSession.isAuthenticated || !isEchoGraphId(sid)) return;
    channelSettingsEchoPermissionEditor.value = {
      loading: true,
      roles: [],
      members: [],
      rows: [],
    };
    void (async () => {
      try {
        const [subjects, overwriteRows] = await Promise.all([
          loadEchoPermissionSubjects(token, sid),
          fetchEchoChannelPermissionOverwriteRows(token, payload.channel.id),
        ]);
        if (channelSettingsTarget.value?.channel.id !== payload.channel.id)
          return;
        channelSettingsEchoPermissionEditor.value = {
          loading: false,
          roles: subjects.roles,
          members: subjects.members,
          rows: overwriteRows.rows,
        };
      } catch (e) {
        guildChannelModalFailure(
          'openChannelSettings',
          e,
          { sid, payload },
          'Could not load channel settings. Try again.',
        );
        if (channelSettingsTarget.value?.channel.id !== payload.channel.id)
          return;
        channelSettingsEchoPermissionEditor.value = {
          loading: false,
          roles: [],
          members: [],
          rows: [],
        };
      }
    })();
  }

  function onChannelSettingsModalOpenUpdate(open: boolean) {
    if (!open) {
      channelSettingsTarget.value = null;
      channelSettingsEchoPermissionEditor.value = null;
    }
  }

  function refreshChannelSettingsTargetAfterSave(
    serverId: string,
    channelId: string,
    categories: ChannelCategory[],
  ) {
    const t = channelSettingsTarget.value;
    if (!t || t.serverId !== serverId || t.channel.id !== channelId) return;
    const placed = findChannelPlacementInCategories(categories, channelId);
    if (!placed) return;
    channelSettingsTarget.value = {
      serverId,
      channel: placed.channel,
      categoryId: placed.categoryId,
    };
  }

  async function handleChannelReorder(payload: {
    channelId: string;
    targetCategoryId: string | null;
    siblingIndex: number;
  }) {
    const sid = selectedServer.value?.id;
    if (!sid || !isEchoGraphId(sid) || !authSession.isAuthenticated) return;
    const token = authSession.accessToken?.trim() ?? '';
    const { channelId, targetCategoryId, siblingIndex } = payload;

    let sourceCategoryApiId: string | null = null;
    for (const cat of categoriesForServer.value) {
      if (cat.channels.some((c) => c.id === channelId)) {
        sourceCategoryApiId = cat.hideCategoryHeader ? null : cat.id;
        break;
      }
    }

    const patch: EchoChannelPatch = { siblingIndex };
    if (sourceCategoryApiId !== targetCategoryId) {
      patch.categoryId = targetCategoryId;
    }
    if (sourceCategoryApiId !== null && targetCategoryId === null) {
      patch.moveOutOfCategoryPermission = 'keep';
    } else if (
      sourceCategoryApiId !== null &&
      targetCategoryId !== null &&
      sourceCategoryApiId !== targetCategoryId
    ) {
      let mode = getChannelMoveCrossCategoryPermission();
      if (mode === 'ask') {
        const picked = await requestAppTwoChoice({
          title: 'Move channel to another category',
          message:
            'This channel has custom permissions. Keep them, or match the new category?',
          primaryLabel: 'Keep channel permissions',
          secondaryLabel: 'Match new category',
          dismissLabel: 'Cancel',
        });
        if (picked === null) return;
        mode = picked === 'primary' ? 'keep' : 'sync';
      }
      patch.moveOutOfCategoryPermission = mode;
    }

    try {
      await patchEchoChannel(token, channelId, patch);
      const cats = await buildEchoChannelCategoriesForServer(token, sid);
      workspace.categoriesByServer.value = {
        ...workspace.categoriesByServer.value,
        [sid]: cats,
      };
    } catch (e) {
      guildChannelModalFailure(
        'handleChannelReorder',
        e,
        { sid, channelId, payload },
        'Could not reorder channel. Try again.',
      );
    }
  }

  async function handleCategoryReorder(payload: {
    categoryId: string;
    siblingIndex: number;
  }) {
    const sid = selectedServer.value?.id;
    if (!sid || !isEchoGraphId(sid) || !authSession.isAuthenticated) return;
    const token = authSession.accessToken?.trim() ?? '';
    const { categoryId, siblingIndex } = payload;

    try {
      await patchEchoServerCategory(token, sid, categoryId, { siblingIndex });
      const cats = await buildEchoChannelCategoriesForServer(token, sid);
      workspace.categoriesByServer.value = {
        ...workspace.categoriesByServer.value,
        [sid]: cats,
      };
    } catch (e) {
      guildChannelModalFailure(
        'handleCategoryReorder',
        e,
        { sid, categoryId, payload },
        'Could not reorder category. Try again.',
      );
    }
  }

  async function handleChannelSettingsSave(payload: {
    channelId: string;
    channelType: 'text' | 'voice' | 'forum' | 'stage' | 'paper';
    serverId: string;
    name: string;
    categoryId: string;
    iconKey: string;
    slowModeSeconds: number;
    userLimit: number;
    nsfw: boolean;
    messageHistoryAnchor: 'top' | 'bottom';
    bitrateBps?: number | null;
    voiceE2eeEnabled?: boolean;
    channelPermissions: ChannelPermissionsState;
    echoPermissionRows?: PermissionOverwriteRowDraft[];
    forumCreatorDefaultPerms?: ForumCreatorDefaultPerms;
    autoDeleteAfterSeconds?: number | null;
    autoDeleteSyncedToCategory?: boolean;
    messageFormatTemplate?: string;
    messageFormatHard?: boolean;
    paperCommentsEnabled?: boolean;
    paperShowAuthorGutter?: boolean;
  }) {
    const sid = payload.serverId;
    if (!sid) return;
    if (isEchoGraphId(sid) && authSession.isAuthenticated) {
      const token = authSession.accessToken?.trim() ?? '';
      const chId = payload.channelId;
      try {
        await patchEchoChannel(token, chId, {
          name: payload.name.trim(),
          categoryId: payload.categoryId,
          slowmodeSeconds: payload.slowModeSeconds,
          userLimit: payload.userLimit,
          nsfw: payload.nsfw,
          iconKey: payload.iconKey,
          ...(payload.channelType === 'text'
            ? {
                messageHistoryAnchor: payload.messageHistoryAnchor,
              }
            : {}),
          ...(payload.channelType === 'voice'
            ? { bitrateBps: payload.bitrateBps }
            : {}),
          ...(payload.channelType === 'voice' || payload.channelType === 'stage'
            ? { voiceE2eeEnabled: payload.voiceE2eeEnabled === true }
            : {}),
          ...(payload.channelType === 'forum' &&
          payload.forumCreatorDefaultPerms
            ? { forumCreatorDefaultPerms: payload.forumCreatorDefaultPerms }
            : {}),
          ...(payload.channelType === 'paper'
            ? {
                paperCommentsEnabled: payload.paperCommentsEnabled !== false,
                paperShowAuthorGutter: payload.paperShowAuthorGutter !== false,
              }
            : {}),
          ...(payload.channelType === 'text' || payload.channelType === 'forum'
            ? {
                autoDeleteSyncedToCategory:
                  payload.autoDeleteSyncedToCategory !== false,
                ...(payload.autoDeleteSyncedToCategory === false &&
                payload.autoDeleteAfterSeconds !== undefined
                  ? {
                      autoDeleteAfterSeconds: payload.autoDeleteAfterSeconds,
                    }
                  : {}),
                messageFormatTemplate:
                  payload.messageFormatTemplate !== undefined
                    ? payload.messageFormatTemplate
                    : '',
                messageFormatHard:
                  (payload.messageFormatTemplate ?? '').trim().length > 0 &&
                  payload.messageFormatHard === true,
              }
            : {}),
        });
        if (payload.echoPermissionRows !== undefined) {
          await putEchoChannelPermissionOverwriteRows(
            token,
            chId,
            payload.echoPermissionRows,
          );
        }
        const cats = await buildEchoChannelCategoriesForServer(token, sid);
        workspace.categoriesByServer.value = {
          ...workspace.categoriesByServer.value,
          [sid]: cats,
        };
        refreshChannelSettingsTargetAfterSave(sid, chId, cats);
        if (channelSettingsEchoPermissionEditor.value) {
          try {
            const overwriteRows = await fetchEchoChannelPermissionOverwriteRows(
              token,
              chId,
            );
            if (channelSettingsTarget.value?.channel.id === chId) {
              channelSettingsEchoPermissionEditor.value = {
                ...channelSettingsEchoPermissionEditor.value,
                rows: overwriteRows.rows,
              };
            }
          } catch (permErr) {
            guildChannelModalFailure(
              'handleChannelSettingsSave.permissionRefresh',
              permErr,
              { sid, chId },
              'Saved channel settings, but could not refresh permissions list.',
            );
          }
        }
      } catch (e) {
        guildChannelModalFailure(
          'handleChannelSettingsSave',
          e,
          { sid, chId },
          'Could not save channel settings. Try again.',
        );
      }
      return;
    }
    if (sid === 'echo') return;
    workspace.updateChannel(sid, payload.channelId, {
      name: payload.name,
      categoryId: payload.categoryId,
      iconKey: payload.iconKey,
      slowModeSeconds: payload.slowModeSeconds,
      userLimit: payload.userLimit,
      nsfw: payload.nsfw,
      messageHistoryAnchor:
        payload.channelType === 'text'
          ? payload.messageHistoryAnchor
          : undefined,
      bitrateBps: payload.bitrateBps,
      ...(payload.channelType === 'voice' || payload.channelType === 'stage'
        ? { voiceE2eeEnabled: payload.voiceE2eeEnabled === true }
        : {}),
      channelPermissions: payload.channelPermissions,
      ...(payload.channelType === 'forum' && payload.forumCreatorDefaultPerms
        ? { forumCreatorDefaultPerms: payload.forumCreatorDefaultPerms }
        : {}),
      ...(payload.channelType === 'text' || payload.channelType === 'forum'
        ? {
            messageFormatTemplate: payload.messageFormatTemplate,
            messageFormatHard:
              (payload.messageFormatTemplate ?? '').trim().length > 0 &&
              payload.messageFormatHard === true,
          }
        : {}),
    });
    const cats = categoriesForServer.value;
    if (cats) {
      refreshChannelSettingsTargetAfterSave(sid, payload.channelId, cats);
    }
  }

  const channelSettingsCategoryPermissionDefaults = computed(() => {
    const t = channelSettingsTarget.value;
    if (!t) return null;
    const cat = categoriesForServer.value.find((c) => c.id === t.categoryId);
    return cat?.channelPermissionDefaults ?? null;
  });

  const channelSettingsCategoryAutoDeleteAfterSeconds = computed(() => {
    const t = channelSettingsTarget.value;
    if (!t) return null;
    const cat = categoriesForServer.value.find((c) => c.id === t.categoryId);
    return cat?.autoDeleteAfterSeconds ?? null;
  });

  function openCategorySettings(categoryId: string) {
    const cat = categoriesForServer.value.find((c) => c.id === categoryId);
    if (!cat) return;
    const sid = selectedServer.value?.id;
    categorySettingsTarget.value = {
      categoryId: cat.id,
      originalName: cat.name,
      name: cat.name,
      serverId: sid,
      channelCount: cat.channels.length,
      textForumChannelCount: cat.channels.filter(
        (c) => c.type === 'text' || c.type === 'forum',
      ).length,
      channelPermissionDefaults: { ...(cat.channelPermissionDefaults ?? {}) },
      autoDeleteAfterSeconds: cat.autoDeleteAfterSeconds ?? null,
    };
    categorySettingsEchoPermissionEditor.value = null;
    const token = authSession.accessToken?.trim() ?? '';
    if (!sid || !authSession.isAuthenticated || !isEchoGraphId(sid)) return;
    categorySettingsEchoPermissionEditor.value = {
      loading: true,
      roles: [],
      members: [],
      rows: [],
    };
    void (async () => {
      try {
        const [subjects, overwriteRows] = await Promise.all([
          loadEchoPermissionSubjects(token, sid),
          fetchEchoCategoryPermissionOverwriteRows(token, sid, categoryId),
        ]);
        if (categorySettingsTarget.value?.categoryId !== categoryId) return;
        categorySettingsEchoPermissionEditor.value = {
          loading: false,
          roles: subjects.roles,
          members: subjects.members,
          rows: overwriteRows.rows,
        };
      } catch (e) {
        guildChannelModalFailure(
          'openCategorySettings',
          e,
          { sid, categoryId },
          'Could not load category settings. Try again.',
        );
        if (categorySettingsTarget.value?.categoryId !== categoryId) return;
        categorySettingsEchoPermissionEditor.value = {
          loading: false,
          roles: [],
          members: [],
          rows: [],
        };
      }
    })();
  }

  function onCategorySettingsModalOpenUpdate(open: boolean) {
    if (!open) {
      categorySettingsTarget.value = null;
      categorySettingsEchoPermissionEditor.value = null;
    }
  }

  async function handleCategorySettingsSave(payload: CategorySettingsSnapshot) {
    const sid = selectedServer.value?.id;
    if (!sid || sid === 'echo') return;
    const token = authSession.accessToken?.trim() ?? '';
    if (authSession.isAuthenticated && isEchoGraphId(sid)) {
      try {
        const categoryPatch: {
          name?: string;
          autoDeleteAfterSeconds?: number | null;
        } = {};
        if (payload.name.trim() && payload.name !== payload.originalName) {
          categoryPatch.name = payload.name.trim();
        }
        if (payload.autoDeleteAfterSeconds !== undefined) {
          categoryPatch.autoDeleteAfterSeconds = payload.autoDeleteAfterSeconds;
        }
        if (Object.keys(categoryPatch).length > 0) {
          await patchEchoServerCategory(
            token,
            sid,
            payload.categoryId,
            categoryPatch,
          );
        }
        if (payload.echoPermissionRows !== undefined) {
          await putEchoCategoryPermissionOverwriteRows(
            token,
            sid,
            payload.categoryId,
            payload.echoPermissionRows,
          );
        } else if (!categorySettingsEchoPermissionEditor.value) {
          const echoPartial = channelOverridesToEchoPartial(
            payload.channelPermissionDefaults,
          );
          await patchEchoCategoryPermissionOverrides(
            token,
            sid,
            payload.categoryId,
            Object.keys(echoPartial).length === 0 ? null : echoPartial,
          );
        }
        const cats = await buildEchoChannelCategoriesForServer(token, sid);
        workspace.categoriesByServer.value = {
          ...workspace.categoriesByServer.value,
          [sid]: cats,
        };
        refreshCategorySettingsTargetAfterSave(
          sid,
          payload.categoryId,
          cats,
          categorySettingsTarget,
        );
        if (categorySettingsEchoPermissionEditor.value) {
          try {
            const overwriteRows =
              await fetchEchoCategoryPermissionOverwriteRows(
                token,
                sid,
                payload.categoryId,
              );
            if (
              categorySettingsTarget.value?.categoryId === payload.categoryId
            ) {
              categorySettingsEchoPermissionEditor.value = {
                ...categorySettingsEchoPermissionEditor.value,
                rows: overwriteRows.rows,
              };
            }
          } catch (permErr) {
            guildChannelModalFailure(
              'handleCategorySettingsSave.permissionRefresh',
              permErr,
              { sid, categoryId: payload.categoryId },
              'Saved category settings, but could not refresh permissions list.',
            );
          }
        }
      } catch (e) {
        guildChannelModalFailure(
          'handleCategorySettingsSave',
          e,
          { sid, categoryId: payload.categoryId },
          'Could not save category settings. Try again.',
        );
      }
      return;
    }
    workspace.updateCategory(sid, payload.categoryId, {
      newName: payload.name !== payload.originalName ? payload.name : undefined,
      channelPermissionDefaults: payload.channelPermissionDefaults,
    });
    const catsAfterLocal = categoriesForServer.value;
    if (catsAfterLocal) {
      refreshCategorySettingsTargetAfterSave(
        sid,
        payload.categoryId,
        catsAfterLocal,
        categorySettingsTarget,
      );
    }
  }

  async function deleteChannelById(channelId: string): Promise<boolean> {
    const sid = selectedServer.value?.id;
    if (!sid || sid === 'echo') return false;
    const channelLabel = resolveChannelLabelForToast(
      categoriesForServer.value,
      channelId,
    );
    const token = authSession.accessToken?.trim() ?? '';
    if (authSession.isAuthenticated && isEchoGraphId(sid)) {
      try {
        await deleteEchoChannel(token || null, channelId);
        await hydrateWorkspace();
      } catch (e) {
        guildChannelModalFailure(
          'deleteChannelById',
          e,
          { sid, channelId },
          'Could not delete this channel. Try again.',
        );
        return false;
      }
    } else {
      workspace.deleteChannel(sid, channelId);
    }
    if (activeChannelId.value === channelId) {
      const first = getFirstTextChannelId(categoriesForServer.value);
      activeChannelId.value = first || '';
    }
    dispatchAppToastDetail({
      message: `Deleted channel “${channelLabel}”.`,
      durationMs: CHANNEL_STRUCTURE_ACTION_TOAST_MS,
    });
    return true;
  }

  async function handleChannelDelete() {
    const target = channelSettingsTarget.value;
    if (!target) return;
    const id = target.channel.id;
    const ok = await deleteChannelById(id);
    if (ok) channelSettingsTarget.value = null;
  }

  async function deleteCategoryById(categoryId: string): Promise<boolean> {
    const sid = selectedServer.value?.id;
    if (!sid || sid === 'echo') return false;
    const categoryLabel = resolveCategoryLabelForToast(
      categoriesForServer.value,
      categoryId,
    );
    const token = authSession.accessToken?.trim() ?? '';
    if (authSession.isAuthenticated && isEchoGraphId(sid)) {
      try {
        await deleteEchoServerCategory(token, sid, categoryId);
        const cats = await buildEchoChannelCategoriesForServer(token, sid);
        workspace.categoriesByServer.value = {
          ...workspace.categoriesByServer.value,
          [sid]: cats,
        };
      } catch (e) {
        guildChannelModalFailure(
          'deleteCategoryById',
          e,
          { sid, categoryId },
          'Could not delete this category. Try again.',
        );
        return false;
      }
    } else {
      workspace.deleteCategory(sid, categoryId);
    }
    const cats = categoriesForServer.value;
    const stillExists = cats.some((c) =>
      c.channels.some((ch) => ch.id === activeChannelId.value),
    );
    if (!stillExists) {
      const first = getFirstTextChannelId(cats);
      activeChannelId.value = first || '';
    }
    dispatchAppToastDetail({
      message: `Deleted category “${categoryLabel}”.`,
      durationMs: CHANNEL_STRUCTURE_ACTION_TOAST_MS,
    });
    return true;
  }

  async function handleCategoryDelete() {
    const target = categorySettingsTarget.value;
    if (!target) return;
    const id = target.categoryId;
    const ok = await deleteCategoryById(id);
    if (ok) categorySettingsTarget.value = null;
  }

  function closeGuildChannelModalsForNavigation() {
    if (
      isCreateChannelModalOpen.value ||
      isCreateCategoryModalOpen.value ||
      channelSettingsTarget.value ||
      categorySettingsTarget.value
    ) {
      isCreateChannelModalOpen.value = false;
      isCreateCategoryModalOpen.value = false;
      createChannelInitialCategoryId.value = null;
      onChannelSettingsModalOpenUpdate(false);
      onCategorySettingsModalOpenUpdate(false);
    }
  }

  watch(
    () => selectedServer.value?.id ?? null,
    (next, prev) => {
      if (prev == null && next == null) return;
      if (next === prev) return;
      closeGuildChannelModalsForNavigation();
    },
  );

  watch(
    () => activeChannelId.value,
    (next, prev) => {
      if (!prev || next === prev) return;
      const openChannelSettings = channelSettingsTarget.value;
      if (
        openChannelSettings &&
        openChannelSettings.channel.id !== next.trim()
      ) {
        onChannelSettingsModalOpenUpdate(false);
      }
      if (
        isCreateChannelModalOpen.value ||
        isCreateCategoryModalOpen.value ||
        categorySettingsTarget.value
      ) {
        closeGuildChannelModalsForNavigation();
      }
    },
  );

  watch(
    () => activeRailTab.value,
    (next, prev) => {
      if (next === prev) return;
      closeGuildChannelModalsForNavigation();
    },
  );

  return {
    isCreateChannelModalOpen,
    createChannelInitialCategoryId,
    isCreateCategoryModalOpen,
    channelSettingsTarget,
    categorySettingsTarget,
    channelSettingsEchoPermissionEditor,
    categorySettingsEchoPermissionEditor,
    createChannelCategoryNames,
    createChannelCategoryOptions,
    openCreateChannelModal,
    openCreateCategoryModal,
    handleCreateChannelModalSubmit,
    handleCreateChannelSubmit,
    handleCreateCategorySubmit,
    openChannelSettings,
    onChannelSettingsModalOpenUpdate,
    handleChannelSettingsSave,
    channelSettingsCategoryPermissionDefaults,
    channelSettingsCategoryAutoDeleteAfterSeconds,
    openCategorySettings,
    onCategorySettingsModalOpenUpdate,
    handleCategorySettingsSave,
    handleChannelDelete,
    handleChannelReorder,
    handleCategoryReorder,
    handleCategoryDelete,
    deleteChannelById,
    deleteCategoryById,
  };
}

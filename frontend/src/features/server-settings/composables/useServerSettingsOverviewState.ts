import { computed, reactive, ref, type Ref } from 'vue';
import { useServerStore } from '@/stores/server';
import { isEchoGraphId } from '@/utils/echoIds';
import {
  mergeServerListsForVanity,
  suggestServerVanityCode,
} from '@/utils/serverVanitySlug';
import { DEFAULT_DESCRIPTIONS } from '@/features/server-settings/overview';
import { useServerBrandingUploads } from '@/features/server-settings/composables/useServerBrandingUploads';
import { createServerSettingsService } from '@/services/orchestration/serverSettings';
import {
  normalizeVanity,
  normalizeServerTags,
  validateServerName,
  validateServerDescription,
} from '@/services/domain/serverSettings';
import { extractUploadErrorMessage } from '@/services/domain/brandingUploads';
import { dispatchAppToast } from '@/utils/controllerMissingAction';

const MAX_SERVER_NAME_LEN = 100;
const MAX_SERVER_DESCRIPTION_LEN = 400;

export type OverviewServer = {
  id: string;
  name: string;
  imageUrl: string;
  bannerImageUrl?: string;
  listedInDirectory?: boolean;
  inviteJoinEnabled?: boolean;
  bannerBlurEnabled?: boolean;
  bannerBlackoutEnabled?: boolean;
  automodSpamEnabled?: boolean;
  raidProtectionEnabled?: boolean;
  raidJoinThresholdCount?: number;
  raidJoinWindowSeconds?: number;
  vanityCode?: string;
  description?: string;
  tags?: string[];
  allowGlobalGuests?: boolean;
} | null;

export type UseServerSettingsOverviewStateOptions = {
  server: Ref<OverviewServer>;
  canManageServer: Ref<boolean | undefined>;
  accessToken: Ref<string | null | undefined>;
  workspace: {
    servers: Ref<unknown[]>;
    refreshExploreDirectory: () => Promise<void>;
  };
};

export function useServerSettingsOverviewState(
  opts: UseServerSettingsOverviewStateOptions,
) {
  const serverStore = useServerStore();

  const form = reactive({
    name: '',
    description: '',
    vanityCode: '',
    tags: [] as string[],
    verificationRequireEmail: true,
    verificationRequirePhone: false,
    verificationRequire2FA: false,
    verificationRequireMatureAccount: false,
    allowGlobalGuests: true,
    defaultNotifications: 'Mentions only',
    uploadLimit: '100 MB',
    afkTimeout: '1 hour',
    welcomeScreenEnabled: true,
    communityEnabled: true,
    discoveryEnabled: false,
    automodSpamEnabled: true,
    explicitMediaFilterEnabled: true,
    raidProtectionEnabled: true,
    raidJoinThresholdCount: 10,
    raidJoinWindowSeconds: 60,
    mentionsRequireRole: false,
  });

  const bannerPreviewUrl = ref<string>('');
  const bannerUploadUrl = computed(() => bannerPreviewUrl.value);
  const serverBannerUrl = computed(
    () =>
      bannerUploadUrl.value ||
      opts.server.value?.bannerImageUrl ||
      opts.server.value?.imageUrl ||
      '',
  );

  const bannerBlurEnabled = ref(false);
  const bannerBlackoutEnabled = ref(false);
  const listedInDirectoryEnabled = ref(true);
  const inviteJoinEnabled = ref(true);
  const bannerPositionY = ref(50);

  const serverSettingsService = createServerSettingsService();

  function onBannerBlurEnabledChange(v: boolean) {
    bannerBlurEnabled.value = v;
    const sid = opts.server.value?.id;
    if (sid) {
      serverStore.updateServerBannerBlurEnabled(sid, v);
      const token = opts.accessToken.value;
      void (async () => {
        try {
          await serverSettingsService.persistPreferences({
            token,
            serverId: sid,
            patch: { bannerBlurEnabled: v },
            serverStore,
            workspaceServers: opts.workspace.servers,
            refreshExploreDirectory: opts.workspace.refreshExploreDirectory,
          });
        } catch {
          serverStore.updateServerBannerBlurEnabled(sid, !v);
          bannerBlurEnabled.value = !v;
        }
      })();
    }
  }

  function onBannerBlackoutEnabledChange(v: boolean) {
    bannerBlackoutEnabled.value = v;
    const sid = opts.server.value?.id;
    if (sid) {
      serverStore.updateServerBannerBlackoutEnabled(sid, v);
      const token = opts.accessToken.value;
      void (async () => {
        try {
          await serverSettingsService.persistPreferences({
            token,
            serverId: sid,
            patch: { bannerBlackoutEnabled: v },
            serverStore,
            workspaceServers: opts.workspace.servers,
            refreshExploreDirectory: opts.workspace.refreshExploreDirectory,
          });
        } catch {
          serverStore.updateServerBannerBlackoutEnabled(sid, !v);
          bannerBlackoutEnabled.value = !v;
        }
      })();
    }
  }

  function onServerAccessModeChange(
    mode: 'public' | 'invite_only' | 'private',
  ) {
    const listed = mode === 'public';
    const invites = mode !== 'private';
    listedInDirectoryEnabled.value = listed;
    inviteJoinEnabled.value = invites;
    form.discoveryEnabled = listed;
    const sid = opts.server.value?.id;
    if (!sid) return;
    if (!isEchoGraphId(sid)) {
      serverSettingsService.syncServerLists({
        serverId: sid,
        patch: { listedInDirectory: listed, inviteJoinEnabled: invites },
        serverStore,
        workspaceServers: opts.workspace.servers,
      });
      return;
    }
    const token = opts.accessToken.value;
    void (async () => {
      try {
        await serverSettingsService.persistPreferences({
          token,
          serverId: sid,
          patch: { listedInDirectory: listed, inviteJoinEnabled: invites },
          serverStore,
          workspaceServers: opts.workspace.servers,
          refreshExploreDirectory: opts.workspace.refreshExploreDirectory,
        });
      } catch {
        syncFormFieldsFromServer();
      }
    })();
  }

  const iconPreviewUrl = ref<string>('');
  const serverIconUrl = computed(
    () => iconPreviewUrl.value || opts.server.value?.imageUrl || '',
  );

  const { onServerBannerFileChange, onServerIconFileChange } =
    useServerBrandingUploads({
      serverId: computed(() => opts.server.value?.id),
      bannerPreviewUrl,
      iconPreviewUrl,
      updateServerBannerImageUrl: (id, url) => {
        if (!isEchoGraphId(id)) {
          serverStore.updateServerBannerImageUrl(id, url);
          return;
        }
        const prevBanner =
          serverStore.servers.find((s) => s.id === id)?.bannerImageUrl ?? '';
        serverStore.updateServerBannerImageUrl(id, url);
        void serverSettingsService
          .persistBranding({
            token: opts.accessToken.value,
            serverId: id,
            patch: { bannerUrl: url },
            refreshExploreDirectory: opts.workspace.refreshExploreDirectory,
          })
          .catch((e) => {
            serverStore.updateServerBannerImageUrl(id, prevBanner);
            bannerPreviewUrl.value = '';
            const detail = extractUploadErrorMessage(e);
            dispatchAppToast(
              detail
                ? `Could not save server banner: ${detail}`
                : 'Could not save server banner.',
              'warning',
            );
          });
      },
      updateServerImageUrl: (id, url) => {
        if (!isEchoGraphId(id)) {
          serverStore.updateServerImageUrl(id, url);
          return;
        }
        const prevIcon =
          serverStore.servers.find((s) => s.id === id)?.imageUrl ?? '';
        serverStore.updateServerImageUrl(id, url);
        void serverSettingsService
          .persistBranding({
            token: opts.accessToken.value,
            serverId: id,
            patch: { iconUrl: url },
            refreshExploreDirectory: opts.workspace.refreshExploreDirectory,
          })
          .catch((e) => {
            serverStore.updateServerImageUrl(id, prevIcon);
            iconPreviewUrl.value = '';
            const detail = extractUploadErrorMessage(e);
            dispatchAppToast(
              detail
                ? `Could not save server icon: ${detail}`
                : 'Could not save server icon.',
              'warning',
            );
          });
      },
    });

  function resetBannerPreviewsAndToggles() {
    bannerPreviewUrl.value = '';
    iconPreviewUrl.value = '';
    if (opts.server.value) {
      bannerBlurEnabled.value = opts.server.value.bannerBlurEnabled ?? false;
      bannerBlackoutEnabled.value =
        opts.server.value.bannerBlackoutEnabled ?? false;
      const y = (opts.server.value as { bannerPositionY?: unknown })
        .bannerPositionY;
      bannerPositionY.value =
        typeof y === 'number' && Number.isFinite(y)
          ? Math.max(0, Math.min(100, y))
          : 50;
    }
  }

  function syncFormFieldsFromServer() {
    const s = opts.server.value;
    form.name = s?.name ?? 'Echo Server';
    if (s && isEchoGraphId(s.id)) {
      form.description = s.description ?? '';
    } else {
      form.description =
        DEFAULT_DESCRIPTIONS[s?.id ?? ''] ??
        'A polished Echo community with active chats, voice rooms, and room to grow.';
    }
    if (s) {
      const saved = s.vanityCode?.trim();
      form.vanityCode = saved ?? '';
      form.tags = normalizeServerTags(s.tags);
      listedInDirectoryEnabled.value = s.listedInDirectory !== false;
      inviteJoinEnabled.value = s.inviteJoinEnabled !== false;
      form.discoveryEnabled = listedInDirectoryEnabled.value;
      form.automodSpamEnabled = s.automodSpamEnabled ?? true;
      form.raidProtectionEnabled = s.raidProtectionEnabled ?? true;
      form.raidJoinThresholdCount = Math.max(2, s.raidJoinThresholdCount ?? 10);
      form.raidJoinWindowSeconds = Math.max(10, s.raidJoinWindowSeconds ?? 60);
      form.allowGlobalGuests = s.allowGlobalGuests !== false;
      const y = (s as { bannerPositionY?: unknown }).bannerPositionY;
      bannerPositionY.value =
        typeof y === 'number' && Number.isFinite(y)
          ? Math.max(0, Math.min(100, y))
          : 50;
    } else {
      form.vanityCode = 'echo';
      form.tags = [];
      listedInDirectoryEnabled.value = true;
      inviteJoinEnabled.value = true;
      form.discoveryEnabled = true;
      form.automodSpamEnabled = true;
      form.raidProtectionEnabled = true;
      form.raidJoinThresholdCount = 10;
      form.raidJoinWindowSeconds = 60;
      form.allowGlobalGuests = true;
      bannerPositionY.value = 50;
    }
  }

  async function removeServerBanner(): Promise<void> {
    const sid = opts.server.value?.id;
    const token = opts.accessToken.value;
    if (!opts.canManageServer.value || !sid) return;
    bannerPreviewUrl.value = '';
    if (!isEchoGraphId(sid)) {
      serverStore.updateServerBannerImageUrl(sid, '');
      return;
    }
    try {
      await serverSettingsService.persistPreferences({
        token,
        serverId: sid,
        patch: { bannerUrl: '' },
        serverStore,
        workspaceServers: opts.workspace.servers,
        refreshExploreDirectory: opts.workspace.refreshExploreDirectory,
      });
    } catch {
      syncFormFieldsFromServer();
    }
  }

  async function persistBannerPositionY(nextY: number): Promise<void> {
    const sid = opts.server.value?.id;
    const token = opts.accessToken.value;
    if (!opts.canManageServer.value || !sid) return;
    const y = Number(nextY);
    const clamped = Number.isFinite(y) ? Math.max(0, Math.min(100, y)) : 50;
    bannerPositionY.value = clamped;
    serverStore.updateServerBannerPositionY(sid, clamped);
    if (!isEchoGraphId(sid)) return;
    try {
      await serverSettingsService.persistPreferences({
        token,
        serverId: sid,
        patch: { bannerPositionY: clamped },
        serverStore,
        workspaceServers: opts.workspace.servers,
        refreshExploreDirectory: opts.workspace.refreshExploreDirectory,
      });
    } catch {
      // fallback: restore from the latest server row
      const y2 = (opts.server.value as { bannerPositionY?: unknown })
        .bannerPositionY;
      const restore =
        typeof y2 === 'number' && Number.isFinite(y2)
          ? Math.max(0, Math.min(100, y2))
          : 50;
      bannerPositionY.value = restore;
      serverStore.updateServerBannerPositionY(sid, restore);
    }
  }

  async function persistAllowGlobalGuestsSetting(next: boolean): Promise<void> {
    const sid = opts.server.value?.id;
    const token = opts.accessToken.value;
    if (!opts.canManageServer.value || !sid || !isEchoGraphId(sid)) return;
    await serverSettingsService.persistPreferences({
      token,
      serverId: sid,
      patch: { allowGlobalGuests: next },
      serverStore,
      workspaceServers: opts.workspace.servers,
      refreshExploreDirectory: opts.workspace.refreshExploreDirectory,
    });
  }

  async function persistModerationSettings(patch: {
    automodSpamEnabled?: boolean;
    raidProtectionEnabled?: boolean;
    raidJoinThresholdCount?: number;
    raidJoinWindowSeconds?: number;
  }) {
    const sid = opts.server.value?.id;
    const token = opts.accessToken.value;
    if (!opts.canManageServer.value || !sid || !isEchoGraphId(sid)) return;
    await serverSettingsService.persistPreferences({
      token,
      serverId: sid,
      patch,
      serverStore,
      workspaceServers: opts.workspace.servers,
      refreshExploreDirectory: opts.workspace.refreshExploreDirectory,
    });
  }

  async function onOverviewVanityBlur() {
    const sid = opts.server.value?.id;
    const token = opts.accessToken.value;
    if (!opts.canManageServer.value || !sid) return;
    const raw = form.vanityCode.trim();
    const normalized = normalizeVanity(raw);
    const current = (opts.server.value?.vanityCode ?? '').trim();
    if (normalized === current) {
      form.vanityCode = normalized || form.vanityCode;
      return;
    }
    if (!isEchoGraphId(sid)) {
      serverSettingsService.syncServerLists({
        serverId: sid,
        patch: { vanityCode: normalized ? normalized : undefined },
        serverStore,
        workspaceServers: opts.workspace.servers,
      });
      form.vanityCode = normalized;
      return;
    }
    try {
      await serverSettingsService.persistPreferences({
        token,
        serverId: sid,
        patch: { vanityCode: normalized },
        serverStore,
        workspaceServers: opts.workspace.servers,
        refreshExploreDirectory: opts.workspace.refreshExploreDirectory,
      });
      form.vanityCode = normalized;
    } catch {
      const all = mergeServerListsForVanity(
        serverStore.servers,
        serverStore.pinnedMoreServers,
      );
      form.vanityCode =
        current ||
        (opts.server.value
          ? suggestServerVanityCode(
              opts.server.value.name,
              opts.server.value.id,
              all,
            )
          : '');
    }
  }

  async function onOverviewNameBlur() {
    const sid = opts.server.value?.id;
    const token = opts.accessToken.value;
    if (!opts.canManageServer.value || !sid) return;
    const next = form.name.trim();
    const current = (opts.server.value?.name ?? '').trim();
    if (next === current) {
      form.name = next || form.name;
      return;
    }
    if (!validateServerName(next, MAX_SERVER_NAME_LEN)) {
      form.name = current || opts.server.value?.name || 'Echo Server';
      return;
    }
    if (!isEchoGraphId(sid)) {
      serverSettingsService.syncServerLists({
        serverId: sid,
        patch: { name: next },
        serverStore,
        workspaceServers: opts.workspace.servers,
      });
      form.name = next;
      return;
    }
    try {
      await serverSettingsService.persistPreferences({
        token,
        serverId: sid,
        patch: { name: next },
        serverStore,
        workspaceServers: opts.workspace.servers,
        refreshExploreDirectory: opts.workspace.refreshExploreDirectory,
      });
      form.name = next;
    } catch {
      form.name = current || opts.server.value?.name || 'Echo Server';
    }
  }

  async function onOverviewDescriptionBlur() {
    const sid = opts.server.value?.id;
    const token = opts.accessToken.value;
    if (!opts.canManageServer.value || !sid) return;
    const next = form.description.trim();
    const current = (opts.server.value?.description ?? '').trim();
    if (next === current) return;
    if (!validateServerDescription(next, MAX_SERVER_DESCRIPTION_LEN)) {
      form.description = current;
      return;
    }
    if (!isEchoGraphId(sid)) {
      serverSettingsService.syncServerLists({
        serverId: sid,
        patch: { description: next },
        serverStore,
        workspaceServers: opts.workspace.servers,
      });
      return;
    }
    try {
      await serverSettingsService.persistPreferences({
        token,
        serverId: sid,
        patch: { description: next },
        serverStore,
        workspaceServers: opts.workspace.servers,
        refreshExploreDirectory: opts.workspace.refreshExploreDirectory,
      });
    } catch {
      form.description = current;
    }
  }

  async function onOverviewTagsBlur() {
    const sid = opts.server.value?.id;
    const token = opts.accessToken.value;
    if (!opts.canManageServer.value || !sid) return;
    const next = normalizeServerTags(form.tags);
    const current = normalizeServerTags(opts.server.value?.tags);
    form.tags = next;
    if (
      next.length === current.length &&
      next.every((tag, index) => tag === current[index])
    ) {
      return;
    }
    if (!isEchoGraphId(sid)) {
      serverSettingsService.syncServerLists({
        serverId: sid,
        patch: { tags: next },
        serverStore,
        workspaceServers: opts.workspace.servers,
      });
      return;
    }
    try {
      await serverSettingsService.persistPreferences({
        token,
        serverId: sid,
        patch: { tags: next },
        serverStore,
        workspaceServers: opts.workspace.servers,
        refreshExploreDirectory: opts.workspace.refreshExploreDirectory,
      });
    } catch {
      form.tags = current;
    }
  }

  return {
    form,
    bannerPreviewUrl,
    serverBannerUrl,
    bannerBlurEnabled,
    bannerBlackoutEnabled,
    listedInDirectoryEnabled,
    inviteJoinEnabled,
    bannerPositionY,
    onBannerBlurEnabledChange,
    onBannerBlackoutEnabledChange,
    onServerAccessModeChange,
    iconPreviewUrl,
    serverIconUrl,
    onServerBannerFileChange,
    removeServerBanner,
    onServerIconFileChange,
    resetBannerPreviewsAndToggles,
    syncFormFieldsFromServer,
    onOverviewVanityBlur,
    onOverviewNameBlur,
    onOverviewDescriptionBlur,
    onOverviewTagsBlur,
    persistModerationSettings,
    persistAllowGlobalGuestsSetting,
    persistBannerPositionY,
  };
}

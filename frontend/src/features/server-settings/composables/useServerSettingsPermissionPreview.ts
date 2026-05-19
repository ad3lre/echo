import { computed, ref, watch, type Ref } from 'vue';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { useAuthSessionStore } from '@/stores/authSession';
import {
  fetchEchoPermissionExplain,
  fetchEchoServerChannels,
  fetchEchoServerRoleList,
} from '@/api/echoClient';

export function useServerSettingsPermissionPreview(serverId: Ref<string>) {
  const auth = useAuthSessionStore();
  const channels = ref<
    { id: string; name: string; categoryName: string; type: string }[]
  >([]);
  const selectedChannelId = ref('');
  const traceMode = ref<'compressed' | 'full'>('compressed');
  const previewUserId = ref('');
  const compareRoleId = ref('');
  const roles = ref<{ id: string; name: string; permissions: string[] }[]>([]);
  const baselinePermissions = ref<string[] | null>(null);
  const loading = ref(false);
  const error = ref('');
  const summary = ref('');
  const effective = ref<string[]>([]);
  const ownerBypass = ref(false);
  const hydrating = ref(false);

  const TRACE_OPTIONS = [
    { label: 'Compressed (default)', value: 'compressed' },
    { label: 'Full (debug)', value: 'full' },
  ];

  const channelOptions = computed(() => {
    const out: { label: string; value: string }[] = [];
    out.push({ label: 'Server-wide (no channel layer)', value: '' });
    for (const channel of channels.value) {
      out.push({
        label: `${channel.name} (${channel.categoryName})`,
        value: channel.id,
      });
    }
    return out;
  });

  const roleOptions = computed(() => {
    const out: { label: string; value: string }[] = [];
    out.push({ label: 'None (show only effective)', value: '' });
    for (const role of roles.value) {
      out.push({ label: role.name, value: role.id });
    }
    return out;
  });

  const canLoad = computed(
    () =>
      !echoSyncCapabilities.isMockDataMode &&
      auth.isAuthenticated &&
      !!serverId.value,
  );

  function isForumPostChannelRow(ch: any): boolean {
    const parent =
      (typeof ch?.parentChannelId === 'string' && ch.parentChannelId.trim()) ||
      (typeof ch?.parent_channel_id === 'string' &&
        ch.parent_channel_id.trim());
    if (parent) return true;
    if (
      Array.isArray(ch?.forumPostTagIds) ||
      Array.isArray(ch?.forum_post_tag_ids)
    )
      return true;
    if (ch?.forumPostPinned === true || ch?.forum_post_pinned === true)
      return true;
    if (ch?.forumPostLocked === true || ch?.forum_post_locked === true)
      return true;
    const archived =
      (typeof ch?.forumPostArchivedAt === 'string' &&
        ch.forumPostArchivedAt.trim()) ||
      (typeof ch?.forum_post_archived_at === 'string' &&
        ch.forum_post_archived_at.trim());
    if (archived) return true;
    return false;
  }

  async function loadChannels() {
    if (!canLoad.value) return;
    const result = await fetchEchoServerChannels(
      auth.accessToken ?? '',
      serverId.value,
    );
    const visible = result.channels.filter(
      (ch: any) => !isForumPostChannelRow(ch),
    );
    channels.value = visible;
    if (!selectedChannelId.value && visible.length > 0) {
      selectedChannelId.value = visible[0]!.id;
    }
  }

  async function loadRoles() {
    if (!canLoad.value) return;
    const result = await fetchEchoServerRoleList(
      auth.accessToken ?? '',
      serverId.value,
    );
    roles.value = result.roles;
  }

  async function loadExplain() {
    if (!canLoad.value) return;
    loading.value = true;
    error.value = '';
    try {
      const result = await fetchEchoPermissionExplain(
        auth.accessToken ?? '',
        serverId.value,
        {
          channelId: selectedChannelId.value || undefined,
          traceMode: traceMode.value,
          userId: previewUserId.value || undefined,
        },
      );
      summary.value = result.explanation.summary;
      effective.value = result.effective;
      ownerBypass.value = result.ownerBypass;
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : 'Failed to load explanation';
      summary.value = '';
      effective.value = [];
      ownerBypass.value = false;
    } finally {
      loading.value = false;
    }
  }

  watch(
    serverId,
    async () => {
      selectedChannelId.value = '';
      previewUserId.value = '';
      compareRoleId.value = '';
      baselinePermissions.value = null;
      channels.value = [];
      roles.value = [];
      summary.value = '';
      effective.value = [];
      ownerBypass.value = false;
      error.value = '';
      if (!canLoad.value) return;

      hydrating.value = true;
      try {
        await Promise.all([loadChannels(), loadRoles()]);
      } catch (e) {
        error.value =
          e instanceof Error ? e.message : 'Failed to load preview inputs';
      } finally {
        hydrating.value = false;
      }
      await loadExplain();
    },
    { immediate: true },
  );

  watch([selectedChannelId, traceMode, previewUserId], () => {
    if (hydrating.value) return;
    void loadExplain();
  });

  watch(compareRoleId, () => {
    if (!compareRoleId.value) {
      baselinePermissions.value = null;
      return;
    }
    const role = roles.value.find((entry) => entry.id === compareRoleId.value);
    baselinePermissions.value = role ? role.permissions : null;
  });

  return {
    TRACE_OPTIONS,
    channels,
    selectedChannelId,
    traceMode,
    previewUserId,
    compareRoleId,
    roles,
    baselinePermissions,
    channelOptions,
    roleOptions,
    loading,
    error,
    summary,
    effective,
    ownerBypass,
    canLoad,
    loadExplain,
  };
}

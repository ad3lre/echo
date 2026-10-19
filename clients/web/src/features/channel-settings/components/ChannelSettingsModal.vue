<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed, ref, watch, toRef } from 'vue';
import { storeToRefs } from 'pinia';
import { useDevSettingsStore } from '@/features/dev/devSettings';
import { useChannelIconResolver } from '@/features/layout/channels/useChannelIconResolver';
import type {
  ChannelPermissionKey,
  ChannelPermissionsState,
  ChannelSummary,
  EchoChannelType,
} from '@shared/types';
import { CHANNEL_WEBHOOKS_ENABLED } from '@shared/integrationKillSwitches';
import { useFocusTrap } from '@/features/layout/useFocusTrap';
import EchoDropdown from '@/components/EchoDropdown.vue';
import ChannelIconPickerPopover from '@/features/channel-settings/ChannelIconPickerPopover.vue';
import ChannelPermissionIconBadge from '@/features/channel-settings/components/ChannelPermissionIconBadge.vue';
import PermissionOverwriteEditor from '@/features/channel-settings/components/PermissionOverwriteEditor.vue';
import ChannelDiscordSyncPanel from '@/features/channel-settings/components/ChannelDiscordSyncPanel.vue';
import ChannelDiscordVoiceMirrorPanel from '@/features/channel-settings/components/ChannelDiscordVoiceMirrorPanel.vue';
import ChannelWebhooksPanel from '@/features/channel-settings/components/ChannelWebhooksPanel.vue';
import {
  getChannelIconKeyForEdit,
  getChannelIconVisual,
  icons,
  type ChannelIconVisual,
} from '@/assets/icons';
import { ensureIconCatalogLoaded } from '@/assets/iconCatalog';
import { resolveEffectiveChannelPermission } from '@/features/chat/domain/channelPermissions';
import { requestAppConfirm } from '@/features/layout/failures/appDialogs';
import type {
  ChannelPermissionDef,
  ChannelSettingsTab,
  EchoPermissionEditorState,
  PermissionOverwriteRowDraft,
} from '@/features/channel-settings/types';
import {
  canonicalizeEchoPermissionRowsForSave,
  echoPermissionOverwriteStateChanged,
} from '@/features/channel-settings/domain/echoPermissionRows';
import {
  getChannelPermissionDefsForChannelType,
  groupChannelPermissionDefs,
  SLOW_MODE_OPTIONS,
  MESSAGE_AUTO_DELETE_OPTIONS,
} from '@/features/channel-settings/types';
import {
  channelPermissionLabel,
  channelTabCopy,
  messageAutoDeleteOptionLabel,
  permissionGroupLabel,
  slowModeOptionLabel,
} from '@/i18n/labels';
import {
  messageAutoDeleteOptionValueToSeconds,
  messageAutoDeleteSecondsToOptionValue,
} from '@shared/messageAutoDelete';
import {
  normalizeForumCreatorDefaultPerms,
  type ForumCreatorDefaultPerms,
} from '@shared/types';
import type { PaperShareVisibility } from '@shared/types/paperShare';
import {
  fetchPaperShareSettings,
  patchPaperShareVisibility,
} from '@/features/paper/paperApi';
import {
  ECHO_VOICE_BITRATE_MAX_KBPS,
  ECHO_VOICE_BITRATE_MIN_KBPS,
} from '@shared/voiceChannelBitrateLimits';
import {
  clampEchoChannelName,
  ECHO_CHANNEL_NAME_MAX_LENGTH,
} from '@shared/echoChannelLimits';
import {
  ECHO_MESSAGE_FORMAT_TEMPLATE_MAX_CHARS,
  normalizeEchoMessageFormatTemplateInput,
} from '@shared/messageChunkLimits';

export type ChannelSettingsCategoryOption = { id: string; label: string };

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    serverName: string;
    isDiscordImportedServer?: boolean;
    categoryOptions: ChannelSettingsCategoryOption[];
    channelSettings: {
      serverId: string;
      channel: ChannelSummary;
      categoryId: string;
    } | null;
    /** Category defaults when “Sync with category” is on. */
    categoryPermissionDefaults?: Partial<
      Record<ChannelPermissionKey, boolean>
    > | null;
    /** Category auto-delete TTL (seconds) when syncing. */
    categoryAutoDeleteAfterSeconds?: number | null;
    echoPermissionEditor?: EchoPermissionEditorState | null;
  }>(),
  {
    categoryPermissionDefaults: null,
    echoPermissionEditor: null,
    isDiscordImportedServer: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  save: [
    payload: {
      channelId: string;
      channelType: EchoChannelType;
      serverId: string;
      name: string;
      categoryId: string;
      iconKey: string;
      slowModeSeconds: number;
      userLimit: number;
      nsfw: boolean;
      bitrateBps: number | null | undefined;
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
    },
  ];
  delete: [];
}>();

const modalRef = ref<HTMLElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

const devSettings = useDevSettingsStore();
const { devModeIdsEnabled } = storeToRefs(devSettings);

const channelIconResolver = useChannelIconResolver(
  toRef(() => props.channelSettings?.serverId),
);

const activeTab = ref<ChannelSettingsTab>('overview');

const channelName = ref('');
const selectedCategory = ref('');
const selectedIconKey = ref('');
const slowModeSecondsStr = ref('0');
const userLimit = ref(0);
const nsfw = ref(false);
const voiceDefaultBitrate = ref(true);
const voiceE2eeEnabled = ref(false);
const bitrateSliderKbps = ref(64);
const channelPermissions = ref<ChannelPermissionsState>({
  syncWithCategory: true,
  overrides: {},
});
const echoPermissionRows = ref<PermissionOverwriteRowDraft[]>([]);
const echoSyncWithCategory = ref(true);
/** Persists role/member pick while switching channel-settings tabs. */
const permissionSelectedRowKey = ref<string | null>(null);

const forumManagePostFlags = ref(true);
const forumDeleteOwnPost = ref(true);
const forumModerateMessagesInOwnPost = ref(false);

const autoDeleteSyncedToCategory = ref(true);
const autoDeleteAfterSecondsStr = ref('0');

const messageFormatTemplate = ref('');
const messageFormatHard = ref(false);
const paperCommentsEnabled = ref(true);
const paperShowAuthorGutter = ref(true);
const paperShareVisibility = ref<PaperShareVisibility>('server');
const paperShareCanManage = ref(false);
const paperShareSaving = ref(false);

async function loadPaperShareSettings(channelId: string) {
  try {
    const s = await fetchPaperShareSettings(channelId);
    paperShareVisibility.value = s.visibility;
    paperShareCanManage.value = s.canManageShare;
  } catch {
    paperShareCanManage.value = false;
  }
}

async function onPaperShareVisibilityChange(visibility: PaperShareVisibility) {
  const cs = props.channelSettings;
  if (!cs || !paperShareCanManage.value) return;
  paperShareSaving.value = true;
  try {
    const s = await patchPaperShareVisibility(cs.channel.id, visibility);
    paperShareVisibility.value = s.visibility;
  } finally {
    paperShareSaving.value = false;
  }
}

const categoryDropdownOptions = computed(() =>
  props.categoryOptions.map((o) => ({ label: o.label, value: o.id })),
);

const slowModeDropdownOptions = computed(() =>
  SLOW_MODE_OPTIONS.map((o) => ({
    value: o.value,
    label: slowModeOptionLabel(o.value),
  })),
);

const autoDeleteDropdownOptions = computed(() =>
  MESSAGE_AUTO_DELETE_OPTIONS.map((o) => ({
    value: o.value,
    label: messageAutoDeleteOptionLabel(o.value),
  })),
);

const channelCategoryLabel = computed(() => {
  const cs = props.channelSettings;
  if (!cs) return '';
  return props.categoryOptions.find((o) => o.id === cs.categoryId)?.label ?? '';
});

const channelType = computed(
  () => props.channelSettings?.channel.type ?? 'text',
);

const isPaperChannel = computed(() => channelType.value === 'paper');

const paperPermissionsDisabled = computed(() => {
  if (!isPaperChannel.value) return false;
  return paperShareVisibility.value !== 'server';
});

const discordSyncChannelType = computed(() =>
  channelType.value === 'forum' ? 'forum' : 'text',
);

const channelSettingsTabs = computed((): ChannelSettingsTab[] => {
  const tabs: ChannelSettingsTab[] = ['overview', 'permissions'];
  if (
    CHANNEL_WEBHOOKS_ENABLED &&
    (channelType.value === 'text' || channelType.value === 'forum') &&
    props.channelSettings?.channel.canManageWebhooks === true
  ) {
    tabs.splice(2, 0, 'webhooks');
  }
  if (channelType.value === 'text' || channelType.value === 'forum')
    tabs.push('format');
  if (channelType.value === 'text' || channelType.value === 'forum')
    tabs.push('discord_sync');
  if (channelType.value === 'voice' && props.isDiscordImportedServer)
    tabs.push('discord_voice_mirror');
  if (channelType.value === 'forum') tabs.push('forum_creator');
  tabs.push('danger_zone');
  return tabs;
});

/** Sidebar + icon preview: live `selectedIconKey` so the chip matches the picker. */
const settingsChannelIconModel = computed(
  (): {
    name: string;
    type: EchoChannelType;
    iconKey?: string;
  } | null => {
    const cs = props.channelSettings;
    if (!cs) return null;
    const ik = selectedIconKey.value?.trim();
    return {
      name:
        clampEchoChannelName(channelName.value) ||
        clampEchoChannelName(cs.channel.name),
      type: cs.channel.type,
      ...(ik ? { iconKey: ik } : {}),
    };
  },
);

const sidebarChannelIconVisual = ref<ChannelIconVisual>({
  kind: 'svg',
  url: icons.message,
});

async function refreshSidebarChannelIcon() {
  const m = settingsChannelIconModel.value;
  if (!m || !props.modelValue) return;
  await ensureIconCatalogLoaded();
  sidebarChannelIconVisual.value = channelIconResolver.getVisual(m);
}

const permissionDefs = computed(() =>
  getChannelPermissionDefsForChannelType(channelType.value),
);
const echoPermissionDefs = computed(() =>
  permissionDefs.value.filter((def) => def.group !== 'Threads'),
);

const permissionGroupsList = computed(() =>
  groupChannelPermissionDefs(permissionDefs.value),
);

function syncFromProps() {
  const cs = props.channelSettings;
  if (!cs) return;
  const ch = cs.channel;
  channelName.value = clampEchoChannelName(ch.name ?? '');
  selectedCategory.value = cs.categoryId;
  selectedIconKey.value = getChannelIconKeyForEdit(ch);
  slowModeSecondsStr.value = String(ch.slowModeSeconds ?? 0);
  userLimit.value = ch.userLimit ?? 0;
  nsfw.value = ch.nsfw === true;
  voiceDefaultBitrate.value = ch.bitrateBps == null;
  voiceE2eeEnabled.value = ch.voiceE2eeEnabled === true;
  bitrateSliderKbps.value =
    ch.bitrateBps != null
      ? Math.min(
          ECHO_VOICE_BITRATE_MAX_KBPS,
          Math.max(
            ECHO_VOICE_BITRATE_MIN_KBPS,
            Math.round(ch.bitrateBps / 1000),
          ),
        )
      : 64;
  channelPermissions.value = ch.channelPermissions
    ? {
        syncWithCategory: ch.channelPermissions.syncWithCategory,
        overrides: { ...ch.channelPermissions.overrides },
      }
    : { syncWithCategory: true, overrides: {} };
  const editor = props.echoPermissionEditor;
  if (editor?.loading) {
    echoPermissionRows.value = (editor.rows ?? []).map((row) => ({
      targetType: row.targetType,
      ...(row.targetType === 'members'
        ? {}
        : { targetId: row.targetId ?? null }),
      partial: { ...(row.partial ?? {}) },
    }));
  } else if (editor) {
    echoPermissionRows.value = (editor.rows ?? []).map((row) => ({
      targetType: row.targetType,
      ...(row.targetType === 'members'
        ? {}
        : { targetId: row.targetId ?? null }),
      partial: { ...(row.partial ?? {}) },
    }));
    echoSyncWithCategory.value = (editor.rows?.length ?? 0) === 0;
  }
  void refreshSidebarChannelIcon();
  const fc = normalizeForumCreatorDefaultPerms(
    ch.type === 'forum' ? ch.forumCreatorDefaultPerms : undefined,
  );
  forumManagePostFlags.value = fc.managePostFlags;
  forumDeleteOwnPost.value = fc.deleteOwnPost;
  forumModerateMessagesInOwnPost.value = fc.moderateMessagesInOwnPost;
  autoDeleteSyncedToCategory.value = ch.autoDeleteSyncedToCategory !== false;
  autoDeleteAfterSecondsStr.value = messageAutoDeleteSecondsToOptionValue(
    ch.autoDeleteAfterSeconds,
  );
  const mt = ch.messageFormatTemplate;
  messageFormatTemplate.value =
    typeof mt === 'string' ? normalizeEchoMessageFormatTemplateInput(mt) : '';
  messageFormatHard.value =
    messageFormatTemplate.value.trim().length > 0 &&
    ch.messageFormatHard === true;
  paperCommentsEnabled.value = ch.paperCommentsEnabled !== false;
  paperShowAuthorGutter.value = ch.paperShowAuthorGutter !== false;
  if (ch.type === 'paper') {
    void loadPaperShareSettings(ch.id);
  }
}

const effectiveCategoryAutoDeleteStr = computed(() =>
  messageAutoDeleteSecondsToOptionValue(
    props.categoryAutoDeleteAfterSeconds ?? null,
  ),
);

const displayedAutoDeleteStr = computed({
  get: () =>
    autoDeleteSyncedToCategory.value
      ? effectiveCategoryAutoDeleteStr.value
      : autoDeleteAfterSecondsStr.value,
  set: (v: string) => {
    if (autoDeleteSyncedToCategory.value) return;
    autoDeleteAfterSecondsStr.value = v;
  },
});

watch(
  () => props.modelValue,
  (open, wasOpen) => {
    if (open && !wasOpen) {
      activeTab.value = 'overview';
      syncFromProps();
    }
    if (!open && wasOpen) {
      permissionSelectedRowKey.value = null;
    }
  },
);

watch(
  () => props.channelSettings?.channel.id,
  (channelId, prevId) => {
    if (channelId && channelId !== prevId) {
      permissionSelectedRowKey.value = null;
    }
  },
);

watch(
  () => props.echoPermissionEditor?.loading,
  (loading, wasLoading) => {
    if (wasLoading && loading === false && props.modelValue) {
      permissionSelectedRowKey.value = null;
    }
  },
);

watch(
  () => [props.channelSettings, props.echoPermissionEditor] as const,
  () => {
    if (props.modelValue) syncFromProps();
  },
);

watch(channelSettingsTabs, (tabs) => {
  if (!tabs.includes(activeTab.value)) activeTab.value = 'overview';
});

watch(messageFormatTemplate, (v) => {
  if (!v.trim()) messageFormatHard.value = false;
});

watch([selectedIconKey, channelName], () => {
  if (props.modelValue && props.channelSettings)
    void refreshSidebarChannelIcon();
});

const syncWithCategoryModel = computed({
  get: () => channelPermissions.value.syncWithCategory,
  set: (v: boolean) => {
    channelPermissions.value = {
      ...channelPermissions.value,
      syncWithCategory: v,
    };
  },
});

const echoSyncWithCategoryModel = computed({
  get: () => echoSyncWithCategory.value,
  set: (v: boolean) => {
    echoSyncWithCategory.value = v;
  },
});

function isPermAllowed(key: ChannelPermissionKey): boolean {
  return resolveEffectiveChannelPermission({
    baseAllowed: true,
    categoryDefaults: props.categoryPermissionDefaults,
    channelPermissions: channelPermissions.value,
    key,
  });
}

function togglePermission(key: ChannelPermissionKey) {
  if (channelPermissions.value.syncWithCategory) return;
  const next = { ...channelPermissions.value.overrides };
  const effective = next[key] !== false;
  next[key] = !effective;
  channelPermissions.value = { ...channelPermissions.value, overrides: next };
}

const trimmedName = computed(() => channelName.value.trim());
const echoPermissionsReady = computed(
  () => !props.echoPermissionEditor || !props.echoPermissionEditor.loading,
);
const canSave = computed(
  () =>
    !!trimmedName.value &&
    !!selectedCategory.value &&
    !!props.channelSettings &&
    echoPermissionsReady.value &&
    props.categoryOptions.some((o) => o.id === selectedCategory.value),
);

const USER_LIMIT_SLIDER_MAX = 99;

const userLimitLabel = computed(() =>
  userLimit.value === 0 ? 'Unlimited' : `${userLimit.value} users`,
);

/** 0–100 for CSS `--slider-fill-pct` on the range track. */
const userLimitSliderFillPct = computed(() => {
  const max = USER_LIMIT_SLIDER_MAX;
  if (max <= 0) return 0;
  const v = Math.min(Math.max(userLimit.value, 0), max);
  return (v / max) * 100;
});

const bitrateSliderFillPct = computed(() => {
  const min = ECHO_VOICE_BITRATE_MIN_KBPS;
  const max = ECHO_VOICE_BITRATE_MAX_KBPS;
  const span = max - min;
  if (span <= 0) return 0;
  const v = Math.min(Math.max(bitrateSliderKbps.value, min), max);
  return ((v - min) / span) * 100;
});

const bitrateKbpsLabel = computed(() =>
  voiceDefaultBitrate.value
    ? echoT('b03.voice.default')
    : echoT('b03.voice.kbps', {
        value: Math.min(
          ECHO_VOICE_BITRATE_MAX_KBPS,
          Math.max(
            ECHO_VOICE_BITRATE_MIN_KBPS,
            Math.round(bitrateSliderKbps.value),
          ),
        ),
      }),
);

const initialSnapshot = computed(() => {
  const cs = props.channelSettings;
  if (!cs) return null;
  const ch = cs.channel;
  const snapIk = getChannelIconKeyForEdit(ch);
  return {
    name: clampEchoChannelName(ch.name ?? ''),
    categoryId: cs.categoryId ?? '',
    iconKey: snapIk,
    slowModeSeconds: String(ch.slowModeSeconds ?? 0),
    userLimit: ch.userLimit ?? 0,
    nsfw: ch.nsfw === true,
    bitrateBps:
      ch.bitrateBps == null ? null : Math.round((ch.bitrateBps ?? 0) / 1000),
    voiceE2eeEnabled: ch.voiceE2eeEnabled === true,
    channelPermissions: ch.channelPermissions
      ? {
          syncWithCategory: ch.channelPermissions.syncWithCategory,
          overrides: { ...ch.channelPermissions.overrides },
        }
      : { syncWithCategory: true, overrides: {} },
    echoPermissionRows:
      props.echoPermissionEditor && !props.echoPermissionEditor.loading
        ? (props.echoPermissionEditor.rows ?? []).map((row) => ({
            targetType: row.targetType,
            ...(row.targetType === 'everyone'
              ? {}
              : { targetId: row.targetId ?? null }),
            partial: { ...(row.partial ?? {}) },
          }))
        : null,
    echoSyncWithCategory:
      props.echoPermissionEditor && !props.echoPermissionEditor.loading
        ? (props.echoPermissionEditor.rows?.length ?? 0) === 0
        : null,
    forumCreator: normalizeForumCreatorDefaultPerms(
      ch.type === 'forum' ? ch.forumCreatorDefaultPerms : undefined,
    ),
    autoDeleteSyncedToCategory: ch.autoDeleteSyncedToCategory !== false,
    autoDeleteAfterSeconds: messageAutoDeleteSecondsToOptionValue(
      ch.autoDeleteAfterSeconds,
    ),
    messageFormatTemplate:
      typeof ch.messageFormatTemplate === 'string'
        ? normalizeEchoMessageFormatTemplateInput(ch.messageFormatTemplate)
        : '',
    messageFormatHard:
      (typeof ch.messageFormatTemplate === 'string'
        ? normalizeEchoMessageFormatTemplateInput(ch.messageFormatTemplate)
        : ''
      ).trim().length > 0 && ch.messageFormatHard === true,
  };
});

const echoPermissionOverwriteDirty = computed(() => {
  const snap = initialSnapshot.value;
  if (!snap || !props.echoPermissionEditor || !echoPermissionsReady.value)
    return false;
  const snapSync = snap.echoSyncWithCategory;
  const snapRows = snap.echoPermissionRows;
  if (snapSync == null || snapRows == null) return false;
  return echoPermissionOverwriteStateChanged(
    { syncWithCategory: snapSync, rows: snapRows },
    {
      syncWithCategory: echoSyncWithCategory.value,
      rows: echoPermissionRows.value,
    },
  );
});

const channelDirty = computed(() => {
  const snap = initialSnapshot.value;
  if (!snap || !props.channelSettings) return false;
  if (trimmedName.value !== (snap.name ?? '').trim()) return true;
  if (selectedCategory.value !== snap.categoryId) return true;
  if ((selectedIconKey.value ?? '') !== (snap.iconKey ?? '')) return true;
  if ((slowModeSecondsStr.value || '0') !== String(snap.slowModeSeconds ?? '0'))
    return true;
  if ((userLimit.value || 0) !== (snap.userLimit || 0)) return true;
  if ((nsfw.value === true) !== (snap.nsfw === true)) return true;
  const currentBps =
    channelType.value === 'voice' && !voiceDefaultBitrate.value
      ? Math.round(bitrateSliderKbps.value)
      : null;
  if ((currentBps ?? null) !== (snap.bitrateBps ?? null)) return true;
  if (
    (channelType.value === 'voice' || channelType.value === 'stage') &&
    (voiceE2eeEnabled.value === true) !== (snap.voiceE2eeEnabled === true)
  )
    return true;
  if (props.echoPermissionEditor && echoPermissionsReady.value) {
    if (echoPermissionOverwriteDirty.value) return true;
  } else if (!props.echoPermissionEditor) {
    if (
      channelPermissions.value.syncWithCategory !==
      snap.channelPermissions.syncWithCategory
    )
      return true;
    if (
      JSON.stringify(channelPermissions.value.overrides ?? {}) !==
      JSON.stringify(snap.channelPermissions.overrides ?? {})
    )
      return true;
  }
  if (channelType.value === 'forum') {
    const sfc = snap.forumCreator;
    if (forumManagePostFlags.value !== sfc.managePostFlags) return true;
    if (forumDeleteOwnPost.value !== sfc.deleteOwnPost) return true;
    if (forumModerateMessagesInOwnPost.value !== sfc.moderateMessagesInOwnPost)
      return true;
  }
  if (channelType.value === 'text' || channelType.value === 'forum') {
    if (autoDeleteSyncedToCategory.value !== snap.autoDeleteSyncedToCategory)
      return true;
    if (
      !autoDeleteSyncedToCategory.value &&
      autoDeleteAfterSecondsStr.value !== snap.autoDeleteAfterSeconds
    )
      return true;
    const curMt = normalizeEchoMessageFormatTemplateInput(
      messageFormatTemplate.value,
    );
    if (curMt !== (snap.messageFormatTemplate ?? '')) return true;
    const curHard = curMt.trim().length > 0 && messageFormatHard.value === true;
    if (curHard !== (snap.messageFormatHard === true)) return true;
  }
  return false;
});

function blurModalFocus() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && modalRef.value?.contains(active)) {
    active.blur();
  }
}

function close() {
  blurModalFocus();
  emit('update:modelValue', false);
}

function onChannelSettingsNavClick(tab: ChannelSettingsTab, e: MouseEvent) {
  activeTab.value = tab;
  (e.currentTarget as HTMLButtonElement | null)?.blur();
}

function save() {
  if (!canSave.value || !props.channelSettings) return;
  const channelId = props.channelSettings.channel.id;
  const kb = Math.min(
    ECHO_VOICE_BITRATE_MAX_KBPS,
    Math.max(
      ECHO_VOICE_BITRATE_MIN_KBPS,
      Math.round(
        Number(bitrateSliderKbps.value) || ECHO_VOICE_BITRATE_MIN_KBPS,
      ),
    ),
  );
  emit('save', {
    channelId,
    channelType: channelType.value,
    serverId: props.channelSettings.serverId,
    name: clampEchoChannelName(trimmedName.value),
    categoryId: selectedCategory.value,
    iconKey: selectedIconKey.value,
    slowModeSeconds: Number.parseInt(slowModeSecondsStr.value, 10) || 0,
    userLimit: userLimit.value,
    nsfw: nsfw.value,
    bitrateBps:
      channelType.value === 'voice'
        ? voiceDefaultBitrate.value
          ? null
          : kb * 1000
        : undefined,
    ...(channelType.value === 'voice' || channelType.value === 'stage'
      ? { voiceE2eeEnabled: voiceE2eeEnabled.value === true }
      : {}),
    channelPermissions: {
      syncWithCategory: channelPermissions.value.syncWithCategory,
      overrides: { ...channelPermissions.value.overrides },
    },
    ...(props.echoPermissionEditor && echoPermissionOverwriteDirty.value
      ? {
          echoPermissionRows: echoSyncWithCategory.value
            ? []
            : canonicalizeEchoPermissionRowsForSave(echoPermissionRows.value),
        }
      : {}),
    ...(channelType.value === 'forum'
      ? {
          forumCreatorDefaultPerms: {
            managePostFlags: forumManagePostFlags.value,
            deleteOwnPost: forumDeleteOwnPost.value,
            moderateMessagesInOwnPost: forumModerateMessagesInOwnPost.value,
          },
        }
      : {}),
    ...(channelType.value === 'text' || channelType.value === 'forum'
      ? {
          autoDeleteSyncedToCategory: autoDeleteSyncedToCategory.value,
          autoDeleteAfterSeconds: autoDeleteSyncedToCategory.value
            ? null
            : messageAutoDeleteOptionValueToSeconds(
                autoDeleteAfterSecondsStr.value,
              ),
          messageFormatTemplate: normalizeEchoMessageFormatTemplateInput(
            messageFormatTemplate.value,
          ),
          messageFormatHard:
            normalizeEchoMessageFormatTemplateInput(
              messageFormatTemplate.value,
            ).trim().length > 0 && messageFormatHard.value === true,
        }
      : {}),
    ...(channelType.value === 'paper'
      ? {
          paperCommentsEnabled: paperCommentsEnabled.value,
          paperShowAuthorGutter: paperShowAuthorGutter.value,
        }
      : {}),
  });
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
}

function tabIcon(tab: ChannelSettingsTab) {
  if (tab === 'permissions') return icons.sliders;
  if (tab === 'webhooks') return icons.puzzle;
  if (tab === 'discord_sync' || tab === 'discord_voice_mirror')
    return icons.discordMark;
  if (tab === 'forum_creator') return icons.messageAlt;
  if (tab === 'format') return icons.list;
  if (tab === 'danger_zone') return icons.trash;
  return icons.message;
}

function channelSettingsNavClass(tab: ChannelSettingsTab) {
  if (activeTab.value === tab) {
    return 'server-settings-nav-item--active';
  }
  if (tab === 'danger_zone') {
    return 'channel-settings-nav--danger';
  }
  return 'text-muted hover:text-foreground channel-settings-nav--idle pointer-fine:hover:bg-glass-hover';
}

async function confirmDeleteChannel() {
  if (!props.channelSettings) return;
  const label = props.channelSettings.channel.name;
  const ok = await requestAppConfirm({
    title: echoT('b03.confirm.title', { label }),
    message: echoT('b03.confirm.message'),
    confirmLabel: echoT('b03.danger.deleteChannel'),
    danger: true,
  });
  if (!ok) return;
  emit('delete');
  emit('update:modelValue', false);
}
</script>

<template>
  <Transition name="server-settings-modal">
    <div
      v-if="modelValue && channelSettings"
      class="fixed inset-0 z-[150] flex items-center justify-center bg-overlay-dim px-2"
      @click.self="close"
      @keydown="onKeydown"
    >
      <div
        ref="modalRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="channel-settings-title"
        class="server-settings-modal relative flex h-[min(860px,94vh)] w-full max-w-6xl overflow-hidden rounded-2xl text-foreground"
      >
        <aside
          class="server-settings-sidebar custom-scrollbar w-full max-w-[280px] shrink-0 overflow-y-auto p-5"
        >
          <div class="mb-5 px-3">
            <div
              class="text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-soft"
            >
              {{ echoT('b03.sidebar.kicker') }}
            </div>
            <h2
              id="channel-settings-title"
              class="mt-2 min-w-0 max-w-full text-2xl font-bold leading-tight truncate"
              :title="channelSettings.channel.name"
            >
              {{ channelSettings.channel.name }}
            </h2>
            <p class="mt-1 text-sm text-muted">
              {{ echoT('b03.sidebar.serverDesc', { serverName }) }}
            </p>
            <div
              class="channel-settings-type-chip mt-3 inline-flex max-w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium"
              :title="echoT('b03.sidebar.typeTitle')"
            >
              <span
                v-if="sidebarChannelIconVisual.kind === 'emoji'"
                class="h-3.5 w-3.5 shrink-0 flex items-center justify-center text-[13px] leading-none"
                aria-hidden="true"
                >{{ sidebarChannelIconVisual.emoji }}</span
              >
              <img
                v-else
                :src="sidebarChannelIconVisual.url"
                alt=""
                class="h-3.5 w-3.5 shrink-0 object-contain server-settings-inline-icon"
              />
              <span class="min-w-0 truncate">{{
                channelType === 'voice' || channelType === 'stage'
                  ? echoT('b03.sidebar.voiceChannel')
                  : channelType === 'forum'
                    ? echoT('b03.sidebar.forumChannel')
                    : echoT('b03.sidebar.textChannel')
              }}</span>
            </div>
          </div>

          <div class="mb-5">
            <div
              class="channel-settings-sidebar-kicker px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em]"
            >
              {{ echoT('b03.sidebar.settings') }}
            </div>
            <div class="flex flex-col gap-1">
              <button
                v-for="tab in channelSettingsTabs"
                :key="tab"
                type="button"
                class="server-settings-nav-item rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border"
                :class="channelSettingsNavClass(tab)"
                @click="onChannelSettingsNavClick(tab, $event)"
              >
                <div class="flex items-center gap-2">
                  <template v-if="tab === 'overview'">
                    <span
                      v-if="sidebarChannelIconVisual.kind === 'emoji'"
                      class="h-4 w-4 shrink-0 flex items-center justify-center text-[15px] leading-none"
                      aria-hidden="true"
                      >{{ sidebarChannelIconVisual.emoji }}</span
                    >
                    <img
                      v-else
                      :src="sidebarChannelIconVisual.url"
                      alt=""
                      class="h-4 w-4 shrink-0 object-contain server-settings-inline-icon"
                    />
                  </template>
                  <img
                    v-else
                    :src="tabIcon(tab)"
                    alt=""
                    class="h-4 w-4 shrink-0 object-contain server-settings-inline-icon"
                  />
                  <span class="truncate">{{ channelTabCopy(tab).title }}</span>
                </div>
              </button>
            </div>
          </div>
        </aside>

        <section
          class="server-settings-content custom-scrollbar flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden p-6"
        >
          <div class="mb-4 flex shrink-0 items-start justify-between gap-4">
            <div>
              <div
                class="text-xs font-semibold uppercase tracking-[0.18em] text-fg-soft"
              >
                {{ echoT('b03.sidebar.kicker') }}
              </div>
              <div class="mt-2 flex items-center gap-3">
                <template v-if="activeTab === 'overview'">
                  <span
                    v-if="sidebarChannelIconVisual.kind === 'emoji'"
                    class="h-6 w-6 shrink-0 flex items-center justify-center text-[22px] leading-none"
                    aria-hidden="true"
                    >{{ sidebarChannelIconVisual.emoji }}</span
                  >
                  <img
                    v-else
                    :src="sidebarChannelIconVisual.url"
                    alt=""
                    class="h-6 w-6 shrink-0 object-contain server-settings-inline-icon"
                  />
                </template>
                <img
                  v-else
                  :src="tabIcon(activeTab)"
                  alt=""
                  class="h-6 w-6 shrink-0 object-contain server-settings-inline-icon"
                />
                <h3 class="text-3xl font-bold text-foreground">
                  {{ channelTabCopy(activeTab).title }}
                </h3>
              </div>
              <p class="mt-2 max-w-2xl text-sm text-muted">
                {{ channelTabCopy(activeTab).description }}
              </p>
            </div>

            <button
              type="button"
              class="close-btn channel-settings-close-btn shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
              @click="close"
            >
              {{ echoT('b03.common.close') }}
            </button>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto pr-1">
            <Transition name="server-settings-panel" mode="out-in">
              <div
                v-if="activeTab === 'overview'"
                key="overview"
                class="server-settings-panel-root channel-settings-overview-discord pb-8"
              >
                <div
                  class="channel-settings-overview-stack flex w-full max-w-2xl flex-col gap-6"
                >
                  <div class="w-full min-w-0">
                    <label
                      class="channel-settings-section-label channel-settings-section-label--icon"
                      for="channel-settings-name"
                    >
                      <img
                        :src="icons.pen"
                        alt=""
                        class="channel-settings-label-icon server-settings-inline-icon"
                      />
                      {{ echoT('b03.overview.name') }}
                    </label>
                    <div
                      class="channel-settings-glass-row mt-2 flex min-h-[44px] w-full min-w-0 items-stretch overflow-hidden rounded-xl"
                    >
                      <ChannelIconPickerPopover
                        v-model="selectedIconKey"
                        variant="combined"
                        :channel-type="
                          channelType === 'voice' || channelType === 'stage'
                            ? 'voice'
                            : 'text'
                        "
                        :server-id="channelSettings?.serverId"
                      />
                      <input
                        id="channel-settings-name"
                        v-model="channelName"
                        type="text"
                        class="channel-settings-name-input min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-sm outline-none"
                        :placeholder="echoT('b03.overview.namePlaceholder')"
                        :maxlength="ECHO_CHANNEL_NAME_MAX_LENGTH"
                      />
                    </div>
                  </div>

                  <div class="w-full min-w-0">
                    <div
                      class="channel-settings-section-label channel-settings-section-label--icon"
                    >
                      <img
                        :src="icons.folder"
                        alt=""
                        class="channel-settings-label-icon server-settings-inline-icon"
                      />
                      {{ echoT('b03.overview.category') }}
                    </div>
                    <div class="channel-settings-dropdowns mt-2 w-full min-w-0">
                      <EchoDropdown
                        v-model="selectedCategory"
                        :options="categoryDropdownOptions"
                        menu-match-trigger-width
                        teleport-menu
                        attached
                        surface="server"
                      />
                    </div>
                  </div>

                  <div
                    v-if="channelType === 'paper'"
                    class="w-full min-w-0 space-y-3"
                  >
                    <div
                      class="channel-settings-section-label channel-settings-section-label--icon"
                    >
                      <img
                        :src="icons.file"
                        alt=""
                        class="channel-settings-label-icon server-settings-inline-icon"
                      />
                      {{ echoT('b03.paper.title') }}
                    </div>
                    <p class="channel-settings-hint w-full min-w-0">
                      {{ echoT('b03.paper.hint') }}
                    </p>
                    <label
                      class="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <input
                        v-model="paperCommentsEnabled"
                        type="checkbox"
                        class="rounded border-border"
                      />
                      {{ echoT('b03.paper.allowComments') }}
                    </label>
                    <label
                      class="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <input
                        v-model="paperShowAuthorGutter"
                        type="checkbox"
                        class="rounded border-border"
                      />
                      {{ echoT('b03.paper.showAuthors') }}
                    </label>
                    <div v-if="paperShareCanManage" class="space-y-2">
                      <div class="text-sm font-medium text-fg">
                        {{ echoT('b03.paper.shareVisibility') }}
                      </div>
                      <p class="channel-settings-hint">
                        {{ echoT('b03.paper.shareVisibilityHint') }}
                      </p>
                      <label
                        class="flex cursor-pointer items-start gap-2 text-sm"
                      >
                        <input
                          type="radio"
                          name="paper-share-vis-settings"
                          class="mt-0.5"
                          value="server"
                          :checked="paperShareVisibility === 'server'"
                          :disabled="paperShareSaving"
                          @change="onPaperShareVisibilityChange('server')"
                        />
                        {{ echoT('b03.paper.serverMembers') }}
                      </label>
                      <label
                        class="flex cursor-pointer items-start gap-2 text-sm"
                      >
                        <input
                          type="radio"
                          name="paper-share-vis-settings"
                          class="mt-0.5"
                          value="private"
                          :checked="paperShareVisibility === 'private'"
                          :disabled="paperShareSaving"
                          @change="onPaperShareVisibilityChange('private')"
                        />
                        {{ echoT('b03.paper.authorsOnly') }}
                      </label>
                      <label
                        class="flex cursor-pointer items-start gap-2 text-sm"
                      >
                        <input
                          type="radio"
                          name="paper-share-vis-settings"
                          class="mt-0.5"
                          value="global"
                          :checked="paperShareVisibility === 'global'"
                          :disabled="paperShareSaving"
                          @change="onPaperShareVisibilityChange('global')"
                        />
                        {{ echoT('b03.paper.anyoneWithLink') }}
                      </label>
                    </div>
                  </div>

                  <div v-if="channelType === 'text'" class="w-full min-w-0">
                    <div
                      class="channel-settings-section-label channel-settings-section-label--icon"
                    >
                      <img
                        :src="icons.stopwatch"
                        alt=""
                        class="channel-settings-label-icon server-settings-inline-icon"
                      />
                      {{ echoT('b03.overview.slowmode') }}
                    </div>
                    <div class="channel-settings-dropdowns mt-2 w-full min-w-0">
                      <EchoDropdown
                        v-model="slowModeSecondsStr"
                        :options="slowModeDropdownOptions"
                        menu-match-trigger-width
                        teleport-menu
                        attached
                        surface="server"
                      />
                    </div>
                    <p class="channel-settings-hint mt-1.5 w-full min-w-0">
                      {{ echoT('b03.overview.slowmodeHint') }}
                    </p>
                  </div>

                  <div
                    class="server-toggle-row w-full min-w-0 items-center !py-3.5"
                  >
                    <div
                      class="channel-settings-option-row__text flex min-w-0 items-center gap-2.5"
                    >
                      <img
                        :src="icons.shield"
                        alt=""
                        class="channel-settings-row-icon server-settings-inline-icon"
                      />
                      <div class="min-w-0">
                        <div class="channel-settings-option-title">
                          {{ echoT('b03.overview.nsfw') }}
                        </div>
                        <p class="channel-settings-hint mt-0.5">
                          {{ echoT('b03.overview.nsfwHint') }}
                        </p>
                      </div>
                    </div>
                    <input
                      v-model="nsfw"
                      type="checkbox"
                      class="server-toggle shrink-0"
                      :aria-label="echoT('b03.overview.nsfwAria')"
                    />
                  </div>

                  <div
                    v-if="channelType === 'voice'"
                    class="flex w-full min-w-0 flex-col gap-6"
                  >
                    <div class="w-full min-w-0">
                      <div
                        class="channel-settings-section-label channel-settings-section-label--icon"
                      >
                        <img
                          :src="icons.usersAvatar"
                          alt=""
                          class="channel-settings-label-icon server-settings-inline-icon"
                        />
                        {{ echoT('b03.voice.userLimit') }}
                      </div>
                      <div class="mt-3 flex w-full min-w-0 items-center gap-4">
                        <input
                          v-model.number="userLimit"
                          type="range"
                          min="0"
                          :max="USER_LIMIT_SLIDER_MAX"
                          step="1"
                          class="channel-user-limit-slider h-2 min-w-0 flex-1 cursor-pointer appearance-none rounded-full"
                          :style="{
                            '--slider-fill-pct': `${userLimitSliderFillPct}%`,
                          }"
                        />
                        <span
                          class="channel-settings-slider-value w-24 shrink-0 text-right text-sm font-medium tabular-nums"
                          >{{ userLimitLabel }}</span
                        >
                      </div>
                    </div>
                    <div class="w-full min-w-0">
                      <div
                        class="channel-settings-section-label channel-settings-section-label--icon"
                      >
                        <img
                          :src="icons.speedometer"
                          alt=""
                          class="channel-settings-label-icon server-settings-inline-icon"
                        />
                        {{ echoT('b03.voice.bitrate') }}
                      </div>
                      <div
                        class="server-toggle-row mt-3 w-full min-w-0 items-center !py-3.5"
                      >
                        <div class="channel-settings-option-row__text min-w-0">
                          <div class="channel-settings-option-title">
                            {{ echoT('b03.voice.useServerDefault') }}
                          </div>
                          <p class="channel-settings-hint mt-0.5">
                            {{
                              echoT('b03.voice.bitrateHint', {
                                min: ECHO_VOICE_BITRATE_MIN_KBPS,
                                max: ECHO_VOICE_BITRATE_MAX_KBPS,
                              })
                            }}
                          </p>
                        </div>
                        <input
                          v-model="voiceDefaultBitrate"
                          type="checkbox"
                          class="server-toggle shrink-0"
                          :aria-label="echoT('b03.voice.useServerDefaultAria')"
                        />
                      </div>
                      <div class="mt-3 flex w-full min-w-0 items-center gap-4">
                        <input
                          v-model.number="bitrateSliderKbps"
                          type="range"
                          :min="ECHO_VOICE_BITRATE_MIN_KBPS"
                          :max="ECHO_VOICE_BITRATE_MAX_KBPS"
                          step="1"
                          :disabled="voiceDefaultBitrate"
                          class="channel-user-limit-slider h-2 min-w-0 flex-1 cursor-pointer appearance-none rounded-full disabled:opacity-40"
                          :style="{
                            '--slider-fill-pct': `${bitrateSliderFillPct}%`,
                          }"
                        />
                        <span
                          class="channel-settings-slider-value w-24 shrink-0 text-right text-sm font-medium tabular-nums"
                          >{{ bitrateKbpsLabel }}</span
                        >
                      </div>
                    </div>
                  </div>

                  <div
                    v-if="channelType === 'voice' || channelType === 'stage'"
                    class="server-toggle-row w-full min-w-0 items-center !py-3.5"
                  >
                    <div
                      class="channel-settings-option-row__text flex min-w-0 items-center gap-2.5"
                    >
                      <img
                        :src="icons.chatLock"
                        alt=""
                        class="channel-settings-row-icon server-settings-inline-icon"
                      />
                      <div class="min-w-0">
                        <div class="channel-settings-option-title">
                          {{ echoT('b03.voice.e2ee') }}
                        </div>
                        <p class="channel-settings-hint mt-0.5">
                          {{ echoT('b03.voice.e2eeHint') }}
                        </p>
                      </div>
                    </div>
                    <input
                      v-model="voiceE2eeEnabled"
                      type="checkbox"
                      class="server-toggle shrink-0"
                      :aria-label="echoT('b03.voice.e2eeAria')"
                    />
                  </div>
                </div>
              </div>

              <div
                v-else-if="activeTab === 'discord_sync'"
                key="discord_sync"
                class="server-settings-panel-root pb-8"
              >
                <ChannelDiscordSyncPanel
                  :server-id="channelSettings.serverId"
                  :channel-id="channelSettings.channel.id"
                  :channel-type="discordSyncChannelType"
                />
              </div>

              <div
                v-else-if="activeTab === 'discord_voice_mirror'"
                key="discord_voice_mirror"
                class="server-settings-panel-root pb-8"
              >
                <ChannelDiscordVoiceMirrorPanel
                  :server-id="channelSettings.serverId"
                  :channel-id="channelSettings.channel.id"
                />
              </div>

              <div
                v-else-if="activeTab === 'webhooks'"
                key="webhooks"
                class="server-settings-panel-root pb-8"
              >
                <ChannelWebhooksPanel
                  :server-id="channelSettings.serverId"
                  :channel-id="channelSettings.channel.id"
                />
              </div>

              <div
                v-else-if="activeTab === 'format'"
                key="format"
                class="server-settings-panel-root pb-8"
              >
                <div class="max-w-2xl space-y-5">
                  <i18n-t
                    keypath="b03.format.intro"
                    tag="p"
                    scope="global"
                    class="channel-settings-hint text-[15px] leading-relaxed"
                  >
                    <template #soft>
                      <strong class="font-semibold text-fg">{{
                        echoT('b03.format.soft')
                      }}</strong>
                    </template>
                    <template #hard>
                      <strong class="font-semibold text-fg">{{
                        echoT('b03.format.hard')
                      }}</strong>
                    </template>
                  </i18n-t>
                  <div class="w-full min-w-0">
                    <label
                      class="channel-settings-section-label"
                      for="channel-settings-message-format"
                      >{{ echoT('b03.format.defaultText') }}</label
                    >
                    <textarea
                      id="channel-settings-message-format"
                      v-model="messageFormatTemplate"
                      class="channel-settings-message-format-input mt-2 min-h-[200px] w-full resize-y rounded-xl border border-border bg-glass px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-border"
                      :maxlength="ECHO_MESSAGE_FORMAT_TEMPLATE_MAX_CHARS"
                      spellcheck="true"
                      placeholder="- "
                    />
                  </div>
                  <fieldset class="space-y-2">
                    <legend class="channel-settings-section-label">
                      {{ echoT('b03.format.enforcement') }}
                    </legend>
                    <label
                      class="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-glass px-3 py-2.5"
                    >
                      <input
                        v-model="messageFormatHard"
                        type="radio"
                        class="mt-1"
                        :value="false"
                        :disabled="!messageFormatTemplate.trim()"
                      />
                      <span>
                        <span class="font-medium text-fg">{{
                          echoT('b03.format.soft')
                        }}</span>
                        <span
                          class="channel-settings-hint mt-0.5 block text-sm"
                        >
                          {{ echoT('b03.format.softHint') }}
                        </span>
                      </span>
                    </label>
                    <label
                      class="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-glass px-3 py-2.5"
                    >
                      <input
                        v-model="messageFormatHard"
                        type="radio"
                        class="mt-1"
                        :value="true"
                        :disabled="!messageFormatTemplate.trim()"
                      />
                      <span>
                        <span class="font-medium text-fg">{{
                          echoT('b03.format.hard')
                        }}</span>
                        <span
                          class="channel-settings-hint mt-0.5 block text-sm"
                        >
                          {{ echoT('b03.format.hardHint') }}
                        </span>
                      </span>
                    </label>
                  </fieldset>
                </div>
              </div>

              <div
                v-else-if="activeTab === 'forum_creator'"
                key="forum_creator"
                class="server-settings-panel-root pb-8"
              >
                <div class="max-w-xl space-y-5">
                  <i18n-t
                    keypath="b03.forum.intro"
                    tag="p"
                    scope="global"
                    class="channel-settings-hint text-[15px] leading-relaxed"
                  >
                    <template #own>
                      <strong class="font-semibold text-fg">{{
                        echoT('b03.forum.own')
                      }}</strong>
                    </template>
                  </i18n-t>
                  <div
                    class="server-toggle-row channel-settings-perm-sync-row items-start !py-4"
                  >
                    <div class="channel-settings-option-row__text min-w-0">
                      <div class="channel-settings-option-title">
                        {{ echoT('b03.forum.managePost') }}
                      </div>
                      <p class="channel-settings-hint mt-1">
                        {{ echoT('b03.forum.managePostHint') }}
                      </p>
                    </div>
                    <input
                      v-model="forumManagePostFlags"
                      type="checkbox"
                      class="server-toggle mt-0.5 shrink-0"
                    />
                  </div>
                  <div
                    class="server-toggle-row channel-settings-perm-sync-row items-start !py-4"
                  >
                    <div class="channel-settings-option-row__text min-w-0">
                      <div class="channel-settings-option-title">
                        {{ echoT('b03.forum.deleteOwn') }}
                      </div>
                      <p class="channel-settings-hint mt-1">
                        {{ echoT('b03.forum.deleteOwnHint') }}
                      </p>
                    </div>
                    <input
                      v-model="forumDeleteOwnPost"
                      type="checkbox"
                      class="server-toggle mt-0.5 shrink-0"
                    />
                  </div>
                  <div
                    class="server-toggle-row channel-settings-perm-sync-row items-start !py-4"
                  >
                    <div class="channel-settings-option-row__text min-w-0">
                      <div class="channel-settings-option-title">
                        {{ echoT('b03.forum.deleteOthers') }}
                      </div>
                      <p class="channel-settings-hint mt-1">
                        {{ echoT('b03.forum.deleteOthersHint') }}
                      </p>
                    </div>
                    <input
                      v-model="forumModerateMessagesInOwnPost"
                      type="checkbox"
                      class="server-toggle mt-0.5 shrink-0"
                    />
                  </div>
                </div>
              </div>

              <div
                v-else-if="activeTab === 'danger_zone'"
                key="danger_zone"
                class="server-settings-panel-root pb-8"
              >
                <div class="max-w-lg space-y-8">
                  <p class="channel-settings-hint text-[15px] leading-relaxed">
                    {{ echoT('b03.danger.intro') }}
                  </p>

                  <section
                    v-if="channelType === 'text' || channelType === 'forum'"
                    class="space-y-3"
                  >
                    <div class="channel-settings-section-label">
                      {{ echoT('b03.danger.autoDelete') }}
                    </div>
                    <p class="channel-settings-hint mt-1.5 w-full min-w-0">
                      {{ echoT('b03.danger.autoDeleteHint') }}
                    </p>
                    <label
                      class="mt-3 flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <input
                        v-model="autoDeleteSyncedToCategory"
                        type="checkbox"
                        class="rounded border-border"
                      />
                      {{ echoT('b03.common.syncWithCategory') }}
                    </label>
                    <p
                      v-if="autoDeleteSyncedToCategory"
                      class="channel-settings-hint mt-2 w-full min-w-0"
                    >
                      {{
                        echoT('b03.danger.inherited', {
                          value: messageAutoDeleteOptionLabel(
                            effectiveCategoryAutoDeleteStr || '',
                          ),
                        })
                      }}
                    </p>
                    <div
                      class="channel-settings-dropdowns mt-3 w-full min-w-0"
                      :class="{
                        'pointer-events-none opacity-45':
                          autoDeleteSyncedToCategory,
                      }"
                    >
                      <EchoDropdown
                        v-model="displayedAutoDeleteStr"
                        :options="autoDeleteDropdownOptions"
                        :label="echoT('b03.danger.retention')"
                        menu-match-trigger-width
                        teleport-menu
                        attached
                        surface="server"
                      />
                    </div>
                  </section>

                  <div
                    class="danger-row danger-row--flat max-w-xl flex-col items-stretch gap-3 sm:flex-row"
                  >
                    <div class="min-w-0">
                      <div class="text-sm font-semibold echo-danger-title">
                        {{ echoT('b03.danger.deleteChannel') }}
                      </div>
                      <i18n-t
                        keypath="b03.danger.deleteDesc"
                        tag="p"
                        scope="global"
                        class="mt-1 text-sm text-fg-soft"
                      >
                        <template #name>
                          <span
                            class="inline-flex min-w-0 max-w-full align-bottom"
                          >
                            <span
                              class="min-w-0 truncate font-semibold text-fg"
                              :title="'#' + channelSettings.channel.name"
                              >#{{ channelSettings.channel.name }}</span
                            >
                          </span>
                        </template>
                      </i18n-t>
                    </div>
                    <button
                      type="button"
                      class="danger-btn danger-btn--strong shrink-0 self-start sm:self-center"
                      @click="confirmDeleteChannel"
                    >
                      {{ echoT('b03.danger.deleteChannel') }}
                    </button>
                  </div>
                </div>
              </div>

              <div
                v-else-if="activeTab === 'permissions'"
                key="permissions"
                class="server-settings-panel-root space-y-5 pb-4"
              >
                <div
                  v-if="isPaperChannel && paperPermissionsDisabled"
                  class="rounded-xl border border-border bg-elevated/50 p-4"
                >
                  <i18n-t
                    keypath="b03.perm.paperNote"
                    tag="p"
                    scope="global"
                    class="text-sm text-fg"
                  >
                    <template #mode>
                      <strong>{{ echoT('b03.paper.serverMembers') }}</strong>
                    </template>
                  </i18n-t>
                </div>

                <template
                  v-if="
                    echoPermissionEditor &&
                    !(isPaperChannel && paperPermissionsDisabled)
                  "
                >
                  <div
                    class="server-toggle-row channel-settings-perm-sync-row items-start !py-4"
                  >
                    <div
                      class="channel-settings-option-row__text min-w-0 max-w-[min(100%,42rem)]"
                    >
                      <div class="channel-settings-option-title">
                        {{ echoT('b03.common.syncWithCategory') }}
                      </div>
                      <i18n-t
                        keypath="b03.perm.syncHint"
                        tag="p"
                        scope="global"
                        class="channel-settings-hint mt-1"
                      >
                        <template #category>
                          <span class="font-semibold text-fg-soft">{{
                            channelCategoryLabel
                          }}</span>
                        </template>
                      </i18n-t>
                    </div>
                    <input
                      v-model="echoSyncWithCategoryModel"
                      type="checkbox"
                      class="server-toggle mt-0.5 shrink-0"
                    />
                  </div>

                  <div
                    v-if="echoSyncWithCategoryModel"
                    class="echo-warn-banner rounded-xl border border-amber-400/25 border-l-4 border-l-amber-400/70 px-4 py-3 text-sm leading-relaxed"
                    role="note"
                  >
                    <i18n-t
                      keypath="b03.perm.inheriting"
                      tag="span"
                      scope="global"
                    >
                      <template #category>
                        <span class="font-semibold">{{
                          channelCategoryLabel
                        }}</span>
                      </template>
                    </i18n-t>
                  </div>

                  <PermissionOverwriteEditor
                    v-model:selected-row-key="permissionSelectedRowKey"
                    :rows="echoPermissionRows"
                    :roles="echoPermissionEditor.roles"
                    :members="echoPermissionEditor.members"
                    :permission-defs="echoPermissionDefs"
                    :loading="echoPermissionEditor.loading"
                    :disabled="echoSyncWithCategoryModel"
                    :disabled-message="
                      echoT('b03.perm.inheriting', {
                        category: channelCategoryLabel,
                      })
                    "
                    @update:rows="echoPermissionRows = $event"
                  />
                </template>
                <template
                  v-else-if="isPaperChannel && paperPermissionsDisabled"
                >
                  <!-- Permissions hidden when paper share visibility is not server -->
                </template>

                <div
                  v-else
                  class="server-settings-panel w-full max-w-full rounded-2xl p-1"
                  :class="{
                    'pointer-events-none opacity-45': syncWithCategoryModel,
                  }"
                >
                  <div
                    class="server-toggle-row channel-settings-perm-sync-row items-start !py-4 px-3"
                  >
                    <div
                      class="channel-settings-option-row__text min-w-0 max-w-[min(100%,42rem)]"
                    >
                      <div class="channel-settings-option-title">
                        {{ echoT('b03.common.syncWithCategory') }}
                      </div>
                      <i18n-t
                        keypath="b03.perm.defaultsHint"
                        tag="p"
                        scope="global"
                        class="channel-settings-hint mt-1"
                      >
                        <template #category>
                          <span class="font-semibold text-fg-soft">{{
                            channelCategoryLabel
                          }}</span>
                        </template>
                      </i18n-t>
                    </div>
                    <input
                      v-model="syncWithCategoryModel"
                      type="checkbox"
                      class="server-toggle mt-0.5 shrink-0"
                    />
                  </div>

                  <div
                    v-if="syncWithCategoryModel"
                    class="echo-warn-banner mx-3 rounded-xl border border-amber-400/25 border-l-4 border-l-amber-400/70 px-4 py-3 text-sm leading-relaxed"
                    role="note"
                  >
                    <i18n-t
                      keypath="b03.perm.showingDefaults"
                      tag="span"
                      scope="global"
                    >
                      <template #category>
                        <span class="font-semibold">{{
                          channelCategoryLabel
                        }}</span>
                      </template>
                    </i18n-t>
                  </div>

                  <div
                    v-for="[group, defs] in permissionGroupsList"
                    :key="group"
                    class="mb-4 w-full last:mb-0"
                  >
                    <div class="settings-subtitle px-3 pt-3 pb-2">
                      {{ permissionGroupLabel(group) }}
                    </div>
                    <div
                      class="roles-permissions-list flex w-full flex-col gap-0.5"
                    >
                      <div
                        v-for="def in defs"
                        :key="def.key"
                        class="role-permission-row channel-settings-perm-item w-full min-w-0 items-start !py-3.5"
                      >
                        <div
                          class="flex min-w-0 flex-1 items-start gap-2.5 pr-3"
                        >
                          <ChannelPermissionIconBadge
                            :permission-key="def.key"
                          />
                          <span
                            class="channel-settings-option-row__text min-w-0 pt-1 text-[14px] font-semibold leading-snug text-fg"
                            >{{
                              channelPermissionLabel(def.key, {
                                group: def.group,
                              })
                            }}</span
                          >
                        </div>
                        <input
                          type="checkbox"
                          class="server-toggle mt-0.5 shrink-0"
                          :checked="isPermAllowed(def.key)"
                          @click.prevent="togglePermission(def.key)"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Transition>
          </div>

          <div
            v-if="channelDirty"
            class="roles-change-bar mt-4 shrink-0 border-t border-border pt-4"
          >
            <div class="text-sm text-fg-subtle">
              {{ echoT('b03.footer.changesApply') }}
            </div>
            <div class="flex gap-2">
              <button
                type="button"
                class="rounded-lg px-4 py-2 text-sm font-semibold text-fg-soft transition-colors hover:bg-glass-hover"
                @click="close"
              >
                {{ echoT('b03.footer.cancel') }}
              </button>
              <button
                type="button"
                class="rounded-lg px-4 py-2 text-sm font-semibold transition-colors hover:bg-glass-active disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="!canSave"
                @click="save"
              >
                {{ echoT('serverSettingsUi.saveChanges') }}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  </Transition>
</template>

<style scoped lang="scss" src="./styles/ChannelSettingsModal.scss"></style>

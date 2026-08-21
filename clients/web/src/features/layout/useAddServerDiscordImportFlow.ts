import { computed, nextTick, onUnmounted, ref, watch, type Ref } from 'vue';
import {
  clearDiscordBotExportWaitState,
  writeDiscordBotExportWaitState,
} from '@/features/discord/botExportWaitState';
import {
  fetchDiscordBotExportPendingRows,
  fetchDiscordBotInGuildStatus,
  interpretBotExportPollAfterFetch,
  loadImportableGuildsOutcome,
  postDiscordBotExportPendingForGuild,
  type AddServerDiscordImportPhase,
  type DiscordBotWaitUiStep,
  type DiscordImportableGuildDto,
} from '@/features/layout/addServerDiscordImportMe';
import { openExternal } from '@/platform/desktopBridge';

/** If the export bot never runs, the UI must not spin forever; user can retry from the bot step. */
const BOT_WAIT_MODAL_TIMEOUT_MS = 12 * 60 * 1000;
/** Nudge that large exports or a missing bot process may be the cause. */
const BOT_WAIT_LONG_HINT_MS = 2 * 60 * 1000;

type AddServerModalView = 'initial' | 'create' | 'join';

export function useAddServerDiscordImportFlow(deps: {
  modelValue: Ref<boolean>;
  canImportDiscord: Ref<boolean | undefined>;
  view: Ref<AddServerModalView>;
  newServerName: Ref<string>;
  onRequestDiscordLink: () => void;
  /** e.g. revoke icon preview before starting Discord import */
  beforeChooseDiscordImport?: () => void;
  /** Revoke previews and return to initial add-server view (Back from Discord wizard). */
  onBackFromCreateToInitial: () => void;
  emitModelValue: (value: boolean) => void;
}) {
  const createUsesDiscordImport = ref(false);
  const discordImportPhase = ref<AddServerDiscordImportPhase>('loading');
  const importableGuilds = ref<DiscordImportableGuildDto[]>([]);
  const discordGuildsError = ref('');
  const selectedImportGuild = ref<DiscordImportableGuildDto | null>(null);
  const guildsLoading = ref(false);
  const guildSearchQuery = ref('');
  const botWaitTakingLong = ref(false);
  const discordInviteFlowBusy = ref(false);

  const importLeaveConfirmVisible = ref(false);
  const skipWaitPersistenceOnClose = ref(false);
  const importLeaveDialogRef = ref<HTMLElement | null>(null);

  const discordBotWaitUiStep = ref<DiscordBotWaitUiStep>('connecting');
  let botWaitPollCount = 0;

  let botWaitPollTimer: ReturnType<typeof setInterval> | null = null;
  let botWaitDeadline: number | null = null;
  let botWaitHintTimer: ReturnType<typeof setTimeout> | null = null;

  function clearBotWaitHintTimer() {
    if (botWaitHintTimer != null) {
      clearTimeout(botWaitHintTimer);
      botWaitHintTimer = null;
    }
  }

  function startBotWaitHintTimer() {
    clearBotWaitHintTimer();
    botWaitTakingLong.value = false;
    botWaitHintTimer = setTimeout(() => {
      botWaitTakingLong.value = true;
      botWaitHintTimer = null;
    }, BOT_WAIT_LONG_HINT_MS);
  }

  function stopBotWaitPoll() {
    if (botWaitPollTimer != null) {
      clearInterval(botWaitPollTimer);
      botWaitPollTimer = null;
    }
    botWaitDeadline = null;
    botWaitPollCount = 0;
    clearBotWaitHintTimer();
    botWaitTakingLong.value = false;
  }

  function applyBotWaitTimeout() {
    stopBotWaitPoll();
    clearDiscordBotExportWaitState();
    discordImportPhase.value = 'invite_bot';
    discordGuildsError.value =
      'That took too long. Try Open Discord again, or create a server without importing.';
  }

  function resetDiscordImportWizard() {
    stopBotWaitPoll();
    discordImportPhase.value = 'loading';
    importableGuilds.value = [];
    discordGuildsError.value = '';
    selectedImportGuild.value = null;
    guildsLoading.value = false;
    guildSearchQuery.value = '';
  }

  const filteredImportableGuilds = computed(() => {
    const q = guildSearchQuery.value.trim().toLowerCase();
    if (!q) return importableGuilds.value;
    return importableGuilds.value.filter((g) =>
      (g.name || '').toLowerCase().includes(q),
    );
  });

  const discordImportExitGuard = computed(
    () => createUsesDiscordImport.value && deps.view.value === 'create',
  );

  function resetForModalOpen() {
    createUsesDiscordImport.value = false;
    resetDiscordImportWizard();
  }

  function setCreateUsesDiscordImport(next: boolean) {
    createUsesDiscordImport.value = next;
  }

  function handleRequestClose(performClose: () => void) {
    if (importLeaveConfirmVisible.value) {
      importLeaveConfirmVisible.value = false;
      return;
    }
    if (discordImportExitGuard.value) {
      importLeaveConfirmVisible.value = true;
      void nextTick(() => importLeaveDialogRef.value?.focus());
      return;
    }
    performClose();
  }

  function cancelImportLeaveConfirm() {
    importLeaveConfirmVisible.value = false;
  }

  function confirmLeaveDiscordImport() {
    importLeaveConfirmVisible.value = false;
    skipWaitPersistenceOnClose.value = true;
    stopBotWaitPoll();
    clearDiscordBotExportWaitState();
    deps.emitModelValue(false);
  }

  watch(
    () => deps.modelValue.value,
    (open, wasOpen) => {
      if (skipWaitPersistenceOnClose.value) {
        skipWaitPersistenceOnClose.value = false;
        return;
      }
      if (
        wasOpen &&
        !open &&
        discordImportPhase.value === 'waiting_bot' &&
        selectedImportGuild.value
      ) {
        writeDiscordBotExportWaitState({
          guildId: selectedImportGuild.value.id,
          guildName: selectedImportGuild.value.name,
          startedAt: Date.now(),
        });
        stopBotWaitPoll();
      }
    },
  );

  onUnmounted(() => {
    stopBotWaitPoll();
  });

  async function loadImportableGuilds() {
    if (!deps.canImportDiscord.value) return;
    guildsLoading.value = true;
    discordGuildsError.value = '';
    try {
      const outcome = await loadImportableGuildsOutcome();
      discordImportPhase.value = outcome.phase;
      importableGuilds.value = outcome.guilds;
      discordGuildsError.value = outcome.message;
    } finally {
      guildsLoading.value = false;
    }
  }

  function chooseDiscordImport() {
    deps.beforeChooseDiscordImport?.();
    createUsesDiscordImport.value = true;
    resetDiscordImportWizard();
    discordImportPhase.value = 'loading';
    guildsLoading.value = true;
    void loadImportableGuilds();
  }

  function backFromCreateDiscordCleanup() {
    createUsesDiscordImport.value = false;
    resetDiscordImportWizard();
  }

  function backDiscordImportStep() {
    if (discordImportPhase.value === 'waiting_bot') {
      stopBotWaitPoll();
      clearDiscordBotExportWaitState();
      discordImportPhase.value = 'invite_bot';
      discordGuildsError.value = '';
      return;
    }
    if (discordImportPhase.value === 'invite_bot') {
      selectedImportGuild.value = null;
      discordImportPhase.value = 'pick_guild';
      discordGuildsError.value = '';
      return;
    }
    if (
      discordImportPhase.value === 'pick_guild' ||
      discordImportPhase.value === 'need_link' ||
      discordImportPhase.value === 'loading'
    ) {
      backFromCreateDiscordCleanup();
      deps.onBackFromCreateToInitial();
    }
  }

  function selectImportGuild(g: DiscordImportableGuildDto) {
    selectedImportGuild.value = g;
    discordImportPhase.value = 'invite_bot';
  }

  async function pollBotExportReadyOnce(): Promise<boolean> {
    const g = selectedImportGuild.value;
    if (!g?.id || discordImportPhase.value !== 'waiting_bot') {
      stopBotWaitPoll();
      return false;
    }
    if (botWaitDeadline != null && Date.now() >= botWaitDeadline) {
      applyBotWaitTimeout();
      return false;
    }
    botWaitPollCount += 1;
    try {
      const pendingRows = await fetchDiscordBotExportPendingRows();
      const row = pendingRows.find((p) => p.discordGuildId === g.id);
      let botInGuildWhenProbed:
        | { botInGuild: boolean; checkSkipped: boolean }
        | null
        | undefined = undefined;
      if (botWaitPollCount % 2 === 1 && row && !row.ready) {
        try {
          botInGuildWhenProbed = await fetchDiscordBotInGuildStatus(g.id);
        } catch {
          botInGuildWhenProbed = null;
        }
      }
      const r = interpretBotExportPollAfterFetch({
        guildId: g.id,
        pendingRows,
        pollCountAfterIncrement: botWaitPollCount,
        botInGuildWhenProbed,
      });
      if (r.uiStep != null) {
        discordBotWaitUiStep.value = r.uiStep;
      }
      return r.isReady === true;
    } catch {
      return false;
    }
  }

  function continueAfterBotInvite() {
    stopBotWaitPoll();
    clearDiscordBotExportWaitState();
    const g = selectedImportGuild.value;
    if (g?.name) {
      deps.newServerName.value = g.name;
    }
    discordImportPhase.value = 'name_server';
  }

  async function openDiscordForBotInstall() {
    const g = selectedImportGuild.value;
    const url = g?.botInviteUrl?.trim();
    if (!g?.id || !url) return;
    discordInviteFlowBusy.value = true;
    try {
      let openDiscordTab = true;
      try {
        const check = await fetchDiscordBotInGuildStatus(g.id);
        if (!check.checkSkipped && check.botInGuild) {
          openDiscordTab = false;
        }
      } catch {
        /* If the check fails, fall back to opening Discord. */
      }

      try {
        await postDiscordBotExportPendingForGuild(g.id, g.name || '');
      } catch (e) {
        discordGuildsError.value =
          e instanceof Error ? e.message : 'Something went wrong. Try again.';
        return;
      }
      discordGuildsError.value = '';
      discordBotWaitUiStep.value = 'connecting';
      if (openDiscordTab) {
        void openExternal(url);
      }
      stopBotWaitPoll();
      discordImportPhase.value = 'waiting_bot';
      botWaitDeadline = Date.now() + BOT_WAIT_MODAL_TIMEOUT_MS;
      startBotWaitHintTimer();
      if (await pollBotExportReadyOnce()) {
        continueAfterBotInvite();
        return;
      }
      botWaitPollTimer = setInterval(() => {
        void (async () => {
          if (await pollBotExportReadyOnce()) {
            continueAfterBotInvite();
          }
        })();
      }, 3000);
    } finally {
      discordInviteFlowBusy.value = false;
    }
  }

  function onLinkDiscordClick() {
    deps.onRequestDiscordLink();
  }

  function clearImportLeaveConfirmOnParentClose() {
    importLeaveConfirmVisible.value = false;
  }

  return {
    createUsesDiscordImport,
    discordImportPhase,
    importableGuilds,
    discordGuildsError,
    selectedImportGuild,
    guildsLoading,
    guildSearchQuery,
    botWaitTakingLong,
    discordInviteFlowBusy,
    importLeaveConfirmVisible,
    importLeaveDialogRef,
    discordBotWaitUiStep,
    filteredImportableGuilds,
    discordImportExitGuard,
    resetForModalOpen,
    resetDiscordImportWizard,
    setCreateUsesDiscordImport,
    handleRequestClose,
    cancelImportLeaveConfirm,
    confirmLeaveDiscordImport,
    loadImportableGuilds,
    chooseDiscordImport,
    backDiscordImportStep,
    selectImportGuild,
    openDiscordForBotInstall,
    onLinkDiscordClick,
    clearImportLeaveConfirmOnParentClose,
  };
}

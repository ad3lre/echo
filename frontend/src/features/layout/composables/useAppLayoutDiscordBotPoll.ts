import { ref, watch, onMounted, onUnmounted } from 'vue';
import { fetchDiscordBotExportPending } from '@/api/meClient';
import {
  clearDiscordBotExportWaitState,
  DISCORD_BOT_BG_WAIT_MAX_MS,
  ensureDiscordBotExportWaitStartedAt,
  isDiscordBotExportWaitExpired,
  readDiscordBotExportWaitState,
  writeDiscordBotExportWaitState,
} from '@/features/discord/discordBotExportWaitState';

/** Cadence for the background poll that watches for a ready Discord bot export. */
const DISCORD_BOT_BG_POLL_INTERVAL_MS = 5000;

export function useAppLayoutDiscordBotPoll(deps: {
  isAuthenticated: () => boolean;
  isAddServerModalOpen: { value: boolean };
}) {
  const discordBotExportReadyBanner = ref<{ guildName: string } | null>(null);
  let bgPollTimer: ReturnType<typeof setInterval> | null = null;

  function clearBgPoll() {
    if (bgPollTimer != null) {
      clearInterval(bgPollTimer);
      bgPollTimer = null;
    }
  }

  async function tick(): Promise<void> {
    if (!deps.isAuthenticated()) return;
    const wait = readDiscordBotExportWaitState();
    if (!wait) {
      clearBgPoll();
      return;
    }
    const normalizedWait = ensureDiscordBotExportWaitStartedAt(wait);
    if (normalizedWait.startedAt !== wait.startedAt) {
      writeDiscordBotExportWaitState(normalizedWait);
    }
    if (
      isDiscordBotExportWaitExpired(normalizedWait, DISCORD_BOT_BG_WAIT_MAX_MS)
    ) {
      clearDiscordBotExportWaitState();
      clearBgPoll();
      return;
    }
    try {
      const { pending } = await fetchDiscordBotExportPending();
      const row = pending.find(
        (p) => p.discordGuildId === normalizedWait.guildId,
      );
      if (row?.ready) {
        clearDiscordBotExportWaitState();
        clearBgPoll();
        discordBotExportReadyBanner.value = {
          guildName: row.guildName || normalizedWait.guildName,
        };
      }
    } catch {
      /* ignore */
    }
  }

  function ensureBgPoll(): void {
    if (!deps.isAuthenticated()) {
      clearBgPoll();
      return;
    }
    if (!readDiscordBotExportWaitState()) {
      clearBgPoll();
      return;
    }
    if (bgPollTimer != null) return;
    void tick();
    bgPollTimer = setInterval(
      () => void tick(),
      DISCORD_BOT_BG_POLL_INTERVAL_MS,
    );
  }

  function dismissBanner(): void {
    discordBotExportReadyBanner.value = null;
  }

  onMounted(() => {
    ensureBgPoll();
  });

  onUnmounted(() => {
    clearBgPoll();
  });

  watch(
    () => deps.isAuthenticated(),
    () => {
      ensureBgPoll();
    },
  );

  watch(deps.isAddServerModalOpen, (open) => {
    if (!open) ensureBgPoll();
  });

  return {
    discordBotExportReadyBanner,
    dismissDiscordBotExportReadyBanner: dismissBanner,
  };
}

import {
  fetchDiscordImportableGuilds,
  fetchDiscordBotExportPending,
  fetchDiscordBotInGuild,
  postDiscordBotExportPending,
  type DiscordImportableGuildDto,
  type DiscordBotExportPendingRow,
} from '@/api/meClient';

export type {
  DiscordImportableGuildDto,
  DiscordBotExportPendingRow,
} from '@/api/meClient';

export type AddServerDiscordImportPhase =
  | 'loading'
  | 'need_link'
  | 'pick_guild'
  | 'invite_bot'
  | 'waiting_bot'
  | 'name_server';

export type DiscordBotWaitUiStep =
  | 'connecting'
  | 'need_bot'
  | 'exporting'
  | 'stuck_sync';

export type LoadImportableGuildsOutcome =
  | {
      phase: 'need_link';
      guilds: DiscordImportableGuildDto[];
      message: string;
    }
  | {
      phase: 'pick_guild';
      guilds: DiscordImportableGuildDto[];
      message: string;
    };

export async function loadImportableGuildsOutcome(): Promise<LoadImportableGuildsOutcome> {
  try {
    const r = await fetchDiscordImportableGuilds();
    if (!r.linked) {
      return { phase: 'need_link', guilds: [], message: '' };
    }
    if ('tokenExpired' in r && r.tokenExpired) {
      return {
        phase: 'need_link',
        guilds: [],
        message: 'Your Discord link expired. Reconnect it in Settings.',
      };
    }
    if ('missingGuildsScope' in r && r.missingGuildsScope) {
      return {
        phase: 'need_link',
        guilds: [],
        message:
          'We need permission to see your servers. Disconnect and link Discord again in Settings.',
      };
    }
    if (r.guilds.length === 0) {
      return {
        phase: 'pick_guild',
        guilds: [],
        message:
          'No servers found that you can import. You need to manage the server in Discord.',
      };
    }
    return { phase: 'pick_guild', guilds: r.guilds, message: '' };
  } catch (e) {
    return {
      phase: 'pick_guild',
      guilds: [],
      message:
        e instanceof Error ? e.message : 'Could not load servers. Try again.',
    };
  }
}

export async function fetchDiscordBotExportPendingRows(): Promise<
  DiscordBotExportPendingRow[]
> {
  const { pending } = await fetchDiscordBotExportPending();
  return pending;
}

export async function fetchDiscordBotInGuildStatus(
  discordGuildId: string,
): Promise<{ botInGuild: boolean; checkSkipped: boolean }> {
  return fetchDiscordBotInGuild(discordGuildId);
}

export async function postDiscordBotExportPendingForGuild(
  discordGuildId: string,
  guildName: string,
): Promise<void> {
  return postDiscordBotExportPending(discordGuildId, guildName);
}

export type BotExportPollInterpretResult =
  | { isReady: true; uiStep: 'exporting' }
  | { isReady: false; uiStep?: DiscordBotWaitUiStep };

/**
 * After fetching pending rows, with poll count already incremented.
 * Callers should only set `botInGuildWhenProbed` when they ran the in-guild probe (odd tick + pending row exists and not ready).
 */
export function interpretBotExportPollAfterFetch(input: {
  guildId: string;
  pendingRows: DiscordBotExportPendingRow[];
  pollCountAfterIncrement: number;
  botInGuildWhenProbed?: { botInGuild: boolean; checkSkipped: boolean } | null;
}): BotExportPollInterpretResult {
  const {
    guildId,
    pendingRows,
    pollCountAfterIncrement,
    botInGuildWhenProbed,
  } = input;
  const row = pendingRows.find((p) => p.discordGuildId === guildId);
  if (row?.ready === true) {
    return { isReady: true, uiStep: 'exporting' };
  }
  if (!row) {
    return {
      isReady: false,
      uiStep: pollCountAfterIncrement < 4 ? 'connecting' : 'stuck_sync',
    };
  }
  if (pollCountAfterIncrement % 2 === 1) {
    if (botInGuildWhenProbed == null) {
      return { isReady: false };
    }
    if (
      !botInGuildWhenProbed.checkSkipped &&
      !botInGuildWhenProbed.botInGuild
    ) {
      return { isReady: false, uiStep: 'need_bot' };
    }
  }
  return { isReady: false, uiStep: 'exporting' };
}

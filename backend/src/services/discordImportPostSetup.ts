import type { Pool } from 'pg';
import {
  applyDiscordBridgePut,
  type DiscordBridgeApplyContext,
} from './discordBridgeApply';
import { getDiscordImportState } from './discordImport';
import { runDiscordMessageImport } from './discordMessageImport';
import {
  applyMirrorVoiceDenyConnect,
  upsertDiscordVoiceMirrorVoiceChannel,
} from '../domain/discordVoiceMirrorRepo';
import { countEchoMessagesInChannel } from '../domain/echoMessagesDal';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Small jitter so parallel clients do not align on the same beat. */
function jittered(baseMs: number): number {
  return baseMs + Math.floor(Math.random() * 220);
}

/** Pause between Discord-facing operations (bot history fetch, webhook creation, etc.). */
const DISCORD_API_SPACING_MS = 520;
const VOICE_LOCAL_GAP_MS = 60;

export type DiscordImportPostSetupBody = {
  syncAllChannels?: boolean;
  importRecentMessages?: boolean;
  /** 1–100, default 90 */
  messageLimit?: number;
};

export type DiscordImportPostSetupBridgeSummary = {
  applied: number;
  failed: number;
  skipped: number;
  failures: { channelId: string; message: string }[];
};

export type DiscordImportPostSetupVoiceSummary = {
  enabled: number;
  failed: number;
  failures: { channelId: string; message: string }[];
};

export type DiscordImportPostSetupMessagesSummary = {
  channelsTried: number;
  importedTotal: number;
  skippedNonEmpty: number;
  skippedWrongType: number;
  failures: { channelId: string; message: string }[];
};

export type DiscordImportPostSetupResult = {
  sync?: {
    bridges: DiscordImportPostSetupBridgeSummary;
    voice: DiscordImportPostSetupVoiceSummary;
  };
  messages?: DiscordImportPostSetupMessagesSummary;
};

/**
 * Optional follow-up after `run-full`: enable Discord↔Echo bridges on all imported
 * text/forum channels (plus voice mirror on voice), then optionally pull recent
 * history into empty channels. Message import runs **before** bridge enable so
 * channels stay empty for import and Discord is not hammered concurrently.
 */
export async function runDiscordImportPostSetup(
  pool: Pool,
  serverId: string,
  actorId: string,
  body: DiscordImportPostSetupBody,
  bridgeCtx?: DiscordBridgeApplyContext,
): Promise<DiscordImportPostSetupResult> {
  const syncAll = body.syncAllChannels === true;
  const importMsgs = body.importRecentMessages === true;
  const messageLimit =
    typeof body.messageLimit === 'number' && Number.isFinite(body.messageLimit)
      ? Math.min(100, Math.max(1, Math.floor(body.messageLimit)))
      : 90;

  if (!syncAll && !importMsgs) {
    return {};
  }

  const state = await getDiscordImportState(pool, serverId);
  if (!state?.channelsImported) {
    throw new Error('Discord channels must be imported before this step.');
  }

  let guildId = '';
  if (syncAll) {
    const guildRow = await pool.query(
      `SELECT NULLIF(TRIM(discord_guild_id::text), '') AS gid
       FROM echo_discord_import_states WHERE server_id = $1 LIMIT 1`,
      [serverId],
    );
    guildId = String(guildRow.rows[0]?.gid ?? '').trim();
    if (!guildId) {
      throw new Error(
        'This server is not bound to a Discord guild; bind Discord import first.',
      );
    }
  }

  const out: DiscordImportPostSetupResult = {};
  const pairs = Object.entries(state.channelIdMap).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  if (importMsgs) {
    const messages: DiscordImportPostSetupMessagesSummary = {
      channelsTried: 0,
      importedTotal: 0,
      skippedNonEmpty: 0,
      skippedWrongType: 0,
      failures: [],
    };

    for (const [, echoChannelId] of pairs) {
      const ct = await pool.query(
        `SELECT LOWER(type::text) AS t FROM echo_channels WHERE id = $1 AND server_id = $2`,
        [echoChannelId, serverId],
      );
      if (!ct.rows.length) continue;
      const t = String(ct.rows[0]?.t ?? '');
      if (t !== 'text' && t !== 'forum') {
        messages.skippedWrongType += 1;
        continue;
      }
      const cnt = await countEchoMessagesInChannel(pool, echoChannelId);
      if (cnt > 0) {
        messages.skippedNonEmpty += 1;
        continue;
      }
      messages.channelsTried += 1;
      try {
        const r = await runDiscordMessageImport(
          pool,
          serverId,
          echoChannelId,
          actorId,
          {
            limit: messageLimit,
          },
        );
        messages.importedTotal += r.importedCount;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        messages.failures.push({ channelId: echoChannelId, message: msg });
      }
      await sleep(jittered(DISCORD_API_SPACING_MS));
    }

    out.messages = messages;
  }

  if (syncAll) {
    const bridges: DiscordImportPostSetupBridgeSummary = {
      applied: 0,
      failed: 0,
      skipped: 0,
      failures: [],
    };
    const voice: DiscordImportPostSetupVoiceSummary = {
      enabled: 0,
      failed: 0,
      failures: [],
    };

    for (const [discordChannelId, echoChannelId] of pairs) {
      const ct = await pool.query(
        `SELECT LOWER(type::text) AS t FROM echo_channels WHERE id = $1 AND server_id = $2`,
        [echoChannelId, serverId],
      );
      if (!ct.rows.length) continue;
      const t = String(ct.rows[0]?.t ?? '');

      if (t === 'text' || t === 'forum') {
        const r = await applyDiscordBridgePut(
          pool,
          serverId,
          echoChannelId,
          actorId,
          {
            inboundEnabled: true,
            outboundEnabled: true,
            discordGuildId: guildId,
            discordChannelId,
          },
          bridgeCtx,
        );
        if (r.ok) {
          bridges.applied += 1;
        } else if (r.error.code === 'FORBIDDEN') {
          bridges.skipped += 1;
        } else {
          bridges.failed += 1;
          bridges.failures.push({
            channelId: echoChannelId,
            message: r.error.message,
          });
        }
        await sleep(jittered(DISCORD_API_SPACING_MS));
      } else if (t === 'voice') {
        try {
          await upsertDiscordVoiceMirrorVoiceChannel(pool, {
            serverId,
            channelId: echoChannelId,
            enabled: true,
          });
          await pool.query(
            `UPDATE echo_channels SET discord_voice_mirror_only = true WHERE id = $1 AND server_id = $2`,
            [echoChannelId, serverId],
          );
          await applyMirrorVoiceDenyConnect(pool, serverId, echoChannelId);
          voice.enabled += 1;
        } catch (e) {
          voice.failed += 1;
          voice.failures.push({
            channelId: echoChannelId,
            message: e instanceof Error ? e.message : String(e),
          });
        }
        await sleep(VOICE_LOCAL_GAP_MS);
      }
    }

    out.sync = { bridges, voice };
  }

  return out;
}

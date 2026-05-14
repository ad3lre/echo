import { join, resolve } from 'node:path';
import { Routes } from 'discord.js';
import type { Client, Guild, GuildMember } from 'discord.js';
import type { CliFlags } from '../config.js';
import {
  buildExportCompleteness,
  ExportStrictViolationError,
} from '../exportCompleteness.js';
import { downloadGuildAssets } from './assets.js';
import { buildEffectivePermissionsSample } from './effectivePermissionsSample.js';
import { runPhaseGuild } from './phaseGuild.js';
import { runPhaseMembers } from './phaseMembers.js';
import { runPhaseOptional } from './phaseOptional.js';
import { ensureDir, prepareJsonl, writeJson } from '../util/fs.js';

function safeFsSegment(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_').trim();
  return cleaned.slice(0, 80) || 'guild';
}

export type FullExportResult = {
  outDir: string;
  memberCount: number;
};

export type RunFullExportOptions = {
  /** When set (including `null`), skip internal fetchMe and use this value for completeness. */
  botMember?: GuildMember | null;
};

/**
 * Runs the same export pipeline as the CLI: guild/roles/channels, members.jsonl, optional phases, assets.
 * JSONL outputs are reset at the start of each run (idempotent reruns).
 */
export async function runFullExport(
  client: Client,
  guild: Guild,
  flags: CliFlags,
  toolVersion: string,
  options?: RunFullExportOptions,
): Promise<FullExportResult> {
  const startedAt = new Date().toISOString();
  const full = await guild.fetch();

  const folderName = `${safeFsSegment(full.name)}_${full.id}`;
  const baseDir = resolve(flags.outDir);
  await ensureDir(baseDir);
  const outDir = join(baseDir, folderName);
  await ensureDir(outDir);

  const membersPath = join(outDir, 'members.jsonl');
  await prepareJsonl(membersPath);
  if (flags.includeOverwritesJsonl)
    await prepareJsonl(join(outDir, 'overwrites.jsonl'));
  if (flags.includeWebhooks) await prepareJsonl(join(outDir, 'webhooks.jsonl'));

  const me =
    options != null &&
    Object.prototype.hasOwnProperty.call(options, 'botMember')
      ? (options.botMember ?? null)
      : await guild.members.fetchMe().catch(() => null);

  const phaseStats = await runPhaseGuild(guild, outDir, flags);

  const memberCount = await runPhaseMembers(client, full.id, membersPath);
  console.log(`[export] members written: ${memberCount}`);

  const optStats = await runPhaseOptional(full, outDir, flags);

  const assetManifest = await downloadGuildAssets(full, join(outDir, 'assets'));
  await writeJson(join(outDir, 'asset_manifest.json'), assetManifest);

  if (flags.computeEffectivePermissions) {
    type ApiMember = { user?: { id: string } };
    const q = new URLSearchParams({ limit: '1000' });
    const batch = (await client.rest.get(Routes.guildMembers(full.id), {
      query: q,
    })) as ApiMember[];
    const slice = batch.slice(0, flags.effectiveMemberLimit);
    const userIds = slice.map((m) => m.user?.id).filter(Boolean) as string[];
    if (userIds.length) {
      const fetched = await full.members.fetch({ user: userIds });
      const members = [...fetched.values()];
      const sample = buildEffectivePermissionsSample(
        full,
        members,
        flags.effectiveChannelLimit,
      );
      await writeJson(
        join(outDir, 'member_effective_permissions_sample.json'),
        sample,
      );
    }
  }

  const guildMemberCount =
    typeof full.memberCount === 'number' && Number.isFinite(full.memberCount)
      ? full.memberCount
      : null;

  const completeness = buildExportCompleteness(me, flags, {
    roleCount: phaseStats.roleCount,
    parentChannelCount: phaseStats.parentChannelCount,
    overwriteRowCount: phaseStats.overwriteRowCount,
    memberCount,
    webhookRows: optStats.webhookRows,
    guildMemberCount,
  });

  const completedAt = new Date().toISOString();
  const exportStatus =
    flags.strict && !completeness.echoCoreOk ? 'failed_strict' : 'ok';

  await writeJson(join(outDir, 'manifest.json'), {
    tool: 'echo-discord-export-bot',
    toolVersion,
    exportStartedAt: startedAt,
    exportCompletedAt: completedAt,
    exportStatus,
    guildId: full.id,
    guildName: full.name,
    memberCountExported: memberCount,
    flags,
    completeness,
    phaseGuild: {
      scheduledEventsWritten: phaseStats.scheduledEventsWritten,
      autoModWritten: phaseStats.autoModWritten,
    },
    optional: {
      invitesWritten: optStats.invitesWritten,
    },
    assetManifestSummary: {
      guildIcon: assetManifest.guildIcon,
      guildBanner: assetManifest.guildBanner,
      emojiFiles: Object.keys(assetManifest.emojis).length,
      stickerFiles: Object.keys(assetManifest.stickers).length,
      roleIconFiles: Object.keys(assetManifest.roleIcons).length,
      assetErrors: assetManifest.errors.length,
    },
  });

  if (flags.strict && !completeness.echoCoreOk) {
    throw new ExportStrictViolationError(completeness);
  }

  console.log(`[export] done -> ${outDir}`);
  return { outDir, memberCount };
}

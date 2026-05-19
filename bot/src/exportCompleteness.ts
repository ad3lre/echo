import { PermissionFlagsBits, type GuildMember } from 'discord.js';
import type { CliFlags } from './config.js';

export type ExportCompleteness = {
  botMemberResolved: boolean;
  /** True when Echo-minimal import data is considered trustworthy. */
  echoCoreOk: boolean;
  checks: Array<{ id: string; ok: boolean; detail?: string }>;
  warnings: string[];
  counts: {
    roles: number;
    parentChannels: number;
    members: number;
    overwriteRows: number;
    webhookRows: number;
  };
  guildMemberCount: number | null;
  notes: string[];
};

export type CompletenessStats = {
  roleCount: number;
  parentChannelCount: number;
  overwriteRowCount: number;
  memberCount: number;
  webhookRows: number;
  /** Discord guild.memberCount when available (null if unknown). */
  guildMemberCount: number | null;
};

/**
 * Echo-core (strict) policy: bot must resolve; must see channels (or Administrator);
 * member pagination must not return empty when Discord reports a populated guild; roles must exist.
 */
export function buildExportCompleteness(
  me: GuildMember | null,
  _flags: CliFlags,
  stats: CompletenessStats,
): ExportCompleteness {
  const checks: ExportCompleteness['checks'] = [];
  const warnings: string[] = [];
  const notes = [
    'Member list REST export requires Server Members privileged intent in the Developer Portal.',
  ];

  const botMemberResolved = me != null;
  checks.push({
    id: 'bot_member',
    ok: botMemberResolved,
    detail: botMemberResolved
      ? undefined
      : 'Could not resolve bot guild member',
  });
  if (!botMemberResolved)
    warnings.push(
      'Bot member unresolved — permission and visibility checks skipped.',
    );

  let viewOk = true;
  if (me) {
    const admin = me.permissions.has(PermissionFlagsBits.Administrator);
    viewOk = admin || me.permissions.has(PermissionFlagsBits.ViewChannel);
    checks.push({
      id: 'view_channel_or_admin',
      ok: viewOk,
      detail: viewOk
        ? undefined
        : 'Missing View Channel (and not Administrator) — channel list may be incomplete',
    });
    if (!viewOk)
      warnings.push(
        'View Channel missing — export may omit channels the bot cannot see.',
      );
  }

  const guildMc = stats.guildMemberCount;
  const memberCountOk =
    stats.memberCount > 0 || guildMc == null || guildMc <= 0;
  checks.push({
    id: 'member_list_non_empty_when_guild_has_members',
    ok: memberCountOk,
    detail: memberCountOk
      ? undefined
      : `Exported 0 members but guild reports ${guildMc} — check GUILD_MEMBERS intent`,
  });
  if (!memberCountOk)
    warnings.push(
      'Zero members exported while guild reports members — likely missing privileged intent.',
    );

  const memberExportCountOk =
    guildMc == null ||
    guildMc <= 15 ||
    stats.memberCount <= 0 ||
    stats.memberCount + 3 >= guildMc;

  if (!memberExportCountOk) {
    const msg = `Exported ${stats.memberCount} guild members but Discord reports about ${guildMc} total — members.jsonl and the import user map will be incomplete until the export bot has Server Members privileged intent (Developer Portal) and you re-run a fresh export.`;
    checks.push({
      id: 'member_export_count_vs_guild_total',
      ok: false,
      detail: msg,
    });
    warnings.push(msg);
  }

  const rolesOk = stats.roleCount > 0;
  checks.push({
    id: 'roles_non_empty',
    ok: rolesOk,
    detail: rolesOk
      ? undefined
      : 'No roles in export (unexpected; @everyone should exist)',
  });
  if (!rolesOk) warnings.push('No roles exported.');

  const echoCoreOk =
    botMemberResolved &&
    viewOk &&
    memberCountOk &&
    rolesOk &&
    memberExportCountOk;

  return {
    botMemberResolved,
    echoCoreOk,
    checks,
    warnings,
    counts: {
      roles: stats.roleCount,
      parentChannels: stats.parentChannelCount,
      members: stats.memberCount,
      overwriteRows: stats.overwriteRowCount,
      webhookRows: stats.webhookRows,
    },
    guildMemberCount: guildMc,
    notes,
  };
}

export class ExportStrictViolationError extends Error {
  readonly name = 'ExportStrictViolationError';
  constructor(public readonly completeness: ExportCompleteness) {
    super(
      'Strict export failed: Echo-core checks did not pass (see completeness in manifest).',
    );
  }
}

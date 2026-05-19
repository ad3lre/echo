import { PermissionFlagsBits, type GuildMember } from 'discord.js';
import type { CliFlags } from './config.js';

/**
 * Human-readable permission check for the export bot. Discord may still return partial data without some of these.
 */
export function formatExportPermissionReport(
  me: GuildMember | null,
  flags: CliFlags,
): string[] {
  const lines: string[] = [];
  if (!me) {
    lines.push('Could not load the bot member; permission check skipped.');
    return lines;
  }

  const p = me.permissions;
  if (p.has(PermissionFlagsBits.Administrator)) {
    lines.push('Bot has Administrator — all export-related checks satisfied.');
    return lines;
  }

  if (p.has(PermissionFlagsBits.ViewChannel)) {
    lines.push('View Channel: OK (see channel structure and overwrites).');
  } else {
    lines.push(
      'View Channel: missing — some channels may be invisible; export may be incomplete.',
    );
  }

  if (flags.includeInvites) {
    if (p.has(PermissionFlagsBits.ManageGuild)) {
      lines.push('Manage Server: OK (invite list).');
    } else {
      lines.push(
        'Manage Server: missing — invites export will be skipped or fail.',
      );
    }
  }

  if (flags.includeWebhooks) {
    if (p.has(PermissionFlagsBits.ManageWebhooks)) {
      lines.push('Manage Webhooks: OK (webhook enumeration).');
    } else {
      lines.push(
        'Manage Webhooks: missing — webhook export may skip many channels.',
      );
    }
  }

  if (flags.includeScheduledEvents) {
    if (p.has(PermissionFlagsBits.ManageEvents)) {
      lines.push('Manage Events: OK (scheduled events).');
    } else {
      lines.push(
        'Manage Events: not granted — scheduled_events fetch may be skipped or limited.',
      );
    }
  }

  if (flags.includeAutoMod) {
    if (p.has(PermissionFlagsBits.ManageGuild)) {
      lines.push(
        'Auto moderation rules: Manage Server present (fetch usually allowed).',
      );
    } else {
      lines.push(
        'Auto moderation: Manage Server missing — rules fetch may fail.',
      );
    }
  }

  lines.push(
    'Member list REST export needs the Server Members privileged intent enabled for this application in the Developer Portal.',
  );

  return lines;
}

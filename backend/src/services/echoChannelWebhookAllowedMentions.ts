import type { MentionEntity } from '../../../shared/types';
import { findAllIdTokenMatches } from '../shared/idTokens';

export type DiscordAllowedMentionsInput = {
  parse?: unknown;
  users?: unknown;
  roles?: unknown;
};

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === 'string' && x.trim()) out.push(x.trim());
    else if (
      x &&
      typeof x === 'object' &&
      typeof (x as { id?: unknown }).id === 'string'
    ) {
      const id = String((x as { id: string }).id).trim();
      if (id) out.push(id);
    }
  }
  return out;
}

function parseFlags(am: DiscordAllowedMentionsInput | undefined): {
  parseEveryone: boolean;
  parseUsers: boolean;
  parseRoles: boolean;
  explicitUserIds: Set<string>;
  explicitRoleIds: Set<string>;
} {
  if (!am) {
    return {
      parseEveryone: true,
      parseUsers: true,
      parseRoles: true,
      explicitUserIds: new Set(),
      explicitRoleIds: new Set(),
    };
  }
  const parseRaw = Array.isArray(am.parse) ? am.parse : [];
  const parseEveryone = parseRaw.includes('everyone');
  const parseUsers = parseRaw.includes('users');
  const parseRoles = parseRaw.includes('roles');
  return {
    parseEveryone,
    parseUsers,
    parseRoles,
    explicitUserIds: new Set(asStringArray(am.users)),
    explicitRoleIds: new Set(asStringArray(am.roles)),
  };
}

/**
 * Build Echo `mentions` from Discord-style `content` tokens plus `allowed_mentions`.
 * When `allowed_mentions` is omitted, behaves like Discord defaults (all parses on).
 */
export function buildMentionEntitiesFromDiscordWebhookContent(
  content: string,
  allowedMentions: DiscordAllowedMentionsInput | undefined,
): MentionEntity[] | undefined {
  const flags = parseFlags(allowedMentions);
  const out: MentionEntity[] = [];

  const reEveryone = /@everyone\b/g;
  let em: RegExpExecArray | null;
  while ((em = reEveryone.exec(content)) !== null) {
    if (!flags.parseEveryone) continue;
    const start = em.index;
    const end = start + em[0].length;
    out.push({
      id: 'everyone',
      kind: 'everyone',
      label: '@everyone',
      start,
      end,
    });
  }

  const reHere = /@here\b/g;
  while ((em = reHere.exec(content)) !== null) {
    if (!flags.parseEveryone) continue;
    const start = em.index;
    const end = start + em[0].length;
    out.push({
      id: 'active',
      kind: 'active',
      label: '@here',
      start,
      end,
    });
  }

  for (const hit of findAllIdTokenMatches(content)) {
    const { start, end, token } = hit;
    if (token.kind === 'user') {
      if (!flags.parseUsers && !flags.explicitUserIds.has(token.id)) continue;
      out.push({
        id: token.id,
        kind: 'user',
        label: `<@${token.id}>`,
        start,
        end,
        userId: token.id,
      });
    } else if (token.kind === 'role') {
      if (!flags.parseRoles && !flags.explicitRoleIds.has(token.id)) continue;
      out.push({
        id: token.id,
        kind: 'role',
        label: `<@&${token.id}>`,
        start,
        end,
        roleId: token.id,
      });
    } else if (token.kind === 'channel') {
      if (!flags.parseUsers) continue;
      out.push({
        id: token.id,
        kind: 'channel',
        label: `<#${token.id}>`,
        start,
        end,
        channelId: token.id,
      });
    }
  }

  out.sort((a, b) => a.start - b.start);
  return out.length ? out : undefined;
}

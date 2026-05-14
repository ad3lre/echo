/**
 * Normalizes unauthenticated invite preview + public directory list JSON (no transport).
 */
import type { EchoInvitePreviewDto } from '@/api/echo/types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function normalizeEchoInvitePreviewPayload(
  data: Record<string, unknown>,
): EchoInvitePreviewDto {
  const memberCount = data.memberCount;
  const vcRaw = data.voiceChannel;
  let voiceChannel: { id: string; name: string } | undefined;
  if (isRecord(vcRaw)) {
    const id =
      typeof vcRaw.id === 'string'
        ? vcRaw.id.trim()
        : vcRaw.id != null
          ? String(vcRaw.id).trim()
          : '';
    const name =
      typeof vcRaw.name === 'string'
        ? vcRaw.name.trim()
        : vcRaw.name != null
          ? String(vcRaw.name).trim()
          : '';
    if (id) voiceChannel = { id, name: name || 'Voice' };
  }
  return {
    name:
      typeof data.name === 'string' ? data.name.trim() || 'Server' : 'Server',
    iconUrl: typeof data.iconUrl === 'string' ? data.iconUrl : '',
    bannerUrl: typeof data.bannerUrl === 'string' ? data.bannerUrl : '',
    description:
      typeof data.description === 'string' ? data.description.trim() : '',
    memberCount:
      typeof memberCount === 'number' && Number.isFinite(memberCount)
        ? Math.max(0, Math.floor(memberCount))
        : 0,
    ...(voiceChannel ? { voiceChannel } : {}),
  };
}

export type EchoDirectoryServerEntry = {
  id: string;
  name: string;
  iconUrl: string;
  bannerUrl: string;
  description?: string;
  tags?: string[];
  createdAt?: string;
  memberCount?: number;
  allowGlobalGuests?: boolean;
};

export function normalizeEchoDirectoryServersPayload(
  data: Record<string, unknown>,
): { servers: EchoDirectoryServerEntry[] } {
  const raw = data.servers;
  const servers: EchoDirectoryServerEntry[] = [];
  if (!Array.isArray(raw)) return { servers };

  for (const row of raw) {
    if (!isRecord(row)) continue;
    const idRaw = row.id;
    const id =
      typeof idRaw === 'string'
        ? idRaw.trim()
        : idRaw != null &&
            (typeof idRaw === 'number' || typeof idRaw === 'bigint')
          ? String(idRaw)
          : '';
    const name = typeof row.name === 'string' ? row.name : '';
    if (!id || !name) continue;
    const desc =
      typeof row.description === 'string' ? row.description.trim() : '';
    const createdAt =
      typeof row.createdAt === 'string' ? row.createdAt : undefined;
    const tags = Array.isArray(row.tags)
      ? row.tags
          .filter((tag): tag is string => typeof tag === 'string')
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean)
      : undefined;
    let memberCount: number | undefined;
    if (
      typeof row.memberCount === 'number' &&
      Number.isFinite(row.memberCount)
    ) {
      memberCount = row.memberCount;
    } else if (typeof row.memberCount === 'string' && row.memberCount.trim()) {
      const n = parseInt(row.memberCount, 10);
      if (Number.isFinite(n)) memberCount = n;
    }
    let allowGlobalGuests: boolean | undefined;
    if (typeof row.allowGlobalGuests === 'boolean') {
      allowGlobalGuests = row.allowGlobalGuests;
    } else if (typeof row.allow_global_guests === 'boolean') {
      allowGlobalGuests = row.allow_global_guests;
    }
    servers.push({
      id,
      name,
      iconUrl: typeof row.iconUrl === 'string' ? row.iconUrl : '',
      bannerUrl: typeof row.bannerUrl === 'string' ? row.bannerUrl : '',
      ...(desc ? { description: desc } : {}),
      ...(tags && tags.length ? { tags } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(memberCount !== undefined ? { memberCount } : {}),
      ...(allowGlobalGuests !== undefined ? { allowGlobalGuests } : {}),
    });
  }
  return { servers };
}

/**
 * Normalizes GET `/dm/threads` JSON into typed DM thread rows (no transport).
 */

export type EchoDmThreadFromApi =
  | {
      channelId: string;
      kind: 'direct';
      peerUserId: string;
      lastActivityId?: string;
      activeCallParticipantUserIds?: string[];
    }
  | {
      channelId: string;
      kind: 'group';
      name: string;
      memberUserIds: string[];
      lastActivityId?: string;
      pfp?: string;
      activeCallParticipantUserIds?: string[];
    };

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function normalizeEchoDmThreadsHttpPayload(raw: unknown): {
  threads: EchoDmThreadFromApi[];
} {
  if (!isRecord(raw)) return { threads: [] };
  const list = raw.threads;
  if (!Array.isArray(list)) return { threads: [] };

  const threads: EchoDmThreadFromApi[] = [];
  for (const t of list) {
    if (!isRecord(t)) continue;
    const channelId = String(t.channelId ?? '');
    if (!channelId) continue;
    const activeCallParticipantUserIds = Array.isArray(
      t.activeCallParticipantUserIds,
    )
      ? t.activeCallParticipantUserIds.map((x) => String(x)).filter(Boolean)
      : [];
    if (t.kind === 'group' && Array.isArray(t.memberUserIds)) {
      const pfpRaw = typeof t.pfp === 'string' ? t.pfp.trim() : '';
      threads.push({
        channelId,
        kind: 'group',
        name: typeof t.name === 'string' ? t.name : 'Group',
        memberUserIds: t.memberUserIds.map((x) => String(x)),
        ...(typeof t.lastActivityId === 'string' && t.lastActivityId.trim()
          ? { lastActivityId: t.lastActivityId.trim() }
          : {}),
        ...(activeCallParticipantUserIds.length > 0
          ? { activeCallParticipantUserIds }
          : {}),
        ...(pfpRaw ? { pfp: pfpRaw } : {}),
      });
    } else {
      threads.push({
        channelId,
        kind: 'direct',
        peerUserId: typeof t.peerUserId === 'string' ? t.peerUserId : '',
        ...(typeof t.lastActivityId === 'string' && t.lastActivityId.trim()
          ? { lastActivityId: t.lastActivityId.trim() }
          : {}),
        ...(activeCallParticipantUserIds.length > 0
          ? { activeCallParticipantUserIds }
          : {}),
      });
    }
  }
  return { threads };
}

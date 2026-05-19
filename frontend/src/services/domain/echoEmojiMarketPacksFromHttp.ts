/**
 * Normalizes GET `/emoji-market/packs` JSON (no transport).
 */
import type {
  EchoEmojiPackMarketSettingsApi,
  EchoEmojiMarketPackApi,
} from '@/api/echo/types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function normalizeEchoEmojiMarketPacksPayload(
  data: Record<string, unknown>,
): { packs: EchoEmojiMarketPackApi[] } {
  const raw = data.packs;
  const packs: EchoEmojiMarketPackApi[] = [];
  if (!Array.isArray(raw)) return { packs };

  for (const row of raw) {
    if (!isRecord(row)) continue;
    const id = typeof row.id === 'string' ? row.id : '';
    const name = typeof row.name === 'string' ? row.name : '';
    const description =
      typeof row.description === 'string' ? row.description : '';
    const authorServerName =
      typeof row.authorServerName === 'string'
        ? row.authorServerName
        : undefined;
    let totalUseCount: number | undefined;
    if (
      typeof row.totalUseCount === 'number' &&
      Number.isFinite(row.totalUseCount)
    ) {
      totalUseCount = row.totalUseCount;
    } else if (
      typeof row.totalUseCount === 'string' &&
      row.totalUseCount.trim()
    ) {
      const n = parseInt(row.totalUseCount, 10);
      if (Number.isFinite(n)) totalUseCount = n;
    }
    let marketSettings: EchoEmojiPackMarketSettingsApi | undefined;
    const msRaw = row.marketSettings;
    if (msRaw && typeof msRaw === 'object' && !Array.isArray(msRaw)) {
      const t = (msRaw as Record<string, unknown>).tags;
      if (Array.isArray(t)) {
        const tags = t
          .filter((x): x is string => typeof x === 'string')
          .map((x) => x.trim())
          .filter(Boolean);
        marketSettings = { tags };
      }
    }
    if (!id || !name) continue;
    const emRaw = row.emojis;
    const emojis: EchoEmojiMarketPackApi['emojis'] = [];
    if (Array.isArray(emRaw)) {
      for (const er of emRaw) {
        if (!isRecord(er)) continue;
        const eid = typeof er.id === 'string' ? er.id : '';
        const ename = typeof er.name === 'string' ? er.name : '';
        const kind =
          er.kind === 'animated' || er.kind === 'static' ? er.kind : 'static';
        if (!eid || !ename) continue;
        emojis.push({
          id: eid,
          name: ename,
          kind,
          ...(typeof er.char === 'string' ? { char: er.char } : {}),
          ...(typeof er.previewUrl === 'string'
            ? { previewUrl: er.previewUrl }
            : {}),
        });
      }
    }
    packs.push({
      id,
      name,
      description,
      emojis,
      ...(authorServerName !== undefined ? { authorServerName } : {}),
      ...(totalUseCount !== undefined ? { totalUseCount } : {}),
      ...(marketSettings !== undefined ? { marketSettings } : {}),
    });
  }
  return { packs };
}

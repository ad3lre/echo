import type { Embed } from '../../../shared/types';
import { mediaUrlPassesEchoPolicy } from './mediaUrlPolicy';

/** Webhook avatar URLs must satisfy the same host policy as user-uploaded media. */
export function sanitizeWebhookAvatarUrl(
  raw: string | undefined,
): string | undefined {
  const u = typeof raw === 'string' ? raw.trim().slice(0, 2048) : '';
  if (!u) return undefined;
  if (!/^https?:\/\//i.test(u)) return undefined;
  return mediaUrlPassesEchoPolicy(u) ? u : undefined;
}

function sanitizeEmbedMediaUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const u = raw.trim().slice(0, 2048);
  if (!u || !/^https?:\/\//i.test(u)) return undefined;
  return mediaUrlPassesEchoPolicy(u) ? u : undefined;
}

/** Strip embed image/thumbnail URLs that bypass Echo media host policy. */
export function sanitizeWebhookEmbeds(
  embeds: Embed[] | undefined,
): Embed[] | undefined {
  if (!embeds?.length) return embeds;
  return embeds.map((embed) => {
    const next = { ...embed } as Embed & {
      image?: { url?: string };
      thumbnail?: { url?: string };
    };
    if (next.image?.url) {
      const safe = sanitizeEmbedMediaUrl(next.image.url);
      if (!safe) delete next.image;
      else next.image = { ...next.image, url: safe };
    }
    if (next.thumbnail?.url) {
      const safe = sanitizeEmbedMediaUrl(next.thumbnail.url);
      if (!safe) delete next.thumbnail;
      else next.thumbnail = { ...next.thumbnail, url: safe };
    }
    return next;
  });
}

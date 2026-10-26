import type { Embed } from '../../../../../contracts/types';
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

/** Clickable link targets: must parse as an http(s) URL; otherwise dropped. */
function sanitizeEmbedLinkUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const u = raw.trim().slice(0, 2048);
  if (!u) return undefined;
  try {
    const p = new URL(u);
    return p.protocol === 'http:' || p.protocol === 'https:' ? u : undefined;
  } catch {
    return undefined;
  }
}

/** Exported scheme validator for clickable webhook link targets (embeds, components). */
export const sanitizeWebhookLinkUrl = sanitizeEmbedLinkUrl;

type LooseEmbed = Omit<Embed, 'provider' | 'video'> & {
  provider?: unknown;
  video?: Record<string, unknown>;
};

/** Strip embed URLs with unsafe schemes or that bypass Echo media host policy. */
export function sanitizeWebhookEmbeds(
  embeds: Embed[] | undefined,
): Embed[] | undefined {
  if (!embeds?.length) return embeds;
  return embeds.map((embed) => {
    const next = { ...embed } as LooseEmbed;
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
    if (next.url !== undefined) {
      const safe = sanitizeEmbedLinkUrl(next.url);
      if (safe) next.url = safe;
      else delete next.url;
    }
    const prov = next.provider;
    if (prov && typeof prov === 'object' && 'url' in prov) {
      const copy = { ...(prov as Record<string, unknown>) };
      const safe = sanitizeEmbedLinkUrl(copy.url);
      if (safe) copy.url = safe;
      else delete copy.url;
      next.provider = copy;
    }
    if (next.author) {
      const author = { ...next.author };
      if (author.url !== undefined) {
        const safe = sanitizeEmbedLinkUrl(author.url);
        if (safe) author.url = safe;
        else delete author.url;
      }
      if (author.icon_url !== undefined) {
        const safe = sanitizeEmbedMediaUrl(author.icon_url);
        if (safe) author.icon_url = safe;
        else delete author.icon_url;
      }
      next.author = author;
    }
    if (next.footer) {
      const footer = { ...next.footer };
      if (footer.icon_url !== undefined) {
        const safe = sanitizeEmbedMediaUrl(footer.icon_url);
        if (safe) footer.icon_url = safe;
        else delete footer.icon_url;
      }
      next.footer = footer;
    }
    if (next.video) {
      const video = { ...next.video };
      if (video.url !== undefined) {
        const safe = sanitizeEmbedMediaUrl(video.url);
        if (safe) video.url = safe;
        else delete video.url;
      }
      if (video.embedUrl !== undefined) {
        const safe = sanitizeEmbedLinkUrl(video.embedUrl);
        if (safe) video.embedUrl = safe;
        else delete video.embedUrl;
      }
      if (!video.url && !video.embedUrl) delete next.video;
      else next.video = video;
    }
    return next as unknown as Embed;
  });
}

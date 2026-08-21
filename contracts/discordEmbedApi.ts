import type { Embed } from './types/message';

export const DISCORD_EMBED_LIMITS = {
  maxEmbedsPerMessage: 10,
  maxFieldsPerEmbed: 25,
  title: 256,
  description: 4096,
  url: 2048,
  fieldName: 256,
  fieldValue: 1024,
  footerText: 2048,
  authorName: 256,
  providerName: 256,
} as const;

function clip(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}

function clipUrl(raw: string | undefined): string | undefined {
  const u = typeof raw === 'string' ? raw.trim() : '';
  if (!u) return undefined;
  return clip(u, DISCORD_EMBED_LIMITS.url);
}

/** Map Echo `Embed` rows to Discord webhook/API embed JSON. */
export function mapEchoEmbedToDiscordApi(
  embed: Embed,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  const title = embed.title?.trim();
  if (title) out.title = clip(title, DISCORD_EMBED_LIMITS.title);

  if (embed.description != null && embed.description !== '') {
    out.description = clip(
      String(embed.description),
      DISCORD_EMBED_LIMITS.description,
    );
  }

  const url = clipUrl(embed.url);
  if (url) out.url = url;

  if (embed.color != null && Number.isFinite(embed.color)) {
    out.color = embed.color;
  }

  const timestamp = embed.timestamp?.trim();
  if (timestamp) out.timestamp = timestamp;

  const provider = embed.provider?.trim();
  if (provider) {
    out.provider = { name: clip(provider, DISCORD_EMBED_LIMITS.providerName) };
  }

  const authorName = embed.author?.name?.trim();
  if (authorName) {
    const author: Record<string, unknown> = {
      name: clip(authorName, DISCORD_EMBED_LIMITS.authorName),
    };
    const authorUrl = clipUrl(embed.author?.url);
    if (authorUrl) author.url = authorUrl;
    const authorIcon = clipUrl(embed.author?.icon_url);
    if (authorIcon) author.icon_url = authorIcon;
    out.author = author;
  }

  const footerText = embed.footer?.text?.trim();
  if (footerText) {
    const footer: Record<string, unknown> = {
      text: clip(footerText, DISCORD_EMBED_LIMITS.footerText),
    };
    const footerIcon = clipUrl(embed.footer?.icon_url);
    if (footerIcon) footer.icon_url = footerIcon;
    out.footer = footer;
  }

  const imageUrl = clipUrl(embed.image?.url);
  if (imageUrl) {
    out.image = {
      url: imageUrl,
      ...(typeof embed.image?.width === 'number'
        ? { width: embed.image.width }
        : {}),
      ...(typeof embed.image?.height === 'number'
        ? { height: embed.image.height }
        : {}),
    };
  }

  const thumbUrl = clipUrl(embed.thumbnail?.url);
  if (thumbUrl) {
    out.thumbnail = {
      url: thumbUrl,
      ...(typeof embed.thumbnail?.width === 'number'
        ? { width: embed.thumbnail.width }
        : {}),
      ...(typeof embed.thumbnail?.height === 'number'
        ? { height: embed.thumbnail.height }
        : {}),
    };
  }

  if (embed.fields?.length) {
    const fields = embed.fields
      .slice(0, DISCORD_EMBED_LIMITS.maxFieldsPerEmbed)
      .map((field) => ({
        name: clip(String(field.name ?? ''), DISCORD_EMBED_LIMITS.fieldName),
        value: clip(String(field.value ?? ''), DISCORD_EMBED_LIMITS.fieldValue),
        inline: field.inline === true,
      }))
      .filter((field) => field.name.length > 0 || field.value.length > 0);
    if (fields.length) out.fields = fields;
  }

  return out;
}

export function mapEchoEmbedsToDiscordApi(
  embeds: Embed[] | undefined,
  max: number = DISCORD_EMBED_LIMITS.maxEmbedsPerMessage,
): Record<string, unknown>[] {
  if (!embeds?.length) return [];
  return embeds
    .slice(0, max)
    .map(mapEchoEmbedToDiscordApi)
    .filter((row) => Object.keys(row).length > 0);
}

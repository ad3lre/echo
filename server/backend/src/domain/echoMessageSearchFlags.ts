import type {
  Embed,
  MessageAttachmentPayload,
} from '../../../../contracts/types';

export type EchoMessageSearchFlags = {
  hasGif: boolean;
  hasImage: boolean;
  hasLink: boolean;
  hasDocs: boolean;
  hasAttachment: boolean;
};

function isGifImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('giphy') ||
    lower.includes('tenor') ||
    lower.includes('.gif') ||
    lower.includes('media.giphy')
  );
}

function stickerHasFormat(
  stickers: unknown,
  formats: readonly string[],
): boolean {
  if (!Array.isArray(stickers)) return false;
  for (const item of stickers) {
    if (!item || typeof item !== 'object') continue;
    const format = (item as { format?: unknown }).format;
    if (typeof format === 'string' && formats.includes(format)) return true;
  }
  return false;
}

function embedHasInlineGif(embeds: unknown): boolean {
  if (!Array.isArray(embeds)) return false;
  for (const embed of embeds) {
    if (!embed || typeof embed !== 'object') continue;
    const o = embed as Embed;
    const imageUrl = o.image?.url?.toLowerCase() ?? '';
    const url = o.url?.toLowerCase() ?? '';
    if (
      imageUrl.includes('media.tenor.') ||
      imageUrl.includes('media.giphy.') ||
      url.includes('tenor.com/view/') ||
      url.includes('giphy.com/gifs/')
    ) {
      return true;
    }
  }
  return false;
}

type AttachmentKindSignals = {
  hasGif: boolean;
  hasImage: boolean;
  hasDocs: boolean;
};

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|heic|heif|bmp|tif|tiff)(\?|$)/i;
const GIF_EXT_RE = /\.gif(\?|$)/i;

function mimeLooksDocument(mime: string): boolean {
  return (
    mime.startsWith('application/') ||
    mime.includes('pdf') ||
    mime.includes('document')
  );
}

function attachmentLooksImage(input: {
  mime: string;
  name: string;
  url: string;
}): boolean {
  // Prefer mime + extension evidence. Do not trust bare `kind: image` — legacy
  // rows sometimes labeled PDFs as images, and client search tests encode that.
  if (mimeLooksDocument(input.mime)) return false;
  return (
    input.mime.startsWith('image/') ||
    IMAGE_EXT_RE.test(input.name) ||
    IMAGE_EXT_RE.test(input.url)
  );
}

/**
 * Classify attachment payloads for search flags. Image attachments must count as
 * `hasImage` / `hasGif` — not only the generic `hasAttachment` bit — otherwise
 * native/web `has:image` misses every photo sent via the attachments array.
 */
function attachmentKindSignals(attachments: unknown): AttachmentKindSignals {
  let hasGif = false;
  let hasImage = false;
  let hasDocs = false;
  if (!Array.isArray(attachments)) {
    return { hasGif, hasImage, hasDocs };
  }
  for (const item of attachments) {
    if (!item || typeof item !== 'object') continue;
    const att = item as MessageAttachmentPayload & { url?: string };
    const kind = String(att.kind ?? '').toLowerCase();
    const mime = String(att.mimeType ?? '').toLowerCase();
    const name = String(att.filename ?? '').toLowerCase();
    const url = String(att.url ?? '').toLowerCase();

    const looksGif =
      kind === 'gif' ||
      mime === 'image/gif' ||
      name.endsWith('.gif') ||
      GIF_EXT_RE.test(url) ||
      isGifImageUrl(url);
    if (looksGif) {
      hasGif = true;
      continue;
    }

    if (attachmentLooksImage({ mime, name, url })) {
      hasImage = true;
      continue;
    }

    if (
      kind === 'document' ||
      mimeLooksDocument(mime) ||
      name.endsWith('.pdf') ||
      name.endsWith('.doc') ||
      name.endsWith('.docx')
    ) {
      hasDocs = true;
    }
  }
  return { hasGif, hasImage, hasDocs };
}

function hasNonEmptyAttachments(attachments: unknown): boolean {
  return Array.isArray(attachments) && attachments.length > 0;
}

/** Derive precomputed search filter flags from persisted message fields. */
export function computeEchoMessageSearchFlags(input: {
  gif?: boolean;
  imageUrl?: string | null;
  searchIndexText?: string | null;
  attachments?: unknown;
  stickers?: unknown;
  embeds?: unknown;
}): EchoMessageSearchFlags {
  const imageUrl = (input.imageUrl ?? '').trim();
  const fromAttachments = attachmentKindSignals(input.attachments);

  const hasGif =
    input.gif === true ||
    (imageUrl !== '' && isGifImageUrl(imageUrl)) ||
    stickerHasFormat(input.stickers, ['gif']) ||
    embedHasInlineGif(input.embeds) ||
    fromAttachments.hasGif;

  const hasImage =
    (imageUrl !== '' && input.gif !== true && !isGifImageUrl(imageUrl)) ||
    stickerHasFormat(input.stickers, ['png', 'apng']) ||
    fromAttachments.hasImage;

  const searchText = String(input.searchIndexText ?? '');
  const hasLink = /https?:\/\//i.test(searchText);

  const hasDocs = fromAttachments.hasDocs;
  const hasAttachment = hasNonEmptyAttachments(input.attachments);

  return {
    hasGif,
    hasImage,
    hasLink,
    hasDocs,
    hasAttachment,
  };
}

export function echoMessageSearchFlagsSqlValues(
  flags: EchoMessageSearchFlags,
): [boolean, boolean, boolean, boolean, boolean] {
  return [
    flags.hasGif,
    flags.hasImage,
    flags.hasLink,
    flags.hasDocs,
    flags.hasAttachment,
  ];
}

/** @internal exported for unit tests */
export const __test = {
  attachmentKindSignals,
  isGifImageUrl,
};

import type {
  Embed,
  MessageAttachmentPayload,
  MessageStickerPayload,
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

function attachmentHasDocMime(attachments: unknown): boolean {
  if (!Array.isArray(attachments)) return false;
  for (const item of attachments) {
    if (!item || typeof item !== 'object') continue;
    const mime = String(
      (item as MessageAttachmentPayload).mimeType ?? '',
    ).toLowerCase();
    if (
      mime.startsWith('application/') ||
      mime.includes('pdf') ||
      mime.includes('document')
    ) {
      return true;
    }
  }
  return false;
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
  const imageLower = imageUrl.toLowerCase();
  const hasGif =
    input.gif === true ||
    (imageUrl !== '' && isGifImageUrl(imageUrl)) ||
    stickerHasFormat(input.stickers, ['gif']) ||
    embedHasInlineGif(input.embeds);

  const hasImage =
    (imageUrl !== '' && input.gif !== true && !isGifImageUrl(imageUrl)) ||
    stickerHasFormat(input.stickers, ['png', 'apng']);

  const searchText = String(input.searchIndexText ?? '');
  const hasLink = /https?:\/\//i.test(searchText);

  const hasDocs = attachmentHasDocMime(input.attachments);
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

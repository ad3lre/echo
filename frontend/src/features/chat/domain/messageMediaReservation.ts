/**
 * Shared media reservation for chat list rows (estimate + render SSOT).
 *
 * Product: attachment collage / still shells reserve a FIXED 16:9 outer box.
 * Images letterbox (contain) or crop (cover) inside; portrait and ultra-wide do
 * not change the virtual row's outer height. Trusted server width/height may
 * size rich-block slots; client probes must never change list outer height.
 */

export const CHAT_MEDIA_BOX_ASPECT_W = 16;
export const CHAT_MEDIA_BOX_ASPECT_H = 9;
export const CHAT_MEDIA_BOX_ASPECT_CSS = `${CHAT_MEDIA_BOX_ASPECT_W} / ${CHAT_MEDIA_BOX_ASPECT_H}`;
export const CHAT_MEDIA_BOX_MAX_WIDTH_PX = 640;
export const CHAT_MEDIA_BOX_MAX_WIDTH_CSS = 'min(100%, 40rem)';
/** Reserved height (px) of the fixed box at full width — estimate + skeleton. */
export const CHAT_MEDIA_BOX_HEIGHT_PX = Math.round(
  (CHAT_MEDIA_BOX_MAX_WIDTH_PX * CHAT_MEDIA_BOX_ASPECT_H) /
    CHAT_MEDIA_BOX_ASPECT_W,
);
/** Vertical margin around the fixed media collage box. */
export const CHAT_MEDIA_BOX_VERTICAL_MARGIN_PX = 8;

/** Total row height contribution for one attachment collage / legacy imageUrl box. */
export function reserveChatAttachmentMediaBoxHeightPx(): number {
  return CHAT_MEDIA_BOX_HEIGHT_PX + CHAT_MEDIA_BOX_VERTICAL_MARGIN_PX;
}

/** Outer shell style for the fixed attachment media box (render path). */
export function chatAttachmentMediaBoxStyle(options?: {
  columns?: string;
  rows?: string;
}): Record<string, string | undefined> {
  return {
    aspectRatio: CHAT_MEDIA_BOX_ASPECT_CSS,
    width: '100%',
    maxWidth: CHAT_MEDIA_BOX_MAX_WIDTH_CSS,
    gridTemplateColumns: options?.columns,
    gridTemplateRows: options?.rows,
  };
}

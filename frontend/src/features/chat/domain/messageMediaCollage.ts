/**
 * Discord-style media collage layout for images/GIFs in a single message.
 *
 * Outer box reservation is owned by `messageMediaReservation` (estimate + render SSOT).
 * This module only plans cell grid placement inside that fixed box.
 *
 *  - 1 item   -> single cell, image shown whole (contain / letterbox).
 *  - 2-4 items -> collage grid, each cell cropped to fill (cover).
 *  - 5+ items -> 3 images shown + a 4th overflow cell badged "+N" (N = total-3).
 *
 * Still images AND GIFs are routed through this planner (interleaved in
 * attachment order); GIF cells keep their paused-first-frame / hover-to-play
 * behavior (see MessageMediaCollageCell). Legacy single `message.imageUrl`
 * messages render as a one-item collage too.
 *
 * Rich-block images carry their own resolution and are NOT routed through this
 * planner (they keep their explicit aspect).
 */

export {
  CHAT_MEDIA_BOX_ASPECT_W,
  CHAT_MEDIA_BOX_ASPECT_H,
  CHAT_MEDIA_BOX_ASPECT_CSS,
  CHAT_MEDIA_BOX_MAX_WIDTH_PX,
  CHAT_MEDIA_BOX_MAX_WIDTH_CSS,
  CHAT_MEDIA_BOX_HEIGHT_PX,
  CHAT_MEDIA_BOX_VERTICAL_MARGIN_PX,
  reserveChatAttachmentMediaBoxHeightPx,
  chatAttachmentMediaBoxStyle,
} from '@/features/chat/domain/messageMediaReservation';

/** How many cells are ever rendered (3 images + 1 overflow, or up to 4 images). */
export const MEDIA_COLLAGE_MAX_CELLS = 4;

export interface CollageSourceItem {
  url: string;
  storageKey?: string;
  alt?: string;
  spoiler?: boolean;
  /** Animated GIF cell: renders via LimitedGifImg (paused first frame, hover to play). */
  isGif?: boolean;
}

export interface CollageCell {
  item: CollageSourceItem;
  /** CSS grid placement for this cell. */
  gridColumn: string;
  gridRow: string;
  /** 'contain' for a lone image (show it all), 'cover' for collage cells. */
  fit: 'contain' | 'cover';
  /** When > 0, render a dimmed "+N" overflow badge over this cell. */
  overflowCount: number;
}

export interface MediaCollagePlan {
  cells: CollageCell[];
  /** grid-template-columns value for the container. */
  columns: string;
  /** grid-template-rows value for the container. */
  rows: string;
}

const FULL = { gridColumn: '1 / -1', gridRow: '1 / -1' };

export function planMediaCollage(
  items: readonly CollageSourceItem[],
): MediaCollagePlan | null {
  if (!items.length) return null;
  const n = items.length;

  if (n === 1) {
    return {
      columns: '1fr',
      rows: '1fr',
      cells: [{ item: items[0]!, ...FULL, fit: 'contain', overflowCount: 0 }],
    };
  }

  if (n === 2) {
    return {
      columns: 'repeat(2, 1fr)',
      rows: '1fr',
      cells: items.slice(0, 2).map((item, i) => ({
        item,
        gridColumn: `${i + 1} / ${i + 2}`,
        gridRow: '1 / -1',
        fit: 'cover' as const,
        overflowCount: 0,
      })),
    };
  }

  if (n === 3) {
    // One tall image on the left, two stacked on the right.
    return {
      columns: 'repeat(2, 1fr)',
      rows: 'repeat(2, 1fr)',
      cells: [
        {
          item: items[0]!,
          gridColumn: '1 / 2',
          gridRow: '1 / -1',
          fit: 'cover',
          overflowCount: 0,
        },
        {
          item: items[1]!,
          gridColumn: '2 / 3',
          gridRow: '1 / 2',
          fit: 'cover',
          overflowCount: 0,
        },
        {
          item: items[2]!,
          gridColumn: '2 / 3',
          gridRow: '2 / 3',
          fit: 'cover',
          overflowCount: 0,
        },
      ],
    };
  }

  // 4 -> 2x2 all visible. 5+ -> 3 images + 4th cell badged "+N" (N = total - 3).
  const positions = [
    { gridColumn: '1 / 2', gridRow: '1 / 2' },
    { gridColumn: '2 / 3', gridRow: '1 / 2' },
    { gridColumn: '1 / 2', gridRow: '2 / 3' },
    { gridColumn: '2 / 3', gridRow: '2 / 3' },
  ];
  const cells: CollageCell[] = positions.map((pos, i) => ({
    item: items[i]!,
    ...pos,
    fit: 'cover' as const,
    overflowCount: n > MEDIA_COLLAGE_MAX_CELLS && i === 3 ? n - 3 : 0,
  }));
  return { columns: 'repeat(2, 1fr)', rows: 'repeat(2, 1fr)', cells };
}

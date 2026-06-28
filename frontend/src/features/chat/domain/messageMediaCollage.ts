/**
 * Discord-style media collage layout for images/GIFs in a single message.
 *
 * The container is a FIXED 16:9 box (see CHAT_MEDIA_BOX_*), so the skeleton and
 * the virtualizer row estimate can reserve the exact space before any byte
 * decodes — no fluid resizing, no scroll jank.
 *
 *  - 1 item   -> single cell, image shown whole (contain / letterbox).
 *  - 2-4 items -> collage grid, each cell cropped to fill (cover).
 *  - 5+ items -> 3 images shown + a 4th overflow cell badged "+N" (N = total-3).
 *
 * Rich-block images carry their own resolution and are NOT routed through this
 * planner (they keep their explicit aspect).
 */

/** Fixed media box: 16:9, capped at the chat column's max attachment width. */
export const CHAT_MEDIA_BOX_ASPECT_W = 16;
export const CHAT_MEDIA_BOX_ASPECT_H = 9;
export const CHAT_MEDIA_BOX_MAX_WIDTH_PX = 640;
export const CHAT_MEDIA_BOX_MAX_WIDTH_CSS = 'min(100%, 40rem)';
/** Reserved height (px) of the fixed box at full width — used by skeleton + row estimate. */
export const CHAT_MEDIA_BOX_HEIGHT_PX = Math.round(
  (CHAT_MEDIA_BOX_MAX_WIDTH_PX * CHAT_MEDIA_BOX_ASPECT_H) /
    CHAT_MEDIA_BOX_ASPECT_W,
);

/** How many cells are ever rendered (3 images + 1 overflow, or up to 4 images). */
export const MEDIA_COLLAGE_MAX_CELLS = 4;

export interface CollageSourceItem {
  url: string;
  storageKey?: string;
  alt?: string;
  spoiler?: boolean;
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

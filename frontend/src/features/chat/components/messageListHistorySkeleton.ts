/**
 * Placeholder rows for Echo channel history load — mirrors MessageBubble grouping:
 * `grouped: false` → avatar + name/time row + body lines; `true` → gutter + body only.
 * `nameWidth` / `timeWidth` size the header line so usernames read as varied (not a fixed bar).
 * Length ~ first history page density (see `ECHO_CHANNEL_MESSAGE_PAGE_SIZE` in `constants/echoHistoryPageSize.ts`).
 */
export type HistorySkeletonImageBlock = {
  aspectW: number;
  aspectH: number;
};

export type HistorySkeletonRow = {
  grouped: boolean;
  /** First row of a same-author cluster keeps header chrome but tightens the gap below. */
  clustered?: boolean;
  /** Tailwind width class for the author-name placeholder (header rows only). */
  nameWidth?: string;
  /** Tailwind width class for the inline timestamp placeholder (header rows only). */
  timeWidth?: string;
  /** Tailwind width classes for body line placeholders (new line per entry). */
  lineWidths: string[];
  /** Reserved media blocks that mirror attachment / image-slot aspect boxes. */
  imageBlocks?: HistorySkeletonImageBlock[];
};

const SKELETON_HEADER_CHROME_PX = 50;
const SKELETON_GROUPED_CHROME_PX = 6;
const SKELETON_BODY_LINE_PX = 22;
/** Matches `.skeleton-media { max-height: 12rem }` plus vertical margin. */
const SKELETON_MEDIA_BLOCK_PX = 12 * 16 + 16;

/** Spinner + label row shown above scroll-up placeholders (Discord-style). */
export const OLDER_FETCH_LOADING_HEADER_PX = 44;

/**
 * Viewport-sized count for scroll-up placeholders — enough to cover ~720p without
 * reserving a full page (80) of phantom height.
 */
export const OLDER_FETCH_SKELETON_ROW_COUNT = 12;

/** TanStack row height guess for a single history skeleton row. */
export function estimateHistorySkeletonRowSizePx(
  row: HistorySkeletonRow,
): number {
  let height = row.grouped
    ? SKELETON_GROUPED_CHROME_PX
    : SKELETON_HEADER_CHROME_PX;
  height += row.lineWidths.length * SKELETON_BODY_LINE_PX;
  if (row.imageBlocks?.length) {
    height += SKELETON_MEDIA_BLOCK_PX * row.imageBlocks.length;
  }
  return height;
}

export const HISTORY_SKELETON_ROWS: HistorySkeletonRow[] = [
  {
    grouped: false,
    nameWidth: 'w-28',
    timeWidth: 'w-10',
    lineWidths: ['w-[min(92%,24rem)]', 'w-[min(58%,17rem)]'],
  },
  { grouped: true, lineWidths: ['w-[min(88%,22rem)]'] },
  { grouped: true, lineWidths: ['w-[min(42%,12rem)]'] },
  {
    grouped: false,
    nameWidth: 'w-20',
    timeWidth: 'w-12',
    clustered: true,
    lineWidths: ['w-[min(95%,26rem)]', 'w-[min(70%,19rem)]'],
    imageBlocks: [{ aspectW: 16, aspectH: 9 }],
  },
  { grouped: true, lineWidths: ['w-[min(90%,24rem)]', 'w-[min(62%,16rem)]'] },
  { grouped: true, lineWidths: ['w-[min(36%,11rem)]'] },
  {
    grouped: false,
    nameWidth: 'w-32',
    timeWidth: 'w-10',
    lineWidths: ['w-[min(80%,21rem)]'],
    imageBlocks: [{ aspectW: 16, aspectH: 9 }],
  },
  {
    grouped: false,
    nameWidth: 'w-24',
    timeWidth: 'w-12',
    lineWidths: [
      'w-[min(86%,23rem)]',
      'w-[min(52%,14rem)]',
      'w-[min(68%,18rem)]',
    ],
  },
  { grouped: true, lineWidths: ['w-[min(93%,25rem)]'] },
  { grouped: true, lineWidths: ['w-[min(48%,15rem)]'] },
  {
    grouped: false,
    nameWidth: 'w-16',
    timeWidth: 'w-10',
    lineWidths: ['w-[min(91%,24rem)]', 'w-[min(66%,18rem)]'],
    imageBlocks: [{ aspectW: 16, aspectH: 9 }],
  },
  { grouped: true, lineWidths: ['w-[min(78%,20rem)]'] },
  { grouped: true, lineWidths: ['w-[min(88%,22rem)]', 'w-[min(44%,13rem)]'] },
  {
    grouped: false,
    nameWidth: 'w-28',
    timeWidth: 'w-12',
    lineWidths: ['w-[min(84%,22rem)]'],
  },
  { grouped: true, lineWidths: ['w-[min(72%,19rem)]'] },
  { grouped: true, lineWidths: ['w-[min(56%,16rem)]'] },
  {
    grouped: false,
    nameWidth: 'w-24',
    timeWidth: 'w-10',
    lineWidths: [
      'w-[min(89%,23rem)]',
      'w-[min(61%,17rem)]',
      'w-[min(40%,12rem)]',
    ],
    imageBlocks: [{ aspectW: 16, aspectH: 9 }],
  },
  { grouped: true, lineWidths: ['w-[min(94%,25rem)]'] },
];

/** Generic varied rows for scroll-up fetch — not derived from visible window edge. */
export const OLDER_FETCH_SKELETON_ROWS: HistorySkeletonRow[] =
  HISTORY_SKELETON_ROWS.slice(0, OLDER_FETCH_SKELETON_ROW_COUNT);
